#!/usr/bin/env node
/**
 * Queue API server — accepts webhook events and enqueues them for processing.
 * Replaces direct orchestrator calls for 100k+ lead scale.
 */
import { Queue } from "bullmq";
import { createServer } from "http";
import { createConnection } from "./redis.js";

const connection = createConnection();

export const agentQueue = new Queue("agent-jobs", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 5000 },
    removeOnComplete: { count: 1000 },
    removeOnFail: { count: 500 },
  },
});

// Campaign-drip queue carries the 4 nurture/reactivation/reminder workers.
// Producer = orchestrator's crm_enroll_campaign tool, which POSTs to
// /enqueue-campaign on this server. Worker files live in src/workers/.
//
// JobId is forced to `${personId}:${campaignId}` so re-enrolling the same
// lead in the same campaign is idempotent — BullMQ rejects duplicate job IDs
// silently, which is the behavior we want at the producer layer (the worker
// owns dedupe between scheduled steps).
export const campaignDripQueue = new Queue("campaign-drip", {
  connection,
  defaultJobOptions: {
    attempts: 3,
    backoff: { type: "exponential", delay: 60_000 },
    removeOnComplete: { count: 5000 },
    removeOnFail: { count: 1000 },
  },
});

const PORT = process.env.QUEUE_PORT ?? "3001";

export async function handleRequest(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const url = new URL(req.url);

  if (url.pathname === "/health") {
    const counts = await agentQueue.getJobCounts();
    return Response.json({ ok: true, queue: counts });
  }

  if (url.pathname === "/enqueue") {
    const secret = req.headers.get("x-queue-secret");
    if (secret !== process.env.QUEUE_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    const job = await agentQueue.add("webhook", body, {
      priority: getPriority(body),
    });

    return Response.json({ queued: true, jobId: job.id });
  }

  if (url.pathname === "/enqueue-campaign") {
    const secret = req.headers.get("x-queue-secret");
    if (secret !== process.env.QUEUE_SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }

    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return new Response("Invalid JSON", { status: 400 });
    }

    if (
      typeof body !== "object" ||
      body === null ||
      typeof (body as { personId?: unknown }).personId !== "string" ||
      typeof (body as { campaignId?: unknown }).campaignId !== "string"
    ) {
      return new Response("Missing personId or campaignId", { status: 400 });
    }

    const { personId, campaignId } = body as { personId: string; campaignId: string };
    const jobId = `${personId}:${campaignId}`;

    // Idempotent enroll: BullMQ enforces unique jobId. We use the campaignId
    // as the worker-routing job name so each worker can subscribe to its own
    // campaign type without inspecting payload.
    const job = await campaignDripQueue.add(
      campaignId,
      { personId, campaignId, enrolledAt: new Date().toISOString() },
      { jobId },
    );

    return Response.json({ queued: true, jobId: job.id ?? jobId });
  }

  return new Response("Not Found", { status: 404 });
}

export function getPriority(body: unknown): number {
  if (typeof body !== "object" || body === null) return 10;
  const b = body as Record<string, unknown>;
  // New inbound SMS from a lead gets highest priority
  if (b.type === "InboundMessage") return 1;
  if (b.type === "ContactCreated") return 3;
  return 10;
}

createServer(async (req, res) => {
  const body = await new Promise<Buffer>((resolve) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks)));
  });
  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method !== "GET" ? new Uint8Array(body) : undefined,
  });
  const response = await handleRequest(request);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(await response.text());
}).listen(Number(PORT));

console.log(`Queue API listening on port ${PORT}`);

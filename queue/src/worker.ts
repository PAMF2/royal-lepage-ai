#!/usr/bin/env node
/**
 * BullMQ worker — pulls jobs from the agent queue and forwards to orchestrator.
 * Run multiple replicas for horizontal scale (WORKER_CONCURRENCY env var).
 */
import { Worker, type Job } from "bullmq";
import { createConnection } from "./redis.js";

const ORCHESTRATOR_URL =
  process.env.ORCHESTRATOR_URL ?? "http://localhost:3000";
const ORCHESTRATOR_SECRET = process.env.ORCHESTRATOR_WEBHOOK_SECRET ?? "";
const CONCURRENCY = Number(process.env.WORKER_CONCURRENCY ?? "5");

const connection = createConnection();

async function processJob(job: Job) {
  const res = await fetch(`${ORCHESTRATOR_URL}/webhook/ghl`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-webhook-secret": ORCHESTRATOR_SECRET,
    },
    body: JSON.stringify(job.data),
  });

  if (!res.ok) {
    throw new Error(`Orchestrator ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

const worker = new Worker("agent-jobs", processJob, {
  connection,
  concurrency: CONCURRENCY,
});

worker.on("completed", (job) => {
  console.log(`[worker] job ${job.id} completed`);
});

worker.on("failed", (job, err) => {
  console.error(`[worker] job ${job?.id} failed: ${err.message}`);
});

worker.on("error", (err) => {
  console.error("[worker] error:", err);
});

console.log(
  `Worker started — concurrency ${CONCURRENCY}, orchestrator ${ORCHESTRATOR_URL}`,
);

process.on("SIGTERM", async () => {
  await worker.close();
  process.exit(0);
});

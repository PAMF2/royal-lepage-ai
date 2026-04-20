#!/usr/bin/env node
/**
 * Monitoring server — logs conversations, tracks agent metrics, exposes health.
 * POST /log  — called by orchestrator after each agent run
 * GET  /health — system health check
 * GET  /metrics — aggregate stats (total runs, avg turns, error rate)
 */
import { Redis } from "ioredis";

const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
const PORT = process.env.MONITORING_PORT ?? "3002";
const SECRET = process.env.MONITORING_SECRET ?? "";

interface ConversationLog {
  contactId: string;
  trigger: string;
  turns: number;
  toolsUsed: string[];
  outcome: string;
  durationMs: number;
  error?: string;
  ts: number;
}

async function handleRequest(req: Request): Promise<Response> {
  const url = new URL(req.url);

  if (url.pathname === "/health") {
    try {
      await redis.ping();
      return Response.json({ ok: true, redis: "up" });
    } catch {
      return Response.json({ ok: false, redis: "down" }, { status: 503 });
    }
  }

  if (url.pathname === "/log" && req.method === "POST") {
    if (req.headers.get("x-monitoring-secret") !== SECRET) {
      return new Response("Unauthorized", { status: 401 });
    }
    const entry = (await req.json()) as ConversationLog;
    entry.ts = Date.now();

    const key = `conv:${entry.contactId}:${entry.ts}`;
    await redis.setex(key, 60 * 60 * 24 * 90, JSON.stringify(entry)); // 90 day TTL
    await redis.lpush("conv:recent", key);
    await redis.ltrim("conv:recent", 0, 9999); // keep last 10k

    await redis.incr("metrics:total_runs");
    if (entry.error) await redis.incr("metrics:total_errors");
    await redis.incrby("metrics:total_turns", entry.turns);
    await redis.incrby("metrics:total_duration_ms", entry.durationMs);

    return Response.json({ logged: true });
  }

  if (url.pathname === "/metrics" && req.method === "GET") {
    const [total, errors, turns, durationMs] = await redis.mget(
      "metrics:total_runs",
      "metrics:total_errors",
      "metrics:total_turns",
      "metrics:total_duration_ms",
    );

    const totalRuns = Number(total ?? 0);
    const totalErrors = Number(errors ?? 0);
    const totalTurns = Number(turns ?? 0);
    const totalDuration = Number(durationMs ?? 0);

    return Response.json({
      totalRuns,
      totalErrors,
      errorRate:
        totalRuns > 0
          ? ((totalErrors / totalRuns) * 100).toFixed(2) + "%"
          : "0%",
      avgTurns: totalRuns > 0 ? (totalTurns / totalRuns).toFixed(1) : "0",
      avgDurationMs: totalRuns > 0 ? Math.round(totalDuration / totalRuns) : 0,
    });
  }

  if (url.pathname === "/conversations" && req.method === "GET") {
    const limit = Number(url.searchParams.get("limit") ?? "20");
    const keys = await redis.lrange("conv:recent", 0, limit - 1);
    if (!keys.length) return Response.json([]);
    const values = await redis.mget(...keys);
    const logs = values
      .filter(Boolean)
      .map((v) => JSON.parse(v as string) as ConversationLog);
    return Response.json(logs);
  }

  return new Response("Not Found", { status: 404 });
}

// Node.js HTTP server
const { createServer } = await import("http");
createServer(async (req, res) => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  const body = Buffer.concat(chunks);

  const request = new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: req.headers as HeadersInit,
    body: req.method !== "GET" && body.length ? body : undefined,
  });

  const response = await handleRequest(request);
  const text = await response.text();
  res.writeHead(response.status, {
    "Content-Type": response.headers.get("Content-Type") ?? "text/plain",
  });
  res.end(text);
}).listen(Number(PORT));

console.log(`Monitoring server listening on port ${PORT}`);

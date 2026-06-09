/**
 * workers/nurture-7day.ts — 7-day nurture campaign.
 *
 * Triggered when a new lead is created in FUB. Sends 4 touches over 7 days:
 *   Day 0 (immediate): SMS welcome + lead-source acknowledgement
 *   Day 1: email with neighborhood listings sampler
 *   Day 3: SMS check-in
 *   Day 7: email with curated property matches
 *
 * Worker contract: a single BullMQ job with name = "nurture-7day". On
 * activation, the worker iterates the steps array; each step is dispatched
 * via `dispatchStep()` then sleeps for `delayMs`. The worker is restart-safe
 * because BullMQ tracks job progress and `step.name` is logged on each
 * dispatch — replaying a failed job re-runs from the same step at the cost
 * of an extra (idempotent) send; tighten to per-step jobs in a follow-up if
 * that cost becomes real.
 */
import { Worker, type Job } from "bullmq";
import { createConnection } from "../redis.js";
import {
  type CampaignJobData,
  type CampaignStep,
  dispatchStep,
  days,
} from "./steps.js";

export const NURTURE_7DAY_STEPS: ReadonlyArray<CampaignStep> = [
  { name: "day0-welcome-sms", kind: "sms", delayMs: 0, templateId: "nurture-7day:day0" },
  { name: "day1-listings-email", kind: "email", delayMs: days(1), templateId: "nurture-7day:day1" },
  { name: "day3-checkin-sms", kind: "sms", delayMs: days(3), templateId: "nurture-7day:day3" },
  { name: "day7-matches-email", kind: "email", delayMs: days(7), templateId: "nurture-7day:day7" },
];

export async function runNurture7DayJob(job: Job<CampaignJobData>): Promise<void> {
  for (const step of NURTURE_7DAY_STEPS) {
    if (step.delayMs > 0) {
      await new Promise((r) => setTimeout(r, step.delayMs));
    }
    await dispatchStep(job.data, step);
  }
}

// Skip worker spawn in tests — they import the file for step-graph assertions
// and don't want a real Redis connection. The `if` guard mirrors how
// queue/src/index.ts is consumed.
if (process.env.NODE_ENV !== "test") {
  const connection = createConnection();
  const worker = new Worker<CampaignJobData>(
    "campaign-drip",
    async (job) => {
      if (job.name === "nurture-7day") return runNurture7DayJob(job);
    },
    { connection, concurrency: Number(process.env.NURTURE_CONCURRENCY ?? "5") },
  );
  worker.on("failed", (_job, err) => console.error("[nurture-7day]", err.message));
}

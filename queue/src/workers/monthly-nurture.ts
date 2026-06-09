/**
 * workers/monthly-nurture.ts — monthly nurture email for leads in Nurture stage.
 *
 * Single-step campaign that recurs every 30 days. Content is sourced from
 * campaign-templates/ at dispatch time so editing a template does not
 * require redeploying the worker.
 *
 * Recurrence: the worker re-enqueues itself with a 30-day delay at the end
 * of each successful run, using the same deterministic job id so two
 * concurrent enrolls collapse to one schedule.
 */
import { Queue, Worker, type Job } from "bullmq";
import { createConnection } from "../redis.js";
import {
  type CampaignJobData,
  type CampaignStep,
  dispatchStep,
  days,
} from "./steps.js";

export const MONTHLY_NURTURE_STEPS: ReadonlyArray<CampaignStep> = [
  { name: "monthly-email", kind: "email", delayMs: 0, templateId: "nurture-monthly:default" },
];

export async function runMonthlyNurtureJob(
  job: Job<CampaignJobData>,
  queue: Pick<Queue, "add">,
): Promise<void> {
  for (const step of MONTHLY_NURTURE_STEPS) {
    await dispatchStep(job.data, step);
  }
  // Re-enqueue self 30 days out. JobId rotates so BullMQ accepts the new
  // entry; the campaignId stays stable so the worker name dispatch still
  // matches.
  const nextJobId = `${job.data.personId}:${job.data.campaignId}:${Date.now()}`;
  await queue.add(
    job.data.campaignId,
    { ...job.data, enrolledAt: new Date().toISOString() },
    { jobId: nextJobId, delay: days(30) },
  );
}

if (process.env.NODE_ENV !== "test") {
  const connection = createConnection();
  const queue = new Queue("campaign-drip", { connection });
  const worker = new Worker<CampaignJobData>(
    "campaign-drip",
    async (job) => {
      if (job.name === "monthly-nurture") return runMonthlyNurtureJob(job, queue);
    },
    { connection, concurrency: Number(process.env.MONTHLY_CONCURRENCY ?? "3") },
  );
  worker.on("failed", (_job, err) => console.error("[monthly-nurture]", err.message));
}

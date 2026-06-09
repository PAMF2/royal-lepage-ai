/**
 * workers/reactivation.ts — cold-lead reactivation campaign.
 *
 * Single-step campaign: one SMS with a fresh IDX listing link + opt-out
 * language. Triggered by the daily reactivation engine (lead-scoring module)
 * when it surfaces a dormant lead whose target area now has a new listing.
 *
 * The reactivation engine enqueues per matched lead with a unique
 * `${personId}:reactivation:${listingId}` job id, so re-running the same
 * scan against the same lead+listing pair is a no-op at the producer layer.
 */
import { Worker, type Job } from "bullmq";
import { createConnection } from "../redis.js";
import {
  type CampaignJobData,
  type CampaignStep,
  dispatchStep,
} from "./steps.js";

export const REACTIVATION_STEPS: ReadonlyArray<CampaignStep> = [
  { name: "reactivation-sms", kind: "sms", delayMs: 0, templateId: "reactivation:listing-match" },
];

export async function runReactivationJob(job: Job<CampaignJobData>): Promise<void> {
  for (const step of REACTIVATION_STEPS) {
    await dispatchStep(job.data, step);
  }
}

if (process.env.NODE_ENV !== "test") {
  const connection = createConnection();
  const worker = new Worker<CampaignJobData>(
    "campaign-drip",
    async (job) => {
      if (job.name === "reactivation") return runReactivationJob(job);
    },
    { connection, concurrency: Number(process.env.REACTIVATION_CONCURRENCY ?? "10") },
  );
  worker.on("failed", (_job, err) => console.error("[reactivation]", err.message));
}

/**
 * workers/appointment-reminders.ts — appointment reminder campaign.
 *
 * Two SMS touches before a booked appointment:
 *   T-24h: full reminder with address + how-to-reach-agent
 *   T-1h:  short heads-up
 *
 * The producer (crm_book_appointment, or a downstream cron in step G+) is
 * responsible for enqueueing with a payload that includes the appointment
 * timestamp. The worker schedules the two SMS sends relative to that.
 *
 * Note on persistence: BullMQ delayed jobs survive Redis restart so the two
 * reminders fire even if the worker restarts in between, as long as Redis
 * itself is durable. Loss-of-Redis is the open risk noted in the migration
 * doc; mitigation is to keep the SMS templates idempotent at the receiver
 * (no harm in a duplicated reminder).
 */
import { Worker, type Job } from "bullmq";
import { createConnection } from "../redis.js";
import {
  type CampaignJobData,
  type CampaignStep,
  dispatchStep,
  hours,
} from "./steps.js";

export const APPOINTMENT_REMINDER_STEPS: ReadonlyArray<CampaignStep> = [
  { name: "t-24h-sms", kind: "sms", delayMs: 0, templateId: "appointment:t-24h" },
  { name: "t-1h-sms", kind: "sms", delayMs: hours(23), templateId: "appointment:t-1h" },
];

export async function runAppointmentReminderJob(job: Job<CampaignJobData>): Promise<void> {
  for (const step of APPOINTMENT_REMINDER_STEPS) {
    if (step.delayMs > 0) {
      await new Promise((r) => setTimeout(r, step.delayMs));
    }
    await dispatchStep(job.data, step);
  }
}

if (process.env.NODE_ENV !== "test") {
  const connection = createConnection();
  const worker = new Worker<CampaignJobData>(
    "campaign-drip",
    async (job) => {
      if (job.name === "appointment-reminders") return runAppointmentReminderJob(job);
    },
    { connection, concurrency: Number(process.env.APPOINTMENT_CONCURRENCY ?? "5") },
  );
  worker.on("failed", (_job, err) => console.error("[appointment-reminders]", err.message));
}

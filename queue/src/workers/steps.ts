/**
 * workers/steps.ts — shared step DAG types + dispatch stub.
 *
 * The 4 worker files in this directory each declare an immutable array of
 * `CampaignStep` entries. `dispatchStep` is the single place where an actual
 * outbound is performed; right now it is a TODO marker because the wiring
 * back into the orchestrator's `crm_send_sms` / `crm_send_email` tools is
 * pending a one-time decision on shared-sender packaging (per
 * MIGRATION-GHL-TO-FUB.md "no duplicate HTTP code").
 *
 * Until that decision lands, the workers are scheduling-only: the BullMQ
 * job graph is correct (delays, ordering, idempotency), but the leaf send
 * is a no-op that logs the would-be action. This keeps step G's surface
 * area auditable and lets step I cut over without the send wiring blocking
 * the milestone.
 *
 * The fastest follow-up path:
 *   1. Add a small shared package (or a /internal/send route on the
 *      orchestrator) that wraps the Twilio + SendGrid + FUB-note logic.
 *   2. Replace the `console.log` in dispatchStep with a real call.
 *   3. Add an integration test that mocks the shared sender.
 */

export type StepKind = "sms" | "email";

export interface CampaignStep {
  /** Stable name for logs + step transitions */
  name: string;
  /** SMS or email payload */
  kind: StepKind;
  /** Delay (ms) from enrollment before this step fires */
  delayMs: number;
  /** Template id; resolved at dispatch time from campaign-templates/ */
  templateId: string;
}

export interface CampaignJobData {
  personId: string;
  campaignId: string;
  enrolledAt: string;
}

/**
 * TODO: replace with real send via shared sender package or orchestrator
 * /internal/send route. See file header for rationale.
 */
export async function dispatchStep(
  job: CampaignJobData,
  step: CampaignStep,
): Promise<void> {
  // eslint-disable-next-line no-console
  console.log(
    `[campaign-drip:STUB] would dispatch ${step.kind} step "${step.name}" ` +
      `(template=${step.templateId}) to person=${job.personId} for campaign=${job.campaignId}`,
  );
}

/** Day → ms helper used by the worker step declarations below. */
export const days = (n: number): number => n * 24 * 60 * 60 * 1000;
export const hours = (n: number): number => n * 60 * 60 * 1000;

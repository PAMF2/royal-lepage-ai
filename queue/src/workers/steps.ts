/**
 * workers/steps.ts — shared step DAG types + dispatch.
 *
 * The 4 worker files in this directory each declare an immutable array of
 * `CampaignStep` entries. `dispatchStep` POSTs to the orchestrator's
 * /internal/send route (added in step L), which owns the Twilio + SendGrid
 * + FUB-note chain — workers reuse that single sender source-of-truth
 * rather than duplicating clients.
 *
 * Auth: ORCHESTRATOR_INTERNAL_SECRET must be set on both sides.
 * Endpoint base: ORCHESTRATOR_URL (default http://localhost:3000).
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

export async function dispatchStep(
  job: CampaignJobData,
  step: CampaignStep,
  fetchImpl: typeof fetch = fetch,
): Promise<void> {
  const url = `${process.env.ORCHESTRATOR_URL ?? "http://localhost:3000"}/internal/send`;
  const secret = process.env.ORCHESTRATOR_INTERNAL_SECRET ?? "";
  const res = await fetchImpl(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-internal-secret": secret,
    },
    body: JSON.stringify({
      kind: step.kind,
      personId: job.personId,
      templateId: step.templateId,
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(
      `[campaign-drip] /internal/send ${res.status} for ${step.kind} ` +
        `step "${step.name}" person=${job.personId}: ${text}`,
    );
  }
}

/** Day → ms helper used by the worker step declarations below. */
export const days = (n: number): number => n * 24 * 60 * 60 * 1000;
export const hours = (n: number): number => n * 60 * 60 * 1000;

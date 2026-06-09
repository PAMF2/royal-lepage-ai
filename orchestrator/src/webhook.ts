import crypto from "crypto";
import type { Request, Response } from "express";
import { runAgent } from "./agent.js";

// FUB signs webhook payloads with HMAC-SHA256 using a secret configured in
// the FUB UI. Same verification pattern as the prior GHL implementation —
// only the header name and env var changed.
//
// TODO: verify x-fub-signature header name + HMAC payload encoding against
// FUB v1 webhook docs once the FUB account is provisioned. Migration doc
// names it `X-FUB-Signature`; case-insensitive headers means lower-case here.
const WEBHOOK_SECRET = process.env.FUB_WEBHOOK_SECRET ?? "";
const MAX_CONCURRENT = Number(process.env.AGENT_CONCURRENCY ?? "5");
const PER_CONTACT_COOLDOWN_MS = Number(process.env.AGENT_COOLDOWN_MS ?? "1000");

let activeAgents = 0;
const lastRunByContact = new Map<string, number>();

function verifySignature(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true; // dev mode: skip if not configured

  const signature = req.headers["x-fub-signature"] as string | undefined;
  if (!signature) return false;

  const payload = JSON.stringify(req.body);
  const expected = crypto
    .createHmac("sha256", WEBHOOK_SECRET)
    .update(payload)
    .digest("hex");

  const sigBuf = Buffer.from(signature, "hex");
  const expBuf = Buffer.from(expected, "hex");
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

function isThrottled(contactId: string): boolean {
  if (activeAgents >= MAX_CONCURRENT) return true;
  const last = lastRunByContact.get(contactId) ?? 0;
  return Date.now() - last < PER_CONTACT_COOLDOWN_MS;
}

function trackRun(contactId: string) {
  activeAgents++;
  lastRunByContact.set(contactId, Date.now());
}

function releaseRun() {
  activeAgents--;
}

// ---------------------------------------------------------------------------
// FUB webhook envelope
// ---------------------------------------------------------------------------
//
// FUB dispatches a single endpoint with a typed `event` field. We handle the
// three events listed in MIGRATION-GHL-TO-FUB.md:
//   - peopleCreated         → new_lead trigger to runAgent
//   - peopleUpdated         → re-score (TODO: wired in step G when the
//                             lead-scoring queue handler lands)
//   - conversationsCreated  → incoming_message trigger to runAgent
//
// TODO: confirm event payload shapes against FUB v1 docs once provisioned.
// The shapes below mirror MIGRATION-GHL-TO-FUB.md and the existing
// `peopleCreated` example data attached to the FUB account.

interface FubPerson {
  id?: string | number;
  firstName?: string;
  lastName?: string;
  phones?: { value: string }[] | string[];
  emails?: { value: string }[] | string[];
  source?: string;
}

interface FubConversation {
  personId?: string | number;
  message?: string;
  conversationId?: string;
}

interface FubWebhookBody {
  event?: "peopleCreated" | "peopleUpdated" | "conversationsCreated";
  data?: FubPerson | FubConversation;
}

function primary<T>(arr: { value: T }[] | T[] | undefined): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const first = arr[0];
  return typeof first === "object" && first !== null && "value" in first
    ? (first as { value: T }).value
    : (first as T);
}

export async function handleFubWebhook(req: Request, res: Response) {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }

  // Ack immediately so FUB does not retry on our processing time.
  res.sendStatus(200);

  const body = req.body as FubWebhookBody | undefined;
  if (!body?.event || !body.data) return;

  switch (body.event) {
    case "peopleCreated": {
      const person = body.data as FubPerson;
      const contactId = person.id != null ? String(person.id) : "";
      if (!contactId) return;
      if (isThrottled(contactId)) return;
      trackRun(contactId);
      try {
        await runAgent({
          trigger: "new_lead",
          contactId,
          contactName: `${person.firstName ?? ""} ${person.lastName ?? ""}`.trim(),
          contactPhone: primary(person.phones),
          contactEmail: primary(person.emails),
          source: person.source ?? "unknown",
        });
      } finally {
        releaseRun();
      }
      return;
    }

    case "peopleUpdated": {
      // TODO (step G): if LPMAMA custom fields changed, enqueue a re-score
      // job on the lead-scoring queue. For now this event is acked but not
      // processed — same observable behavior the GHL surface had before
      // updates were wired.
      return;
    }

    case "conversationsCreated": {
      const conv = body.data as FubConversation;
      const contactId = conv.personId != null ? String(conv.personId) : "";
      if (!contactId || !conv.message) return;
      if (isThrottled(contactId)) return;
      trackRun(contactId);
      try {
        await runAgent({
          trigger: "incoming_message",
          contactId,
          message: conv.message,
          conversationId: conv.conversationId,
        });
      } finally {
        releaseRun();
      }
      return;
    }
  }
}

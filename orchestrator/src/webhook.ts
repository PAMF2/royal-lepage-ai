import crypto from "crypto";
import type { Request, Response } from "express";
import { runAgent } from "./agent.js";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";
const MAX_CONCURRENT = Number(process.env.AGENT_CONCURRENCY ?? "5");
const PER_CONTACT_COOLDOWN_MS = Number(process.env.AGENT_COOLDOWN_MS ?? "1000");

let activeAgents = 0;
const lastRunByContact = new Map<string, number>();

function verifySignature(req: Request): boolean {
  if (!WEBHOOK_SECRET) return true; // dev mode: skip if not configured

  const signature = req.headers["x-ghl-signature"] as string | undefined;
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

export async function handleLeadWebhook(req: Request, res: Response) {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);
  const contact = req.body;
  if (!contact?.id) return;

  if (isThrottled(contact.id)) return;

  trackRun(contact.id);
  try {
    await runAgent({
      trigger: "new_lead",
      contactId: contact.id,
      contactName:
        `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
      contactPhone: contact.phone,
      contactEmail: contact.email,
      source: contact.source ?? "unknown",
    });
  } finally {
    releaseRun();
  }
}

export async function handleMessageWebhook(req: Request, res: Response) {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);
  const msg = req.body;
  if (!msg?.contactId || !msg?.message) return;

  if (isThrottled(msg.contactId)) return;

  trackRun(msg.contactId);
  try {
    await runAgent({
      trigger: "incoming_message",
      contactId: msg.contactId,
      message: msg.message,
      conversationId: msg.conversationId,
    });
  } finally {
    releaseRun();
  }
}

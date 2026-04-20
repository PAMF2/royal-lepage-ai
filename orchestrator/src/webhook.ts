import crypto from "crypto";
import type { Request, Response } from "express";
import { runAgent } from "./agent.js";

const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET ?? "";

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
  // timingSafeEqual requires equal-length buffers; unequal length means invalid
  if (sigBuf.length !== expBuf.length) return false;
  return crypto.timingSafeEqual(sigBuf, expBuf);
}

export async function handleLeadWebhook(req: Request, res: Response) {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200); // acknowledge immediately before async work
  const contact = req.body;
  if (!contact?.id) return;

  await runAgent({
    trigger: "new_lead",
    contactId: contact.id,
    contactName: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
    contactPhone: contact.phone,
    contactEmail: contact.email,
    source: contact.source ?? "unknown",
  });
}

export async function handleMessageWebhook(req: Request, res: Response) {
  if (!verifySignature(req)) {
    res.sendStatus(401);
    return;
  }

  res.sendStatus(200);
  const msg = req.body;
  if (!msg?.contactId || !msg?.message) return;

  await runAgent({
    trigger: "incoming_message",
    contactId: msg.contactId,
    message: msg.message,
    conversationId: msg.conversationId,
  });
}

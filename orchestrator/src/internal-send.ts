/**
 * internal-send.ts — POST /internal/send route handler.
 *
 * Called by queue/ campaign-drip workers (see queue/src/workers/steps.ts
 * dispatchStep). The orchestrator is the single source of truth for the
 * Twilio + SendGrid + FUB-note outbound chain; this route is the seam that
 * lets workers reuse that chain without duplicating the clients.
 *
 * Auth: x-internal-secret header must match ORCHESTRATOR_INTERNAL_SECRET.
 * This is a server-to-server endpoint behind the orchestrator's network
 * boundary — not exposed to public webhooks.
 *
 * Body:
 *   { kind: "sms" | "email", personId, templateId, message?, subject?, body? }
 *
 * Message resolution: if `message` (or `subject`+`body` for email) is
 * supplied, it is used directly. Otherwise a placeholder built from the
 * templateId is used. Template-file loading from campaign-templates/ is a
 * follow-up; the call shape lets that swap in without changing the worker
 * contract.
 *
 * For SMS the route looks up the contact's phone via crm_get_contact, then
 * dispatches via crm_send_sms — same chain the agent loop uses, so audit
 * notes land in FUB the same way for cron-driven sends and agent-driven
 * sends.
 */
import type { Request, Response } from "express";
import { handleCrmTool } from "./tools/crm.js";

function env(key: string, fallback = ""): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

interface FubPersonLite {
  phones?: { value: string }[] | string[];
  emails?: { value: string }[] | string[];
}

function pickPrimary<T>(arr: { value: T }[] | T[] | undefined): T | undefined {
  if (!arr || arr.length === 0) return undefined;
  const first = arr[0];
  return typeof first === "object" && first !== null && "value" in first
    ? (first as { value: T }).value
    : (first as T);
}

interface InternalSendBody {
  kind?: "sms" | "email";
  personId?: string;
  templateId?: string;
  message?: string;
  subject?: string;
  body?: string;
}

export async function handleInternalSend(req: Request, res: Response): Promise<void> {
  const secret = env("ORCHESTRATOR_INTERNAL_SECRET");
  if (!secret || req.headers["x-internal-secret"] !== secret) {
    res.sendStatus(401);
    return;
  }

  const body = (req.body ?? {}) as InternalSendBody;
  if (!body.kind || !body.personId) {
    res.status(400).json({ error: "kind + personId required" });
    return;
  }

  // Fetch the contact once so we can route to phone/email and so any FUB
  // 404 (deleted contact) is surfaced as 404 here rather than as a Twilio
  // "missing recipient" downstream.
  let contact: FubPersonLite;
  try {
    contact = (await handleCrmTool("crm_get_contact", { contactId: body.personId })) as FubPersonLite;
  } catch (e) {
    res.status(502).json({ error: `crm_get_contact failed: ${e instanceof Error ? e.message : String(e)}` });
    return;
  }

  if (body.kind === "sms") {
    const toPhone = pickPrimary(contact.phones);
    if (!toPhone) {
      res.status(422).json({ error: "contact has no phone" });
      return;
    }
    const message =
      body.message ??
      `[${body.templateId ?? "drip"}] (template body not yet loaded — replace via campaign-templates/ loader)`;
    const result = await handleCrmTool("crm_send_sms", {
      contactId: body.personId,
      toPhone,
      message,
    });
    res.status(200).json(result);
    return;
  }

  if (body.kind === "email") {
    const toEmail = pickPrimary(contact.emails);
    if (!toEmail) {
      res.status(422).json({ error: "contact has no email" });
      return;
    }
    const subject = body.subject ?? `[${body.templateId ?? "drip"}]`;
    const html =
      body.body ??
      `<p>[${body.templateId ?? "drip"}] (template body not yet loaded — replace via campaign-templates/ loader)</p>`;
    const result = await handleCrmTool("crm_send_email", {
      contactId: body.personId,
      toEmail,
      subject,
      body: html,
    });
    res.status(200).json(result);
    return;
  }

  res.status(400).json({ error: `unknown kind: ${body.kind}` });
}

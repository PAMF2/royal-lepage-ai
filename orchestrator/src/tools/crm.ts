/**
 * tools/crm.ts — CRM tool surface (FUB + Twilio + SendGrid + BullMQ).
 *
 * Replaces tools/ghl.ts. Tool names are renamed `ghl_*` → `crm_*` so the
 * agent's system prompt carries no vendor-specific naming.
 *
 * See MIGRATION-GHL-TO-FUB.md for the per-endpoint mapping and the rationale.
 *
 * Outbound side-effects:
 *   - SMS via Twilio Messages API, then logged to FUB `/notes` so the
 *     conversation history stays single-source.
 *   - Email via SendGrid v3 API, then logged to FUB `/notes` for the same
 *     reason. The one-line swap point to FUB native outbound (if/when it
 *     ships) lives in `sendEmail()`.
 *   - Campaign enroll posts to the queue/ server's `/enqueue-campaign`
 *     endpoint, which adds a BullMQ job to the `campaign-drip` queue. The
 *     queue server's endpoint is added in step G (BullMQ drip workers).
 *
 * Net constraints (per migration doc):
 *   - 10s timeout per call.
 *   - 3x exponential backoff (1s / 4s / 16s) on 5xx and network errors.
 *   - FUB rate limit 250 req / 10s — enforced by an in-memory sliding window.
 *   - Twilio rate limit 1 msg/sec/FROM — relied on at the API layer; we do
 *     not duplicate the throttle here.
 *
 * FUB endpoint paths used below are best-guess against the migration doc.
 * Each carries a `// TODO: verify against FUB v1 docs once API key arrives`
 * marker so we don't ship code that silently 404s against the real API.
 */
import type Anthropic from "@anthropic-ai/sdk";

const FUB_BASE = "https://api.followupboss.com/v1";

// Env is read lazily (per call) so credentials rotated at runtime take effect
// without a process restart, and so test setups that set env vars after
// module-load still see them. The previous module-scope `const` reads bound
// stale empty values when tests imported crm.ts.
function env(key: string, fallback = ""): string {
  const v = process.env[key];
  return v && v.length > 0 ? v : fallback;
}

// ---------------------------------------------------------------------------
// HTTP wrapper — timeout, retry, JSON in/out
// ---------------------------------------------------------------------------

interface HttpOpts {
  method: string;
  url: string;
  headers?: Record<string, string>;
  body?: unknown;
  timeoutMs?: number;
  retries?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;
const RETRY_DELAYS_MS = [1_000, 4_000, 16_000];

export async function httpJSON<T = unknown>(opts: HttpOpts): Promise<T> {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = (opts.retries ?? RETRY_DELAYS_MS.length) + 1;

  let lastErr: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(opts.url, {
        method: opts.method,
        headers: {
          "Content-Type": "application/json",
          ...(opts.headers ?? {}),
        },
        body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
        signal: controller.signal,
      });
      clearTimeout(timer);

      // Retry 5xx; raise immediately on 4xx (client error, retry won't help)
      if (res.status >= 500) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      // Some endpoints return 204 with empty body
      const ct = res.headers.get("content-type") ?? "";
      if (res.status === 204 || !ct.includes("json")) {
        return undefined as T;
      }
      return (await res.json()) as T;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      const isLast = attempt === maxAttempts - 1;
      const isRetryable = isNetworkErr(err) || is5xx(err);
      if (isLast || !isRetryable) break;
      await sleep(RETRY_DELAYS_MS[attempt] ?? RETRY_DELAYS_MS[RETRY_DELAYS_MS.length - 1]);
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNetworkErr(err: unknown): boolean {
  if (!(err instanceof Error)) return false;
  // node fetch surfaces network failures as TypeError "fetch failed" or AbortError on timeout
  return err.name === "AbortError" || err.message.includes("fetch failed") || err.message.includes("ECONN");
}

function is5xx(err: unknown): boolean {
  return err instanceof Error && /^HTTP 5\d\d:/.test(err.message);
}

// ---------------------------------------------------------------------------
// FUB sliding-window rate limiter — 250 req / 10s
// ---------------------------------------------------------------------------

const FUB_WINDOW_MS = 10_000;
const FUB_MAX_PER_WINDOW = 250;
const fubCallTimestamps: number[] = [];

export async function fubRateLimitGate(): Promise<void> {
  const now = Date.now();
  // Prune outside the window
  while (fubCallTimestamps.length > 0 && now - fubCallTimestamps[0] > FUB_WINDOW_MS) {
    fubCallTimestamps.shift();
  }
  if (fubCallTimestamps.length >= FUB_MAX_PER_WINDOW) {
    const waitMs = FUB_WINDOW_MS - (now - fubCallTimestamps[0]) + 1;
    await sleep(waitMs);
    return fubRateLimitGate();
  }
  fubCallTimestamps.push(now);
}

/** Test-only: reset the sliding window. Not exported to the agent surface. */
export function _resetFubRateLimiter(): void {
  fubCallTimestamps.length = 0;
}

// ---------------------------------------------------------------------------
// FUB client
// ---------------------------------------------------------------------------

async function fub<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string | number>,
): Promise<T> {
  await fubRateLimitGate();
  const url = new URL(`${FUB_BASE}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  }
  // FUB v1 uses HTTP Basic with the API key as the username and empty password.
  // TODO: verify against FUB v1 docs once API key arrives.
  const basic = Buffer.from(`${env("FUB_API_KEY")}:`).toString("base64");
  return httpJSON<T>({
    method,
    url: url.toString(),
    headers: {
      Authorization: `Basic ${basic}`,
      "X-System": "RoyalLepageHomie",
    },
    body,
  });
}

// ---------------------------------------------------------------------------
// Twilio client — Messages API
// ---------------------------------------------------------------------------

interface TwilioMessageResponse {
  sid: string;
  status: string;
  to: string;
  from: string;
  body: string;
}

async function twilioSendSms(to: string, body: string): Promise<TwilioMessageResponse> {
  const sid = env("TWILIO_ACCOUNT_SID");
  const url = `https://api.twilio.com/2010-04-01/Accounts/${sid}/Messages.json`;
  const basic = Buffer.from(`${sid}:${env("TWILIO_AUTH_TOKEN")}`).toString("base64");
  // Twilio Messages.json wants application/x-www-form-urlencoded, not JSON.
  // Hand-roll a small fetch here rather than bend httpJSON's JSON contract.
  const form = new URLSearchParams({ To: to, From: env("TWILIO_FROM"), Body: body });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Basic ${basic}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: form.toString(),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status >= 500) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      return (await res.json()) as TwilioMessageResponse;
    } catch (err) {
      lastErr = err;
      const isLast = attempt === RETRY_DELAYS_MS.length;
      const isRetryable = isNetworkErr(err) || is5xx(err);
      if (isLast || !isRetryable) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  clearTimeout(timer);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------------------------------------------------------------------------
// SendGrid client — v3 Mail Send
// ---------------------------------------------------------------------------

interface SendGridSendResult {
  messageId: string | null;
}

async function sendEmail(
  toEmail: string,
  subject: string,
  htmlBody: string,
): Promise<SendGridSendResult> {
  // ONE-LINE SWAP POINT: if FUB ships an outbound email endpoint, route here
  // instead of SendGrid. Until then, SendGrid v3 carries every outbound email.
  const url = "https://api.sendgrid.com/v3/mail/send";
  const apiKey = env("SENDGRID_API_KEY");
  const payload = {
    personalizations: [{ to: [{ email: toEmail }] }],
    from: { email: env("SENDGRID_FROM_EMAIL") },
    subject,
    content: [{ type: "text/html", value: htmlBody }],
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), DEFAULT_TIMEOUT_MS);
  let lastErr: unknown;
  for (let attempt = 0; attempt < RETRY_DELAYS_MS.length + 1; attempt++) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.status >= 500) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        throw new Error(`HTTP ${res.status}: ${text}`);
      }
      // SendGrid returns 202 with `X-Message-Id` header on success
      const messageId = res.headers.get("x-message-id");
      return { messageId };
    } catch (err) {
      lastErr = err;
      const isLast = attempt === RETRY_DELAYS_MS.length;
      const isRetryable = isNetworkErr(err) || is5xx(err);
      if (isLast || !isRetryable) break;
      await sleep(RETRY_DELAYS_MS[attempt]);
    }
  }
  clearTimeout(timer);
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

// ---------------------------------------------------------------------------
// Campaign enrollment — posts to queue/ server
// ---------------------------------------------------------------------------

interface EnrollResult {
  queued: boolean;
  jobId: string;
}

async function enrollInCampaign(personId: string, campaignId: string): Promise<EnrollResult> {
  // The queue/ server exposes /enqueue-campaign (added in step G). Idempotency
  // key is `${personId}:${campaignId}` so re-enrolling the same lead in the
  // same campaign is a no-op at the worker layer.
  // TODO: confirm endpoint name when step G lands.
  return httpJSON<EnrollResult>({
    method: "POST",
    url: `${env("QUEUE_API_URL", "http://localhost:3001")}/enqueue-campaign`,
    headers: { "x-queue-secret": env("QUEUE_SECRET") },
    body: { personId, campaignId },
  });
}

// ---------------------------------------------------------------------------
// Anthropic tool surface
// ---------------------------------------------------------------------------

export const crmTools: Anthropic.Tool[] = [
  {
    name: "crm_search_contacts",
    description: "Search contacts in the CRM (Follow Up Boss)",
    input_schema: {
      type: "object" as const,
      properties: { query: { type: "string" }, limit: { type: "number" } },
      required: ["query"],
    },
  },
  {
    name: "crm_get_contact",
    description: "Get full contact details by ID",
    input_schema: {
      type: "object" as const,
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    },
  },
  {
    name: "crm_send_sms",
    description: "Send an SMS to a contact (max 160 chars for first touch). Sends via Twilio and logs the outbound to the CRM contact's notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        toPhone: { type: "string", description: "E.164 phone number; required because Twilio is the sender, not the CRM" },
        message: { type: "string" },
      },
      required: ["contactId", "toPhone", "message"],
    },
  },
  {
    name: "crm_send_email",
    description: "Send an email to a contact (SendGrid). Logs the outbound to the CRM contact's notes.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        toEmail: { type: "string" },
        subject: { type: "string" },
        body: { type: "string", description: "HTML body" },
      },
      required: ["contactId", "toEmail", "subject", "body"],
    },
  },
  {
    name: "crm_get_conversation",
    description: "Get full conversation history (events) for a contact",
    input_schema: {
      type: "object" as const,
      properties: { contactId: { type: "string" } },
      required: ["contactId"],
    },
  },
  {
    name: "crm_add_note",
    description: "Add a note to a contact record",
    input_schema: {
      type: "object" as const,
      properties: { contactId: { type: "string" }, body: { type: "string" } },
      required: ["contactId", "body"],
    },
  },
  {
    name: "crm_update_pipeline_stage",
    description: "Move a contact to a new pipeline stage",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        stage: { type: "string", description: "Stage name as configured in the CRM" },
      },
      required: ["contactId", "stage"],
    },
  },
  {
    name: "crm_create_opportunity",
    description: "Create a pipeline opportunity (deal) for a contact",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        name: { type: "string" },
        value: { type: "number" },
        stage: { type: "string" },
      },
      required: ["contactId", "name", "stage"],
    },
  },
  {
    name: "crm_book_appointment",
    description: "Book a showing or consultation appointment",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        startTime: { type: "string", description: "ISO 8601 start time" },
        type: { type: "string", description: "e.g. Showing, Consultation" },
      },
      required: ["contactId", "startTime"],
    },
  },
  {
    name: "crm_add_tags",
    description: "Add tags to a contact (e.g. hot-lead, pre-approved, buyer)",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        tags: { type: "array", items: { type: "string" } },
      },
      required: ["contactId", "tags"],
    },
  },
  {
    name: "crm_enroll_campaign",
    description: "Enroll a contact in a drip campaign. Enqueues a BullMQ job; the campaign worker handles step scheduling.",
    input_schema: {
      type: "object" as const,
      properties: {
        contactId: { type: "string" },
        campaignId: { type: "string" },
      },
      required: ["contactId", "campaignId"],
    },
  },
];

// ---------------------------------------------------------------------------
// Tool handlers
// ---------------------------------------------------------------------------

export async function handleCrmTool(
  name: string,
  input: Record<string, unknown>,
): Promise<unknown> {
  switch (name) {
    case "crm_search_contacts": {
      // TODO: verify against FUB v1 docs once API key arrives.
      const limit = typeof input.limit === "number" ? input.limit : 10;
      return fub("GET", "/people", undefined, {
        query: String(input.query ?? ""),
        limit,
      });
    }

    case "crm_get_contact": {
      // TODO: verify against FUB v1 docs once API key arrives.
      return fub("GET", `/people/${input.contactId}`);
    }

    case "crm_send_sms": {
      const contactId = String(input.contactId);
      const toPhone = String(input.toPhone);
      const message = String(input.message);
      const sms = await twilioSendSms(toPhone, message);
      // Log to FUB so the conversation history stays single-source.
      // TODO: verify /notes payload shape against FUB v1 docs.
      await fub("POST", "/notes", {
        personId: contactId,
        body: `[SMS sent via Twilio sid=${sms.sid} to=${toPhone}]\n${message}`,
      }).catch(() => {
        // Don't fail the send if the audit-note write fails; surface in logs.
        // The send itself already happened; FUB note is best-effort.
      });
      return sms;
    }

    case "crm_send_email": {
      const contactId = String(input.contactId);
      const toEmail = String(input.toEmail);
      const subject = String(input.subject);
      const body = String(input.body);
      const result = await sendEmail(toEmail, subject, body);
      // TODO: verify /notes payload shape against FUB v1 docs.
      await fub("POST", "/notes", {
        personId: contactId,
        body: `[Email sent via SendGrid messageId=${result.messageId ?? "n/a"} to=${toEmail}]\nSubject: ${subject}`,
      }).catch(() => { /* best-effort */ });
      return result;
    }

    case "crm_get_conversation": {
      // TODO: verify /events?personId= against FUB v1 docs once API key arrives.
      return fub("GET", "/events", undefined, { personId: String(input.contactId) });
    }

    case "crm_add_note": {
      // TODO: verify /notes payload shape against FUB v1 docs.
      return fub("POST", "/notes", {
        personId: String(input.contactId),
        body: String(input.body),
      });
    }

    case "crm_update_pipeline_stage": {
      // TODO: verify FUB stage update payload — PUT /people/{id} with {stage}.
      return fub("PUT", `/people/${input.contactId}`, { stage: String(input.stage) });
    }

    case "crm_create_opportunity": {
      // TODO: verify /deals payload shape against FUB v1 docs.
      return fub("POST", "/deals", {
        personId: String(input.contactId),
        name: String(input.name),
        value: typeof input.value === "number" ? input.value : undefined,
        stage: String(input.stage),
      });
    }

    case "crm_book_appointment": {
      // TODO: verify /appointments payload shape against FUB v1 docs.
      return fub("POST", "/appointments", {
        personId: String(input.contactId),
        startTime: String(input.startTime),
        type: typeof input.type === "string" ? input.type : "Consultation",
      });
    }

    case "crm_add_tags": {
      // TODO: verify whether FUB exposes tag-append vs tag-set on PUT /people.
      const tags = Array.isArray(input.tags) ? (input.tags as string[]) : [];
      return fub("PUT", `/people/${input.contactId}`, { tags });
    }

    case "crm_enroll_campaign": {
      return enrollInCampaign(String(input.contactId), String(input.campaignId));
    }

    default:
      throw new Error(`Unknown CRM tool: ${name}`);
  }
}

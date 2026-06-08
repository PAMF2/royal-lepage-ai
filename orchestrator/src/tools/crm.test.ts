/**
 * crm.test.ts — unit tests for tools/crm.ts (mocked fetch).
 *
 * Strategy:
 *   - Stub global.fetch per test with a `vi.fn()` that returns the right
 *     shape for the endpoint under test. Inspect call args to assert URL,
 *     method, headers, and body.
 *   - Set the required env vars at file scope so module-load defaults pick
 *     them up. Each test that depends on env reads them via the same path.
 *   - Reset the FUB sliding-window between tests so a backed-up window from
 *     a prior test never blocks the next call.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Env BEFORE importing crm.ts so module-scope `const` reads pick them up.
process.env.FUB_API_KEY = "fub-test-key";
process.env.TWILIO_ACCOUNT_SID = "AC_test";
process.env.TWILIO_AUTH_TOKEN = "twilio-secret";
process.env.TWILIO_FROM = "+15145550000";
process.env.SENDGRID_API_KEY = "sg-test";
process.env.SENDGRID_FROM_EMAIL = "noreply@example.com";
process.env.QUEUE_API_URL = "http://queue.local:3001";
process.env.QUEUE_SECRET = "queue-test-secret";

import {
  handleCrmTool,
  crmTools,
  httpJSON,
  _resetFubRateLimiter,
} from "./crm.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function jsonResponse(body: unknown, init: { status?: number; headers?: Record<string, string> } = {}): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

function emptyResponse(status: number, headers: Record<string, string> = {}): Response {
  return new Response(null, { status, headers });
}

beforeEach(() => {
  _resetFubRateLimiter();
});

afterEach(() => {
  vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Tool surface contract
// ---------------------------------------------------------------------------

describe("crmTools surface", () => {
  it("exposes exactly 11 tools, all prefixed crm_", () => {
    expect(crmTools).toHaveLength(11);
    for (const t of crmTools) {
      expect(t.name.startsWith("crm_")).toBe(true);
    }
  });

  it("handleCrmTool throws on unknown tool name", async () => {
    await expect(handleCrmTool("crm_does_not_exist", {})).rejects.toThrow(/Unknown CRM tool/);
  });
});

// ---------------------------------------------------------------------------
// httpJSON — timeout + retry behavior
// ---------------------------------------------------------------------------

describe("httpJSON retry/timeout", () => {
  it("returns parsed JSON on 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ ok: true, n: 42 }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await httpJSON<{ ok: boolean; n: number }>({ method: "GET", url: "http://x/y" });
    expect(result).toEqual({ ok: true, n: 42 });
  });

  it("retries on 503 then succeeds (no real sleep)", async () => {
    vi.useFakeTimers();
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("upstream", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);

    const promise = httpJSON({ method: "GET", url: "http://x/y" });
    // Advance the 1s retry delay
    await vi.advanceTimersByTimeAsync(1_001);
    const result = await promise;

    expect(result).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("does NOT retry on 4xx — fails fast", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("bad payload", { status: 400 }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(httpJSON({ method: "POST", url: "http://x/y", body: {} })).rejects.toThrow(/HTTP 400/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

// ---------------------------------------------------------------------------
// FUB endpoints (search / get / events / notes / pipeline / deals / appt / tags)
// ---------------------------------------------------------------------------

describe("crm FUB endpoints", () => {
  it("crm_search_contacts → GET /people?query=&limit= with Basic auth", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ people: [{ id: 1 }] }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await handleCrmTool("crm_search_contacts", { query: "alice", limit: 5 });

    expect(out).toEqual({ people: [{ id: 1 }] });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("https://api.followupboss.com/v1/people?");
    expect(url).toContain("query=alice");
    expect(url).toContain("limit=5");
    expect(init.method).toBe("GET");
    expect((init.headers as Record<string, string>).Authorization).toMatch(/^Basic /);
  });

  it("crm_get_contact → GET /people/{id}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "p-42", firstName: "Jane" }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await handleCrmTool("crm_get_contact", { contactId: "p-42" });

    expect(out).toMatchObject({ id: "p-42" });
    expect(fetchMock.mock.calls[0][0]).toContain("/people/p-42");
  });

  it("crm_get_conversation → GET /events?personId=", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ events: [] }));
    vi.stubGlobal("fetch", fetchMock);

    await handleCrmTool("crm_get_conversation", { contactId: "p-99" });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/events?");
    expect(url).toContain("personId=p-99");
  });

  it("crm_add_note → POST /notes with {personId, body}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "note-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await handleCrmTool("crm_add_note", { contactId: "p-1", body: "hello" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/notes");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({ personId: "p-1", body: "hello" });
  });

  it("crm_update_pipeline_stage → PUT /people/{id} with {stage}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "p-7" }));
    vi.stubGlobal("fetch", fetchMock);

    await handleCrmTool("crm_update_pipeline_stage", { contactId: "p-7", stage: "Qualified" });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/people/p-7");
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ stage: "Qualified" });
  });

  it("crm_create_opportunity → POST /deals with {personId,name,value,stage}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "deal-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await handleCrmTool("crm_create_opportunity", {
      contactId: "p-1",
      name: "Condo on Bay",
      value: 750000,
      stage: "Open",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/deals");
    expect(JSON.parse(init.body as string)).toMatchObject({
      personId: "p-1",
      name: "Condo on Bay",
      value: 750000,
      stage: "Open",
    });
  });

  it("crm_book_appointment → POST /appointments", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "appt-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await handleCrmTool("crm_book_appointment", {
      contactId: "p-1",
      startTime: "2026-06-10T15:00:00Z",
      type: "Showing",
    });

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/appointments");
    expect(JSON.parse(init.body as string)).toMatchObject({
      personId: "p-1",
      startTime: "2026-06-10T15:00:00Z",
      type: "Showing",
    });
  });

  it("crm_add_tags → PUT /people/{id} with {tags}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: "p-1" }));
    vi.stubGlobal("fetch", fetchMock);

    await handleCrmTool("crm_add_tags", { contactId: "p-1", tags: ["hot-lead", "buyer"] });

    const [, init] = fetchMock.mock.calls[0];
    expect(init.method).toBe("PUT");
    expect(JSON.parse(init.body as string)).toEqual({ tags: ["hot-lead", "buyer"] });
  });
});

// ---------------------------------------------------------------------------
// Twilio + SendGrid + FUB note audit chain
// ---------------------------------------------------------------------------

describe("crm outbound (Twilio/SendGrid) with FUB audit note", () => {
  it("crm_send_sms posts to Twilio and then logs note to FUB", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ sid: "SM1", status: "queued", to: "+15140000000", from: "+15145550000", body: "hi" }))
      .mockResolvedValueOnce(jsonResponse({ id: "note-99" }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await handleCrmTool("crm_send_sms", {
      contactId: "p-1",
      toPhone: "+15140000000",
      message: "hi",
    });

    expect(out).toMatchObject({ sid: "SM1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const twilioUrl = fetchMock.mock.calls[0][0] as string;
    expect(twilioUrl).toContain("api.twilio.com");
    expect(twilioUrl).toContain("/Accounts/AC_test/Messages.json");
    const twilioInit = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(twilioInit.headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(twilioInit.body).toContain("To=%2B15140000000");
    expect(twilioInit.body).toContain("From=%2B15145550000");

    const noteUrl = fetchMock.mock.calls[1][0] as string;
    expect(noteUrl).toContain("/notes");
    const noteBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(noteBody.personId).toBe("p-1");
    expect(noteBody.body).toContain("sid=SM1");
  });

  it("crm_send_email posts to SendGrid and then logs note to FUB", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(emptyResponse(202, { "x-message-id": "SG-MSG-1" }))
      .mockResolvedValueOnce(jsonResponse({ id: "note-100" }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await handleCrmTool("crm_send_email", {
      contactId: "p-1",
      toEmail: "lead@example.com",
      subject: "Welcome",
      body: "<p>Hi</p>",
    });

    expect(out).toEqual({ messageId: "SG-MSG-1" });

    const sgUrl = fetchMock.mock.calls[0][0] as string;
    expect(sgUrl).toBe("https://api.sendgrid.com/v3/mail/send");
    const sgInit = fetchMock.mock.calls[0][1] as { headers: Record<string, string>; body: string };
    expect(sgInit.headers.Authorization).toBe("Bearer sg-test");
    const sgPayload = JSON.parse(sgInit.body);
    expect(sgPayload.from.email).toBe("noreply@example.com");
    expect(sgPayload.personalizations[0].to[0].email).toBe("lead@example.com");

    const noteBody = JSON.parse((fetchMock.mock.calls[1][1] as { body: string }).body);
    expect(noteBody.body).toContain("messageId=SG-MSG-1");
  });
});

// ---------------------------------------------------------------------------
// Campaign enroll → queue/ server
// ---------------------------------------------------------------------------

describe("crm_enroll_campaign", () => {
  it("POSTs to queue/enqueue-campaign with x-queue-secret + {personId,campaignId}", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ queued: true, jobId: "p-1:camp-7" }));
    vi.stubGlobal("fetch", fetchMock);

    const out = await handleCrmTool("crm_enroll_campaign", {
      contactId: "p-1",
      campaignId: "camp-7",
    });

    expect(out).toEqual({ queued: true, jobId: "p-1:camp-7" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("http://queue.local:3001/enqueue-campaign");
    expect((init.headers as Record<string, string>)["x-queue-secret"]).toBe("queue-test-secret");
    expect(JSON.parse(init.body as string)).toEqual({ personId: "p-1", campaignId: "camp-7" });
  });
});

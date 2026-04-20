/**
 * webhook.test.ts
 *
 * WEBHOOK_SECRET is captured at module-load time in webhook.ts, so we must
 * set process.env BEFORE importing the module.  We achieve this with
 * vi.resetModules() + dynamic import() inside each describe block.
 */
import crypto from "crypto";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeHmac(secret: string, body: unknown): string {
  return crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(body))
    .digest("hex");
}

function makeReq(
  body: unknown,
  signature?: string,
): { body: unknown; headers: Record<string, string | undefined> } {
  return {
    body,
    headers: { "x-ghl-signature": signature },
  };
}

function makeRes() {
  const res = {
    statusCode: 0,
    sendStatus(code: number) {
      this.statusCode = code;
      return this;
    },
  };
  return res;
}

const SECRET = "test-secret-xyz";

// ---------------------------------------------------------------------------
// Helper: fresh module load with controlled env + mocked runAgent
// ---------------------------------------------------------------------------
async function loadWebhook(secret: string) {
  // Reset module registry so webhook.ts re-executes and re-reads process.env
  vi.resetModules();
  process.env.WEBHOOK_SECRET = secret;

  // Provide a fresh runAgent mock for this module instance
  const mockRunAgent = vi.fn().mockResolvedValue(undefined);
  vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));

  const { handleLeadWebhook, handleMessageWebhook } =
    await import("./webhook.js");
  return { handleLeadWebhook, handleMessageWebhook, mockRunAgent };
}

// ---------------------------------------------------------------------------
// HMAC verification — with secret set
// ---------------------------------------------------------------------------
describe("verifySignature — secret configured", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("valid HMAC signature → 200", async () => {
    const { handleLeadWebhook } = await loadWebhook(SECRET);
    const body = { id: "contact-1", firstName: "Jane", source: "web" };
    const sig = makeHmac(SECRET, body);
    const res = makeRes();

    await handleLeadWebhook(makeReq(body, sig) as never, res as never);

    expect(res.statusCode).toBe(200);
  });

  it("invalid HMAC signature → 401", async () => {
    const { handleLeadWebhook } = await loadWebhook(SECRET);
    const body = { id: "contact-1" };
    const res = makeRes();

    await handleLeadWebhook(
      makeReq(body, "deadbeef".repeat(8)) as never,
      res as never,
    );

    expect(res.statusCode).toBe(401);
  });

  it("missing signature when WEBHOOK_SECRET is set → 401", async () => {
    const { handleLeadWebhook } = await loadWebhook(SECRET);
    const body = { id: "contact-1" };
    const res = makeRes();

    await handleLeadWebhook(makeReq(body, undefined) as never, res as never);

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// HMAC verification — dev mode (no secret)
// ---------------------------------------------------------------------------
describe("verifySignature — dev mode (no WEBHOOK_SECRET)", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("missing signature when WEBHOOK_SECRET is unset → 200 (dev mode)", async () => {
    const { handleLeadWebhook } = await loadWebhook("");
    const body = { id: "contact-dev" };
    const res = makeRes();

    await handleLeadWebhook(makeReq(body, undefined) as never, res as never);

    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// handleLeadWebhook — event routing (dev mode, no HMAC needed)
// ---------------------------------------------------------------------------
describe("handleLeadWebhook — event routing", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("new_lead trigger dispatches runAgent with correct shape", async () => {
    const { handleLeadWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      id: "contact-42",
      firstName: "Alice",
      lastName: "Martin",
      phone: "+15141112222",
      email: "alice@example.com",
      source: "IDX",
    };
    const res = makeRes();

    await handleLeadWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    expect(mockRunAgent).toHaveBeenCalledWith({
      trigger: "new_lead",
      contactId: "contact-42",
      contactName: "Alice Martin",
      contactPhone: "+15141112222",
      contactEmail: "alice@example.com",
      source: "IDX",
    });
  });

  it("missing contact.id → runAgent is NOT called", async () => {
    const { handleLeadWebhook, mockRunAgent } = await loadWebhook("");
    const body = { firstName: "No", lastName: "Id" };
    const res = makeRes();

    await handleLeadWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("contact with no firstName/lastName → contactName is empty string", async () => {
    const { handleLeadWebhook, mockRunAgent } = await loadWebhook("");
    const body = { id: "c-noname", source: "organic" };
    const res = makeRes();

    await handleLeadWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent.mock.calls[0][0]).toMatchObject({
      trigger: "new_lead",
      contactName: "",
      source: "organic",
    });
  });
});

// ---------------------------------------------------------------------------
// handleMessageWebhook — event routing
// ---------------------------------------------------------------------------
describe("handleMessageWebhook — event routing", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("incoming_message trigger dispatches runAgent with correct shape", async () => {
    const { handleMessageWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      contactId: "contact-99",
      message: "I am interested in a 3-bed condo",
      conversationId: "conv-abc",
    };
    const res = makeRes();

    await handleMessageWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    expect(mockRunAgent).toHaveBeenCalledWith({
      trigger: "incoming_message",
      contactId: "contact-99",
      message: "I am interested in a 3-bed condo",
      conversationId: "conv-abc",
    });
  });

  it("missing contactId or message → runAgent is NOT called", async () => {
    const { handleMessageWebhook, mockRunAgent } = await loadWebhook("");
    const body = { contactId: "c-99" }; // no message
    const res = makeRes();

    await handleMessageWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("invalid HMAC on incoming_message → 401, runAgent not called", async () => {
    const { handleMessageWebhook, mockRunAgent } = await loadWebhook(SECRET);
    const body = { contactId: "c-99", message: "hi" };
    const res = makeRes();

    await handleMessageWebhook(makeReq(body, "badsig") as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});

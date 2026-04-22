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
// Rate limiting — concurrent agent limit (MAX_CONCURRENT = 5)
// ---------------------------------------------------------------------------
describe("rate limiting — concurrent limit", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("6th concurrent webhook is dropped (runAgent called exactly 5 times)", async () => {
    // Use a never-resolving runAgent so activeAgents stays at 5
    vi.resetModules();
    process.env.WEBHOOK_SECRET = "";

    let resolveAll!: () => void;
    const hold = new Promise<void>((res) => {
      resolveAll = res;
    });
    const mockRunAgent = vi.fn().mockReturnValue(hold);
    vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));

    const { handleLeadWebhook } = await import("./webhook.js");
    const res = makeRes();

    // Fire 5 concurrent webhooks — each will call trackRun and then await hold
    const inflight = Array.from({ length: 5 }, (_, i) =>
      handleLeadWebhook(
        makeReq({ id: `contact-${i}` }) as never,
        makeRes() as never,
      ),
    );

    // Give the microtask queue time to reach the await runAgent(...) line in each
    await new Promise((r) => setTimeout(r, 0));

    // 6th webhook — should be throttled (activeAgents === 5 >= MAX_CONCURRENT)
    await handleLeadWebhook(
      makeReq({ id: "contact-6th" }) as never,
      res as never,
    );

    expect(mockRunAgent).toHaveBeenCalledTimes(5);

    // Clean up: unblock the in-flight agents
    resolveAll();
    await Promise.all(inflight);
  });

  it("activeAgents decrements after runAgent completes (slot is released)", async () => {
    vi.resetModules();
    process.env.WEBHOOK_SECRET = "";

    let resolveFirst!: () => void;
    const firstCall = new Promise<void>((res) => {
      resolveFirst = res;
    });
    let callCount = 0;
    const mockRunAgent = vi.fn().mockImplementation(() => {
      callCount++;
      if (callCount === 1) return firstCall;
      return Promise.resolve();
    });
    vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));

    const { handleLeadWebhook } = await import("./webhook.js");

    // Fill all 5 slots
    const inflight = Array.from({ length: 5 }, (_, i) =>
      handleLeadWebhook(
        makeReq({ id: `contact-${i}` }) as never,
        makeRes() as never,
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRunAgent).toHaveBeenCalledTimes(5);

    // Release one slot by resolving the first agent
    resolveFirst();
    await inflight[0];

    // Now a new webhook should be accepted (activeAgents dropped to 4)
    await handleLeadWebhook(
      makeReq({ id: "contact-after-release" }) as never,
      makeRes() as never,
    );

    expect(mockRunAgent).toHaveBeenCalledTimes(6);

    // Clean up remaining
    await Promise.all(inflight.slice(1));
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — per-contact cooldown (PER_CONTACT_COOLDOWN_MS = 1000)
// ---------------------------------------------------------------------------
describe("rate limiting — per-contact cooldown", () => {
  afterEach(() => {
    delete process.env.WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("second webhook for same contactId within 1000ms is dropped", async () => {
    const { handleLeadWebhook, mockRunAgent } = await loadWebhook("");

    const body = { id: "contact-cool" };

    await handleLeadWebhook(makeReq(body) as never, makeRes() as never);
    await handleLeadWebhook(makeReq(body) as never, makeRes() as never);

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
  });

  it("different contactIds are NOT throttled by each other", async () => {
    const { handleLeadWebhook, mockRunAgent } = await loadWebhook("");

    await handleLeadWebhook(
      makeReq({ id: "contact-A" }) as never,
      makeRes() as never,
    );
    await handleLeadWebhook(
      makeReq({ id: "contact-B" }) as never,
      makeRes() as never,
    );

    expect(mockRunAgent).toHaveBeenCalledTimes(2);
  });

  it("same contactId is accepted again after cooldown expires", async () => {
    vi.useFakeTimers();

    vi.resetModules();
    process.env.WEBHOOK_SECRET = "";
    const mockRunAgent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));
    const { handleLeadWebhook } = await import("./webhook.js");

    const body = { id: "contact-timer" };

    await handleLeadWebhook(makeReq(body) as never, makeRes() as never);

    // Advance past the 1000ms cooldown
    vi.advanceTimersByTime(1001);

    await handleLeadWebhook(makeReq(body) as never, makeRes() as never);

    expect(mockRunAgent).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
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

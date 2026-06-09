/**
 * webhook.test.ts — FUB webhook handler tests.
 *
 * FUB_WEBHOOK_SECRET is captured at module-load time in webhook.ts, so we
 * set process.env BEFORE importing the module via vi.resetModules() +
 * dynamic import() inside each describe block. Same pattern used for the
 * prior GHL implementation.
 *
 * Test count preserved at 15 (matching pre-migration baseline).
 */
import crypto from "crypto";
import { describe, it, expect, vi, afterEach } from "vitest";

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
    headers: { "x-fub-signature": signature },
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

const SECRET = "fub-test-secret-xyz";

async function loadWebhook(secret: string) {
  vi.resetModules();
  process.env.FUB_WEBHOOK_SECRET = secret;

  const mockRunAgent = vi.fn().mockResolvedValue(undefined);
  vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));

  const { handleFubWebhook } = await import("./webhook.js");
  return { handleFubWebhook, mockRunAgent };
}

// ---------------------------------------------------------------------------
// HMAC verification — with secret set
// ---------------------------------------------------------------------------
describe("verifySignature — FUB_WEBHOOK_SECRET configured", () => {
  afterEach(() => {
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("valid HMAC signature → 200", async () => {
    const { handleFubWebhook } = await loadWebhook(SECRET);
    const body = {
      event: "peopleCreated",
      data: { id: "1", firstName: "Jane", source: "web" },
    };
    const sig = makeHmac(SECRET, body);
    const res = makeRes();

    await handleFubWebhook(makeReq(body, sig) as never, res as never);

    expect(res.statusCode).toBe(200);
  });

  it("invalid HMAC signature → 401", async () => {
    const { handleFubWebhook } = await loadWebhook(SECRET);
    const body = { event: "peopleCreated", data: { id: "1" } };
    const res = makeRes();

    await handleFubWebhook(
      makeReq(body, "deadbeef".repeat(8)) as never,
      res as never,
    );

    expect(res.statusCode).toBe(401);
  });

  it("missing signature when FUB_WEBHOOK_SECRET is set → 401", async () => {
    const { handleFubWebhook } = await loadWebhook(SECRET);
    const body = { event: "peopleCreated", data: { id: "1" } };
    const res = makeRes();

    await handleFubWebhook(makeReq(body, undefined) as never, res as never);

    expect(res.statusCode).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// HMAC verification — dev mode (no secret)
// ---------------------------------------------------------------------------
describe("verifySignature — dev mode (no FUB_WEBHOOK_SECRET)", () => {
  afterEach(() => {
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("missing signature when FUB_WEBHOOK_SECRET is unset → 200 (dev mode)", async () => {
    const { handleFubWebhook } = await loadWebhook("");
    const body = {
      event: "peopleCreated",
      data: { id: "contact-dev" },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body, undefined) as never, res as never);

    expect(res.statusCode).toBe(200);
  });
});

// ---------------------------------------------------------------------------
// peopleCreated event routing
// ---------------------------------------------------------------------------
describe("handleFubWebhook — peopleCreated routing", () => {
  afterEach(() => {
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("dispatches runAgent with new_lead trigger and full contact shape", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      event: "peopleCreated",
      data: {
        id: "42",
        firstName: "Alice",
        lastName: "Martin",
        phones: [{ value: "+15141112222" }],
        emails: [{ value: "alice@example.com" }],
        source: "IDX",
      },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    expect(mockRunAgent).toHaveBeenCalledWith({
      trigger: "new_lead",
      contactId: "42",
      contactName: "Alice Martin",
      contactPhone: "+15141112222",
      contactEmail: "alice@example.com",
      source: "IDX",
    });
  });

  it("missing person.id → runAgent is NOT called", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      event: "peopleCreated",
      data: { firstName: "No", lastName: "Id" },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("contact with no firstName/lastName → contactName is empty string", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      event: "peopleCreated",
      data: { id: "c-noname", source: "organic" },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body) as never, res as never);

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
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("6th concurrent webhook is dropped (runAgent called exactly 5 times)", async () => {
    vi.resetModules();
    process.env.FUB_WEBHOOK_SECRET = "";

    let resolveAll!: () => void;
    const hold = new Promise<void>((res) => {
      resolveAll = res;
    });
    const mockRunAgent = vi.fn().mockReturnValue(hold);
    vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));

    const { handleFubWebhook } = await import("./webhook.js");
    const res = makeRes();

    const inflight = Array.from({ length: 5 }, (_, i) =>
      handleFubWebhook(
        makeReq({
          event: "peopleCreated",
          data: { id: `contact-${i}` },
        }) as never,
        makeRes() as never,
      ),
    );

    await new Promise((r) => setTimeout(r, 0));

    await handleFubWebhook(
      makeReq({
        event: "peopleCreated",
        data: { id: "contact-6th" },
      }) as never,
      res as never,
    );

    expect(mockRunAgent).toHaveBeenCalledTimes(5);

    resolveAll();
    await Promise.all(inflight);
  });

  it("activeAgents decrements after runAgent completes (slot is released)", async () => {
    vi.resetModules();
    process.env.FUB_WEBHOOK_SECRET = "";

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

    const { handleFubWebhook } = await import("./webhook.js");

    const inflight = Array.from({ length: 5 }, (_, i) =>
      handleFubWebhook(
        makeReq({
          event: "peopleCreated",
          data: { id: `contact-${i}` },
        }) as never,
        makeRes() as never,
      ),
    );
    await new Promise((r) => setTimeout(r, 0));
    expect(mockRunAgent).toHaveBeenCalledTimes(5);

    resolveFirst();
    await inflight[0];

    await handleFubWebhook(
      makeReq({
        event: "peopleCreated",
        data: { id: "contact-after-release" },
      }) as never,
      makeRes() as never,
    );

    expect(mockRunAgent).toHaveBeenCalledTimes(6);

    await Promise.all(inflight.slice(1));
  });
});

// ---------------------------------------------------------------------------
// Rate limiting — per-contact cooldown (PER_CONTACT_COOLDOWN_MS = 1000)
// ---------------------------------------------------------------------------
describe("rate limiting — per-contact cooldown", () => {
  afterEach(() => {
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("second webhook for same contactId within 1000ms is dropped", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");

    const body = {
      event: "peopleCreated",
      data: { id: "contact-cool" },
    };

    await handleFubWebhook(makeReq(body) as never, makeRes() as never);
    await handleFubWebhook(makeReq(body) as never, makeRes() as never);

    expect(mockRunAgent).toHaveBeenCalledTimes(1);
  });

  it("different contactIds are NOT throttled by each other", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");

    await handleFubWebhook(
      makeReq({ event: "peopleCreated", data: { id: "contact-A" } }) as never,
      makeRes() as never,
    );
    await handleFubWebhook(
      makeReq({ event: "peopleCreated", data: { id: "contact-B" } }) as never,
      makeRes() as never,
    );

    expect(mockRunAgent).toHaveBeenCalledTimes(2);
  });

  it("same contactId is accepted again after cooldown expires", async () => {
    vi.useFakeTimers();

    vi.resetModules();
    process.env.FUB_WEBHOOK_SECRET = "";
    const mockRunAgent = vi.fn().mockResolvedValue(undefined);
    vi.doMock("./agent.js", () => ({ runAgent: mockRunAgent }));
    const { handleFubWebhook } = await import("./webhook.js");

    const body = { event: "peopleCreated", data: { id: "contact-timer" } };

    await handleFubWebhook(makeReq(body) as never, makeRes() as never);

    vi.advanceTimersByTime(1001);

    await handleFubWebhook(makeReq(body) as never, makeRes() as never);

    expect(mockRunAgent).toHaveBeenCalledTimes(2);

    vi.useRealTimers();
  });
});

// ---------------------------------------------------------------------------
// conversationsCreated event routing
// ---------------------------------------------------------------------------
describe("handleFubWebhook — conversationsCreated routing", () => {
  afterEach(() => {
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("incoming_message trigger dispatches runAgent with correct shape", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      event: "conversationsCreated",
      data: {
        personId: "99",
        message: "I am interested in a 3-bed condo",
        conversationId: "conv-abc",
      },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).toHaveBeenCalledOnce();
    expect(mockRunAgent).toHaveBeenCalledWith({
      trigger: "incoming_message",
      contactId: "99",
      message: "I am interested in a 3-bed condo",
      conversationId: "conv-abc",
    });
  });

  it("missing personId or message → runAgent is NOT called", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      event: "conversationsCreated",
      data: { personId: "99" }, // no message
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body) as never, res as never);

    expect(mockRunAgent).not.toHaveBeenCalled();
  });

  it("invalid HMAC on conversationsCreated → 401, runAgent not called", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook(SECRET);
    const body = {
      event: "conversationsCreated",
      data: { personId: "99", message: "hi" },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body, "badsig") as never, res as never);

    expect(res.statusCode).toBe(401);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// peopleUpdated routing (currently a no-op pending step G)
// ---------------------------------------------------------------------------
describe("handleFubWebhook — peopleUpdated routing", () => {
  afterEach(() => {
    delete process.env.FUB_WEBHOOK_SECRET;
    vi.resetModules();
  });

  it("peopleUpdated is acked 200 but does NOT call runAgent (re-score wires in step G)", async () => {
    const { handleFubWebhook, mockRunAgent } = await loadWebhook("");
    const body = {
      event: "peopleUpdated",
      data: { id: "p-1", firstName: "Updated" },
    };
    const res = makeRes();

    await handleFubWebhook(makeReq(body) as never, res as never);

    expect(res.statusCode).toBe(200);
    expect(mockRunAgent).not.toHaveBeenCalled();
  });
});

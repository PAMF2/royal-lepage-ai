import { vi, describe, it, expect, beforeEach } from "vitest";

const mocks = vi.hoisted(() => ({
  ping: vi.fn(),
  setex: vi.fn(),
  lpush: vi.fn(),
  ltrim: vi.fn(),
  incr: vi.fn(),
  incrby: vi.fn(),
  mget: vi.fn(),
  lrange: vi.fn(),
}));

vi.mock("ioredis", () => {
  class Redis {
    ping = mocks.ping;
    setex = mocks.setex;
    lpush = mocks.lpush;
    ltrim = mocks.ltrim;
    incr = mocks.incr;
    incrby = mocks.incrby;
    mget = mocks.mget;
    lrange = mocks.lrange;
  }
  return { Redis, default: Redis };
});

vi.mock("http", () => ({
  createServer: vi.fn().mockReturnValue({ listen: vi.fn() }),
  default: { createServer: vi.fn().mockReturnValue({ listen: vi.fn() }) },
}));

process.env.MONITORING_SECRET = "test-monitor-secret";
const { handleRequest } = await import("./index.js");

describe("GET /health", () => {
  it("should return 200 with status ok when redis is reachable", async () => {
    mocks.ping.mockResolvedValue("PONG");
    const req = new Request("http://localhost/health", { method: "GET" });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.redis).toBe("up");
  });

  it("should return 503 when redis ping throws", async () => {
    mocks.ping.mockRejectedValue(new Error("Connection refused"));
    const req = new Request("http://localhost/health", { method: "GET" });
    const res = await handleRequest(req);

    expect(res.status).toBe(503);
    const body = await res.json();
    expect(body.ok).toBe(false);
    expect(body.redis).toBe("down");
  });
});

describe("GET /metrics", () => {
  it("should return aggregate stats from redis", async () => {
    mocks.mget.mockResolvedValue(["10", "2", "50", "30000"]);
    const req = new Request("http://localhost/metrics", { method: "GET" });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRuns).toBe(10);
    expect(body.totalErrors).toBe(2);
    expect(body.errorRate).toBe("20.00%");
    expect(body.avgTurns).toBe("5.0");
    expect(body.avgDurationMs).toBe(3000);
  });

  it("should return zero-value stats when redis returns nulls", async () => {
    mocks.mget.mockResolvedValue([null, null, null, null]);
    const req = new Request("http://localhost/metrics", { method: "GET" });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.totalRuns).toBe(0);
    expect(body.errorRate).toBe("0%");
    expect(body.avgTurns).toBe("0");
    expect(body.avgDurationMs).toBe(0);
  });
});

describe("POST /log (conversations)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.setex.mockResolvedValue("OK");
    mocks.lpush.mockResolvedValue(1);
    mocks.ltrim.mockResolvedValue("OK");
    mocks.incr.mockResolvedValue(1);
    mocks.incrby.mockResolvedValue(1);
  });

  it("should return 401 when secret header is missing", async () => {
    const req = new Request("http://localhost/log", {
      method: "POST",
      body: JSON.stringify({
        contactId: "c1",
        trigger: "t",
        turns: 3,
        toolsUsed: [],
        outcome: "ok",
        durationMs: 100,
      }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 when secret header is wrong", async () => {
    const req = new Request("http://localhost/log", {
      method: "POST",
      headers: { "x-monitoring-secret": "bad-secret" },
      body: JSON.stringify({
        contactId: "c1",
        trigger: "t",
        turns: 3,
        toolsUsed: [],
        outcome: "ok",
        durationMs: 100,
      }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(401);
  });

  it("should log a conversation entry and return logged true", async () => {
    const entry = {
      contactId: "c42",
      trigger: "InboundMessage",
      turns: 5,
      toolsUsed: ["search"],
      outcome: "sent",
      durationMs: 1200,
    };
    const req = new Request("http://localhost/log", {
      method: "POST",
      headers: { "x-monitoring-secret": "test-monitor-secret" },
      body: JSON.stringify(entry),
    });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.logged).toBe(true);
    expect(mocks.setex).toHaveBeenCalledOnce();
    expect(mocks.lpush).toHaveBeenCalledWith(
      "conv:recent",
      expect.stringContaining("conv:c42:"),
    );
    expect(mocks.incr).toHaveBeenCalledWith("metrics:total_runs");
    expect(mocks.incrby).toHaveBeenCalledWith("metrics:total_turns", 5);
    expect(mocks.incrby).toHaveBeenCalledWith(
      "metrics:total_duration_ms",
      1200,
    );
  });

  it("should increment error counter when entry has an error field", async () => {
    const entry = {
      contactId: "c99",
      trigger: "ContactCreated",
      turns: 1,
      toolsUsed: [],
      outcome: "error",
      durationMs: 50,
      error: "timeout",
    };
    const req = new Request("http://localhost/log", {
      method: "POST",
      headers: { "x-monitoring-secret": "test-monitor-secret" },
      body: JSON.stringify(entry),
    });
    await handleRequest(req);

    expect(mocks.incr).toHaveBeenCalledWith("metrics:total_errors");
  });

  it("should not increment error counter when entry has no error field", async () => {
    const entry = {
      contactId: "c100",
      trigger: "ContactCreated",
      turns: 2,
      toolsUsed: [],
      outcome: "ok",
      durationMs: 200,
    };
    const req = new Request("http://localhost/log", {
      method: "POST",
      headers: { "x-monitoring-secret": "test-monitor-secret" },
      body: JSON.stringify(entry),
    });
    await handleRequest(req);

    const errorIncrCalls = mocks.incr.mock.calls.filter(
      (args) => args[0] === "metrics:total_errors",
    );
    expect(errorIncrCalls).toHaveLength(0);
  });
});

describe("GET /conversations", () => {
  it("should return empty array when no keys in redis", async () => {
    mocks.lrange.mockResolvedValue([]);
    const req = new Request("http://localhost/conversations", {
      method: "GET",
    });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toEqual([]);
  });

  it("should return parsed conversation logs", async () => {
    const log = {
      contactId: "c1",
      trigger: "t",
      turns: 2,
      toolsUsed: [],
      outcome: "ok",
      durationMs: 100,
      ts: 1000,
    };
    mocks.lrange.mockResolvedValue(["conv:c1:1000"]);
    mocks.mget.mockResolvedValue([JSON.stringify(log)]);

    const req = new Request("http://localhost/conversations", {
      method: "GET",
    });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body).toHaveLength(1);
    expect(body[0].contactId).toBe("c1");
  });

  it("should pass the limit param to lrange", async () => {
    mocks.lrange.mockResolvedValue([]);
    const req = new Request("http://localhost/conversations?limit=5", {
      method: "GET",
    });
    await handleRequest(req);
    expect(mocks.lrange).toHaveBeenCalledWith("conv:recent", 0, 4);
  });
});

describe("invalid routes", () => {
  it("should return 404 for unknown GET path", async () => {
    const req = new Request("http://localhost/unknown", { method: "GET" });
    const res = await handleRequest(req);
    expect(res.status).toBe(404);
  });

  it("should return 404 for unknown POST path", async () => {
    const req = new Request("http://localhost/does-not-exist", {
      method: "POST",
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(404);
  });
});

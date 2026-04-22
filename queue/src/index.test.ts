import { vi, describe, it, expect, beforeEach } from "vitest";

vi.mock("ioredis", () => {
  class Redis {}
  return { Redis, default: Redis };
});

const mockAdd = vi.fn();
const mockGetJobCounts = vi.fn();

vi.mock("bullmq", () => {
  class Queue {
    add = mockAdd;
    getJobCounts = mockGetJobCounts;
  }
  class Worker {
    on = vi.fn();
    close = vi.fn();
  }
  return { Queue, Worker };
});

const { getPriority, handleRequest, agentQueue } = await import("./index.js");

describe("getPriority", () => {
  it("should return 1 when type is InboundMessage", () => {
    expect(getPriority({ type: "InboundMessage" })).toBe(1);
  });

  it("should return 3 when type is ContactCreated", () => {
    expect(getPriority({ type: "ContactCreated" })).toBe(3);
  });

  it("should return 10 for an unknown type string", () => {
    expect(getPriority({ type: "SomethingElse" })).toBe(10);
  });

  it("should return 10 when body is null", () => {
    expect(getPriority(null)).toBe(10);
  });

  it("should return 10 when body is a primitive", () => {
    expect(getPriority(42)).toBe(10);
  });

  it("should return 10 when body has no type field", () => {
    expect(getPriority({ foo: "bar" })).toBe(10);
  });
});

describe("handleRequest — POST /health", () => {
  beforeEach(() => {
    mockGetJobCounts.mockResolvedValue({ waiting: 2, active: 1 });
  });

  it("should return 200 with queue counts", async () => {
    const req = new Request("http://localhost/health", { method: "POST" });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    expect(body.queue).toEqual({ waiting: 2, active: 1 });
  });
});

describe("handleRequest — POST /enqueue", () => {
  beforeEach(() => {
    vi.stubEnv("QUEUE_SECRET", "test-secret");
    mockAdd.mockResolvedValue({ id: "job-123" });
  });

  it("should return 401 when secret header is missing", async () => {
    const req = new Request("http://localhost/enqueue", {
      method: "POST",
      body: JSON.stringify({ type: "InboundMessage" }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(401);
  });

  it("should return 401 when secret header is wrong", async () => {
    const req = new Request("http://localhost/enqueue", {
      method: "POST",
      headers: { "x-queue-secret": "wrong-secret" },
      body: JSON.stringify({ type: "InboundMessage" }),
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(401);
  });

  it("should return 400 when body is not valid JSON", async () => {
    const req = new Request("http://localhost/enqueue", {
      method: "POST",
      headers: { "x-queue-secret": "test-secret" },
      body: "not-json{{",
    });
    const res = await handleRequest(req);
    expect(res.status).toBe(400);
  });

  it("should queue a job and return 200 with jobId for valid request", async () => {
    const payload = { type: "InboundMessage", contactId: "c1" };
    const req = new Request("http://localhost/enqueue", {
      method: "POST",
      headers: { "x-queue-secret": "test-secret" },
      body: JSON.stringify(payload),
    });
    const res = await handleRequest(req);

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.queued).toBe(true);
    expect(body.jobId).toBe("job-123");
    expect(mockAdd).toHaveBeenCalledWith("webhook", payload, { priority: 1 });
  });

  it("should assign priority 3 for ContactCreated events", async () => {
    const payload = { type: "ContactCreated" };
    const req = new Request("http://localhost/enqueue", {
      method: "POST",
      headers: { "x-queue-secret": "test-secret" },
      body: JSON.stringify(payload),
    });
    await handleRequest(req);
    expect(mockAdd).toHaveBeenCalledWith("webhook", payload, { priority: 3 });
  });

  it("should assign priority 10 for unknown event types", async () => {
    const payload = { type: "UnknownEvent" };
    const req = new Request("http://localhost/enqueue", {
      method: "POST",
      headers: { "x-queue-secret": "test-secret" },
      body: JSON.stringify(payload),
    });
    await handleRequest(req);
    expect(mockAdd).toHaveBeenCalledWith("webhook", payload, { priority: 10 });
  });
});

describe("handleRequest — method guard", () => {
  it("should return 405 for GET requests", async () => {
    const req = new Request("http://localhost/health", { method: "GET" });
    const res = await handleRequest(req);
    expect(res.status).toBe(405);
  });

  it("should return 405 for PUT requests", async () => {
    const req = new Request("http://localhost/enqueue", { method: "PUT" });
    const res = await handleRequest(req);
    expect(res.status).toBe(405);
  });
});

/**
 * internal-send.test.ts
 *
 * The handler reads ORCHESTRATOR_INTERNAL_SECRET lazily on each call and
 * calls handleCrmTool directly, so we mock crm.ts via vi.doMock + dynamic
 * import — same pattern as webhook.test.ts.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const SECRET = "internal-secret-xyz";

function makeReq(
  body: unknown,
  signature?: string,
): { body: unknown; headers: Record<string, string | undefined> } {
  return { body, headers: { "x-internal-secret": signature } };
}

function makeRes() {
  return {
    statusCode: 0,
    payload: null as unknown,
    sendStatus(code: number) {
      this.statusCode = code;
      return this;
    },
    status(code: number) {
      this.statusCode = code;
      return this;
    },
    json(payload: unknown) {
      this.payload = payload;
      return this;
    },
  };
}

async function loadHandler(crmMock: {
  crm_get_contact?: (input: unknown) => unknown;
  crm_send_sms?: (input: unknown) => unknown;
  crm_send_email?: (input: unknown) => unknown;
}) {
  vi.resetModules();
  process.env.ORCHESTRATOR_INTERNAL_SECRET = SECRET;
  const handleCrmTool = vi.fn().mockImplementation(async (name: string, input: unknown) => {
    const fn = crmMock[name as keyof typeof crmMock];
    if (!fn) throw new Error(`unmocked tool: ${name}`);
    return fn(input);
  });
  vi.doMock("./tools/crm.js", () => ({ handleCrmTool, crmTools: [] }));
  const { handleInternalSend } = await import("./internal-send.js");
  return { handleInternalSend, handleCrmTool };
}

beforeEach(() => {
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
});

afterEach(() => {
  delete process.env.ORCHESTRATOR_INTERNAL_SECRET;
  vi.resetModules();
});

describe("auth", () => {
  it("missing header → 401", async () => {
    const { handleInternalSend } = await loadHandler({});
    const res = makeRes();
    await handleInternalSend(makeReq({}, undefined) as never, res as never);
    expect(res.statusCode).toBe(401);
  });

  it("wrong header → 401", async () => {
    const { handleInternalSend } = await loadHandler({});
    const res = makeRes();
    await handleInternalSend(makeReq({}, "wrong") as never, res as never);
    expect(res.statusCode).toBe(401);
  });
});

describe("body shape", () => {
  it("missing kind or personId → 400", async () => {
    const { handleInternalSend } = await loadHandler({});
    const res = makeRes();
    await handleInternalSend(
      makeReq({ kind: "sms" }, SECRET) as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
  });

  it("unknown kind → 400", async () => {
    const { handleInternalSend } = await loadHandler({
      crm_get_contact: () => ({ phones: [{ value: "+1" }] }),
    });
    const res = makeRes();
    await handleInternalSend(
      makeReq({ kind: "video", personId: "p-1" }, SECRET) as never,
      res as never,
    );
    expect(res.statusCode).toBe(400);
  });
});

describe("sms dispatch", () => {
  it("happy path: fetches contact, sends sms with primary phone, returns crm_send_sms result", async () => {
    const sendSpy = vi.fn().mockResolvedValue({ sid: "SM1" });
    const { handleInternalSend, handleCrmTool } = await loadHandler({
      crm_get_contact: () => ({ phones: [{ value: "+15140000000" }] }),
      crm_send_sms: sendSpy,
    });
    const res = makeRes();
    await handleInternalSend(
      makeReq(
        { kind: "sms", personId: "p-1", templateId: "nurture-7day:day0" },
        SECRET,
      ) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    expect(res.payload).toEqual({ sid: "SM1" });
    expect(handleCrmTool).toHaveBeenNthCalledWith(1, "crm_get_contact", { contactId: "p-1" });
    expect(sendSpy).toHaveBeenCalledOnce();
    const arg = sendSpy.mock.calls[0][0] as { toPhone: string; message: string };
    expect(arg.toPhone).toBe("+15140000000");
    expect(arg.message).toContain("nurture-7day:day0");
  });

  it("uses explicit message override when provided", async () => {
    const sendSpy = vi.fn().mockResolvedValue({ sid: "SM2" });
    const { handleInternalSend } = await loadHandler({
      crm_get_contact: () => ({ phones: [{ value: "+15140000000" }] }),
      crm_send_sms: sendSpy,
    });
    await handleInternalSend(
      makeReq(
        { kind: "sms", personId: "p-1", message: "hello world", templateId: "x" },
        SECRET,
      ) as never,
      makeRes() as never,
    );
    expect((sendSpy.mock.calls[0][0] as { message: string }).message).toBe("hello world");
  });

  it("contact with no phone → 422", async () => {
    const { handleInternalSend } = await loadHandler({
      crm_get_contact: () => ({ phones: [] }),
    });
    const res = makeRes();
    await handleInternalSend(
      makeReq({ kind: "sms", personId: "p-1" }, SECRET) as never,
      res as never,
    );
    expect(res.statusCode).toBe(422);
  });

  it("crm_get_contact failure → 502", async () => {
    const { handleInternalSend } = await loadHandler({
      crm_get_contact: () => {
        throw new Error("FUB 404");
      },
    });
    const res = makeRes();
    await handleInternalSend(
      makeReq({ kind: "sms", personId: "ghost" }, SECRET) as never,
      res as never,
    );
    expect(res.statusCode).toBe(502);
  });
});

describe("email dispatch", () => {
  it("happy path: sends email with primary email + template-derived subject", async () => {
    const sendSpy = vi.fn().mockResolvedValue({ messageId: "M1" });
    const { handleInternalSend } = await loadHandler({
      crm_get_contact: () => ({ emails: [{ value: "lead@example.com" }] }),
      crm_send_email: sendSpy,
    });
    const res = makeRes();
    await handleInternalSend(
      makeReq(
        { kind: "email", personId: "p-1", templateId: "nurture-monthly:default" },
        SECRET,
      ) as never,
      res as never,
    );
    expect(res.statusCode).toBe(200);
    const arg = sendSpy.mock.calls[0][0] as { toEmail: string; subject: string; body: string };
    expect(arg.toEmail).toBe("lead@example.com");
    expect(arg.subject).toContain("nurture-monthly:default");
    expect(arg.body).toContain("nurture-monthly:default");
  });

  it("contact with no email → 422", async () => {
    const { handleInternalSend } = await loadHandler({
      crm_get_contact: () => ({ emails: [] }),
    });
    const res = makeRes();
    await handleInternalSend(
      makeReq({ kind: "email", personId: "p-1" }, SECRET) as never,
      res as never,
    );
    expect(res.statusCode).toBe(422);
  });
});

import { describe, it, expect, vi } from "vitest";
import {
  REQUIRED_FIELDS,
  listExistingCustomFields,
  createCustomField,
  setupCustomFields,
} from "./custom-fields.js";

const API_KEY = "fub-test-key";

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("REQUIRED_FIELDS", () => {
  it("matches the migration doc: 6 fields, homie_score is number, rest are text", () => {
    const names = REQUIRED_FIELDS.map((f) => f.name);
    expect(names).toEqual([
      "homie_score",
      "lpmama_city",
      "lpmama_budget",
      "lpmama_timeline",
      "lpmama_motivation",
      "lpmama_mortgage_status",
    ]);
    expect(REQUIRED_FIELDS.find((f) => f.name === "homie_score")?.type).toBe("number");
    expect(REQUIRED_FIELDS.filter((f) => f.type === "text")).toHaveLength(5);
  });
});

describe("listExistingCustomFields", () => {
  it("normalizes names to lowercase + trim", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        jsonResponse({ customFields: [{ name: " Homie_Score" }, { name: "lpmama_city" }] }),
      );
    const set = await listExistingCustomFields(API_KEY, fetchMock as never);
    expect(set.has("homie_score")).toBe(true);
    expect(set.has("lpmama_city")).toBe(true);
  });

  it("throws on non-ok response", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("forbidden", { status: 403 }));
    await expect(listExistingCustomFields(API_KEY, fetchMock as never)).rejects.toThrow(/403/);
  });
});

describe("createCustomField", () => {
  it("POSTs the right body and returns the assigned id", async () => {
    const fetchMock = vi.fn().mockResolvedValue(jsonResponse({ id: 42 }));
    const result = await createCustomField(
      API_KEY,
      { name: "homie_score", type: "number" },
      fetchMock as never,
    );
    expect(result).toEqual({ created: true, id: "42" });
    const init = fetchMock.mock.calls[0][1] as { method: string; body: string; headers: Record<string, string> };
    expect(init.method).toBe("POST");
    expect(init.headers.Authorization).toMatch(/^Basic /);
    expect(JSON.parse(init.body)).toEqual({
      name: "homie_score",
      type: "number",
      category: "person",
    });
  });

  it("returns {created:false, reason} on HTTP error", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("conflict", { status: 409 }));
    const result = await createCustomField(
      API_KEY,
      { name: "lpmama_city", type: "text" },
      fetchMock as never,
    );
    expect(result).toEqual({ created: false, reason: "HTTP 409: conflict" });
  });
});

describe("setupCustomFields (idempotency)", () => {
  it("creates only the missing fields and skips the rest", async () => {
    // Pretend 2 of the 6 already exist
    const existing = { customFields: [{ name: "homie_score" }, { name: "lpmama_city" }] };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse(existing)) // list
      .mockImplementation(() => Promise.resolve(jsonResponse({ id: 1 }))); // each create fresh body

    const summary = await setupCustomFields({ apiKey: API_KEY, fetchImpl: fetchMock as never });

    expect(summary.skipped).toEqual(["homie_score", "lpmama_city"]);
    expect(summary.created).toEqual([
      "lpmama_budget",
      "lpmama_timeline",
      "lpmama_motivation",
      "lpmama_mortgage_status",
    ]);
    // 1 list + 4 creates
    expect(fetchMock).toHaveBeenCalledTimes(5);
  });

  it("re-running against a fully-populated FUB is a no-op (all skipped)", async () => {
    const existing = { customFields: REQUIRED_FIELDS.map((f) => ({ name: f.name })) };
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse(existing));

    const summary = await setupCustomFields({ apiKey: API_KEY, fetchImpl: fetchMock as never });

    expect(summary.created).toEqual([]);
    expect(summary.skipped).toHaveLength(6);
    expect(fetchMock).toHaveBeenCalledTimes(1); // list only, no creates
  });

  it("throws if a create fails", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ customFields: [] }))
      .mockResolvedValueOnce(new Response("server error", { status: 500 }));
    await expect(
      setupCustomFields({ apiKey: API_KEY, fetchImpl: fetchMock as never }),
    ).rejects.toThrow(/Failed to create homie_score/);
  });
});

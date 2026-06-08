/**
 * fub-export.test.ts — pure helpers + exportPeople with mocked FUB client.
 */
import { describe, it, expect, vi } from "vitest";
import {
  escapeCsv,
  joinTags,
  primaryEmail,
  primaryPhone,
  customField,
  transformPerson,
  exportPeople,
  createFubClient,
  CSV_HEADER,
  type FubClient,
  type Person,
  type PeoplePage,
  type RowSink,
} from "./fub-export.js";

// --- helpers ---

class MemSink implements RowSink {
  lines: string[] = [];
  write(line: string): void {
    this.lines.push(line);
  }
}

function person(id: number, overrides: Partial<Person> = {}): Person {
  return {
    id,
    firstName: `First${id}`,
    lastName: `Last${id}`,
    emails: [{ value: `p${id}@example.com`, isPrimary: true }],
    phones: [{ value: `+1555000${id.toString().padStart(4, "0")}` }],
    ...overrides,
  };
}

function mockClient(pages: PeoplePage[]): FubClient {
  let idx = 0;
  return {
    async get<T>(_path: string): Promise<T> {
      const page = pages[idx++] ?? { people: [] };
      return page as unknown as T;
    },
  };
}

// --- pure helper tests ---

describe("escapeCsv", () => {
  it("returns empty string for null/undefined", () => {
    expect(escapeCsv(null)).toBe("");
    expect(escapeCsv(undefined)).toBe("");
  });
  it("passes through plain strings unchanged", () => {
    expect(escapeCsv("hello")).toBe("hello");
  });
  it("quotes strings containing commas", () => {
    expect(escapeCsv("a,b")).toBe('"a,b"');
  });
  it("doubles internal quotes and wraps in quotes", () => {
    expect(escapeCsv('she said "hi"')).toBe('"she said ""hi"""');
  });
  it("quotes strings with newlines", () => {
    expect(escapeCsv("line1\nline2")).toBe('"line1\nline2"');
  });
  it("stringifies numbers", () => {
    expect(escapeCsv(42)).toBe("42");
  });
});

describe("joinTags", () => {
  it("joins tags with pipe", () => {
    expect(joinTags(["a", "b", "c"])).toBe("a|b|c");
  });
  it("returns empty for empty/undefined", () => {
    expect(joinTags([])).toBe("");
    expect(joinTags(undefined)).toBe("");
  });
});

describe("primaryEmail", () => {
  it("returns isPrimary email when present", () => {
    expect(
      primaryEmail({
        id: 1,
        emails: [
          { value: "a@x.com" },
          { value: "b@x.com", isPrimary: true },
          { value: "c@x.com" },
        ],
      }),
    ).toBe("b@x.com");
  });
  it("falls back to first email when none flagged primary", () => {
    expect(primaryEmail({ id: 1, emails: [{ value: "a@x.com" }, { value: "b@x.com" }] })).toBe(
      "a@x.com",
    );
  });
  it("returns empty when no emails", () => {
    expect(primaryEmail({ id: 1 })).toBe("");
    expect(primaryEmail({ id: 1, emails: [] })).toBe("");
  });
});

describe("primaryPhone", () => {
  it("returns isPrimary phone when present", () => {
    expect(
      primaryPhone({
        id: 1,
        phones: [{ value: "111" }, { value: "222", isPrimary: true }],
      }),
    ).toBe("222");
  });
  it("falls back to first phone", () => {
    expect(primaryPhone({ id: 1, phones: [{ value: "999" }] })).toBe("999");
  });
  it("returns empty when no phones", () => {
    expect(primaryPhone({ id: 1 })).toBe("");
  });
});

describe("customField", () => {
  it("returns stringified value", () => {
    expect(customField({ id: 1, customFields: { city: "Toronto" } }, "city")).toBe("Toronto");
    expect(customField({ id: 1, customFields: { budget: 500000 } }, "budget")).toBe("500000");
  });
  it("returns empty when key missing or value null", () => {
    expect(customField({ id: 1 }, "city")).toBe("");
    expect(customField({ id: 1, customFields: { city: null } }, "city")).toBe("");
  });
});

describe("transformPerson", () => {
  it("maps Person → CsvRow with sensible defaults", () => {
    const row = transformPerson({ id: 7 });
    expect(row).toEqual({
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      source: "FollowUpBoss",
      city: "",
      budget: "",
      timeline: "",
      tags: "",
      fub_id: 7,
    });
  });
  it("preserves source when set", () => {
    expect(transformPerson({ id: 1, source: "Zillow" }).source).toBe("Zillow");
  });
});

// --- exportPeople integration tests ---

describe("exportPeople", () => {
  it("writes CSV header + one row per person across pages", async () => {
    const client = mockClient([
      { people: [person(1), person(2)], _metadata: { nextLink: "/people?page=2" } },
      { people: [person(3)] },
    ]);
    const sink = new MemSink();
    const exported = await exportPeople({ client, sink, pageSleepMs: 0 });

    expect(exported).toBe(3);
    expect(sink.lines).toHaveLength(4); // header + 3 rows
    expect(sink.lines[0].trim()).toBe(CSV_HEADER.join(","));
    expect(sink.lines[1]).toContain("p1@example.com");
    expect(sink.lines[2]).toContain("p2@example.com");
    expect(sink.lines[3]).toContain("p3@example.com");
  });

  it("dedupes by fub_id across pages (defensive against pagination drift)", async () => {
    const client = mockClient([
      { people: [person(1), person(2)], _metadata: { nextLink: "/p2" } },
      { people: [person(2), person(3)] }, // id=2 repeats — must be skipped
    ]);
    const sink = new MemSink();
    const exported = await exportPeople({ client, sink, pageSleepMs: 0 });

    expect(exported).toBe(3); // 1, 2, 3 — not 4
    const fubIds = sink.lines.slice(1).map((l) => l.trim().split(",").pop());
    expect(fubIds).toEqual(["1", "2", "3"]);
  });

  it("respects limitTotal mid-page", async () => {
    const client = mockClient([
      { people: [person(1), person(2), person(3), person(4), person(5)] },
    ]);
    const sink = new MemSink();
    const exported = await exportPeople({ client, sink, limitTotal: 2, pageSleepMs: 0 });

    expect(exported).toBe(2);
    expect(sink.lines).toHaveLength(3); // header + 2 rows
  });

  it("stops when page returns empty people", async () => {
    const client = mockClient([{ people: [] }]);
    const sink = new MemSink();
    const exported = await exportPeople({ client, sink, pageSleepMs: 0 });
    expect(exported).toBe(0);
    expect(sink.lines).toHaveLength(1); // header only
  });

  it("escapes commas and quotes in CSV cells", async () => {
    const client = mockClient([
      {
        people: [
          {
            id: 9,
            firstName: "Doe, John",
            lastName: 'say "hi"',
            emails: [{ value: "x@y.com" }],
          },
        ],
      },
    ]);
    const sink = new MemSink();
    await exportPeople({ client, sink, pageSleepMs: 0 });
    expect(sink.lines[1]).toContain('"Doe, John"');
    expect(sink.lines[1]).toContain('"say ""hi"""');
  });

  it("calls onProgress per page", async () => {
    const onProgress = vi.fn();
    const client = mockClient([
      { people: [person(1), person(2)], _metadata: { nextLink: "/p2", total: 3 } },
      { people: [person(3)], _metadata: { total: 3 } },
    ]);
    await exportPeople({ client, sink: new MemSink(), pageSleepMs: 0, onProgress });
    expect(onProgress).toHaveBeenCalledTimes(2);
    expect(onProgress).toHaveBeenNthCalledWith(1, 2, 3);
    expect(onProgress).toHaveBeenNthCalledWith(2, 3, 3);
  });
});

// --- createFubClient retry behavior ---

describe("createFubClient", () => {
  it("retries on 429 honoring Retry-After header", async () => {
    const slept: number[] = [];
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("", { status: 429, headers: { "retry-after": "3" } }),
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    const client = createFubClient({
      apiKey: "test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      sleepImpl: async (ms) => {
        slept.push(ms);
      },
    });
    const result = await client.get<{ ok: boolean }>("/people");
    expect(result).toEqual({ ok: true });
    expect(slept).toEqual([3000]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws on non-2xx non-429 response", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response("bad token", { status: 401, statusText: "Unauthorized" }));
    const client = createFubClient({
      apiKey: "test",
      fetchImpl: fetchMock as unknown as typeof fetch,
      retries: 1,
    });
    await expect(client.get("/people")).rejects.toThrow(/401/);
  });

  it("sends Basic auth header derived from apiKey", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({}), { status: 200 }));
    const client = createFubClient({
      apiKey: "secret",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });
    await client.get("/people");
    const call = fetchMock.mock.calls[0];
    const headers = call[1].headers as Record<string, string>;
    const expected = "Basic " + Buffer.from("secret:").toString("base64");
    expect(headers.Authorization).toBe(expected);
  });
});

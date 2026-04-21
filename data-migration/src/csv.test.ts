import { describe, it, expect } from "vitest";
import {
  parseLines,
  chunkArray,
  isSkippable,
  normalizeTags,
  buildContactBody,
  deduplicateByEmail,
  type LeadRow,
} from "./csv.js";

describe("parseLines", () => {
  it("parses a well-formed CSV into LeadRow objects", () => {
    const lines = [
      "firstName,lastName,email,phone",
      "Alice,Smith,alice@example.com,+15141110001",
    ];
    const rows = parseLines(lines);
    expect(rows).toHaveLength(1);
    expect(rows[0].firstName).toBe("Alice");
    expect(rows[0].lastName).toBe("Smith");
    expect(rows[0].email).toBe("alice@example.com");
    expect(rows[0].phone).toBe("+15141110001");
  });

  it("maps mixed-case headers to camelCase LeadRow fields", () => {
    const lines = ["FirstName,LastName,Email", "Bob,Jones,bob@example.com"];
    const rows = parseLines(lines);
    expect(rows[0].firstName).toBe("Bob");
    expect(rows[0].lastName).toBe("Jones");
    expect(rows[0].email).toBe("bob@example.com");
  });

  it("skips blank lines", () => {
    const lines = ["firstName,email", "", "Carol,carol@example.com", ""];
    const rows = parseLines(lines);
    expect(rows).toHaveLength(1);
  });

  it("returns empty array when only header is present", () => {
    const rows = parseLines(["firstName,lastName,email"]);
    expect(rows).toHaveLength(0);
  });

  it("returns empty array for empty input", () => {
    expect(parseLines([])).toHaveLength(0);
  });

  it("strips surrounding double-quotes from values", () => {
    const lines = ["firstName,email", '"Dan","dan@example.com"'];
    const rows = parseLines(lines);
    expect(rows[0].firstName).toBe("Dan");
    expect(rows[0].email).toBe("dan@example.com");
  });

  it("assigns empty string for missing trailing columns", () => {
    const lines = ["firstName,lastName,email,phone", "Eve,Green"];
    const rows = parseLines(lines);
    expect(rows[0].email).toBe("");
    expect(rows[0].phone).toBe("");
  });

  it("parses multiple rows correctly", () => {
    const lines = [
      "firstName,email",
      "A,a@example.com",
      "B,b@example.com",
      "C,c@example.com",
    ];
    const rows = parseLines(lines);
    expect(rows).toHaveLength(3);
    expect(rows[2].firstName).toBe("C");
  });

  it("trims whitespace from values", () => {
    const lines = ["firstName , email", " Frank , frank@example.com "];
    const rows = parseLines(lines);
    expect(rows[0].firstName).toBe("Frank");
    expect(rows[0].email).toBe("frank@example.com");
  });

  it("handles all optional columns when present", () => {
    const lines = [
      "firstName,lastName,email,phone,source,city,budget,timeline,tags",
      "Gina,Lee,gina@example.com,+15559990001,Referral,Montreal,500000,3months,buyer|warm-lead",
    ];
    const rows = parseLines(lines);
    expect(rows[0].city).toBe("Montreal");
    expect(rows[0].budget).toBe("500000");
    expect(rows[0].timeline).toBe("3months");
    expect(rows[0].tags).toBe("buyer|warm-lead");
  });
});

describe("chunkArray", () => {
  it("splits an array into chunks of the given size", () => {
    const chunks = chunkArray([1, 2, 3, 4, 5], 2);
    expect(chunks).toEqual([[1, 2], [3, 4], [5]]);
  });

  it("returns a single chunk when array length equals chunk size", () => {
    const chunks = chunkArray([1, 2, 3], 3);
    expect(chunks).toEqual([[1, 2, 3]]);
  });

  it("returns one chunk per element when size is 1", () => {
    const chunks = chunkArray(["a", "b", "c"], 1);
    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toEqual(["a"]);
  });

  it("returns empty array for empty input", () => {
    expect(chunkArray([], 10)).toEqual([]);
  });

  it("returns the full array as one chunk when size exceeds length", () => {
    const chunks = chunkArray([1, 2], 100);
    expect(chunks).toEqual([[1, 2]]);
  });

  it("preserves total element count across all chunks", () => {
    const arr = Array.from({ length: 100 }, (_, i) => i);
    const chunks = chunkArray(arr, 10);
    const total = chunks.reduce((sum, c) => sum + c.length, 0);
    expect(total).toBe(100);
  });

  it("last chunk contains remainder elements", () => {
    const chunks = chunkArray([1, 2, 3, 4, 5, 6, 7], 3);
    expect(chunks[chunks.length - 1]).toEqual([7]);
  });
});

describe("isSkippable", () => {
  it("returns true when both email and phone are absent", () => {
    const row: LeadRow = { firstName: "Helen" };
    expect(isSkippable(row)).toBe(true);
  });

  it("returns false when email is present", () => {
    const row: LeadRow = { email: "helen@example.com" };
    expect(isSkippable(row)).toBe(false);
  });

  it("returns false when phone is present", () => {
    const row: LeadRow = { phone: "+15550001111" };
    expect(isSkippable(row)).toBe(false);
  });

  it("returns false when both email and phone are present", () => {
    const row: LeadRow = { email: "x@x.com", phone: "+1" };
    expect(isSkippable(row)).toBe(false);
  });

  it("returns true when email and phone are empty strings", () => {
    const row: LeadRow = { email: "", phone: "" };
    expect(isSkippable(row)).toBe(true);
  });
});

describe("normalizeTags", () => {
  it("adds csv-import tag when tags field is absent", () => {
    const row: LeadRow = { firstName: "Ivan" };
    expect(normalizeTags(row, "CSV Import")).toContain("csv-import");
  });

  it("splits pipe-separated tags into individual entries", () => {
    const row: LeadRow = { tags: "buyer|warm-lead" };
    const tags = normalizeTags(row, "CSV Import");
    expect(tags).toContain("buyer");
    expect(tags).toContain("warm-lead");
  });

  it("trims whitespace from each tag", () => {
    const row: LeadRow = { tags: " hot-lead | pre-approved " };
    const tags = normalizeTags(row, "CSV Import");
    expect(tags).toContain("hot-lead");
    expect(tags).toContain("pre-approved");
  });

  it("does not add csv-import twice when already present", () => {
    const row: LeadRow = { tags: "csv-import|buyer" };
    const tags = normalizeTags(row, "CSV Import");
    expect(tags.filter((t) => t === "csv-import")).toHaveLength(1);
  });

  it("filters out empty segments from malformed pipe strings", () => {
    const row: LeadRow = { tags: "buyer||" };
    const tags = normalizeTags(row, "CSV Import");
    expect(tags.every((t) => t.length > 0)).toBe(true);
  });
});

describe("buildContactBody", () => {
  const location = "loc-123";
  const source = "CSV Import";

  it("includes locationId in the body", () => {
    const row: LeadRow = { email: "j@example.com" };
    const body = buildContactBody(row, location, source);
    expect(body.locationId).toBe(location);
  });

  it("uses row source over default source when present", () => {
    const row: LeadRow = { email: "j@example.com", source: "Referral" };
    const body = buildContactBody(row, location, source);
    expect(body.source).toBe("Referral");
  });

  it("falls back to defaultSource when row source is absent", () => {
    const row: LeadRow = { email: "j@example.com" };
    const body = buildContactBody(row, location, source);
    expect(body.source).toBe(source);
  });

  it("always includes csv-import in tags", () => {
    const row: LeadRow = { email: "j@example.com" };
    const body = buildContactBody(row, location, source);
    expect(body.tags as string[]).toContain("csv-import");
  });

  it("includes city in customField when present", () => {
    const row: LeadRow = { email: "j@example.com", city: "Ottawa" };
    const body = buildContactBody(row, location, source);
    const fields = body.customField as { id: string; value: string }[];
    expect(fields.some((f) => f.id === "city" && f.value === "Ottawa")).toBe(
      true,
    );
  });

  it("includes budget in customField when present", () => {
    const row: LeadRow = { email: "j@example.com", budget: "700000" };
    const body = buildContactBody(row, location, source);
    const fields = body.customField as { id: string; value: string }[];
    expect(fields.some((f) => f.id === "budget" && f.value === "700000")).toBe(
      true,
    );
  });

  it("includes timeline in customField when present", () => {
    const row: LeadRow = { email: "j@example.com", timeline: "6months" };
    const body = buildContactBody(row, location, source);
    const fields = body.customField as { id: string; value: string }[];
    expect(
      fields.some((f) => f.id === "timeline" && f.value === "6months"),
    ).toBe(true);
  });

  it("omits falsy fields from customField array", () => {
    const row: LeadRow = { email: "j@example.com" };
    const body = buildContactBody(row, location, source);
    const fields = body.customField as unknown[];
    expect(fields.every(Boolean)).toBe(true);
  });

  it("maps firstName, lastName, email, phone from row", () => {
    const row: LeadRow = {
      firstName: "Kim",
      lastName: "Park",
      email: "kim@example.com",
      phone: "+15559990002",
    };
    const body = buildContactBody(row, location, source);
    expect(body.firstName).toBe("Kim");
    expect(body.lastName).toBe("Park");
    expect(body.email).toBe("kim@example.com");
    expect(body.phone).toBe("+15559990002");
  });
});

describe("deduplicateByEmail", () => {
  it("removes duplicate rows with the same email", () => {
    const rows: LeadRow[] = [
      { email: "dup@example.com", firstName: "First" },
      { email: "dup@example.com", firstName: "Second" },
    ];
    const result = deduplicateByEmail(rows);
    expect(result).toHaveLength(1);
    expect(result[0].firstName).toBe("First");
  });

  it("keeps rows with no email (they cannot be deduplicated by email)", () => {
    const rows: LeadRow[] = [
      { phone: "+15550001111" },
      { phone: "+15550002222" },
    ];
    const result = deduplicateByEmail(rows);
    expect(result).toHaveLength(2);
  });

  it("is case-insensitive when comparing emails", () => {
    const rows: LeadRow[] = [
      { email: "User@Example.COM" },
      { email: "user@example.com" },
    ];
    const result = deduplicateByEmail(rows);
    expect(result).toHaveLength(1);
  });

  it("preserves unique rows untouched", () => {
    const rows: LeadRow[] = [
      { email: "a@example.com" },
      { email: "b@example.com" },
      { email: "c@example.com" },
    ];
    expect(deduplicateByEmail(rows)).toHaveLength(3);
  });

  it("returns empty array for empty input", () => {
    expect(deduplicateByEmail([])).toHaveLength(0);
  });

  it("handles mix of rows with and without emails", () => {
    const rows: LeadRow[] = [
      { email: "x@example.com" },
      { phone: "+1" },
      { email: "x@example.com" },
      { phone: "+2" },
    ];
    const result = deduplicateByEmail(rows);
    expect(result).toHaveLength(3);
  });

  it("trims whitespace before comparing emails", () => {
    const rows: LeadRow[] = [
      { email: " trim@example.com" },
      { email: "trim@example.com " },
    ];
    const result = deduplicateByEmail(rows);
    expect(result).toHaveLength(1);
  });
});

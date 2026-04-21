import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  isDormant,
  buildListingParams,
  pickMatchResult,
  buildReactivationPrompt,
  extractMessageText,
  type Contact,
  type ListingRaw,
} from "./logic.js";

const NOW = new Date("2026-04-20T12:00:00Z");

describe("isDormant", () => {
  it("returns true when contact has no lastContacted and no dateAdded", () => {
    const contact: Contact = { id: "c1" };
    expect(isDormant(contact, 30, NOW)).toBe(true);
  });

  it("returns true when dateLastContacted is older than the dormant threshold", () => {
    const contact: Contact = {
      id: "c2",
      dateLastContacted: new Date(NOW.getTime() - 31 * 86400000).toISOString(),
    };
    expect(isDormant(contact, 30, NOW)).toBe(true);
  });

  it("returns false when dateLastContacted is within the dormant threshold", () => {
    const contact: Contact = {
      id: "c3",
      dateLastContacted: new Date(NOW.getTime() - 10 * 86400000).toISOString(),
    };
    expect(isDormant(contact, 30, NOW)).toBe(false);
  });

  it("returns false when dateLastContacted is exactly on the boundary day", () => {
    const contact: Contact = {
      id: "c4",
      dateLastContacted: new Date(NOW.getTime() - 30 * 86400000).toISOString(),
    };
    expect(isDormant(contact, 30, NOW)).toBe(false);
  });

  it("falls back to dateAdded when dateLastContacted is absent", () => {
    const oldDate = new Date(NOW.getTime() - 60 * 86400000).toISOString();
    const contact: Contact = { id: "c5", dateAdded: oldDate };
    expect(isDormant(contact, 30, NOW)).toBe(true);
  });

  it("excludes contacts tagged dnc", () => {
    const contact: Contact = { id: "c6", tags: ["dnc"] };
    expect(isDormant(contact, 30, NOW)).toBe(false);
  });

  it("excludes contacts tagged no-contact", () => {
    const contact: Contact = { id: "c7", tags: ["no-contact"] };
    expect(isDormant(contact, 30, NOW)).toBe(false);
  });

  it("excludes contacts tagged handed-off", () => {
    const contact: Contact = { id: "c8", tags: ["handed-off"] };
    expect(isDormant(contact, 30, NOW)).toBe(false);
  });

  it("excludes contacts tagged closed", () => {
    const contact: Contact = { id: "c9", tags: ["closed"] };
    expect(isDormant(contact, 30, NOW)).toBe(false);
  });

  it("includes contacts with unrelated tags when dormant", () => {
    const contact: Contact = {
      id: "c10",
      tags: ["buyer"],
      dateLastContacted: new Date(NOW.getTime() - 45 * 86400000).toISOString(),
    };
    expect(isDormant(contact, 30, NOW)).toBe(true);
  });

  it("respects a custom dormancy threshold of 7 days", () => {
    const contact: Contact = {
      id: "c11",
      dateLastContacted: new Date(NOW.getTime() - 8 * 86400000).toISOString(),
    };
    expect(isDormant(contact, 7, NOW)).toBe(true);
  });

  it("returns false when within a custom 7-day threshold", () => {
    const contact: Contact = {
      id: "c12",
      dateLastContacted: new Date(NOW.getTime() - 5 * 86400000).toISOString(),
    };
    expect(isDormant(contact, 7, NOW)).toBe(false);
  });
});

describe("buildListingParams", () => {
  it("returns base params unchanged when contact has no custom fields", () => {
    const contact: Contact = { id: "c1" };
    const result = buildListingParams(contact, { limit: "3" });
    expect(result).toEqual({ limit: "3" });
  });

  it("adds cities param when contact has city custom field", () => {
    const contact: Contact = {
      id: "c2",
      customField: [{ id: "city", value: "Montreal" }],
    };
    const result = buildListingParams(contact, { limit: "3" });
    expect(result.cities).toBe("Montreal");
  });

  it("adds minprice and maxprice at 85% and 115% of budget", () => {
    const contact: Contact = {
      id: "c3",
      customField: [{ id: "budget", value: "$500000" }],
    };
    const result = buildListingParams(contact, {});
    expect(result.minprice).toBe("425000");
    expect(result.maxprice).toBe("575000");
  });

  it("strips non-numeric characters from budget before computing range", () => {
    const contact: Contact = {
      id: "c4",
      customField: [{ id: "budget", value: "CAD 800,000" }],
    };
    const result = buildListingParams(contact, {});
    expect(result.minprice).toBe(String(Math.round(800000 * 0.85)));
    expect(result.maxprice).toBe(String(Math.round(800000 * 1.15)));
  });

  it("omits price params when budget is non-numeric", () => {
    const contact: Contact = {
      id: "c5",
      customField: [{ id: "budget", value: "flexible" }],
    };
    const result = buildListingParams(contact, {});
    expect(result.minprice).toBeUndefined();
    expect(result.maxprice).toBeUndefined();
  });

  it("does not mutate the original base params object", () => {
    const contact: Contact = {
      id: "c6",
      customField: [{ id: "city", value: "Quebec" }],
    };
    const base = { limit: "3" };
    buildListingParams(contact, base);
    expect(base).toEqual({ limit: "3" });
  });
});

describe("pickMatchResult", () => {
  const listing: ListingRaw = {
    address: { full: "123 Main St" },
    listPrice: 499000,
    property: { bedrooms: 3, bathrooms: 2 },
  };

  it("returns new-listing trigger when newListings is non-empty", () => {
    const result = pickMatchResult([listing], []);
    expect(result.trigger).toBe("new listing in their area");
  });

  it("includes address, price, beds and baths in new-listing snippet", () => {
    const result = pickMatchResult([listing], []);
    expect(result.snippet).toContain("123 Main St");
    expect(result.snippet).toContain("499");
    expect(result.snippet).toContain("3bd");
    expect(result.snippet).toContain("2ba");
  });

  it("returns price-drop trigger when newListings is empty and priceDrops has entries", () => {
    const result = pickMatchResult([], [listing]);
    expect(result.trigger).toBe(
      "price reduction on a property matching their criteria",
    );
  });

  it("includes address and price in price-drop snippet", () => {
    const result = pickMatchResult([], [listing]);
    expect(result.snippet).toContain("123 Main St");
    expect(result.snippet).toContain("499");
  });

  it("returns market-update trigger with empty snippet when both arrays are empty", () => {
    const result = pickMatchResult([], []);
    expect(result.trigger).toBe("market update");
    expect(result.snippet).toBe("");
  });

  it("prefers new listing over price drop when both are present", () => {
    const priceDrop: ListingRaw = {
      address: { full: "999 Drop Ave" },
      listPrice: 350000,
    };
    const result = pickMatchResult([listing], [priceDrop]);
    expect(result.trigger).toBe("new listing in their area");
  });

  it("uses only the first listing when multiple are present", () => {
    const second: ListingRaw = {
      address: { full: "456 Other Rd" },
      listPrice: 600000,
      property: { bedrooms: 4, bathrooms: 3 },
    };
    const result = pickMatchResult([listing, second], []);
    expect(result.snippet).not.toContain("456 Other Rd");
  });

  it("handles listing with missing address gracefully", () => {
    const sparse: ListingRaw = { listPrice: 300000 };
    expect(() => pickMatchResult([sparse], [])).not.toThrow();
  });
});

describe("buildReactivationPrompt", () => {
  it("uses firstName when available", () => {
    const contact: Contact = { id: "c1", firstName: "Alice" };
    const prompt = buildReactivationPrompt(contact, "market update", "");
    expect(prompt).toContain("Alice");
  });

  it("falls back to 'there' when firstName is absent", () => {
    const contact: Contact = { id: "c2" };
    const prompt = buildReactivationPrompt(contact, "market update", "");
    expect(prompt).toContain("there");
  });

  it("includes the trigger in the prompt", () => {
    const contact: Contact = { id: "c3" };
    const prompt = buildReactivationPrompt(
      contact,
      "price reduction on a property matching their criteria",
      "",
    );
    expect(prompt).toContain(
      "price reduction on a property matching their criteria",
    );
  });

  it("includes listing snippet when provided", () => {
    const contact: Contact = { id: "c4" };
    const prompt = buildReactivationPrompt(
      contact,
      "new listing in their area",
      "New listing: 123 Main St",
    );
    expect(prompt).toContain("123 Main St");
  });

  it("omits listing context line when snippet is empty", () => {
    const contact: Contact = { id: "c5" };
    const prompt = buildReactivationPrompt(contact, "market update", "");
    expect(prompt).not.toContain("Listing context:");
  });

  it("includes city custom field when present", () => {
    const contact: Contact = {
      id: "c6",
      customField: [{ id: "city", value: "Laval" }],
    };
    const prompt = buildReactivationPrompt(contact, "market update", "");
    expect(prompt).toContain("Laval");
  });

  it("includes budget custom field when present", () => {
    const contact: Contact = {
      id: "c7",
      customField: [{ id: "budget", value: "$600000" }],
    };
    const prompt = buildReactivationPrompt(contact, "market update", "");
    expect(prompt).toContain("$600000");
  });

  it("omits city line when city field is absent", () => {
    const contact: Contact = { id: "c8" };
    const prompt = buildReactivationPrompt(contact, "market update", "");
    expect(prompt).not.toContain("target area:");
  });
});

describe("extractMessageText", () => {
  it("returns the text from the first content item", () => {
    const contact: Contact = { id: "c1", firstName: "Bob" };
    const data = { content: [{ text: "Hey Bob, check this out!" }] };
    expect(extractMessageText(data, contact)).toBe("Hey Bob, check this out!");
  });

  it("returns fallback message when content array is empty", () => {
    const contact: Contact = { id: "c2", firstName: "Sue" };
    const result = extractMessageText({ content: [] }, contact);
    expect(result).toContain("Sue");
  });

  it("returns fallback message when content is undefined", () => {
    const contact: Contact = { id: "c3", firstName: "Tom" };
    const result = extractMessageText({}, contact);
    expect(result).toContain("Tom");
  });

  it("uses 'there' in fallback when firstName is absent", () => {
    const contact: Contact = { id: "c4" };
    const result = extractMessageText({}, contact);
    expect(result).toContain("there");
  });

  it("returns fallback when text field is undefined on content item", () => {
    const contact: Contact = { id: "c5", firstName: "Ana" };
    const result = extractMessageText({ content: [{}] }, contact);
    expect(result).toContain("Ana");
  });
});

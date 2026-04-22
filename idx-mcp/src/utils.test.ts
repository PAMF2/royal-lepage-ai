import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  buildAuthHeader,
  isoDateDaysAgo,
  isoDateDaysAhead,
  mcpSuccess,
  mcpError,
  buildSearchParams,
  buildComparableParams,
  buildNewListingsParams,
  buildPriceReductionParams,
  buildOpenHousesParams,
  isValidPropertyType,
  isValidSortBy,
  isValidPriceRange,
  isValidLimit,
  formatPrice,
  formatPriceRange,
  buildListingSummaryPrompt,
  generateListingSummary,
} from "./utils.js";

// ── buildAuthHeader ───────────────────────────────────────────────────────────

describe("buildAuthHeader", () => {
  it("should return Basic auth for simplyrets with key and secret", () => {
    // Arrange
    const expected = `Basic ${Buffer.from("mykey:mysecret").toString("base64")}`;
    // Act
    const actual = buildAuthHeader("simplyrets", "mykey", "mysecret");
    // Assert
    expect(actual).toBe(expected);
  });

  it("should use empty string for missing secret in simplyrets", () => {
    // Arrange
    const expected = `Basic ${Buffer.from("mykey:").toString("base64")}`;
    // Act
    const actual = buildAuthHeader("simplyrets", "mykey");
    // Assert
    expect(actual).toBe(expected);
  });

  it("should return Bearer token for crea_ddf", () => {
    // Act
    const actual = buildAuthHeader("crea_ddf", "ddf-token-abc");
    // Assert
    expect(actual).toBe("Bearer ddf-token-abc");
  });
});

// ── isoDateDaysAgo ────────────────────────────────────────────────────────────

describe("isoDateDaysAgo", () => {
  it("should return YYYY-MM-DD string for 0 days ago", () => {
    // Arrange
    const now = new Date("2026-04-20T12:00:00.000Z");
    // Act
    const actual = isoDateDaysAgo(now, 0);
    // Assert
    expect(actual).toBe("2026-04-20");
  });

  it("should subtract the given number of days correctly", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const actual = isoDateDaysAgo(now, 30);
    // Assert
    expect(actual).toBe("2026-03-21");
  });

  it("should not mutate the supplied date", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    const original = now.toISOString();
    // Act
    isoDateDaysAgo(now, 90);
    // Assert
    expect(now.toISOString()).toBe(original);
  });
});

// ── isoDateDaysAhead ──────────────────────────────────────────────────────────

describe("isoDateDaysAhead", () => {
  it("should add the given number of days correctly", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const actual = isoDateDaysAhead(now, 7);
    // Assert
    expect(actual).toBe("2026-04-27");
  });

  it("should return the same day for 0 days ahead", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const actual = isoDateDaysAhead(now, 0);
    // Assert
    expect(actual).toBe("2026-04-20");
  });
});

// ── mcpSuccess ────────────────────────────────────────────────────────────────

describe("mcpSuccess", () => {
  it("should wrap data in content array with text type", () => {
    // Arrange
    const data = { id: "1", price: 500000 };
    // Act
    const result = mcpSuccess(data);
    // Assert
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
  });

  it("should handle null data", () => {
    // Act
    const result = mcpSuccess(null);
    // Assert
    expect(result.content[0].text).toBe("null");
  });

  it("should handle an empty array", () => {
    // Act
    const result = mcpSuccess([]);
    // Assert
    expect(result.content[0].text).toBe("[]");
  });
});

// ── mcpError ──────────────────────────────────────────────────────────────────

describe("mcpError", () => {
  it("should extract the message from an Error instance", () => {
    // Arrange
    const error = new Error("IDX API 404: not found");
    // Act
    const result = mcpError(error);
    // Assert
    expect(result.content[0].text).toBe("Error: IDX API 404: not found");
    expect(result.isError).toBe(true);
  });

  it("should stringify non-Error values", () => {
    // Act
    const result = mcpError("something went wrong");
    // Assert
    expect(result.content[0].text).toBe("Error: something went wrong");
    expect(result.isError).toBe(true);
  });

  it("should handle numeric error values", () => {
    // Act
    const result = mcpError(500);
    // Assert
    expect(result.content[0].text).toBe("Error: 500");
  });
});

// ── buildSearchParams ─────────────────────────────────────────────────────────

describe("buildSearchParams", () => {
  it("should map all provided fields to IDX param names", () => {
    // Arrange / Act
    const params = buildSearchParams({
      city: "Vancouver",
      postalCode: "V6B 1A1",
      minPrice: 400000,
      maxPrice: 900000,
      minBeds: 2,
      maxBeds: 4,
      minBaths: 1,
      propertyType: "condo",
      limit: 10,
      sortBy: "price",
    });
    // Assert
    expect(params).toMatchObject({
      cities: "Vancouver",
      postalCodes: "V6B 1A1",
      minprice: 400000,
      maxprice: 900000,
      minbeds: 2,
      maxbeds: 4,
      minbaths: 1,
      type: "condo",
      limit: 10,
      sort: "price",
    });
  });

  it("should pass undefined for omitted optional fields", () => {
    // Act
    const params = buildSearchParams({ limit: 10, sortBy: "listdate" });
    // Assert
    expect(params.cities).toBeUndefined();
    expect(params.minprice).toBeUndefined();
    expect(params.type).toBeUndefined();
  });
});

// ── buildComparableParams ─────────────────────────────────────────────────────

describe("buildComparableParams", () => {
  it("should set status=closed and compute lastModifiedFrom correctly", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildComparableParams(
      { city: "Toronto", soldWithinDays: 90, limit: 5 },
      now,
    );
    // Assert
    expect(params.status).toBe("closed");
    expect(params.lastModifiedFrom).toBe("2026-01-20");
    expect(params.cities).toBe("Toronto");
    expect(params.limit).toBe(5);
  });

  it("should include optional price/bed filters when provided", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildComparableParams(
      {
        city: "Calgary",
        minPrice: 300000,
        maxPrice: 700000,
        minBeds: 3,
        soldWithinDays: 30,
        limit: 10,
      },
      now,
    );
    // Assert
    expect(params.minprice).toBe(300000);
    expect(params.maxprice).toBe(700000);
    expect(params.minbeds).toBe(3);
  });
});

// ── buildNewListingsParams ────────────────────────────────────────────────────

describe("buildNewListingsParams", () => {
  it("should compute lastModifiedFrom from withinDays", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildNewListingsParams({ withinDays: 7, limit: 10 }, now);
    // Assert
    expect(params.lastModifiedFrom).toBe("2026-04-13");
  });

  it("should map city and postalCode fields", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildNewListingsParams(
      { city: "Ottawa", postalCode: "K1A 0A9", withinDays: 3, limit: 5 },
      now,
    );
    // Assert
    expect(params.cities).toBe("Ottawa");
    expect(params.postalCodes).toBe("K1A 0A9");
  });
});

// ── buildPriceReductionParams ─────────────────────────────────────────────────

describe("buildPriceReductionParams", () => {
  it("should always include priceReduced=true", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildPriceReductionParams(
      { withinDays: 14, limit: 10 },
      now,
    );
    // Assert
    expect(params.priceReduced).toBe(true);
  });

  it("should compute lastModifiedFrom from withinDays", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildPriceReductionParams(
      { city: "Edmonton", withinDays: 14, limit: 10 },
      now,
    );
    // Assert
    expect(params.lastModifiedFrom).toBe("2026-04-06");
  });
});

// ── buildOpenHousesParams ─────────────────────────────────────────────────────

describe("buildOpenHousesParams", () => {
  it("should set startTime to today and endTime to withinDays ahead", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildOpenHousesParams({ withinDays: 7, limit: 10 }, now);
    // Assert
    expect(params.startTime).toBe("2026-04-20");
    expect(params.endTime).toBe("2026-04-27");
  });

  it("should include city when provided", () => {
    // Arrange
    const now = new Date("2026-04-20T00:00:00.000Z");
    // Act
    const params = buildOpenHousesParams(
      { city: "Montreal", withinDays: 3, limit: 5 },
      now,
    );
    // Assert
    expect(params.cities).toBe("Montreal");
    expect(params.limit).toBe(5);
  });
});

// ── Filter validators ─────────────────────────────────────────────────────────

describe("isValidPropertyType", () => {
  it.each([
    "residential",
    "condo",
    "townhouse",
    "multi-family",
    "land",
    "commercial",
  ])("should return true for valid type %s", (type) => {
    expect(isValidPropertyType(type)).toBe(true);
  });

  it("should return false for an unknown type", () => {
    expect(isValidPropertyType("cabin")).toBe(false);
  });

  it("should return false for empty string", () => {
    expect(isValidPropertyType("")).toBe(false);
  });
});

describe("isValidSortBy", () => {
  it.each(["listdate", "price", "beds"])(
    "should return true for valid sort %s",
    (sort) => {
      expect(isValidSortBy(sort)).toBe(true);
    },
  );

  it("should return false for an unknown sort value", () => {
    expect(isValidSortBy("date_added")).toBe(false);
  });
});

describe("isValidPriceRange", () => {
  it("should return true when only minPrice is provided", () => {
    expect(isValidPriceRange(100000, undefined)).toBe(true);
  });

  it("should return true when only maxPrice is provided", () => {
    expect(isValidPriceRange(undefined, 900000)).toBe(true);
  });

  it("should return true when both are undefined", () => {
    expect(isValidPriceRange(undefined, undefined)).toBe(true);
  });

  it("should return true when minPrice equals maxPrice", () => {
    expect(isValidPriceRange(500000, 500000)).toBe(true);
  });

  it("should return true when minPrice < maxPrice", () => {
    expect(isValidPriceRange(200000, 800000)).toBe(true);
  });

  it("should return false when minPrice > maxPrice", () => {
    expect(isValidPriceRange(900000, 400000)).toBe(false);
  });
});

describe("isValidLimit", () => {
  it("should return true for a limit of 1", () => {
    expect(isValidLimit(1)).toBe(true);
  });

  it("should return true for limit at the default max of 50", () => {
    expect(isValidLimit(50)).toBe(true);
  });

  it("should return false for 0", () => {
    expect(isValidLimit(0)).toBe(false);
  });

  it("should return false for a value above the default max", () => {
    expect(isValidLimit(51)).toBe(false);
  });

  it("should respect a custom max parameter", () => {
    expect(isValidLimit(20, 20)).toBe(true);
    expect(isValidLimit(21, 20)).toBe(false);
  });

  it("should return false for non-integer values", () => {
    expect(isValidLimit(5.5)).toBe(false);
  });
});

// ── formatPrice ───────────────────────────────────────────────────────────────

describe("formatPrice", () => {
  it("should format whole-dollar amounts with no decimal places", () => {
    // Arrange / Act
    const result = formatPrice(500000);
    // Assert — contains digits and no decimal point
    expect(result).toMatch(/500[,.]?000/);
    expect(result).not.toMatch(/\.\d{2}/);
  });

  it("should format zero as a currency string", () => {
    const result = formatPrice(0);
    expect(result).toContain("0");
  });

  it("should include a currency symbol", () => {
    const result = formatPrice(1000000);
    // CAD symbol or code present
    expect(result).toMatch(/\$|CA\$|CAD/);
  });
});

// ── formatPriceRange ──────────────────────────────────────────────────────────

describe("formatPriceRange", () => {
  it("should show both bounds when both are provided", () => {
    const result = formatPriceRange(300000, 700000);
    expect(result).toContain("300");
    expect(result).toContain("700");
    expect(result).toContain("–");
  });

  it("should show From prefix when only minPrice is provided", () => {
    const result = formatPriceRange(400000, undefined);
    expect(result).toMatch(/^From/);
    expect(result).toContain("400");
  });

  it("should show Up to prefix when only maxPrice is provided", () => {
    const result = formatPriceRange(undefined, 800000);
    expect(result).toMatch(/^Up to/);
    expect(result).toContain("800");
  });

  it("should return 'Any price' when both bounds are omitted", () => {
    expect(formatPriceRange()).toBe("Any price");
  });
});

// ── buildListingSummaryPrompt ─────────────────────────────────────────────────

describe("buildListingSummaryPrompt", () => {
  it("should embed the MLS ID in the prompt text", () => {
    const prompt = buildListingSummaryPrompt("MLS-12345");
    expect(prompt).toContain("MLS-12345");
  });

  it("should mention SMS in the instructions", () => {
    const prompt = buildListingSummaryPrompt("X99");
    expect(prompt.toLowerCase()).toContain("sms");
  });

  it("should instruct not to use markdown", () => {
    const prompt = buildListingSummaryPrompt("X99");
    expect(prompt.toLowerCase()).toContain("markdown");
  });
});

// ── generateListingSummary ────────────────────────────────────────────────────

describe("generateListingSummary", () => {
  const base = {
    mlsId: "A1234",
    address: "123 Main St",
    city: "Vancouver",
    price: 1250000,
    beds: 3,
    baths: 2,
    propertyType: "condo",
  };

  it("should include address and city", () => {
    const result = generateListingSummary(base);
    expect(result).toContain("123 Main St");
    expect(result).toContain("Vancouver");
  });

  it("should include beds and baths", () => {
    const result = generateListingSummary(base);
    expect(result).toContain("3");
    expect(result).toContain("2");
  });

  it("should include the MLS ID", () => {
    const result = generateListingSummary(base);
    expect(result).toContain("A1234");
  });

  it("should include the formatted price", () => {
    const result = generateListingSummary(base);
    expect(result).toContain("250");
  });

  it("should include the property type", () => {
    const result = generateListingSummary(base);
    expect(result).toContain("condo");
  });
});

import { describe, it, expect } from "vitest";
import {
  mcpSuccess,
  mcpError,
  buildOfferClauseContext,
  buildCmaContext,
  buildListingPresentationPrompt,
  buildFlyerContext,
  formatCmaComparable,
  formatCmaSoldComparable,
  formatEvalComp,
  type OfferClauseInput,
  type CmaListing,
  type ListingPresentationInput,
  type FlyerInput,
} from "./formatters.js";

// ── mcpSuccess ─────────────────────────────────────────────────────────────

describe("mcpSuccess", () => {
  it("should wrap a string value directly without JSON serialisation", () => {
    // Arrange
    const input = "Hello, agent.";
    // Act
    const result = mcpSuccess(input);
    // Assert
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe("Hello, agent.");
  });

  it("should serialise a non-string value as pretty-printed JSON", () => {
    // Arrange
    const input = { foo: "bar", count: 3 };
    // Act
    const result = mcpSuccess(input);
    // Assert
    expect(result.content[0].text).toBe(JSON.stringify(input, null, 2));
  });

  it("should handle null without throwing", () => {
    // Arrange / Act
    const result = mcpSuccess(null);
    // Assert
    expect(result.content[0].text).toBe("null");
  });

  it("should handle an empty array", () => {
    const result = mcpSuccess([]);
    expect(result.content[0].text).toBe("[]");
  });
});

// ── mcpError ──────────────────────────────────────────────────────────────

describe("mcpError", () => {
  it("should extract the message from an Error instance", () => {
    // Arrange
    const error = new Error("something broke");
    // Act
    const result = mcpError(error);
    // Assert
    expect(result.content[0].text).toBe("Error: something broke");
    expect(result.isError).toBe(true);
  });

  it("should coerce a non-Error value to string", () => {
    // Arrange / Act
    const result = mcpError("network timeout");
    // Assert
    expect(result.content[0].text).toBe("Error: network timeout");
    expect(result.isError).toBe(true);
  });

  it("should handle numeric error codes", () => {
    const result = mcpError(404);
    expect(result.content[0].text).toBe("Error: 404");
  });
});

// ── buildOfferClauseContext ────────────────────────────────────────────────

describe("buildOfferClauseContext", () => {
  const baseInput: OfferClauseInput = {
    buyerName: "Alice Dupont",
    offerPrice: 550000,
    depositAmount: 25000,
    closingDate: "June 30, 2026",
    conditions: ["financing", "home inspection"],
    inclusions: "Fridge, stove",
    agentName: "Marc Leblanc",
    brokerageName: "Royal LePage",
    province: "QC",
  };

  it("should include all required labelled fields", () => {
    // Arrange / Act
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      baseInput,
    );
    // Assert
    expect(result).toContain("Property: 123 Main St");
    expect(result).toContain("List Price: $600,000");
    expect(result).toContain("MLS#: MLS123");
    expect(result).toContain("Buyer: Alice Dupont");
    expect(result).toMatch(/Offer Price: \$550[,.]000/);
    expect(result).toMatch(/Deposit: \$25[,.]000/);
    expect(result).toContain("Closing Date: June 30, 2026");
    expect(result).toContain("Conditions: financing, home inspection");
    expect(result).toContain("Inclusions: Fridge, stove");
    expect(result).toContain("Agent: Marc Leblanc, Royal LePage");
    expect(result).toContain("Province: QC");
  });

  it("should default conditions to 'None' when omitted", () => {
    // Arrange
    const input: OfferClauseInput = { ...baseInput, conditions: undefined };
    // Act
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      input,
    );
    // Assert
    expect(result).toContain("Conditions: None");
  });

  it("should default inclusions to 'Standard' when omitted", () => {
    const input: OfferClauseInput = { ...baseInput, inclusions: undefined };
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      input,
    );
    expect(result).toContain("Inclusions: Standard");
  });

  it("should default agentName to 'Your Agent' when omitted", () => {
    const input: OfferClauseInput = { ...baseInput, agentName: undefined };
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      input,
    );
    expect(result).toContain("Agent: Your Agent, Royal LePage");
  });

  it("should default brokerageName to 'Royal LePage' when omitted", () => {
    const input: OfferClauseInput = { ...baseInput, brokerageName: undefined };
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      input,
    );
    expect(result).toContain("Royal LePage");
  });

  it("should default province to 'QC' when omitted", () => {
    const input: OfferClauseInput = { ...baseInput, province: undefined };
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      input,
    );
    expect(result).toContain("Province: QC");
  });

  it("should handle an empty conditions array", () => {
    const input: OfferClauseInput = { ...baseInput, conditions: [] };
    const result = buildOfferClauseContext(
      "123 Main St",
      "$600,000",
      "MLS123",
      input,
    );
    expect(result).toContain("Conditions: None");
  });
});

// ── formatCmaComparable ────────────────────────────────────────────────────

describe("formatCmaComparable", () => {
  it("should map address.full, listPrice, bedrooms, bathrooms", () => {
    // Arrange
    const listing: CmaListing = {
      address: { full: "456 Oak Ave" },
      listPrice: 525000,
      property: { bedrooms: 3, bathrooms: 2 },
    };
    // Act
    const result = formatCmaComparable(listing);
    // Assert
    expect(result).toEqual({
      address: "456 Oak Ave",
      price: 525000,
      beds: 3,
      baths: 2,
    });
  });

  it("should return undefined fields when listing is empty", () => {
    const result = formatCmaComparable({});
    expect(result.address).toBeUndefined();
    expect(result.price).toBeUndefined();
    expect(result.beds).toBeUndefined();
    expect(result.baths).toBeUndefined();
  });
});

// ── formatCmaSoldComparable ────────────────────────────────────────────────

describe("formatCmaSoldComparable", () => {
  it("should use 'soldPrice' key instead of 'price'", () => {
    // Arrange
    const listing: CmaListing = {
      address: { full: "789 Elm St" },
      listPrice: 490000,
      property: { bedrooms: 2, bathrooms: 1 },
    };
    // Act
    const result = formatCmaSoldComparable(listing);
    // Assert
    expect(result).toEqual({
      address: "789 Elm St",
      soldPrice: 490000,
      beds: 2,
      baths: 1,
    });
  });
});

// ── buildCmaContext ────────────────────────────────────────────────────────

describe("buildCmaContext", () => {
  const active: CmaListing[] = [
    {
      address: { full: "1 Active St" },
      listPrice: 500000,
      property: { bedrooms: 3, bathrooms: 2 },
    },
  ];
  const sold: CmaListing[] = [
    {
      address: { full: "2 Sold Ave" },
      listPrice: 480000,
      property: { bedrooms: 3, bathrooms: 2 },
    },
  ];

  it("should include the subject property header", () => {
    // Act
    const result = buildCmaContext(
      "99 Test Rd",
      "Montreal",
      3,
      2,
      undefined,
      "residential",
      active,
      sold,
    );
    // Assert
    expect(result).toContain("Subject Property: 99 Test Rd, Montreal");
    expect(result).toContain("Beds: 3 | Baths: 2");
    expect(result).not.toContain("Sqft");
  });

  it("should include sqft when provided", () => {
    const result = buildCmaContext(
      "99 Test Rd",
      "Montreal",
      3,
      2,
      1400,
      "residential",
      active,
      sold,
    );
    expect(result).toContain("| Sqft: 1400");
  });

  it("should include sellerName and agentName when provided", () => {
    const result = buildCmaContext(
      "99 Test Rd",
      "Montreal",
      3,
      2,
      undefined,
      "residential",
      active,
      sold,
      "Jane Seller",
      "Bob Agent",
    );
    expect(result).toContain("Seller: Jane Seller");
    expect(result).toContain("Prepared by: Bob Agent");
  });

  it("should omit sellerName and agentName lines when not provided", () => {
    const result = buildCmaContext(
      "99 Test Rd",
      "Montreal",
      3,
      2,
      undefined,
      "residential",
      active,
      sold,
    );
    expect(result).not.toContain("Seller:");
    expect(result).not.toContain("Prepared by:");
  });

  it("should cap active comparables at 5 listings", () => {
    // Arrange — 7 active listings
    const manyActive: CmaListing[] = Array.from({ length: 7 }, (_, i) => ({
      address: { full: `${i} Active St` },
      listPrice: 500000 + i * 1000,
      property: { bedrooms: 3, bathrooms: 2 },
    }));
    // Act
    const result = buildCmaContext(
      "99 Test Rd",
      "Montreal",
      3,
      2,
      undefined,
      "residential",
      manyActive,
      sold,
    );
    const parsed = JSON.parse(
      result
        .split("Active Comparables (competition):")[1]
        .split("Recent Sales")[0]
        .trim(),
    );
    // Assert
    expect(parsed).toHaveLength(5);
  });

  it("should cap sold comparables at 6 listings", () => {
    // Arrange — 9 sold listings
    const manySold: CmaListing[] = Array.from({ length: 9 }, (_, i) => ({
      address: { full: `${i} Sold Ave` },
      listPrice: 480000 + i * 1000,
      property: { bedrooms: 3, bathrooms: 2 },
    }));
    const result = buildCmaContext(
      "99 Test Rd",
      "Montreal",
      3,
      2,
      undefined,
      "residential",
      active,
      manySold,
    );
    const parsed = JSON.parse(
      result.split("Recent Sales (last 90 days):")[1].trim(),
    );
    expect(parsed).toHaveLength(6);
  });
});

// ── buildListingPresentationPrompt ────────────────────────────────────────

describe("buildListingPresentationPrompt", () => {
  const base: ListingPresentationInput = {
    sellerName: "Marie Tremblay",
    propertyAddress: "200 Lakeshore Dr",
    city: "Laval",
    agentName: "Sophie Roy",
  };

  it("should include all core fields", () => {
    // Act
    const result = buildListingPresentationPrompt(base);
    // Assert
    expect(result).toContain("Seller: Marie Tremblay");
    expect(result).toContain("Property: 200 Lakeshore Dr, Laval");
    expect(result).toContain("Agent: Sophie Roy");
    expect(result).toContain("Brokerage: Royal LePage");
  });

  it("should append years of experience when provided", () => {
    const result = buildListingPresentationPrompt({
      ...base,
      agentYearsExperience: 12,
    });
    expect(result).toContain("(12 years experience)");
  });

  it("should not include experience annotation when omitted", () => {
    const result = buildListingPresentationPrompt(base);
    expect(result).not.toContain("years experience");
  });

  it("should include formatted suggested price when provided", () => {
    const result = buildListingPresentationPrompt({
      ...base,
      suggestedPrice: 875000,
    });
    expect(result).toMatch(/Suggested list price: \$875[,.]000/);
  });

  it("should not include price line when suggestedPrice is omitted", () => {
    const result = buildListingPresentationPrompt(base);
    expect(result).not.toContain("Suggested list price");
  });

  it("should default marketCondition to balanced", () => {
    const result = buildListingPresentationPrompt(base);
    expect(result).toContain("balanced market");
  });

  it("should use the supplied marketCondition", () => {
    const result = buildListingPresentationPrompt({
      ...base,
      marketCondition: "sellers",
    });
    expect(result).toContain("sellers market");
  });
});

// ── buildFlyerContext ──────────────────────────────────────────────────────

describe("buildFlyerContext", () => {
  const base: FlyerInput = {
    address: "300 Pine Cres",
    price: 699000,
    beds: 4,
    baths: 3,
    agentName: "Luc Bernard",
    agentPhone: "514-555-0199",
  };

  it("should include property details and agent info", () => {
    // Act
    const result = buildFlyerContext(base);
    // Assert
    expect(result).toContain("Property: 300 Pine Cres");
    expect(result).toMatch(/Price: \$699[,.]000/);
    expect(result).toContain("Beds: 4 | Baths: 3");
    expect(result).toContain("Agent: Luc Bernard | 514-555-0199");
    expect(result).toContain("MLS#: TBD");
  });

  it("should include sqft when provided", () => {
    const result = buildFlyerContext({ ...base, sqft: 2100 });
    expect(result).toMatch(/2[,.]100 sqft/);
  });

  it("should include mlsId when provided", () => {
    const result = buildFlyerContext({ ...base, mlsId: "QC12345" });
    expect(result).toContain("MLS#: QC12345");
  });

  it("should include highlights when provided", () => {
    const result = buildFlyerContext({
      ...base,
      highlights: "heated floors, granite counters",
    });
    expect(result).toContain("Key features: heated floors, granite counters");
  });

  it("should omit highlights line when not provided", () => {
    const result = buildFlyerContext(base);
    expect(result).not.toContain("Key features:");
  });

  it("should include open house date when provided", () => {
    const result = buildFlyerContext({
      ...base,
      openHouseDate: "Saturday May 10, 1–3 PM",
    });
    expect(result).toContain("Open House: Saturday May 10, 1–3 PM");
  });

  it("should include agent email when provided", () => {
    const result = buildFlyerContext({
      ...base,
      agentEmail: "luc@royallepage.ca",
    });
    expect(result).toContain("luc@royallepage.ca");
  });
});

// ── formatEvalComp ─────────────────────────────────────────────────────────

describe("formatEvalComp", () => {
  it("should map all five fields correctly", () => {
    // Arrange
    const listing = {
      address: { full: "10 Comp Lane" },
      listPrice: 460000,
      property: { bedrooms: 3, bathrooms: 2, area: 1350 },
    };
    // Act
    const result = formatEvalComp(listing);
    // Assert
    expect(result).toEqual({
      address: "10 Comp Lane",
      soldPrice: 460000,
      beds: 3,
      baths: 2,
      sqft: 1350,
    });
  });

  it("should return undefined for all fields on an empty listing", () => {
    const result = formatEvalComp({});
    expect(result.address).toBeUndefined();
    expect(result.soldPrice).toBeUndefined();
    expect(result.beds).toBeUndefined();
    expect(result.baths).toBeUndefined();
    expect(result.sqft).toBeUndefined();
  });
});

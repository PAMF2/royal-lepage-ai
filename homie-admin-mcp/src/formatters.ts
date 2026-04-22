/**
 * Pure formatting helpers for homie-admin-mcp.
 * No I/O, no API calls — safe to import in tests.
 */

// ── MCP response helpers ───────────────────────────────────────────────────

export function mcpSuccess(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
  };
}

export function mcpError(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true as const,
  };
}

// ── Offer clause builder ───────────────────────────────────────────────────

export interface OfferClauseInput {
  buyerName: string;
  offerPrice: number;
  depositAmount: number;
  closingDate: string;
  conditions?: string[];
  inclusions?: string;
  agentName?: string;
  brokerageName?: string;
  province?: string;
}

/**
 * Builds the offer-clause context block that is embedded in the Claude prompt.
 * Returns a plain string with labelled fields.
 */
export function buildOfferClauseContext(
  address: string,
  listPrice: string,
  mlsId: string,
  input: OfferClauseInput,
): string {
  const {
    buyerName,
    offerPrice,
    depositAmount,
    closingDate,
    conditions,
    inclusions,
    agentName,
    brokerageName = "Royal LePage",
    province = "QC",
  } = input;

  return [
    `Property: ${address}`,
    `List Price: ${listPrice}`,
    `MLS#: ${mlsId}`,
    ``,
    `Buyer: ${buyerName}`,
    `Offer Price: $${offerPrice.toLocaleString()}`,
    `Deposit: $${depositAmount.toLocaleString()}`,
    `Closing Date: ${closingDate}`,
    `Conditions: ${conditions?.join(", ") || "None"}`,
    `Inclusions: ${inclusions ?? "Standard"}`,
    `Agent: ${agentName ?? "Your Agent"}, ${brokerageName}`,
    `Province: ${province}`,
  ].join("\n");
}

// ── CMA formatter ──────────────────────────────────────────────────────────

export interface CmaListing {
  address?: Record<string, string>;
  listPrice?: number;
  property?: Record<string, unknown>;
}

export function formatCmaComparable(listing: CmaListing) {
  return {
    address: listing.address?.full,
    price: listing.listPrice,
    beds: listing.property?.bedrooms,
    baths: listing.property?.bathrooms,
  };
}

export function formatCmaSoldComparable(listing: CmaListing) {
  return {
    address: listing.address?.full,
    soldPrice: listing.listPrice,
    beds: listing.property?.bedrooms,
    baths: listing.property?.bathrooms,
  };
}

/**
 * Builds the CMA context block embedded in the Claude prompt.
 */
export function buildCmaContext(
  subjectAddress: string,
  city: string,
  beds: number,
  baths: number,
  sqft: number | undefined,
  propertyType: string,
  activeListings: CmaListing[],
  soldListings: CmaListing[],
  sellerName?: string,
  agentName?: string,
): string {
  const lines: string[] = [
    `Subject Property: ${subjectAddress}, ${city}`,
    `Beds: ${beds} | Baths: ${baths}${sqft ? ` | Sqft: ${sqft}` : ""} | Type: ${propertyType}`,
  ];
  if (sellerName) lines.push(`Seller: ${sellerName}`);
  if (agentName) lines.push(`Prepared by: ${agentName}`);

  lines.push(
    "",
    "Active Comparables (competition):",
    JSON.stringify(
      activeListings.slice(0, 5).map(formatCmaComparable),
      null,
      2,
    ),
    "",
    "Recent Sales (last 90 days):",
    JSON.stringify(
      soldListings.slice(0, 6).map(formatCmaSoldComparable),
      null,
      2,
    ),
  );

  return lines.join("\n");
}

// ── Listing presentation generator ────────────────────────────────────────

export interface ListingPresentationInput {
  sellerName: string;
  propertyAddress: string;
  city: string;
  agentName: string;
  agentYearsExperience?: number;
  suggestedPrice?: number;
  marketCondition?: string;
}

export function buildListingPresentationPrompt(
  input: ListingPresentationInput,
): string {
  const {
    sellerName,
    propertyAddress,
    city,
    agentName,
    agentYearsExperience,
    suggestedPrice,
    marketCondition = "balanced",
  } = input;

  const experienceLine = agentYearsExperience
    ? ` (${agentYearsExperience} years experience)`
    : "";
  const priceLine = suggestedPrice
    ? `Suggested list price: $${suggestedPrice.toLocaleString()}`
    : "";

  return [
    `Seller: ${sellerName}`,
    `Property: ${propertyAddress}, ${city}`,
    `Agent: ${agentName}${experienceLine}`,
    `Market: ${marketCondition} market`,
    priceLine,
    `Brokerage: Royal LePage`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Flyer copy formatter ───────────────────────────────────────────────────

export interface FlyerInput {
  mlsId?: string;
  address: string;
  price: number;
  beds: number;
  baths: number;
  sqft?: number;
  highlights?: string;
  agentName: string;
  agentPhone: string;
  agentEmail?: string;
  openHouseDate?: string;
}

export function buildFlyerContext(input: FlyerInput): string {
  const {
    mlsId,
    address,
    price,
    beds,
    baths,
    sqft,
    highlights,
    agentName,
    agentPhone,
    agentEmail,
    openHouseDate,
  } = input;

  return [
    `Property: ${address}`,
    `Price: $${price.toLocaleString()}`,
    `Beds: ${beds} | Baths: ${baths}${sqft ? ` | ${sqft.toLocaleString()} sqft` : ""}`,
    highlights ? `Key features: ${highlights}` : "",
    openHouseDate ? `Open House: ${openHouseDate}` : "",
    `Agent: ${agentName} | ${agentPhone}${agentEmail ? ` | ${agentEmail}` : ""}`,
    `MLS#: ${mlsId ?? "TBD"}`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Home evaluation formatter ──────────────────────────────────────────────

export interface HomeEvalListing {
  address?: Record<string, string>;
  listPrice?: number;
  property?: Record<string, unknown>;
}

export function formatEvalComp(listing: HomeEvalListing) {
  return {
    address: listing.address?.full,
    soldPrice: listing.listPrice,
    beds: listing.property?.bedrooms,
    baths: listing.property?.bathrooms,
    sqft: listing.property?.area,
  };
}

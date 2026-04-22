// Pure utility functions extracted from idx-mcp index.ts
// These are side-effect-free and fully testable without any HTTP calls.

export type PropertyType =
  | "residential"
  | "condo"
  | "townhouse"
  | "multi-family"
  | "land"
  | "commercial";

export type SortBy = "listdate" | "price" | "beds";

export type IdxProvider = "simplyrets" | "crea_ddf";

export type IdxParams = Record<string, string | number | boolean | undefined>;

// ── Auth ──────────────────────────────────────────────────────────────────────

/**
 * Build the Authorization header value for the given provider.
 * SimplyRETS uses HTTP Basic; CREA DDF uses Bearer.
 */
export function buildAuthHeader(
  provider: IdxProvider,
  apiKey: string,
  apiSecret?: string,
): string {
  if (provider === "simplyrets") {
    const encoded = Buffer.from(`${apiKey}:${apiSecret ?? ""}`).toString(
      "base64",
    );
    return `Basic ${encoded}`;
  }
  return `Bearer ${apiKey}`;
}

// ── Date helpers ──────────────────────────────────────────────────────────────

/**
 * Return the ISO date string (YYYY-MM-DD) for a date that is `daysAgo` days
 * before `now`. Does not mutate the supplied Date.
 */
export function isoDateDaysAgo(now: Date, daysAgo: number): string {
  const d = new Date(now.getTime());
  d.setDate(d.getDate() - daysAgo);
  return d.toISOString().split("T")[0];
}

/**
 * Return the ISO date string (YYYY-MM-DD) for a date that is `daysAhead` days
 * after `now`.
 */
export function isoDateDaysAhead(now: Date, daysAhead: number): string {
  const d = new Date(now.getTime() + daysAhead * 86_400_000);
  return d.toISOString().split("T")[0];
}

// ── MCP response builders ─────────────────────────────────────────────────────

export function mcpSuccess(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
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

// ── Search param builders ─────────────────────────────────────────────────────

export interface SearchListingsInput {
  city?: string;
  postalCode?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  maxBeds?: number;
  minBaths?: number;
  propertyType?: PropertyType;
  limit: number;
  sortBy: SortBy;
}

export function buildSearchParams(input: SearchListingsInput): IdxParams {
  return {
    cities: input.city,
    postalCodes: input.postalCode,
    minprice: input.minPrice,
    maxprice: input.maxPrice,
    minbeds: input.minBeds,
    maxbeds: input.maxBeds,
    minbaths: input.minBaths,
    type: input.propertyType,
    limit: input.limit,
    sort: input.sortBy,
  };
}

export interface ComparableInput {
  city: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  soldWithinDays: number;
  limit: number;
}

export function buildComparableParams(
  input: ComparableInput,
  now: Date,
): IdxParams {
  return {
    cities: input.city,
    minprice: input.minPrice,
    maxprice: input.maxPrice,
    minbeds: input.minBeds,
    limit: input.limit,
    status: "closed",
    lastModifiedFrom: isoDateDaysAgo(now, input.soldWithinDays),
  };
}

export interface NewListingsInput {
  city?: string;
  postalCode?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  propertyType?: Exclude<PropertyType, "commercial">;
  withinDays: number;
  limit: number;
}

export function buildNewListingsParams(
  input: NewListingsInput,
  now: Date,
): IdxParams {
  return {
    cities: input.city,
    postalCodes: input.postalCode,
    minprice: input.minPrice,
    maxprice: input.maxPrice,
    minbeds: input.minBeds,
    type: input.propertyType,
    limit: input.limit,
    lastModifiedFrom: isoDateDaysAgo(now, input.withinDays),
  };
}

export interface PriceReductionInput {
  city?: string;
  minPrice?: number;
  maxPrice?: number;
  minBeds?: number;
  withinDays: number;
  limit: number;
}

export function buildPriceReductionParams(
  input: PriceReductionInput,
  now: Date,
): IdxParams {
  return {
    cities: input.city,
    minprice: input.minPrice,
    maxprice: input.maxPrice,
    minbeds: input.minBeds,
    limit: input.limit,
    priceReduced: true,
    lastModifiedFrom: isoDateDaysAgo(now, input.withinDays),
  };
}

export interface OpenHousesInput {
  city?: string;
  withinDays: number;
  limit: number;
}

export function buildOpenHousesParams(
  input: OpenHousesInput,
  now: Date,
): IdxParams {
  return {
    cities: input.city,
    startTime: now.toISOString().split("T")[0],
    endTime: isoDateDaysAhead(now, input.withinDays),
    limit: input.limit,
  };
}

// ── Filter validators ─────────────────────────────────────────────────────────

const VALID_PROPERTY_TYPES: ReadonlySet<string> = new Set([
  "residential",
  "condo",
  "townhouse",
  "multi-family",
  "land",
  "commercial",
]);

const VALID_SORT_BY: ReadonlySet<string> = new Set([
  "listdate",
  "price",
  "beds",
]);

export function isValidPropertyType(value: string): value is PropertyType {
  return VALID_PROPERTY_TYPES.has(value);
}

export function isValidSortBy(value: string): value is SortBy {
  return VALID_SORT_BY.has(value);
}

export function isValidPriceRange(
  minPrice?: number,
  maxPrice?: number,
): boolean {
  if (minPrice === undefined || maxPrice === undefined) return true;
  return minPrice <= maxPrice;
}

export function isValidLimit(limit: number, max = 50): boolean {
  return Number.isInteger(limit) && limit >= 1 && limit <= max;
}

// ── Price formatters ──────────────────────────────────────────────────────────

/**
 * Format a numeric price into a human-readable Canadian dollar string.
 * e.g. 1250000 → "$1,250,000"
 */
export function formatPrice(price: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(price);
}

/**
 * Format a price range as a display string.
 * Either bound may be omitted (open-ended).
 */
export function formatPriceRange(minPrice?: number, maxPrice?: number): string {
  if (minPrice !== undefined && maxPrice !== undefined) {
    return `${formatPrice(minPrice)} – ${formatPrice(maxPrice)}`;
  }
  if (minPrice !== undefined) return `From ${formatPrice(minPrice)}`;
  if (maxPrice !== undefined) return `Up to ${formatPrice(maxPrice)}`;
  return "Any price";
}

// ── Listing summary generators ────────────────────────────────────────────────

export interface ListingSummaryInput {
  mlsId: string;
  address: string;
  city: string;
  price: number;
  beds: number;
  baths: number;
  propertyType: string;
}

/**
 * Generate the prompt text used in the listing_summary MCP prompt.
 */
export function buildListingSummaryPrompt(mlsId: string): string {
  return (
    `Fetch the listing with MLS ID ${mlsId} and write a 2-sentence conversational summary` +
    ` suitable for sending to a lead via SMS. Include price, beds/baths, and one standout feature.` +
    ` Do not use markdown.`
  );
}

/**
 * Generate a short inline listing summary without an API call.
 * Suitable for embedding in AI context strings.
 */
export function generateListingSummary(input: ListingSummaryInput): string {
  const price = formatPrice(input.price);
  return `${input.beds} bed / ${input.baths} bath ${input.propertyType} at ${input.address}, ${input.city} — ${price} (MLS# ${input.mlsId})`;
}

#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// CREA DDF (Canadian boards) or SimplyRETS (US boards)
// Set IDX_PROVIDER=simplyrets or idx_provider=crea_ddf
const IDX_PROVIDER = (process.env.IDX_PROVIDER ?? "simplyrets").toLowerCase();
const IDX_API_KEY = process.env.IDX_API_KEY;
const IDX_API_SECRET = process.env.IDX_API_SECRET;
const IDX_FEED_URL = process.env.IDX_FEED_URL;

if (!IDX_API_KEY) {
  console.error(
    "ERROR: IDX_API_KEY environment variable is required.\n" +
      "For SimplyRETS: get credentials at simplyrets.com\n" +
      "For CREA DDF: apply at crea.ca/data-feed",
  );
  process.exit(1);
}

const SIMPLY_BASE = "https://api.simplyrets.com";
const CREA_BASE = IDX_FEED_URL ?? "https://ddf.crea.ca/Access/Query";

const AUTH_HEADER =
  IDX_PROVIDER === "simplyrets"
    ? "Basic " +
      Buffer.from(`${IDX_API_KEY}:${IDX_API_SECRET ?? ""}`).toString("base64")
    : `Bearer ${IDX_API_KEY}`;

async function idxRequest<T = unknown>(
  path: string,
  params?: Record<string, string | number | boolean | undefined>,
): Promise<T> {
  const base = IDX_PROVIDER === "simplyrets" ? SIMPLY_BASE : CREA_BASE;
  const url = new URL(`${base}${path}`);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }
  const res = await fetch(url.toString(), {
    headers: { Authorization: AUTH_HEADER, Accept: "application/json" },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`IDX API ${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

function mcpSuccess(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function mcpError(error: unknown) {
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

const server = new McpServer({ name: "idx-mcp", version: "1.0.0" });

// ── Listing Search ────────────────────────────────────────────────────────────

server.tool(
  "search_listings",
  "Search MLS listings by location, price, beds, baths, and property type",
  {
    city: z.string().optional(),
    postalCode: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minBeds: z.number().optional(),
    maxBeds: z.number().optional(),
    minBaths: z.number().optional(),
    propertyType: z
      .enum([
        "residential",
        "condo",
        "townhouse",
        "multi-family",
        "land",
        "commercial",
      ])
      .optional(),
    limit: z.number().min(1).max(50).default(10),
    sortBy: z.enum(["listdate", "price", "beds"]).default("listdate"),
  },
  async ({
    city,
    postalCode,
    minPrice,
    maxPrice,
    minBeds,
    maxBeds,
    minBaths,
    propertyType,
    limit,
    sortBy,
  }) => {
    try {
      const data = await idxRequest("/properties", {
        cities: city,
        postalCodes: postalCode,
        minprice: minPrice,
        maxprice: maxPrice,
        minbeds: minBeds,
        maxbeds: maxBeds,
        minbaths: minBaths,
        type: propertyType,
        limit,
        sort: sortBy,
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_listing",
  "Get full details for a specific MLS listing by MLS number or listing ID",
  { mlsId: z.string().describe("MLS number or listing ID") },
  async ({ mlsId }) => {
    try {
      const data = await idxRequest(`/properties/${mlsId}`);
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_comparables",
  "Find comparable sold listings near a subject property (for CMAs and AI context)",
  {
    address: z.string().describe("Subject property address"),
    city: z.string(),
    radiusKm: z.number().default(1).describe("Search radius in kilometers"),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minBeds: z.number().optional(),
    soldWithinDays: z
      .number()
      .default(90)
      .describe("Only include sales within this many days"),
    limit: z.number().min(1).max(20).default(5),
  },
  async ({
    city,
    radiusKm,
    minPrice,
    maxPrice,
    minBeds,
    soldWithinDays,
    limit,
  }) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - soldWithinDays);
      const data = await idxRequest("/properties", {
        cities: city,
        minprice: minPrice,
        maxprice: maxPrice,
        minbeds: minBeds,
        limit,
        status: "closed",
        lastModifiedFrom: cutoff.toISOString().split("T")[0],
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_new_listings",
  "Get listings added in the last N days — used for lead reactivation triggers",
  {
    city: z.string().optional(),
    postalCode: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minBeds: z.number().optional(),
    propertyType: z
      .enum(["residential", "condo", "townhouse", "multi-family", "land"])
      .optional(),
    withinDays: z
      .number()
      .default(7)
      .describe("Listings added within this many days"),
    limit: z.number().min(1).max(20).default(10),
  },
  async ({
    city,
    postalCode,
    minPrice,
    maxPrice,
    minBeds,
    propertyType,
    withinDays,
    limit,
  }) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - withinDays);
      const data = await idxRequest("/properties", {
        cities: city,
        postalCodes: postalCode,
        minprice: minPrice,
        maxprice: maxPrice,
        minbeds: minBeds,
        type: propertyType,
        limit,
        lastModifiedFrom: cutoff.toISOString().split("T")[0],
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_price_reductions",
  "Find listings with recent price reductions — used to re-engage dormant leads",
  {
    city: z.string().optional(),
    minPrice: z.number().optional(),
    maxPrice: z.number().optional(),
    minBeds: z.number().optional(),
    withinDays: z.number().default(14),
    limit: z.number().min(1).max(20).default(10),
  },
  async ({ city, minPrice, maxPrice, minBeds, withinDays, limit }) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - withinDays);
      const data = await idxRequest("/properties", {
        cities: city,
        minprice: minPrice,
        maxprice: maxPrice,
        minbeds: minBeds,
        limit,
        priceReduced: true,
        lastModifiedFrom: cutoff.toISOString().split("T")[0],
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_open_houses",
  "Find upcoming open houses in an area",
  {
    city: z.string().optional(),
    withinDays: z.number().default(7),
    limit: z.number().min(1).max(20).default(10),
  },
  async ({ city, withinDays, limit }) => {
    try {
      const from = new Date().toISOString().split("T")[0];
      const to = new Date(Date.now() + withinDays * 86400000)
        .toISOString()
        .split("T")[0];
      const data = await idxRequest("/openhouses", {
        cities: city,
        startTime: from,
        endTime: to,
        limit,
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_market_stats",
  "Get market statistics for an area (avg price, days on market, list-to-sale ratio)",
  {
    city: z.string(),
    propertyType: z.enum(["residential", "condo", "townhouse"]).optional(),
  },
  async ({ city, propertyType }) => {
    try {
      const [active, sold] = await Promise.all([
        idxRequest("/properties", {
          cities: city,
          type: propertyType,
          limit: 50,
        }),
        idxRequest("/properties", {
          cities: city,
          type: propertyType,
          status: "closed",
          limit: 50,
        }),
      ]);
      return mcpSuccess({
        area: city,
        propertyType,
        activeListings: active,
        recentSales: sold,
      });
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Prompts ───────────────────────────────────────────────────────────────────

server.prompt(
  "listing_summary",
  "Generate a natural language summary of a listing for SMS or conversation use",
  { mlsId: z.string() },
  ({ mlsId }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Fetch the listing with MLS ID ${mlsId} and write a 2-sentence conversational summary suitable for sending to a lead via SMS. Include price, beds/baths, and one standout feature. Do not use markdown.`,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

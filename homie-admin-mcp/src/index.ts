#!/usr/bin/env node
/**
 * Homie Admin MCP — agent OS for Royal LePage agents
 * Handles: offer drafting, CMAs, listing presentations, marketing materials
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const IDX_API_KEY = process.env.IDX_API_KEY!;
const IDX_API_SECRET = process.env.IDX_API_SECRET ?? "";

if (!ANTHROPIC_API_KEY) {
  console.error("ERROR: ANTHROPIC_API_KEY is required.");
  process.exit(1);
}

const IDX_AUTH =
  "Basic " + Buffer.from(`${IDX_API_KEY}:${IDX_API_SECRET}`).toString("base64");

async function idxGet(path: string, params?: Record<string, string>) {
  const url = new URL(`https://api.simplyrets.com${path}`);
  if (params)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: IDX_AUTH, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`IDX ${res.status}`);
  return res.json();
}

async function claude(prompt: string, maxTokens = 2000): Promise<string> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-6",
      max_tokens: maxTokens,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const data = await res.json();
  return data.content?.[0]?.text ?? "";
}

function mcpSuccess(data: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: typeof data === "string" ? data : JSON.stringify(data, null, 2),
      },
    ],
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

const server = new McpServer({ name: "homie-admin-mcp", version: "1.0.0" });

// ── Offer Drafting ─────────────────────────────────────────────────────────────

server.tool(
  "draft_offer",
  "Draft a real estate offer letter for a buyer based on listing and buyer details",
  {
    mlsId: z.string().describe("MLS ID of the property"),
    buyerName: z.string(),
    offerPrice: z.number().describe("Offer price in dollars"),
    depositAmount: z.number().describe("Deposit/earnest money amount"),
    closingDate: z
      .string()
      .describe("Desired closing date (e.g. June 15, 2026)"),
    conditions: z
      .array(z.string())
      .optional()
      .describe(
        "Conditions (e.g. 'financing', 'home inspection', 'sale of buyer property')",
      ),
    inclusions: z
      .string()
      .optional()
      .describe("Items included in the offer (appliances, fixtures, etc.)"),
    agentName: z.string().optional(),
    brokerageName: z.string().default("Royal LePage"),
    province: z
      .string()
      .default("QC")
      .describe("Province code for legal context"),
  },
  async ({
    mlsId,
    buyerName,
    offerPrice,
    depositAmount,
    closingDate,
    conditions,
    inclusions,
    agentName,
    brokerageName,
    province,
  }) => {
    try {
      const listing = await idxGet(`/properties/${mlsId}`);
      const address = listing.address?.full ?? "the property";
      const listPrice = listing.listPrice?.toLocaleString("en-CA", {
        style: "currency",
        currency: "CAD",
        maximumFractionDigits: 0,
      });

      const draft = await claude(
        `You are a real estate agent at ${brokerageName} in ${province}, Canada. Draft a professional offer letter for the following transaction.

Property: ${address}
List Price: ${listPrice}
MLS#: ${mlsId}

Buyer: ${buyerName}
Offer Price: $${offerPrice.toLocaleString()}
Deposit: $${depositAmount.toLocaleString()}
Closing Date: ${closingDate}
Conditions: ${conditions?.join(", ") || "None"}
Inclusions: ${inclusions ?? "Standard"}
Agent: ${agentName ?? "Your Agent"}, ${brokerageName}

Write a complete, professional offer letter. Include all standard clauses for ${province}. Format it clearly with sections. Use formal language.`,
        2500,
      );

      return mcpSuccess(draft);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── CMA (Comparative Market Analysis) ─────────────────────────────────────────

server.tool(
  "generate_cma",
  "Generate a Comparative Market Analysis (CMA) for a property or seller consultation",
  {
    subjectAddress: z.string(),
    city: z.string(),
    beds: z.number(),
    baths: z.number(),
    sqft: z.number().optional(),
    propertyType: z
      .enum(["residential", "condo", "townhouse"])
      .default("residential"),
    sellerName: z.string().optional(),
    agentName: z.string().optional(),
  },
  async ({
    subjectAddress,
    city,
    beds,
    baths,
    sqft,
    propertyType,
    sellerName,
    agentName,
  }) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const [activeListings, soldListings] = await Promise.all([
        idxGet("/properties", {
          cities: city,
          minbeds: String(beds - 1),
          maxbeds: String(beds + 1),
          type: propertyType,
          limit: "5",
        }),
        idxGet("/properties", {
          cities: city,
          minbeds: String(beds - 1),
          maxbeds: String(beds + 1),
          type: propertyType,
          status: "closed",
          limit: "6",
          lastModifiedFrom: cutoff.toISOString().split("T")[0],
        }),
      ]);

      const cma = await claude(
        `You are a real estate agent at Royal LePage preparing a CMA for a seller.

Subject Property: ${subjectAddress}, ${city}
Beds: ${beds} | Baths: ${baths}${sqft ? ` | Sqft: ${sqft}` : ""} | Type: ${propertyType}
${sellerName ? `Seller: ${sellerName}` : ""}
${agentName ? `Prepared by: ${agentName}` : ""}

Active Comparables (competition):
${JSON.stringify(
  activeListings
    .slice(0, 5)
    .map((l: Record<string, unknown>) => ({
      address: (l.address as Record<string, string>)?.full,
      price: l.listPrice,
      beds: (l.property as Record<string, unknown>)?.bedrooms,
      baths: (l.property as Record<string, unknown>)?.bathrooms,
    })),
  null,
  2,
)}

Recent Sales (last 90 days):
${JSON.stringify(
  soldListings
    .slice(0, 6)
    .map((l: Record<string, unknown>) => ({
      address: (l.address as Record<string, string>)?.full,
      soldPrice: l.listPrice,
      beds: (l.property as Record<string, unknown>)?.bedrooms,
      baths: (l.property as Record<string, unknown>)?.bathrooms,
    })),
  null,
  2,
)}

Write a professional CMA report with:
1. Market summary
2. Active competition analysis
3. Recent sales analysis
4. Suggested list price range with justification
5. Recommended strategy (pricing, timing)

Format clearly with sections. Be specific and data-driven.`,
        2500,
      );

      return mcpSuccess(cma);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Listing Presentation ───────────────────────────────────────────────────────

server.tool(
  "generate_listing_presentation",
  "Generate a listing presentation script and talking points for a seller meeting",
  {
    sellerName: z.string(),
    propertyAddress: z.string(),
    city: z.string(),
    agentName: z.string(),
    agentYearsExperience: z.number().optional(),
    suggestedPrice: z.number().optional(),
    marketCondition: z
      .enum(["buyers", "sellers", "balanced"])
      .default("balanced"),
  },
  async ({
    sellerName,
    propertyAddress,
    city,
    agentName,
    agentYearsExperience,
    suggestedPrice,
    marketCondition,
  }) => {
    try {
      const presentation =
        await claude(`Create a compelling listing presentation for the following meeting:

Seller: ${sellerName}
Property: ${propertyAddress}, ${city}
Agent: ${agentName}${agentYearsExperience ? ` (${agentYearsExperience} years experience)` : ""}
Market: ${marketCondition} market
${suggestedPrice ? `Suggested list price: $${suggestedPrice.toLocaleString()}` : ""}
Brokerage: Royal LePage

Write a structured presentation covering:
1. Opening (build rapport, agenda)
2. Market overview for ${city}
3. Your marketing plan (MLS, social media, open houses, professional photography, IDX syndication)
4. Pricing strategy and the CMA
5. Royal LePage advantages
6. The selling timeline
7. Commission and next steps
8. Close (call to action — sign today)

Include suggested talking points and anticipated seller objections with responses.`);

      return mcpSuccess(presentation);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Marketing Materials ────────────────────────────────────────────────────────

server.tool(
  "generate_listing_description",
  "Write a compelling MLS listing description for a property",
  {
    mlsId: z
      .string()
      .optional()
      .describe("MLS ID to pull property data automatically"),
    address: z.string().optional(),
    beds: z.number().optional(),
    baths: z.number().optional(),
    sqft: z.number().optional(),
    highlights: z
      .string()
      .optional()
      .describe(
        "Key features to emphasize (e.g. 'renovated kitchen, backyard pool, quiet street')",
      ),
    targetBuyer: z
      .string()
      .optional()
      .describe(
        "Who this home is ideal for (e.g. 'young families, investors, downsizers')",
      ),
    tone: z
      .enum(["luxury", "family", "investment", "standard"])
      .default("standard"),
  },
  async ({
    mlsId,
    address,
    beds,
    baths,
    sqft,
    highlights,
    targetBuyer,
    tone,
  }) => {
    try {
      let propertyInfo = { address, beds, baths, sqft };

      if (mlsId && IDX_API_KEY) {
        const listing = await idxGet(`/properties/${mlsId}`);
        propertyInfo = {
          address: listing.address?.full ?? address,
          beds: listing.property?.bedrooms ?? beds,
          baths: listing.property?.bathrooms ?? baths,
          sqft: listing.property?.area ?? sqft,
        };
      }

      const description = await claude(
        `Write a compelling MLS listing description for this property.

Address: ${propertyInfo.address ?? "N/A"}
Beds: ${propertyInfo.beds ?? "N/A"} | Baths: ${propertyInfo.baths ?? "N/A"}${propertyInfo.sqft ? ` | ${propertyInfo.sqft} sqft` : ""}
${highlights ? `Key features: ${highlights}` : ""}
${targetBuyer ? `Ideal for: ${targetBuyer}` : ""}
Tone: ${tone}

Write a 150-200 word MLS description that:
- Opens with a strong hook
- Highlights the best features naturally
- Ends with a call to action (book a showing)
- Uses vivid but professional language
- No all-caps, no excessive punctuation

Then write a shorter 80-character social media caption for Instagram/Facebook.`,
        800,
      );

      return mcpSuccess(description);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "generate_flyer_copy",
  "Write copy for a property marketing flyer or brochure",
  {
    mlsId: z.string().optional(),
    address: z.string(),
    price: z.number(),
    beds: z.number(),
    baths: z.number(),
    sqft: z.number().optional(),
    highlights: z.string().optional(),
    agentName: z.string(),
    agentPhone: z.string(),
    agentEmail: z.string().optional(),
    openHouseDate: z.string().optional(),
  },
  async ({
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
  }) => {
    try {
      const copy = await claude(
        `Write flyer copy for a real estate property listing at Royal LePage.

Property: ${address}
Price: $${price.toLocaleString()}
Beds: ${beds} | Baths: ${baths}${sqft ? ` | ${sqft.toLocaleString()} sqft` : ""}
${highlights ? `Key features: ${highlights}` : ""}
${openHouseDate ? `Open House: ${openHouseDate}` : ""}
Agent: ${agentName} | ${agentPhone}${agentEmail ? ` | ${agentEmail}` : ""}
MLS#: ${mlsId ?? "TBD"}

Write flyer copy with:
1. Headline (punchy, under 10 words)
2. Subheadline (price + key stats in one line)
3. 3-4 bullet points for top features
4. Short property description (50-70 words)
5. Call to action
6. Agent contact block

Format clearly. Keep it clean and professional.`,
        800,
      );

      return mcpSuccess(copy);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Home Evaluation ────────────────────────────────────────────────────────────

server.tool(
  "generate_home_evaluation",
  "Generate an AI home evaluation report with estimated value range",
  {
    address: z.string(),
    city: z.string(),
    beds: z.number(),
    baths: z.number(),
    sqft: z.number().optional(),
    yearBuilt: z.number().optional(),
    condition: z
      .enum(["excellent", "good", "fair", "needs-work"])
      .default("good"),
    propertyType: z
      .enum(["residential", "condo", "townhouse"])
      .default("residential"),
    ownerName: z.string().optional(),
  },
  async ({
    address,
    city,
    beds,
    baths,
    sqft,
    yearBuilt,
    condition,
    propertyType,
    ownerName,
  }) => {
    try {
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - 90);

      const comps = await idxGet("/properties", {
        cities: city,
        minbeds: String(beds - 1),
        maxbeds: String(beds + 1),
        type: propertyType,
        status: "closed",
        limit: "8",
        lastModifiedFrom: cutoff.toISOString().split("T")[0],
      });

      const evaluation = await claude(
        `Generate a home evaluation report for:

Property: ${address}, ${city}
Beds: ${beds} | Baths: ${baths}${sqft ? ` | ${sqft.toLocaleString()} sqft` : ""}
${yearBuilt ? `Year Built: ${yearBuilt}` : ""}
Condition: ${condition}
Type: ${propertyType}
${ownerName ? `Owner: ${ownerName}` : ""}

Recent comparable sales (last 90 days):
${JSON.stringify(
  comps.slice(0, 8).map((l: Record<string, unknown>) => ({
    address: (l.address as Record<string, string>)?.full,
    soldPrice: l.listPrice,
    beds: (l.property as Record<string, unknown>)?.bedrooms,
    baths: (l.property as Record<string, unknown>)?.bathrooms,
    sqft: (l.property as Record<string, unknown>)?.area,
  })),
  null,
  2,
)}

Write a professional home evaluation including:
1. Executive summary
2. Market conditions in ${city}
3. Comparable sales analysis
4. Estimated value range (low / most likely / high) with justification
5. Factors affecting value (positive and negative)
6. Recommended list price if selling now
7. Disclaimer

Be specific and data-driven. Professional tone.`,
        2000,
      );

      return mcpSuccess(evaluation);
    } catch (e) {
      return mcpError(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

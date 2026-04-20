const IDX_API_KEY = process.env.IDX_API_KEY;
const IDX_API_SECRET = process.env.IDX_API_SECRET ?? "";
const BASE = "https://api.simplyrets.com";
const AUTH = "Basic " + Buffer.from(`${IDX_API_KEY}:${IDX_API_SECRET}`).toString("base64");
async function idx(path, params) {
    const url = new URL(`${BASE}${path}`);
    if (params) {
        for (const [k, v] of Object.entries(params)) {
            if (v !== undefined)
                url.searchParams.set(k, String(v));
        }
    }
    const res = await fetch(url.toString(), {
        headers: { Authorization: AUTH, Accept: "application/json" },
    });
    if (!res.ok)
        throw new Error(`IDX ${res.status}: ${await res.text()}`);
    return res.json();
}
export const idxTools = [
    {
        name: "idx_search_listings",
        description: "Search MLS listings by location, price, beds and type",
        input_schema: {
            type: "object",
            properties: {
                city: { type: "string" },
                minPrice: { type: "number" },
                maxPrice: { type: "number" },
                minBeds: { type: "number" },
                propertyType: { type: "string" },
                limit: { type: "number" },
            },
        },
    },
    {
        name: "idx_get_listing",
        description: "Get full details for a specific listing by MLS ID",
        input_schema: {
            type: "object",
            properties: { mlsId: { type: "string" } },
            required: ["mlsId"],
        },
    },
    {
        name: "idx_get_comparables",
        description: "Find comparable sold listings near a property for CMA context",
        input_schema: {
            type: "object",
            properties: {
                city: { type: "string" },
                minPrice: { type: "number" },
                maxPrice: { type: "number" },
                minBeds: { type: "number" },
                soldWithinDays: { type: "number" },
                limit: { type: "number" },
            },
            required: ["city"],
        },
    },
    {
        name: "idx_get_new_listings",
        description: "Get listings added in the last N days — for lead reactivation triggers",
        input_schema: {
            type: "object",
            properties: {
                city: { type: "string" },
                minPrice: { type: "number" },
                maxPrice: { type: "number" },
                minBeds: { type: "number" },
                withinDays: { type: "number" },
                limit: { type: "number" },
            },
        },
    },
    {
        name: "idx_get_price_reductions",
        description: "Find listings with recent price reductions — for re-engaging dormant leads",
        input_schema: {
            type: "object",
            properties: {
                city: { type: "string" },
                minPrice: { type: "number" },
                maxPrice: { type: "number" },
                withinDays: { type: "number" },
                limit: { type: "number" },
            },
        },
    },
];
export async function handleIdxTool(name, input) {
    switch (name) {
        case "idx_search_listings":
            return idx("/properties", {
                cities: input.city,
                minprice: input.minPrice,
                maxprice: input.maxPrice,
                minbeds: input.minBeds,
                type: input.propertyType,
                limit: input.limit ?? 10,
            });
        case "idx_get_listing":
            return idx(`/properties/${input.mlsId}`);
        case "idx_get_comparables": {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (input.soldWithinDays ?? 90));
            return idx("/properties", {
                cities: input.city,
                minprice: input.minPrice,
                maxprice: input.maxPrice,
                minbeds: input.minBeds,
                limit: input.limit ?? 5,
                status: "closed",
                lastModifiedFrom: cutoff.toISOString().split("T")[0],
            });
        }
        case "idx_get_new_listings": {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (input.withinDays ?? 7));
            return idx("/properties", {
                cities: input.city,
                minprice: input.minPrice,
                maxprice: input.maxPrice,
                minbeds: input.minBeds,
                limit: input.limit ?? 10,
                lastModifiedFrom: cutoff.toISOString().split("T")[0],
            });
        }
        case "idx_get_price_reductions": {
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - (input.withinDays ?? 14));
            return idx("/properties", {
                cities: input.city,
                minprice: input.minPrice,
                maxprice: input.maxPrice,
                limit: input.limit ?? 10,
                priceReduced: "true",
                lastModifiedFrom: cutoff.toISOString().split("T")[0],
            });
        }
        default:
            throw new Error(`Unknown IDX tool: ${name}`);
    }
}

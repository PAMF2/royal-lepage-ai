#!/usr/bin/env node
/**
 * Lead Reactivation Engine
 * Runs on a schedule (daily). Finds dormant leads and re-engages them
 * with personalized messages using new listings, price drops, or market updates.
 *
 * Usage: npx tsx src/index.ts
 */

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const GHL_CAMPAIGN_REACTIVATION = process.env.GHL_CAMPAIGN_REACTIVATION!;
const IDX_API_KEY = process.env.IDX_API_KEY!;
const IDX_API_SECRET = process.env.IDX_API_SECRET ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;
const DORMANT_DAYS = parseInt(process.env.DORMANT_DAYS ?? "30", 10);
const MAX_PER_RUN = parseInt(process.env.MAX_PER_RUN ?? "200", 10);

if (!GHL_API_KEY || !GHL_LOCATION_ID || !ANTHROPIC_API_KEY) {
  console.error("Required: GHL_API_KEY, GHL_LOCATION_ID, ANTHROPIC_API_KEY");
  process.exit(1);
}

interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  customField?: { id: string; value: string }[];
  dateLastContacted?: string;
  dateAdded?: string;
}

async function ghl(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
) {
  const url = new URL(`https://services.leadconnectorhq.com${path}`);
  if (params)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method,
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);
  return res.json();
}

async function idx(path: string, params?: Record<string, string>) {
  const url = new URL(`https://api.simplyrets.com${path}`);
  if (params)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const auth =
    "Basic " +
    Buffer.from(`${IDX_API_KEY}:${IDX_API_SECRET}`).toString("base64");
  const res = await fetch(url.toString(), {
    headers: { Authorization: auth, Accept: "application/json" },
  });
  if (!res.ok) return [];
  return res.json();
}

async function generateReactivationMessage(
  contact: Contact,
  trigger: string,
  listingSnippet: string,
): Promise<string> {
  const name = contact.firstName ?? "there";
  const cityField = contact.customField?.find((f) => f.id === "city")?.value;
  const budgetField = contact.customField?.find(
    (f) => f.id === "budget",
  )?.value;

  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 200,
      messages: [
        {
          role: "user",
          content: `Write a short, warm re-engagement SMS (under 160 chars) from Homie at Royal LePage to ${name}.
Trigger: ${trigger}
${listingSnippet ? `Listing context: ${listingSnippet}` : ""}
${cityField ? `Their target area: ${cityField}` : ""}
${budgetField ? `Their budget: ${budgetField}` : ""}
Be conversational, not salesy. End with a soft call to action. No markdown, no quotes.`,
        },
      ],
    }),
  });
  const data = await res.json();
  return (
    data.content?.[0]?.text ??
    `Hi ${name}, checking in — there's some new activity in the market that might interest you. Still looking? 🏡`
  );
}

async function getDormantLeads(): Promise<Contact[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DORMANT_DAYS);

  const data = await ghl("GET", "/contacts/", undefined, {
    locationId: GHL_LOCATION_ID,
    limit: String(MAX_PER_RUN),
    sortBy: "dateLastContacted",
    sortOrder: "asc",
  });

  return (data.contacts ?? []).filter((c: Contact) => {
    if (c.tags?.includes("dnc") || c.tags?.includes("no-contact")) return false;
    if (c.tags?.includes("handed-off") || c.tags?.includes("closed"))
      return false;
    const lastContact = c.dateLastContacted ?? c.dateAdded;
    if (!lastContact) return true;
    return new Date(lastContact) < cutoff;
  });
}

async function getMatchingListings(contact: Contact) {
  const city = contact.customField?.find((f) => f.id === "city")?.value;
  const budget = contact.customField?.find((f) => f.id === "budget")?.value;

  const params: Record<string, string> = { limit: "3", sort: "listdate" };
  if (city) params.cities = city;
  if (budget) {
    const num = parseInt(budget.replace(/\D/g, ""), 10);
    if (!isNaN(num)) {
      params.minprice = String(Math.round(num * 0.85));
      params.maxprice = String(Math.round(num * 1.15));
    }
  }

  const [newListings, priceDrops] = await Promise.all([
    idx("/properties", {
      ...params,
      lastModifiedFrom: new Date(Date.now() - 7 * 86400000)
        .toISOString()
        .split("T")[0],
    }),
    idx("/properties", { ...params, priceReduced: "true" }),
  ]);

  if (newListings.length > 0) {
    const l = newListings[0];
    return {
      trigger: "new listing in their area",
      snippet: `New listing: ${l.address?.full} — $${l.listPrice?.toLocaleString()}, ${l.property?.bedrooms}bd/${l.property?.bathrooms}ba`,
    };
  }
  if (priceDrops.length > 0) {
    const l = priceDrops[0];
    return {
      trigger: "price reduction on a property matching their criteria",
      snippet: `Price drop: ${l.address?.full} now at $${l.listPrice?.toLocaleString()}`,
    };
  }

  return { trigger: "market update", snippet: "" };
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log(
    `\nReactivation engine starting (dormant threshold: ${DORMANT_DAYS} days)...\n`,
  );

  const dormant = await getDormantLeads();
  console.log(`Found ${dormant.length} dormant leads.\n`);

  let reactivated = 0;
  let failed = 0;

  for (const contact of dormant) {
    try {
      const { trigger, snippet } = await getMatchingListings(contact);
      const message = await generateReactivationMessage(
        contact,
        trigger,
        snippet,
      );

      if (contact.phone) {
        await ghl("POST", "/conversations/messages", {
          type: "SMS",
          contactId: contact.id,
          locationId: GHL_LOCATION_ID,
          message,
        });
      }

      await ghl("POST", `/contacts/${contact.id}/notes`, {
        body: `[Reactivation] Sent: "${message}" | Trigger: ${trigger}`,
      });

      if (GHL_CAMPAIGN_REACTIVATION) {
        await ghl(
          "POST",
          `/contacts/${contact.id}/campaigns/${GHL_CAMPAIGN_REACTIVATION}`,
        );
      }

      reactivated++;
      process.stdout.write(`\r  Reactivated: ${reactivated}/${dormant.length}`);
      await sleep(1200);
    } catch (e) {
      failed++;
      console.error(`\n  Error for contact ${contact.id}: ${e}`);
    }
  }

  console.log(`\n\nDone. Reactivated: ${reactivated} | Failed: ${failed}`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

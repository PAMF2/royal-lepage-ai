#!/usr/bin/env node
/**
 * Lead Reactivation Engine.
 *
 * Runs on a schedule (daily). Finds dormant leads in FUB and re-engages
 * them with a personalised SMS, audit-logged back to FUB as a note. Migrated
 * from GHL to FUB + Twilio in step K of the replace-ghl branch.
 *
 * Outbound senders are duplicated inline here rather than reaching into
 * orchestrator/tools/crm.ts — keeps modules independent and avoids a
 * workspace dep. The two helpers (fub() + twilioSendSms()) are tiny and
 * the FUB v1 contract is documented in MIGRATION-GHL-TO-FUB.md.
 *
 * TODO: verify FUB v1 endpoints once API key arrives:
 *   - GET  /people?sortBy=lastActivity&sortOrder=asc&limit=
 *   - POST /notes  { personId, body }
 *
 * Usage: FUB_API_KEY=... TWILIO_* set ... npx tsx src/index.ts
 */

const FUB_API_KEY = process.env.FUB_API_KEY ?? "";
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID ?? "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN ?? "";
const TWILIO_FROM = process.env.TWILIO_FROM ?? "";
const IDX_API_KEY = process.env.IDX_API_KEY ?? "";
const IDX_API_SECRET = process.env.IDX_API_SECRET ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const DORMANT_DAYS = parseInt(process.env.DORMANT_DAYS ?? "30", 10);
const MAX_PER_RUN = parseInt(process.env.MAX_PER_RUN ?? "200", 10);

const FUB_BASE = "https://api.followupboss.com/v1";

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

// ---------------------------------------------------------------------------
// FUB client (Basic auth)
// ---------------------------------------------------------------------------

function fubAuth(): string {
  return `Basic ${Buffer.from(`${FUB_API_KEY}:`).toString("base64")}`;
}

async function fub(
  method: string,
  path: string,
  body?: unknown,
  params?: Record<string, string>,
): Promise<unknown> {
  const url = new URL(`${FUB_BASE}${path}`);
  if (params)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    method,
    headers: { Authorization: fubAuth(), "Content-Type": "application/json" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`FUB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}

// ---------------------------------------------------------------------------
// Twilio SMS (inline, form-urlencoded)
// ---------------------------------------------------------------------------

async function twilioSendSms(to: string, body: string): Promise<void> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`;
  const basic = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const form = new URLSearchParams({ To: to, From: TWILIO_FROM, Body: body });
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form.toString(),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${await res.text()}`);
}

// ---------------------------------------------------------------------------
// IDX (unchanged)
// ---------------------------------------------------------------------------

async function idx(path: string, params?: Record<string, string>): Promise<unknown[]> {
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
  return (await res.json()) as unknown[];
}

// ---------------------------------------------------------------------------
// Message generation (Anthropic)
// ---------------------------------------------------------------------------

async function generateReactivationMessage(
  contact: Contact,
  trigger: string,
  listingSnippet: string,
): Promise<string> {
  const name = contact.firstName ?? "there";
  const cityField = contact.customField?.find((f) => f.id === "city" || f.id === "lpmama_city")?.value;
  const budgetField = contact.customField?.find((f) => f.id === "budget" || f.id === "lpmama_budget")?.value;

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
  const data = (await res.json()) as { content?: { text?: string }[] };
  return (
    data.content?.[0]?.text ??
    `Hi ${name}, checking in — there's some new activity in the market that might interest you. Still looking? 🏡`
  );
}

// ---------------------------------------------------------------------------
// Dormant lead lookup
// ---------------------------------------------------------------------------

interface FubPersonRaw {
  id: string | number;
  firstName?: string;
  lastName?: string;
  phones?: { value: string }[];
  tags?: string[];
  lpmama_city?: string;
  lpmama_budget?: string;
  lastActivity?: string;
  created?: string;
}

function rawToContact(p: FubPersonRaw): Contact {
  const customField = [
    p.lpmama_city ? { id: "lpmama_city", value: p.lpmama_city } : null,
    p.lpmama_budget ? { id: "lpmama_budget", value: p.lpmama_budget } : null,
  ].filter((x): x is { id: string; value: string } => x !== null);
  return {
    id: String(p.id),
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phones?.[0]?.value,
    tags: p.tags ?? [],
    dateLastContacted: p.lastActivity,
    dateAdded: p.created,
    customField,
  };
}

async function getDormantLeads(): Promise<Contact[]> {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - DORMANT_DAYS);

  const data = (await fub("GET", "/people", undefined, {
    limit: String(MAX_PER_RUN),
    sortBy: "lastActivity",
    sortOrder: "asc",
  })) as { people?: FubPersonRaw[] };

  return (data.people ?? []).map(rawToContact).filter((c) => {
    if (c.tags?.includes("dnc") || c.tags?.includes("no-contact")) return false;
    if (c.tags?.includes("handed-off") || c.tags?.includes("closed")) return false;
    const lastContact = c.dateLastContacted ?? c.dateAdded;
    if (!lastContact) return true;
    return new Date(lastContact) < cutoff;
  });
}

async function getMatchingListings(
  contact: Contact,
): Promise<{ trigger: string; snippet: string }> {
  const city = contact.customField?.find(
    (f) => f.id === "city" || f.id === "lpmama_city",
  )?.value;
  const budget = contact.customField?.find(
    (f) => f.id === "budget" || f.id === "lpmama_budget",
  )?.value;

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
      lastModifiedFrom: new Date(Date.now() - 7 * 86400000).toISOString().split("T")[0],
    }),
    idx("/properties", { ...params, priceReduced: "true" }),
  ]);

  if (newListings.length > 0) {
    const l = newListings[0] as {
      address?: { full?: string };
      listPrice?: number;
      property?: { bedrooms?: number; bathrooms?: number };
    };
    return {
      trigger: "new listing in their area",
      snippet: `New listing: ${l.address?.full} — $${l.listPrice?.toLocaleString()}, ${l.property?.bedrooms}bd/${l.property?.bathrooms}ba`,
    };
  }
  if (priceDrops.length > 0) {
    const l = priceDrops[0] as { address?: { full?: string }; listPrice?: number };
    return {
      trigger: "price reduction on a property matching their criteria",
      snippet: `Price drop: ${l.address?.full} now at $${l.listPrice?.toLocaleString()}`,
    };
  }

  return { trigger: "market update", snippet: "" };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

export async function run(): Promise<void> {
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
      const message = await generateReactivationMessage(contact, trigger, snippet);

      if (contact.phone) {
        await twilioSendSms(contact.phone, message);
      }

      // Audit-log the outbound to FUB so the conversation stays single-source.
      await fub("POST", "/notes", {
        personId: contact.id,
        body: `[Reactivation] Sent: "${message}" | Trigger: ${trigger}`,
      });

      // The GHL drip-campaign enroll is gone — campaign-drip is owned by queue/
      // workers now, enrolled via crm_enroll_campaign from the agent loop. If
      // a reactivation push should also enroll into a follow-up drip, that
      // belongs on the orchestrator side, not in this runner.

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

const isMain =
  process.argv[1] &&
  new URL(import.meta.url).pathname.endsWith(
    process.argv[1].replace(/\\/g, "/").split("/").pop()!,
  );

if (isMain) {
  if (!FUB_API_KEY || !ANTHROPIC_API_KEY) {
    console.error("Required: FUB_API_KEY, ANTHROPIC_API_KEY");
    process.exit(1);
  }
  run().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

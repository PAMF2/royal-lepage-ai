#!/usr/bin/env node
/**
 * Lead Scoring Runner — scores all contacts in GHL and tags them accordingly
 * Usage: npx tsx src/index.ts
 * Run on a schedule (daily cron) to keep scores fresh
 */

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const BASE = "https://services.leadconnectorhq.com";

if (!GHL_API_KEY || !GHL_LOCATION_ID) {
  console.error("Required: GHL_API_KEY, GHL_LOCATION_ID");
  process.exit(1);
}

interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  dateAdded?: string;
  customField?: { id: string; value: string }[];
}

function scoreContact(c: Contact): number {
  let score = 0;
  const tags = c.tags ?? [];
  const fields = c.customField ?? [];

  // Recency (30 pts)
  const days = Math.floor(
    (Date.now() - new Date(c.dateAdded ?? "").getTime()) / 86400000,
  );
  if (days <= 1) score += 30;
  else if (days <= 7) score += 20;
  else if (days <= 30) score += 10;
  else if (days <= 90) score += 5;

  // Contact completeness (20 pts)
  if (c.phone) score += 10;
  if (c.email) score += 5;
  if (c.firstName && c.lastName) score += 5;

  // Tags (up to 25 pts)
  const HOT = [
    "hot-lead",
    "pre-approved",
    "cash-buyer",
    "motivated",
    "appointment-set",
  ];
  const WARM = ["warm-lead", "buyer", "seller", "contacted"];
  const BAD = ["dnc", "no-answer-3x"];
  for (const t of tags) {
    if (HOT.includes(t)) score += 10;
    if (WARM.includes(t)) score += 5;
    if (BAD.includes(t)) score -= 15;
  }

  // LPMAMA completeness (25 pts — 5 per field)
  const LPMAMA = [
    "city",
    "budget",
    "timeline",
    "motivation",
    "mortgage_status",
  ];
  for (const field of LPMAMA) {
    if (fields.find((f) => f.id === field && f.value)) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

function scoreTier(score: number): { tag: string; remove: string[] } {
  if (score >= 70)
    return { tag: "score-hot", remove: ["score-warm", "score-cold"] };
  if (score >= 40)
    return { tag: "score-warm", remove: ["score-hot", "score-cold"] };
  return { tag: "score-cold", remove: ["score-hot", "score-warm"] };
}

async function ghl(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
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

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  let page = 1;
  let total = 0;
  let scored = 0;

  console.log("Starting lead scoring run...\n");

  while (true) {
    const data = await ghl(
      "GET",
      `/contacts/?locationId=${GHL_LOCATION_ID}&limit=100&page=${page}`,
    );
    const contacts: Contact[] = data.contacts ?? [];
    if (contacts.length === 0) break;
    total += contacts.length;

    await Promise.all(
      contacts.map(async (contact) => {
        const score = scoreContact(contact);
        const { tag, remove } = scoreTier(score);

        // Remove old score tags, add new one
        const currentTags = contact.tags ?? [];
        const tagsToAdd = currentTags.includes(tag) ? [] : [tag];
        const tagsToRemove = remove.filter((t) => currentTags.includes(t));

        const updates: Promise<unknown>[] = [];
        if (tagsToAdd.length)
          updates.push(
            ghl("POST", `/contacts/${contact.id}/tags`, { tags: tagsToAdd }),
          );
        if (tagsToRemove.length)
          updates.push(
            ghl("DELETE", `/contacts/${contact.id}/tags`, {
              tags: tagsToRemove,
            }),
          );

        // Store score in custom field
        updates.push(
          ghl("PUT", `/contacts/${contact.id}`, {
            customField: [{ id: "homie_score", value: String(score) }],
          }),
        );

        await Promise.all(updates);
        scored++;
      }),
    );

    process.stdout.write(`\r  Scored ${scored}/${total} contacts...`);
    page++;
    await sleep(1200); // respect GHL rate limits
  }

  console.log(`\n\nDone. Scored ${scored} contacts total.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

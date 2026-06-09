#!/usr/bin/env node
/**
 * Lead Scoring Runner — scores all FUB people and writes the score back to
 * the `homie_score` custom field. Tags are reconciled to a single tier tag.
 *
 * Migrated from GHL to FUB in step K of the replace-ghl branch.
 *
 * Usage: FUB_API_KEY=... npx tsx src/index.ts
 * Run on a schedule (daily cron) to keep scores fresh.
 *
 * FUB rate limit: 250 req/10s — we paginate at 100 per page and sleep 1.2s
 * between pages, same conservative cadence as the original GHL runner.
 *
 * TODO: verify FUB v1 endpoint shapes once API key arrives:
 *   - GET  /people?limit=&offset=&fields= for pagination
 *   - PUT  /people/{id} for tag reconciliation + custom field set
 *   - Custom field shape on PUT — assumed flat: { homie_score: 73 }
 *     (the previous GHL shape was nested customField[{id, value}])
 */

import { scoreContact, scoreTier } from "./scoring.js";
import type { Contact } from "./scoring.js";

const FUB_API_KEY = process.env.FUB_API_KEY ?? "";
const FUB_BASE = "https://api.followupboss.com/v1";

if (!FUB_API_KEY) {
  console.error("Required: FUB_API_KEY");
  process.exit(1);
}

function basicAuthHeader(): string {
  return `Basic ${Buffer.from(`${FUB_API_KEY}:`).toString("base64")}`;
}

async function fub(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${FUB_BASE}${path}`, {
    method,
    headers: {
      Authorization: basicAuthHeader(),
      "Content-Type": "application/json",
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`FUB ${res.status}: ${await res.text()}`);
  return res.status === 204 ? undefined : res.json();
}

interface FubPersonRaw {
  id: string | number;
  firstName?: string;
  lastName?: string;
  phones?: { value: string }[];
  emails?: { value: string }[];
  tags?: string[];
  created?: string;
  homie_score?: number | string;
  lpmama_city?: string;
  lpmama_budget?: string;
  lpmama_timeline?: string;
  lpmama_motivation?: string;
  lpmama_mortgage_status?: string;
}

interface FubPeoplePage {
  people?: FubPersonRaw[];
}

/** Convert a FUB person record into the Contact shape scoring.ts expects. */
function toContact(p: FubPersonRaw): Contact {
  const customField = [
    p.lpmama_city ? { id: "lpmama_city", value: p.lpmama_city } : null,
    p.lpmama_budget ? { id: "lpmama_budget", value: p.lpmama_budget } : null,
    p.lpmama_timeline ? { id: "lpmama_timeline", value: p.lpmama_timeline } : null,
    p.lpmama_motivation ? { id: "lpmama_motivation", value: p.lpmama_motivation } : null,
    p.lpmama_mortgage_status
      ? { id: "lpmama_mortgage_status", value: p.lpmama_mortgage_status }
      : null,
  ].filter((x): x is { id: string; value: string } => x !== null);

  return {
    id: String(p.id),
    firstName: p.firstName,
    lastName: p.lastName,
    phone: p.phones?.[0]?.value,
    email: p.emails?.[0]?.value,
    tags: p.tags ?? [],
    dateAdded: p.created,
    customField,
  };
}

async function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function run(): Promise<void> {
  let offset = 0;
  const limit = 100;
  let total = 0;
  let scored = 0;

  console.log("Starting lead scoring run...\n");

  // eslint-disable-next-line no-constant-condition
  while (true) {
    const page = (await fub(
      "GET",
      `/people?limit=${limit}&offset=${offset}`,
    )) as FubPeoplePage;
    const rawPeople = page.people ?? [];
    if (rawPeople.length === 0) break;
    total += rawPeople.length;

    await Promise.all(
      rawPeople.map(async (raw) => {
        const contact = toContact(raw);
        const score = scoreContact(contact);
        const { tag, remove } = scoreTier(score);

        // Reconcile tier tags: ensure `tag` is present, drop the others.
        const currentTags = contact.tags ?? [];
        const filtered = currentTags.filter((t) => !remove.includes(t));
        const nextTags = filtered.includes(tag) ? filtered : [...filtered, tag];

        // FUB PUT /people/{id} accepts a single body that updates both tags
        // and the homie_score custom field in one round-trip — saves one
        // request per contact vs three under GHL.
        await fub("PUT", `/people/${contact.id}`, {
          tags: nextTags,
          homie_score: score,
        });
        scored++;
      }),
    );

    process.stdout.write(`\r  Scored ${scored}/${total} contacts...`);
    offset += limit;
    await sleep(1200); // respect FUB rate limits (250/10s)
  }

  console.log(`\n\nDone. Scored ${scored} contacts total.`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

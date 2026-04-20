#!/usr/bin/env node
/**
 * Lead Scoring Runner — scores all contacts in GHL and tags them accordingly
 * Usage: npx tsx src/index.ts
 * Run on a schedule (daily cron) to keep scores fresh
 */

import { scoreContact, scoreTier } from "./scoring.js";
import type { Contact } from "./scoring.js";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const BASE = "https://services.leadconnectorhq.com";

if (!GHL_API_KEY || !GHL_LOCATION_ID) {
  console.error("Required: GHL_API_KEY, GHL_LOCATION_ID");
  process.exit(1);
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

#!/usr/bin/env node
/**
 * Data Migration — imports up to 100,000 leads from CSV into GoHighLevel
 * Usage: npx tsx src/index.ts --file leads.csv --dry-run
 */
import { createReadStream } from "fs";
import { createInterface } from "readline";
import { parseArgs } from "util";

const { values } = parseArgs({
  args: process.argv.slice(2),
  options: {
    file: { type: "string" },
    "dry-run": { type: "boolean", default: false },
    "batch-size": { type: "string", default: "10" },
    source: { type: "string", default: "CSV Import" },
  },
});

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const FILE = values.file;
const DRY_RUN = values["dry-run"];
const BATCH_SIZE = parseInt(values["batch-size"] as string, 10);
const SOURCE = values.source as string;

if (!GHL_API_KEY || !GHL_LOCATION_ID) {
  console.error("Required: GHL_API_KEY, GHL_LOCATION_ID");
  process.exit(1);
}

if (!FILE) {
  console.error("Required: --file leads.csv");
  console.error("\nExpected CSV columns (any order):");
  console.error(
    "  firstName, lastName, email, phone, source, city, budget, timeline, tags",
  );
  process.exit(1);
}

interface LeadRow {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  city?: string;
  budget?: string;
  timeline?: string;
  tags?: string;
}

async function createContact(
  row: LeadRow,
): Promise<{ success: boolean; id?: string; error?: string }> {
  const tags = row.tags
    ? row.tags
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  if (!tags.includes("csv-import")) tags.push("csv-import");

  const body = {
    locationId: GHL_LOCATION_ID,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    source: row.source || SOURCE,
    tags,
    customField: [
      row.city && { id: "city", value: row.city },
      row.budget && { id: "budget", value: row.budget },
      row.timeline && { id: "timeline", value: row.timeline },
    ].filter(Boolean),
  };

  const res = await fetch("https://services.leadconnectorhq.com/contacts/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    return { success: false, error: `GHL ${res.status}: ${text}` };
  }

  const data = await res.json();
  return { success: true, id: data.contact?.id };
}

async function parseCsv(filePath: string): Promise<LeadRow[]> {
  const rows: LeadRow[] = [];
  const rl = createInterface({
    input: createReadStream(filePath),
    crlfDelay: Infinity,
  });
  let headers: string[] = [];

  for await (const line of rl) {
    if (!line.trim()) continue;
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headers.length === 0) {
      headers = cols.map((h) => h.toLowerCase().replace(/\s+/g, ""));
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    rows.push(row as LeadRow);
  }

  return rows;
}

async function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function run() {
  console.log(`\nReading ${FILE}...`);
  const rows = await parseCsv(FILE!);
  console.log(`Found ${rows.length} leads.`);

  if (DRY_RUN) {
    console.log("\nDRY RUN — first 3 rows:");
    rows
      .slice(0, 3)
      .forEach((r, i) => console.log(`  ${i + 1}.`, JSON.stringify(r)));
    console.log(
      `\nWould import ${rows.length} contacts into GHL location ${GHL_LOCATION_ID}.`,
    );
    return;
  }

  let imported = 0;
  let failed = 0;
  let skipped = 0;

  for (let i = 0; i < rows.length; i += BATCH_SIZE) {
    const batch = rows.slice(i, i + BATCH_SIZE);

    await Promise.all(
      batch.map(async (row) => {
        if (!row.email && !row.phone) {
          skipped++;
          return;
        }
        const result = await createContact(row);
        if (result.success) {
          imported++;
        } else {
          failed++;
          if (failed <= 5) console.error(`  Error (row ${i}): ${result.error}`);
        }
      }),
    );

    // GHL rate limit: ~10 req/sec
    await sleep(1100);

    const pct = Math.round(((i + BATCH_SIZE) / rows.length) * 100);
    process.stdout.write(
      `\r  Progress: ${Math.min(i + BATCH_SIZE, rows.length)}/${rows.length} (${Math.min(pct, 100)}%) — imported: ${imported} failed: ${failed} skipped: ${skipped}`,
    );
  }

  console.log(`\n\nDone.`);
  console.log(`  Imported: ${imported}`);
  console.log(`  Failed:   ${failed}`);
  console.log(`  Skipped:  ${skipped} (no email or phone)`);
}

run().catch((e) => {
  console.error(e);
  process.exit(1);
});

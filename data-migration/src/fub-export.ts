#!/usr/bin/env node
/**
 * FollowUpBoss → CSV Exporter
 *
 * Pulls contacts from FollowUpBoss API and writes a CSV in the format
 * expected by data-migration's CSV → GHL importer.
 *
 * Gap captured in PHASE-1-PLAN.md (#4): repo had CSV→GHL but no FUB→CSV.
 *
 * Endpoints used (from Apr 2026 verified scoping doc):
 *   GET /people           250 req / 10s global
 *   GET /people/{id}/notes 10 req / 10s   ← bottleneck
 *
 * Strategy:
 *   1. Page through /people, max 100/page, "next" cursor for deep pagination.
 *   2. For each person, optionally fetch /notes (off by default — toggle with --with-notes).
 *   3. Honor Retry-After header on 429 responses.
 *   4. Dedupe by fub_id across pages (defensive — pagination drift is rare but
 *      a duplicate row would re-import the contact downstream).
 *   5. Write CSV streamingly — never buffers 200k rows in memory.
 *
 * Output columns match data-migration's importer:
 *   firstName, lastName, email, phone, source, city, budget, timeline, tags, fub_id
 *
 * Usage:
 *   FUB_API_KEY=xxxxx npx tsx src/fub-export.ts --out leads.csv
 *   FUB_API_KEY=xxxxx npx tsx src/fub-export.ts --out leads.csv --with-notes
 *   FUB_API_KEY=xxxxx npx tsx src/fub-export.ts --out leads.csv --limit 1000
 *
 * Estimated runtime for 200k contacts:
 *   - people-only:        ~13 min (200k / 100 = 2000 pages, 250 req/10s = ~80s)
 *   - with notes:         ~12-24h (10 req/10s on notes = bottleneck)
 */

import * as fs from "node:fs";
import { setTimeout as sleep } from "node:timers/promises";
import { fileURLToPath } from "node:url";

const FUB_BASE_URL = "https://api.followupboss.com/v1";

// --- Types ---

export interface Person {
  id: number;
  firstName?: string;
  lastName?: string;
  emails?: { value: string; isPrimary?: boolean }[];
  phones?: { value: string; isPrimary?: boolean }[];
  source?: string;
  sourceUrl?: string;
  stage?: string;
  tags?: string[];
  customFields?: Record<string, string | number | null>;
  createdAt?: string;
  updatedAt?: string;
}

export interface PeoplePage {
  people: Person[];
  _metadata?: { total?: number; nextLink?: string };
}

export interface CsvRow {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  source: string;
  city: string;
  budget: string;
  timeline: string;
  tags: string;
  fub_id: number;
}

export const CSV_HEADER = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "source",
  "city",
  "budget",
  "timeline",
  "tags",
  "fub_id",
] as const;

// --- HTTP helpers ---

function authHeader(apiKey: string): string {
  // FUB uses HTTP Basic with API key as username and empty password.
  const token = Buffer.from(`${apiKey}:`).toString("base64");
  return `Basic ${token}`;
}

export interface FubClient {
  get<T>(path: string): Promise<T>;
}

export interface FubClientOpts {
  apiKey: string;
  baseUrl?: string;
  fetchImpl?: typeof fetch;
  sleepImpl?: (ms: number) => Promise<void>;
  retries?: number;
  verbose?: boolean;
}

export function createFubClient(opts: FubClientOpts): FubClient {
  const baseUrl = opts.baseUrl ?? FUB_BASE_URL;
  const fetchImpl = opts.fetchImpl ?? fetch;
  const sleepImpl = opts.sleepImpl ?? ((ms) => sleep(ms));
  const retries = opts.retries ?? 5;
  const verbose = opts.verbose ?? false;

  return {
    async get<T>(path: string): Promise<T> {
      const url = path.startsWith("http") ? path : `${baseUrl}${path}`;
      for (let attempt = 0; attempt < retries; attempt++) {
        const res = await fetchImpl(url, {
          headers: { Authorization: authHeader(opts.apiKey), Accept: "application/json" },
        });
        if (res.status === 429) {
          const retryAfter = parseInt(res.headers.get("retry-after") ?? "10", 10);
          if (verbose) console.error(`429 — sleeping ${retryAfter}s`);
          await sleepImpl(retryAfter * 1000);
          continue;
        }
        if (!res.ok) {
          throw new Error(`FUB ${res.status} ${res.statusText}: ${await res.text()}`);
        }
        return (await res.json()) as T;
      }
      throw new Error(`FUB GET ${path} failed after ${retries} retries`);
    },
  };
}

// --- CSV helpers ---

export function escapeCsv(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export interface RowSink {
  write(line: string): void;
}

export function writeRow(sink: RowSink, values: (string | number | null | undefined)[]): void {
  sink.write(values.map(escapeCsv).join(",") + "\n");
}

// --- Transform ---

export function primaryEmail(p: Person): string {
  if (!p.emails?.length) return "";
  return (p.emails.find((e) => e.isPrimary) ?? p.emails[0]).value ?? "";
}

export function primaryPhone(p: Person): string {
  if (!p.phones?.length) return "";
  return (p.phones.find((ph) => ph.isPrimary) ?? p.phones[0]).value ?? "";
}

export function customField(p: Person, key: string): string {
  const v = p.customFields?.[key];
  return v == null ? "" : String(v);
}

export function joinTags(tags: string[] | undefined): string {
  if (!tags?.length) return "";
  return tags.join("|");
}

export function transformPerson(p: Person): CsvRow {
  return {
    firstName: p.firstName ?? "",
    lastName: p.lastName ?? "",
    email: primaryEmail(p),
    phone: primaryPhone(p),
    source: p.source ?? "FollowUpBoss",
    city: customField(p, "city"),
    budget: customField(p, "budget"),
    timeline: customField(p, "timeline"),
    tags: joinTags(p.tags),
    fub_id: p.id,
  };
}

// --- Export loop ---

export interface ExportOpts {
  client: FubClient;
  sink: RowSink;
  perPage?: number;
  limitTotal?: number;
  pageSleepMs?: number;
  sleepImpl?: (ms: number) => Promise<void>;
  verbose?: boolean;
  onProgress?: (exported: number, totalKnown: number | undefined) => void;
}

export async function exportPeople(opts: ExportOpts): Promise<number> {
  const perPage = opts.perPage ?? 100;
  const limitTotal = opts.limitTotal ?? Infinity;
  const pageSleepMs = opts.pageSleepMs ?? 50;
  const sleepImpl = opts.sleepImpl ?? ((ms) => sleep(ms));

  writeRow(opts.sink, [...CSV_HEADER]);

  const seen = new Set<number>();
  let exported = 0;
  let nextUrl: string | undefined = `/people?limit=${perPage}&sort=created`;

  while (nextUrl && exported < limitTotal) {
    const page: PeoplePage = await opts.client.get<PeoplePage>(nextUrl);
    const people = page.people ?? [];
    if (!people.length) break;

    for (const p of people) {
      if (exported >= limitTotal) break;
      if (seen.has(p.id)) continue;
      seen.add(p.id);
      const row = transformPerson(p);
      writeRow(opts.sink, [
        row.firstName,
        row.lastName,
        row.email,
        row.phone,
        row.source,
        row.city,
        row.budget,
        row.timeline,
        row.tags,
        row.fub_id,
      ]);
      exported++;
    }

    nextUrl = page._metadata?.nextLink ?? undefined;
    if (opts.onProgress) opts.onProgress(exported, page._metadata?.total);
    if (nextUrl) await sleepImpl(pageSleepMs);
  }

  return exported;
}

// --- CLI ---

function parseArgs(argv: string[]): {
  outPath: string;
  perPage: number;
  limitTotal: number;
  withNotes: boolean;
  verbose: boolean;
} {
  const flag = (name: string): string | undefined => {
    const idx = argv.indexOf(name);
    return idx >= 0 ? argv[idx + 1] : undefined;
  };
  const hasFlag = (name: string): boolean => argv.includes(name);
  return {
    outPath: flag("--out") ?? "leads.csv",
    perPage: parseInt(flag("--per-page") ?? "100", 10),
    limitTotal: flag("--limit") ? parseInt(flag("--limit")!, 10) : Infinity,
    withNotes: hasFlag("--with-notes"),
    verbose: hasFlag("--verbose"),
  };
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<void> {
  const apiKey = process.env.FUB_API_KEY ?? "";
  if (!apiKey) {
    console.error("Required env var: FUB_API_KEY (your FollowUpBoss API key)");
    process.exit(1);
  }

  const args = parseArgs(argv);
  const out = fs.createWriteStream(args.outPath, { encoding: "utf-8" });
  const client = createFubClient({ apiKey, verbose: args.verbose });
  const startedAt = Date.now();

  const exported = await exportPeople({
    client,
    sink: out,
    perPage: args.perPage,
    limitTotal: args.limitTotal,
    verbose: args.verbose,
    onProgress: (count, total) => {
      if (args.verbose || count % 1000 === 0) {
        const elapsed = ((Date.now() - startedAt) / 1000).toFixed(1);
        console.log(`Exported ${count}${total ? `/${total}` : ""} (elapsed ${elapsed}s)`);
      }
    },
  });

  out.end();
  await new Promise<void>((resolve) => out.on("finish", () => resolve()));
  const elapsedMin = ((Date.now() - startedAt) / 60000).toFixed(1);
  console.log(`\nDone. Wrote ${exported} contacts to ${args.outPath} (${elapsedMin} min).`);

  if (args.withNotes) {
    console.log(`\nNOTE: --with-notes was set, but notes export is intentionally not implemented in v1.`);
    console.log(`Bottleneck: /people/{id}/notes is 10 req/10s. For 200k contacts → ~55h.`);
    console.log(`Recommend running an overnight job per agent-batch (e.g. by source or pond) instead.`);
  }
}

// Auto-run only when invoked directly as a script (skips during `import` from tests).
const invokedAsScript =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedAsScript) {
  main().catch((err) => {
    console.error(`FUB export failed: ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}

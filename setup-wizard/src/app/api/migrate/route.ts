import { type NextRequest } from "next/server";
import { ghlFetch, csvToContacts } from "@/lib/ghl";
import type { Creds } from "@/lib/ghl";

// In-memory progress store (single-server; fine for wizard use)
export const progress: {
  total: number;
  done: number;
  errors: number;
  running: boolean;
  log: string[];
} = { total: 0, done: 0, errors: 0, running: false, log: [] };

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

export async function POST(req: NextRequest) {
  if (progress.running) {
    return Response.json(
      { error: "Migration already running" },
      { status: 409 },
    );
  }

  const body = (await req.json()) as { creds: Creds; csv: string };
  const contacts = csvToContacts(body.csv);

  if (contacts.length === 0) {
    return Response.json(
      { error: "No contacts found in CSV" },
      { status: 400 },
    );
  }

  // Reset progress
  progress.total = contacts.length;
  progress.done = 0;
  progress.errors = 0;
  progress.running = true;
  progress.log = [`Starting import of ${contacts.length} contacts…`];

  // Run in background
  (async () => {
    const BATCH = 10;
    for (let i = 0; i < contacts.length; i += BATCH) {
      const batch = contacts.slice(i, i + BATCH);
      await Promise.all(
        batch.map(async (row) => {
          try {
            const phone = row.phone ?? row.Phone ?? row.mobile ?? "";
            const email = row.email ?? row.Email ?? "";
            if (!phone && !email) {
              progress.errors++;
              return;
            }

            await ghlFetch(body.creds, "POST", "/contacts/", {
              locationId: body.creds.ghlLocationId,
              firstName:
                row.firstName ?? row.first_name ?? row["First Name"] ?? "",
              lastName: row.lastName ?? row.last_name ?? row["Last Name"] ?? "",
              email: email || undefined,
              phone: phone || undefined,
              source: row.source ?? row.Source ?? "CSV Import",
              tags: row.tags
                ? row.tags.split("|").map((t: string) => t.trim())
                : ["csv-import"],
              customFields: [
                row.city
                  ? { key: "contact.city", field_value: row.city }
                  : null,
              ].filter(Boolean),
            });
            progress.done++;
          } catch {
            progress.errors++;
          }
        }),
      );
      progress.log.push(
        `Imported ${Math.min(i + BATCH, contacts.length)} / ${contacts.length}`,
      );
      await sleep(1100); // GHL rate limit
    }
    progress.running = false;
    progress.log.push(
      `Done. ${progress.done} imported, ${progress.errors} skipped.`,
    );
  })();

  return Response.json({ started: true, total: contacts.length });
}

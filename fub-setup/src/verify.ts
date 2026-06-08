#!/usr/bin/env node
/**
 * fub-setup verify — fail loudly if any required custom field is missing.
 * Exits 0 on full match, non-zero with the list of missing names on mismatch.
 */
import { REQUIRED_FIELDS, listExistingCustomFields } from "./custom-fields.js";

async function main(): Promise<void> {
  const apiKey = process.env.FUB_API_KEY;
  if (!apiKey) {
    console.error("FUB_API_KEY is not set");
    process.exit(1);
  }
  const existing = await listExistingCustomFields(apiKey);
  const missing = REQUIRED_FIELDS.map((f) => f.name).filter(
    (n) => !existing.has(n.toLowerCase()),
  );
  if (missing.length > 0) {
    console.error("Missing custom fields:", missing.join(", "));
    console.error("Run `npm run setup` to seed them.");
    process.exit(2);
  }
  console.log("✓ All required custom fields present in FUB.");
}

await main();

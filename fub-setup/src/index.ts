#!/usr/bin/env node
/**
 * fub-setup — one-time entrypoint to seed FUB with the custom fields the
 * orchestrator and lead-scoring modules read from. Idempotent.
 *
 * Usage: FUB_API_KEY=... npm run setup
 */
import { setupCustomFields } from "./custom-fields.js";

const apiKey = process.env.FUB_API_KEY;
if (!apiKey) {
  console.error("FUB_API_KEY is not set");
  process.exit(1);
}

console.log("Royal LePage FUB Setup\n");

try {
  const { created, skipped } = await setupCustomFields({
    apiKey,
    log: (m) => console.log(m),
  });
  console.log(
    `\n✓ Setup complete. created=${created.length} skipped=${skipped.length}`,
  );
  console.log("  Next: run `npm run verify` to confirm.");
} catch (e) {
  console.error("Setup failed:", e instanceof Error ? e.message : e);
  process.exit(1);
}

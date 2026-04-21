#!/usr/bin/env node
/**
 * Reactivation Scheduler
 * Runs the reactivation job on a configurable interval.
 *
 * Interval config:
 *   - Production: REACTIVATION_INTERVAL_HOURS env var (default 24)
 *   - Development (NODE_ENV=development): fixed 2 minutes
 *
 * Usage: node dist/scheduler.js
 */

import { run } from "./index.js";

const IS_DEV = process.env.NODE_ENV === "development";
const INTERVAL_HOURS = parseFloat(
  process.env.REACTIVATION_INTERVAL_HOURS ?? "24",
);
const INTERVAL_MS = IS_DEV ? 2 * 60 * 1000 : INTERVAL_HOURS * 60 * 60 * 1000;

function log(message: string): void {
  const ts = new Date().toISOString();
  console.log(`[${ts}] ${message}`);
}

async function tick(): Promise<void> {
  log("Reactivation job starting.");
  try {
    await run();
    log("Reactivation job completed successfully.");
  } catch (err) {
    log(
      `Reactivation job failed: ${err instanceof Error ? err.message : String(err)}`,
    );
  }
}

const intervalLabel = IS_DEV
  ? "2 minutes (dev mode)"
  : `${INTERVAL_HOURS} hour(s)`;

log(`Scheduler initializing. Interval: ${intervalLabel}.`);

// Run immediately on startup, then on the configured interval.
tick().then(() => {
  setInterval(tick, INTERVAL_MS);
});

#!/usr/bin/env node
/**
 * GHL Setup Script — runs once to configure GoHighLevel for Royal LePage
 * Usage: npx tsx src/index.ts
 */
import { setupPipeline } from "./pipeline.js";
import { setupWebhooks } from "./webhooks.js";
import { setupCampaigns } from "./campaigns.js";
import { setupCustomFields } from "./custom-fields.js";
import { setupCustomValues } from "./custom-values.js";

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL;

if (!GHL_API_KEY || !GHL_LOCATION_ID || !ORCHESTRATOR_URL) {
  console.error("Required: GHL_API_KEY, GHL_LOCATION_ID, ORCHESTRATOR_URL");
  process.exit(1);
}

console.log("Royal LePage GHL Setup\n");

try {
  await setupCustomFields();
  await setupCustomValues();
  await setupPipeline();
  await setupWebhooks();
  await setupCampaigns();
  console.log("\n✓ Setup complete. Royal LePage GHL is ready.");
  console.log("  Next: run 'make verify' to confirm all connections.");
} catch (e) {
  console.error("Setup failed:", e);
  process.exit(1);
}

#!/usr/bin/env node
/**
 * Pre-flight verification — checks all API connections before going live.
 * Usage: npx tsx src/verify.ts
 */

type Result = { name: string; ok: boolean; detail: string };
const results: Result[] = [];

function pass(name: string, detail: string) {
  results.push({ name, ok: true, detail });
}
function fail(name: string, detail: string) {
  results.push({ name, ok: false, detail });
}

// ── GHL connection ────────────────────────────────────────────
async function checkGHL() {
  const key = process.env.GHL_API_KEY;
  const loc = process.env.GHL_LOCATION_ID;
  if (!key || !loc) {
    fail("GHL", "GHL_API_KEY or GHL_LOCATION_ID missing");
    return;
  }

  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${loc}`,
      { headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28" } },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    pass("GHL", `Connected — location: ${data.location?.name ?? loc}`);
  } catch (e) {
    fail("GHL", String(e));
  }
}

// ── Anthropic connection ─────────────────────────────────────
async function checkAnthropic() {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) {
    fail("Anthropic", "ANTHROPIC_API_KEY missing");
    return;
  }

  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: { "x-api-key": key, "anthropic-version": "2023-06-01" },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pass("Anthropic", "API key valid");
  } catch (e) {
    fail("Anthropic", String(e));
  }
}

// ── IDX / MLS connection ─────────────────────────────────────
async function checkIDX() {
  const provider = process.env.IDX_PROVIDER ?? "crea_ddf";
  const key = process.env.IDX_API_KEY;
  const secret = process.env.IDX_API_SECRET;
  if (!key || !secret) {
    fail("IDX", "IDX_API_KEY or IDX_API_SECRET missing");
    return;
  }

  try {
    if (provider === "simplyrets") {
      const auth = Buffer.from(`${key}:${secret}`).toString("base64");
      const res = await fetch("https://api.simplyrets.com/properties?limit=1", {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      pass("IDX (SimplyRETS)", "Connected");
    } else {
      // CREA DDF — just validate credentials are present (no public test endpoint)
      pass(
        "IDX (CREA DDF)",
        `Credentials present — live test requires signed IDX agreement`,
      );
    }
  } catch (e) {
    fail("IDX", String(e));
  }
}

// ── Redis connection ─────────────────────────────────────────
async function checkRedis() {
  const url = process.env.REDIS_URL;
  if (!url) {
    fail("Redis", "REDIS_URL missing — required for queue + monitoring");
    return;
  }

  try {
    const { Redis } = await import("ioredis");
    const redis = new Redis(url, { connectTimeout: 5000, lazyConnect: true });
    await redis.connect();
    await redis.ping();
    await redis.quit();
    pass("Redis", `Connected — ${url.replace(/:[^:@]+@/, ":***@")}`);
  } catch (e) {
    fail("Redis", String(e));
  }
}

// ── ElevenLabs connection (optional) ────────────────────────
async function checkElevenLabs() {
  const key = process.env.ELEVENLABS_API_KEY;
  if (!key) {
    pass("ElevenLabs", "Not configured (optional — voice AI)");
    return;
  }

  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": key },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pass("ElevenLabs", "API key valid");
  } catch (e) {
    fail("ElevenLabs", String(e));
  }
}

// ── GHL custom fields check ───────────────────────────────────
async function checkCustomFields() {
  const key = process.env.GHL_API_KEY;
  const loc = process.env.GHL_LOCATION_ID;
  if (!key || !loc) return;

  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${loc}/customFields`,
      { headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28" } },
    );
    const data = await res.json();
    const keys = new Set<string>(
      (data.customFields ?? []).map((f: { fieldKey: string }) => f.fieldKey),
    );
    const required = ["contact.homie_score", "contact.lpmama_location"];
    const missing = required.filter((k) => !keys.has(k));
    if (missing.length > 0) {
      fail(
        "GHL Custom Fields",
        `Missing: ${missing.join(", ")} — run: make setup`,
      );
    } else {
      pass("GHL Custom Fields", "homie_score + LPMAMA fields present");
    }
  } catch (e) {
    fail("GHL Custom Fields", String(e));
  }
}

// ── GHL webhooks check ────────────────────────────────────────
async function checkWebhooks() {
  const key = process.env.GHL_API_KEY;
  const loc = process.env.GHL_LOCATION_ID;
  const orchUrl = process.env.ORCHESTRATOR_URL;
  if (!key || !loc) return;

  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${loc}/webhooks`,
      { headers: { Authorization: `Bearer ${key}`, Version: "2021-07-28" } },
    );
    const data = await res.json();
    const hooks = data.webhooks ?? [];
    const hasLead = hooks.some((h: { url: string }) =>
      h.url?.includes("/webhook/lead"),
    );
    const hasMsg = hooks.some((h: { url: string }) =>
      h.url?.includes("/webhook/message"),
    );

    if (hasLead && hasMsg) {
      pass(
        "GHL Webhooks",
        "ContactCreate + InboundMessage webhooks registered",
      );
    } else if (!hasLead && !hasMsg) {
      fail(
        "GHL Webhooks",
        `Not registered — run: make setup (ORCHESTRATOR_URL=${orchUrl ?? "not set"})`,
      );
    } else {
      fail(
        "GHL Webhooks",
        `Partial — lead:${hasLead} msg:${hasMsg} — run: make setup`,
      );
    }
  } catch (e) {
    fail("GHL Webhooks", String(e));
  }
}

// ── Run all checks ────────────────────────────────────────────
await Promise.all([
  checkGHL(),
  checkAnthropic(),
  checkIDX(),
  checkRedis(),
  checkElevenLabs(),
  checkCustomFields(),
  checkWebhooks(),
]);

console.log("\n╔══════════════════════════════════════════════════╗");
console.log("║  Royal LePage AI Platform — Pre-flight Check     ║");
console.log("╠══════════════════════════════════════════════════╣");
for (const r of results) {
  const icon = r.ok ? "✓" : "✗";
  const color = r.ok ? "\x1b[32m" : "\x1b[31m";
  console.log(
    `║ ${color}${icon}\x1b[0m  ${r.name.padEnd(20)} ${r.detail.slice(0, 26).padEnd(26)} ║`,
  );
}
console.log("╚══════════════════════════════════════════════════╝");

const failures = results.filter((r) => !r.ok);
if (failures.length > 0) {
  console.log(`\n${failures.length} check(s) failed. Fix before deploying.\n`);
  process.exit(1);
} else {
  console.log("\nAll checks passed. System is ready to deploy.\n");
}

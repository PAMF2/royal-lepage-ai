/**
 * Sets GHL Custom Values that campaign templates reference.
 * These are account-level variables (e.g. {{company_name}}, {{agent_name}}).
 */
const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const BASE = "https://services.leadconnectorhq.com";

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

const DEFAULT_VALUES = [
  { name: "Company Name", key: "company_name", value: "Royal LePage" },
  { name: "Agent Name", key: "agent_name", value: "Sarah" },
  { name: "Brokerage Phone", key: "brokerage_phone", value: "" },
  { name: "Brokerage Email", key: "brokerage_email", value: "" },
  { name: "IDX Website URL", key: "idx_website_url", value: "" },
  { name: "AI Agent Name", key: "ai_agent_name", value: "Homie" },
  { name: "Booking Link", key: "booking_link", value: "" },
];

export async function setupCustomValues() {
  console.log("Setting up custom values...");

  // List existing
  const existing = await ghl(
    "GET",
    `/locations/${GHL_LOCATION_ID}/customValues`,
  );
  const existingKeys = new Set<string>(
    (existing.customValues ?? []).map((v: { fieldKey: string }) => v.fieldKey),
  );

  for (const cv of DEFAULT_VALUES) {
    const key = `custom_values.${cv.key}`;
    if (existingKeys.has(key)) {
      console.log(`  ✓ Already exists: ${cv.name}`);
      continue;
    }

    await ghl("POST", `/locations/${GHL_LOCATION_ID}/customValues`, {
      name: cv.name,
      fieldKey: cv.key,
      value: cv.value,
    });
    console.log(
      `  + Created: {{${cv.key}}} = "${cv.value || "(fill in GHL)"}" `,
    );
  }

  console.log(
    "\nCustom values ready. Update values in GHL → Settings → Custom Values.\n",
  );
}

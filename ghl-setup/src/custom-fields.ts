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

const REQUIRED_FIELDS = [
  { name: "Homie Score", fieldKey: "homie_score", dataType: "NUMERICAL" },
  { name: "LPMAMA - Location", fieldKey: "lpmama_location", dataType: "TEXT" },
  { name: "LPMAMA - Price", fieldKey: "lpmama_price", dataType: "TEXT" },
  {
    name: "LPMAMA - Motivation",
    fieldKey: "lpmama_motivation",
    dataType: "TEXT",
  },
  { name: "LPMAMA - Agent", fieldKey: "lpmama_agent", dataType: "TEXT" },
  { name: "LPMAMA - Mortgage", fieldKey: "lpmama_mortgage", dataType: "TEXT" },
  {
    name: "LPMAMA - Appointment",
    fieldKey: "lpmama_appointment",
    dataType: "TEXT",
  },
  {
    name: "IDX - Saved Listings",
    fieldKey: "idx_saved_listings",
    dataType: "TEXT",
  },
  { name: "IDX - Last Viewed", fieldKey: "idx_last_viewed", dataType: "TEXT" },
  { name: "Lead Source URL", fieldKey: "lead_source_url", dataType: "TEXT" },
  {
    name: "Reactivation Trigger",
    fieldKey: "reactivation_trigger",
    dataType: "TEXT",
  },
  { name: "Last AI Contact", fieldKey: "last_ai_contact", dataType: "TEXT" },
];

export async function setupCustomFields(): Promise<Record<string, string>> {
  console.log("Setting up custom fields...");

  // Get existing fields to avoid duplicates
  const existing = await ghl(
    "GET",
    `/locations/${GHL_LOCATION_ID}/customFields`,
  );
  const existingKeys = new Set<string>(
    (existing.customFields ?? []).map((f: { fieldKey: string }) => f.fieldKey),
  );
  const fieldIdMap: Record<string, string> = {};

  // Map existing field IDs
  for (const f of existing.customFields ?? []) {
    fieldIdMap[f.fieldKey] = f.id;
  }

  for (const field of REQUIRED_FIELDS) {
    if (existingKeys.has(`contact.${field.fieldKey}`)) {
      console.log(`  ✓ Already exists: ${field.name}`);
      continue;
    }

    const result = await ghl(
      "POST",
      `/locations/${GHL_LOCATION_ID}/customFields`,
      {
        name: field.name,
        dataType: field.dataType,
        fieldKey: field.fieldKey,
        model: "contact",
      },
    );

    const id = result.customField?.id ?? result.id ?? "?";
    fieldIdMap[field.fieldKey] = id;
    console.log(`  + Created: ${field.name} (id: ${id})`);
  }

  console.log("\nCustom fields ready.\n");
  return fieldIdMap;
}

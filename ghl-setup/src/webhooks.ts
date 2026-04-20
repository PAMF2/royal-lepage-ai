const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const ORCHESTRATOR_URL = process.env.ORCHESTRATOR_URL!;
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

const HOOKS = [
  {
    name: "Homie - New Lead",
    url: `${ORCHESTRATOR_URL}/webhook/lead`,
    events: ["ContactCreate"],
  },
  {
    name: "Homie - Incoming Message",
    url: `${ORCHESTRATOR_URL}/webhook/message`,
    events: ["InboundMessage"],
  },
];

export async function setupWebhooks() {
  console.log("Registering GHL webhooks...");

  // Fetch existing to avoid duplicates
  const existing = await ghl("GET", `/locations/${GHL_LOCATION_ID}/webhooks`);
  const existingUrls = new Set<string>(
    (existing.webhooks ?? []).map((w: { url: string }) => w.url),
  );

  for (const hook of HOOKS) {
    const targetUrl = `${ORCHESTRATOR_URL}${hook.url.replace(ORCHESTRATOR_URL, "")}`;

    if (existingUrls.has(targetUrl)) {
      console.log(`  ✓ Already exists: ${hook.name}`);
      continue;
    }

    const result = await ghl("POST", `/locations/${GHL_LOCATION_ID}/webhooks`, {
      name: hook.name,
      url: targetUrl,
      events: hook.events,
    });
    console.log(
      `  + Registered: ${hook.name} → ${targetUrl} (id: ${result.webhook?.id ?? "?"})`,
    );
  }

  console.log();
}

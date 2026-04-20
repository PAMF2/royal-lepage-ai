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

export async function setupWebhooks() {
  console.log("Registering GHL webhooks...");

  const hooks = [
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

  for (const hook of hooks) {
    const result = await ghl("POST", `/locations/${GHL_LOCATION_ID}/webhooks`, {
      name: hook.name,
      url: hook.url,
      events: hook.events,
    });
    console.log(
      `Webhook registered: ${hook.name} → ${hook.url} (id: ${result.webhook?.id})`,
    );
  }

  console.log();
}

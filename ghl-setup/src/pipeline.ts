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

export async function setupPipeline() {
  console.log("Creating Homie lead pipeline...");

  const pipeline = await ghl("POST", "/opportunities/pipelines", {
    locationId: GHL_LOCATION_ID,
    name: "Homie Lead Pipeline",
    stages: [
      { name: "New Lead", position: 0 },
      { name: "Attempted Contact", position: 1 },
      { name: "Contacted", position: 2 },
      { name: "Qualified", position: 3 },
      { name: "Appointment Set", position: 4 },
      { name: "Handed Off", position: 5 },
      { name: "Nurture", position: 6 },
      { name: "Closed Won", position: 7 },
      { name: "Closed Lost", position: 8 },
    ],
  });

  console.log(`Pipeline created: ${pipeline.pipeline?.id}`);
  console.log("Stage IDs:");
  pipeline.pipeline?.stages?.forEach((s: { name: string; id: string }) => {
    console.log(`  ${s.name}: ${s.id}`);
  });
  console.log("Copy these IDs into your .env as GHL_STAGE_* variables.\n");

  return pipeline;
}

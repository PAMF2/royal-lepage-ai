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

export async function setupCampaigns() {
  console.log("Creating GHL campaigns...");

  const campaigns = [
    {
      name: "Homie - 7-Day Drip (No Response)",
      description:
        "For leads that don't respond to initial SMS. Day 1 SMS, Day 3 Email, Day 7 SMS.",
    },
    {
      name: "Homie - Reactivation (Dormant 30d+)",
      description:
        "Re-engages leads silent for 30+ days. Triggered by price drops or new listings.",
    },
    {
      name: "Homie - Appointment Reminder",
      description:
        "24hr and 1hr reminders before a booked showing or consultation.",
    },
    {
      name: "Homie - Post-Showing Follow-Up",
      description:
        "Follows up 24hrs after a showing. Collects feedback and gauges interest.",
    },
    {
      name: "Homie - Monthly Nurture",
      description:
        "Monthly market update for long-term nurture leads. Keeps Royal LePage top of mind.",
    },
  ];

  for (const c of campaigns) {
    const result = await ghl(
      "POST",
      `/locations/${GHL_LOCATION_ID}/campaigns`,
      {
        name: c.name,
        description: c.description,
      },
    );
    console.log(`Campaign created: ${c.name} (id: ${result.campaign?.id})`);
  }

  console.log(
    "\nCampaign IDs will need to be added as GHL_CAMPAIGN_* env vars.",
  );
  console.log("Then add SMS/email steps manually in GHL Campaign Builder.\n");
}

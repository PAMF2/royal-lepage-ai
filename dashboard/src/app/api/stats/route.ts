import { NextResponse } from "next/server";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;
const BASE = "https://services.leadconnectorhq.com";

async function ghl(path: string, params?: Record<string, string>) {
  const url = new URL(`${BASE}${path}`);
  if (params)
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${GHL_API_KEY}`, Version: "2021-07-28" },
    next: { revalidate: 60 },
  });
  if (!res.ok) throw new Error(`GHL ${res.status}`);
  return res.json();
}

export async function GET() {
  try {
    const [pipelines, contacts] = await Promise.all([
      ghl("/opportunities/pipelines", { locationId: GHL_LOCATION_ID }),
      ghl("/contacts/search", { locationId: GHL_LOCATION_ID, limit: "1" }),
    ]);

    const pipeline = pipelines.pipelines?.find((p: { name: string }) =>
      p.name.includes("Homie"),
    );

    const stageCounts: Record<string, number> = {};
    if (pipeline?.stages) {
      for (const stage of pipeline.stages) {
        const opps = await ghl("/opportunities/search", {
          location_id: GHL_LOCATION_ID,
          pipeline_id: pipeline.id,
          pipeline_stage_id: stage.id,
          limit: "1",
        });
        stageCounts[stage.name] = opps.meta?.total ?? 0;
      }
    }

    const totalLeads = contacts.meta?.total ?? 0;
    const qualified = stageCounts["Qualified"] ?? 0;
    const appointmentSet = stageCounts["Appointment Set"] ?? 0;
    const handedOff = stageCounts["Handed Off"] ?? 0;

    return NextResponse.json({
      totalLeads,
      stageCounts,
      conversionRate:
        totalLeads > 0 ? ((appointmentSet / totalLeads) * 100).toFixed(1) : "0",
      qualificationRate:
        totalLeads > 0 ? ((qualified / totalLeads) * 100).toFixed(1) : "0",
      appointmentsSet: appointmentSet,
      handedOff,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

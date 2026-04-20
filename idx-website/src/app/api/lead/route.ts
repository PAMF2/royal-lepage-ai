import { NextRequest, NextResponse } from "next/server";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { name, phone, email, city, budget, timeline } = body;

  const [firstName, ...rest] = (name ?? "").split(" ");
  const lastName = rest.join(" ");

  const res = await fetch("https://services.leadconnectorhq.com/contacts/", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: JSON.stringify({
      locationId: GHL_LOCATION_ID,
      firstName,
      lastName,
      phone,
      email,
      source: "IDX Website",
      tags: ["idx", "new-lead"],
      customField: [
        { id: "city", value: city },
        { id: "budget", value: budget },
        { id: "timeline", value: timeline },
      ],
    }),
  });

  if (!res.ok) {
    return NextResponse.json(
      { error: "Failed to create contact" },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}

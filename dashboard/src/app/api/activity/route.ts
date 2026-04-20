import { NextResponse } from "next/server";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

export async function GET() {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/conversations/search?locationId=${GHL_LOCATION_ID}&limit=20&sortBy=lastMessageDate&sortOrder=desc`,
      {
        headers: {
          Authorization: `Bearer ${GHL_API_KEY}`,
          Version: "2021-07-28",
        },
        next: { revalidate: 30 },
      },
    );
    if (!res.ok) throw new Error(`GHL ${res.status}`);
    const data = await res.json();

    const activities = (data.conversations ?? []).map(
      (c: Record<string, unknown>) => ({
        id: c.id,
        contactName: `${c.contactName ?? "Unknown"}`,
        action: c.lastMessageBody ?? "Message received",
        stage: c.type ?? "SMS",
        timestamp: c.dateUpdated ?? c.dateAdded,
      }),
    );

    return NextResponse.json({ activities });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

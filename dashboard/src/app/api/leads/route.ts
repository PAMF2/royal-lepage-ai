import { NextResponse } from "next/server";
import { scoreContact } from "@/lib/scoring";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

export async function GET() {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/contacts/?locationId=${GHL_LOCATION_ID}&limit=50&sortBy=dateAdded&sortOrder=desc`,
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
    const leads = (data.contacts ?? []).map((c: Record<string, unknown>) => ({
      ...c,
      score: scoreContact(c),
    }));
    return NextResponse.json({ leads });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}

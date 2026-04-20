import { type NextRequest } from "next/server";
import type { Creds } from "@/lib/ghl";

interface CheckResult {
  name: string;
  ok: boolean;
  detail: string;
}

async function checkGHL(creds: Creds): Promise<CheckResult> {
  try {
    const res = await fetch(
      `https://services.leadconnectorhq.com/locations/${creds.ghlLocationId}`,
      {
        headers: {
          Authorization: `Bearer ${creds.ghlApiKey}`,
          Version: "2021-07-28",
        },
      },
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return {
      name: "GoHighLevel",
      ok: true,
      detail: `Location: ${data.location?.name ?? creds.ghlLocationId}`,
    };
  } catch (e) {
    return { name: "GoHighLevel", ok: false, detail: String(e) };
  }
}

async function checkAnthropic(creds: Creds): Promise<CheckResult> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/models", {
      headers: {
        "x-api-key": creds.anthropicApiKey,
        "anthropic-version": "2023-06-01",
      },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { name: "Anthropic", ok: true, detail: "API key valid" };
  } catch (e) {
    return { name: "Anthropic", ok: false, detail: String(e) };
  }
}

async function checkIDX(creds: Creds): Promise<CheckResult> {
  if (!creds.idxApiKey || !creds.idxApiSecret) {
    return {
      name: "IDX / MLS",
      ok: false,
      detail: "API key or secret missing",
    };
  }
  try {
    if (creds.idxProvider === "simplyrets") {
      const auth = Buffer.from(
        `${creds.idxApiKey}:${creds.idxApiSecret}`,
      ).toString("base64");
      const res = await fetch("https://api.simplyrets.com/properties?limit=1", {
        headers: { Authorization: `Basic ${auth}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return { name: "IDX / MLS", ok: true, detail: "SimplyRETS connected" };
    }
    return {
      name: "IDX / MLS",
      ok: true,
      detail:
        "CREA DDF credentials present (live test requires signed agreement)",
    };
  } catch (e) {
    return { name: "IDX / MLS", ok: false, detail: String(e) };
  }
}

async function checkElevenLabs(creds: Creds): Promise<CheckResult> {
  if (!creds.elevenLabsApiKey) {
    return {
      name: "ElevenLabs",
      ok: true,
      detail: "Not configured (optional)",
    };
  }
  try {
    const res = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": creds.elevenLabsApiKey },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return { name: "ElevenLabs", ok: true, detail: "API key valid" };
  } catch (e) {
    return { name: "ElevenLabs", ok: false, detail: String(e) };
  }
}

export async function POST(req: NextRequest) {
  const creds = (await req.json()) as Creds;

  const results = await Promise.all([
    checkGHL(creds),
    checkAnthropic(creds),
    checkIDX(creds),
    checkElevenLabs(creds),
  ]);

  const allOk =
    results.filter((r) => !r.ok && r.name !== "ElevenLabs").length === 0;
  return Response.json({ ok: allOk, results });
}

import { type NextRequest } from "next/server";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join } from "path";

const CONFIG_PATH = join(process.cwd(), "config.json");

interface Config {
  creds: Record<string, string>;
  ghlConfigured: boolean;
  configuredAt?: string;
}

export async function GET() {
  if (!existsSync(CONFIG_PATH)) {
    return Response.json({ exists: false });
  }
  try {
    const raw = readFileSync(CONFIG_PATH, "utf8");
    const cfg = JSON.parse(raw) as Config;
    return Response.json({ exists: true, ...cfg });
  } catch {
    return Response.json({ exists: false });
  }
}

export async function POST(req: NextRequest) {
  const body = (await req.json()) as Partial<Config>;
  let existing: Config = { creds: {}, ghlConfigured: false };

  if (existsSync(CONFIG_PATH)) {
    try {
      existing = JSON.parse(readFileSync(CONFIG_PATH, "utf8")) as Config;
    } catch {}
  }

  const updated: Config = {
    creds: body.creds ?? existing.creds,
    ghlConfigured: body.ghlConfigured ?? existing.ghlConfigured,
    configuredAt: new Date().toISOString(),
  };

  writeFileSync(CONFIG_PATH, JSON.stringify(updated, null, 2));
  return Response.json({ saved: true });
}

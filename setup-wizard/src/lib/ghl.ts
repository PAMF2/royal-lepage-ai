export interface Creds {
  ghlApiKey: string;
  ghlLocationId: string;
  anthropicApiKey: string;
  idxProvider: string;
  idxApiKey: string;
  idxApiSecret: string;
  orchestratorUrl: string;
  webhookSecret: string;
  elevenLabsApiKey?: string;
}

export async function ghlFetch(
  creds: Creds,
  method: string,
  path: string,
  body?: unknown,
) {
  const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${creds.ghlApiKey}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);
  return res.json();
}

export function csvToContacts(csv: string): Record<string, string>[] {
  const lines = csv.trim().split("\n");
  if (lines.length < 2) return [];
  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().replace(/^"|"$/g, ""));
  return lines.slice(1).map((line) => {
    const values = line.split(",").map((v) => v.trim().replace(/^"|"$/g, ""));
    const obj: Record<string, string> = {};
    headers.forEach((h, i) => {
      obj[h] = values[i] ?? "";
    });
    return obj;
  });
}

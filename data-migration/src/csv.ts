export interface LeadRow {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  city?: string;
  budget?: string;
  timeline?: string;
  tags?: string;
}

const HEADER_REMAP: Record<string, keyof LeadRow> = {
  firstname: "firstName",
  lastname: "lastName",
  email: "email",
  phone: "phone",
  source: "source",
  city: "city",
  budget: "budget",
  timeline: "timeline",
  tags: "tags",
};

export function parseLines(lines: string[]): LeadRow[] {
  const rows: LeadRow[] = [];
  let headers: string[] = [];

  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
    if (headers.length === 0) {
      headers = cols.map((h) => {
        const lower = h.toLowerCase().replace(/\s+/g, "");
        return HEADER_REMAP[lower] ?? lower;
      });
      continue;
    }
    const row: Record<string, string> = {};
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? "";
    });
    rows.push(row as LeadRow);
  }

  return rows;
}

export function chunkArray<T>(arr: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

export function isSkippable(row: LeadRow): boolean {
  return !row.email && !row.phone;
}

export function normalizeTags(row: LeadRow, defaultSource: string): string[] {
  const tags = row.tags
    ? row.tags
        .split("|")
        .map((t) => t.trim())
        .filter(Boolean)
    : [];
  if (!tags.includes("csv-import")) tags.push("csv-import");
  return tags;
}

export function buildContactBody(
  row: LeadRow,
  locationId: string,
  defaultSource: string,
): Record<string, unknown> {
  const tags = normalizeTags(row, defaultSource);
  return {
    locationId,
    firstName: row.firstName,
    lastName: row.lastName,
    email: row.email,
    phone: row.phone,
    source: row.source || defaultSource,
    tags,
    customField: [
      row.city && { id: "city", value: row.city },
      row.budget && { id: "budget", value: row.budget },
      row.timeline && { id: "timeline", value: row.timeline },
    ].filter(Boolean),
  };
}

export function deduplicateByEmail(rows: LeadRow[]): LeadRow[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (!row.email) return true;
    const key = row.email.toLowerCase().trim();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

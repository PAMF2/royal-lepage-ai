export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  tags?: string[];
  dateAdded?: string;
  customField?: { id: string; value: string }[];
}

export function scoreContact(c: Contact): number {
  let score = 0;
  const tags = c.tags ?? [];
  const fields = c.customField ?? [];

  // Recency (30 pts)
  const days = Math.floor(
    (Date.now() - new Date(c.dateAdded ?? "").getTime()) / 86400000,
  );
  if (days <= 1) score += 30;
  else if (days <= 7) score += 20;
  else if (days <= 30) score += 10;
  else if (days <= 90) score += 5;

  // Contact completeness (20 pts)
  if (c.phone) score += 10;
  if (c.email) score += 5;
  if (c.firstName && c.lastName) score += 5;

  // Tags (up to 25 pts)
  const HOT = [
    "hot-lead",
    "pre-approved",
    "cash-buyer",
    "motivated",
    "appointment-set",
  ];
  const WARM = ["warm-lead", "buyer", "seller", "contacted"];
  const BAD = ["dnc", "no-answer-3x"];
  for (const t of tags) {
    if (HOT.includes(t)) score += 10;
    if (WARM.includes(t)) score += 5;
    if (BAD.includes(t)) score -= 15;
  }

  // LPMAMA completeness (25 pts — 5 per field)
  const LPMAMA = [
    "city",
    "budget",
    "timeline",
    "motivation",
    "mortgage_status",
  ];
  for (const field of LPMAMA) {
    if (fields.find((f) => f.id === field && f.value)) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

export function scoreTier(score: number): { tag: string; remove: string[] } {
  if (score >= 70)
    return { tag: "score-hot", remove: ["score-warm", "score-cold"] };
  if (score >= 40)
    return { tag: "score-warm", remove: ["score-hot", "score-cold"] };
  return { tag: "score-cold", remove: ["score-hot", "score-warm"] };
}

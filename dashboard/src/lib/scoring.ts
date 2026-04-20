/**
 * Lead scoring model — scores 0–100 based on LPMAMA signals, recency, and tags
 */

const HOT_TAGS = [
  "hot-lead",
  "pre-approved",
  "cash-buyer",
  "motivated",
  "appointment-set",
];
const WARM_TAGS = ["warm-lead", "buyer", "seller", "contacted"];
const NEGATIVE_TAGS = ["dnc", "cold-lead", "no-answer-3x"];

export function scoreContact(contact: Record<string, unknown>): number {
  let score = 0;
  const tags: string[] = (contact.tags as string[]) ?? [];
  const customFields =
    (contact.customField as { id: string; value: string }[]) ?? [];

  // Recency (up to 30 pts)
  const added = new Date(contact.dateAdded as string);
  const daysSince = Math.floor((Date.now() - added.getTime()) / 86400000);
  if (daysSince <= 1) score += 30;
  else if (daysSince <= 7) score += 20;
  else if (daysSince <= 30) score += 10;
  else if (daysSince <= 90) score += 5;

  // Contact completeness (up to 20 pts)
  if (contact.phone) score += 10;
  if (contact.email) score += 5;
  if (contact.firstName && contact.lastName) score += 5;

  // Hot/warm tags (up to 25 pts)
  for (const tag of tags) {
    if (HOT_TAGS.includes(tag)) score += 10;
    if (WARM_TAGS.includes(tag)) score += 5;
    if (NEGATIVE_TAGS.includes(tag)) score -= 15;
  }

  // LPMAMA custom fields (up to 25 pts — 5 per field answered)
  const lpmFields = [
    "city",
    "budget",
    "timeline",
    "motivation",
    "mortgage_status",
  ];
  for (const field of lpmFields) {
    const found = customFields.find((f) => f.id === field && f.value);
    if (found) score += 5;
  }

  return Math.max(0, Math.min(100, score));
}

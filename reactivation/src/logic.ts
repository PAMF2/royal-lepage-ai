export interface Contact {
  id: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  tags?: string[];
  customField?: { id: string; value: string }[];
  dateLastContacted?: string;
  dateAdded?: string;
}

export interface ListingRaw {
  address?: { full?: string };
  listPrice?: number;
  property?: { bedrooms?: number; bathrooms?: number };
}

export interface MatchResult {
  trigger: string;
  snippet: string;
}

export function isDormant(
  contact: Contact,
  dormantDays: number,
  now: Date,
): boolean {
  if (contact.tags?.includes("dnc") || contact.tags?.includes("no-contact"))
    return false;
  if (contact.tags?.includes("handed-off") || contact.tags?.includes("closed"))
    return false;
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - dormantDays);
  const lastContact = contact.dateLastContacted ?? contact.dateAdded;
  if (!lastContact) return true;
  return new Date(lastContact) < cutoff;
}

export function buildListingParams(
  contact: Contact,
  baseParams: Record<string, string>,
): Record<string, string> {
  const params: Record<string, string> = { ...baseParams };
  const city = contact.customField?.find((f) => f.id === "city")?.value;
  const budget = contact.customField?.find((f) => f.id === "budget")?.value;
  if (city) params.cities = city;
  if (budget) {
    const num = parseInt(budget.replace(/\D/g, ""), 10);
    if (!isNaN(num)) {
      params.minprice = String(Math.round(num * 0.85));
      params.maxprice = String(Math.round(num * 1.15));
    }
  }
  return params;
}

export function pickMatchResult(
  newListings: ListingRaw[],
  priceDrops: ListingRaw[],
): MatchResult {
  if (newListings.length > 0) {
    const l = newListings[0];
    return {
      trigger: "new listing in their area",
      snippet: `New listing: ${l.address?.full} — $${l.listPrice?.toLocaleString()}, ${l.property?.bedrooms}bd/${l.property?.bathrooms}ba`,
    };
  }
  if (priceDrops.length > 0) {
    const l = priceDrops[0];
    return {
      trigger: "price reduction on a property matching their criteria",
      snippet: `Price drop: ${l.address?.full} now at $${l.listPrice?.toLocaleString()}`,
    };
  }
  return { trigger: "market update", snippet: "" };
}

export function buildReactivationPrompt(
  contact: Contact,
  trigger: string,
  listingSnippet: string,
): string {
  const name = contact.firstName ?? "there";
  const cityField = contact.customField?.find((f) => f.id === "city")?.value;
  const budgetField = contact.customField?.find(
    (f) => f.id === "budget",
  )?.value;

  return (
    `Write a short, warm re-engagement SMS (under 160 chars) from Homie at Royal LePage to ${name}.\n` +
    `Trigger: ${trigger}\n` +
    (listingSnippet ? `Listing context: ${listingSnippet}\n` : "") +
    (cityField ? `Their target area: ${cityField}\n` : "") +
    (budgetField ? `Their budget: ${budgetField}\n` : "") +
    `Be conversational, not salesy. End with a soft call to action. No markdown, no quotes.`
  );
}

export function extractMessageText(
  data: { content?: { text?: string }[] },
  contact: Contact,
): string {
  const name = contact.firstName ?? "there";
  return (
    data.content?.[0]?.text ??
    `Hi ${name}, checking in — there's some new activity in the market that might interest you. Still looking? 🏡`
  );
}

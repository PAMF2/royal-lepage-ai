/**
 * fub-setup/custom-fields.ts — idempotent seeder for the six custom fields
 * the orchestrator + lead-scoring modules read from FUB person records.
 *
 * Per MIGRATION-GHL-TO-FUB.md:
 *   homie_score             (number, 0-100)
 *   lpmama_city             (text)
 *   lpmama_budget           (text)
 *   lpmama_timeline         (text)
 *   lpmama_motivation       (text)
 *   lpmama_mortgage_status  (text)
 *
 * Idempotent: list existing fields first; only create the ones missing.
 *
 * TODO: verify against FUB v1 docs once API key arrives.
 *   - Endpoint:     GET/POST /customFields
 *   - Auth:         HTTP Basic with API key as username, empty password
 *   - Create body:  { name, type: "text"|"number", category: "person" }
 *   - List shape:   { customFields: [{ name, type, ... }] }
 * If FUB v1 differs on any of these, the change is a one-line edit per call.
 */

export interface RequiredField {
  name: string;
  type: "text" | "number";
}

export const REQUIRED_FIELDS: ReadonlyArray<RequiredField> = [
  { name: "homie_score", type: "number" },
  { name: "lpmama_city", type: "text" },
  { name: "lpmama_budget", type: "text" },
  { name: "lpmama_timeline", type: "text" },
  { name: "lpmama_motivation", type: "text" },
  { name: "lpmama_mortgage_status", type: "text" },
];

const FUB_BASE = "https://api.followupboss.com/v1";

function basicAuthHeader(apiKey: string): string {
  return `Basic ${Buffer.from(`${apiKey}:`).toString("base64")}`;
}

interface FubCustomField {
  name: string;
  type?: string;
}

interface FubCustomFieldsResponse {
  customFields?: FubCustomField[];
}

/**
 * List the existing custom fields. Returned set is lowercased + trimmed for
 * comparison against the canonical names in REQUIRED_FIELDS.
 */
export async function listExistingCustomFields(
  apiKey: string,
  fetchImpl: typeof fetch = fetch,
): Promise<Set<string>> {
  const res = await fetchImpl(`${FUB_BASE}/customFields`, {
    method: "GET",
    headers: { Authorization: basicAuthHeader(apiKey) },
  });
  if (!res.ok) {
    throw new Error(`FUB GET /customFields failed: ${res.status} ${await res.text()}`);
  }
  const body = (await res.json()) as FubCustomFieldsResponse;
  const names = (body.customFields ?? []).map((f) => f.name.trim().toLowerCase());
  return new Set(names);
}

/**
 * Create a single custom field. Returns the FUB-assigned id (or null when
 * the response shape is unknown — verification still passes by name match).
 */
export async function createCustomField(
  apiKey: string,
  field: RequiredField,
  fetchImpl: typeof fetch = fetch,
): Promise<{ created: true; id: string | null } | { created: false; reason: string }> {
  const res = await fetchImpl(`${FUB_BASE}/customFields`, {
    method: "POST",
    headers: {
      Authorization: basicAuthHeader(apiKey),
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: field.name,
      type: field.type,
      // TODO: verify "category" key name + value against FUB v1 docs.
      category: "person",
    }),
  });
  if (!res.ok) {
    return { created: false, reason: `HTTP ${res.status}: ${await res.text()}` };
  }
  const body = (await res.json()) as { id?: string | number; customField?: { id?: string | number } };
  const rawId = body.id ?? body.customField?.id ?? null;
  return { created: true, id: rawId != null ? String(rawId) : null };
}

/**
 * Idempotent setup entrypoint. Lists existing fields; creates only the
 * ones missing. Returns a summary of {created, skipped}.
 */
export async function setupCustomFields(opts: {
  apiKey: string;
  fetchImpl?: typeof fetch;
  log?: (msg: string) => void;
}): Promise<{ created: string[]; skipped: string[] }> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const log = opts.log ?? (() => undefined);
  const existing = await listExistingCustomFields(opts.apiKey, fetchImpl);

  const created: string[] = [];
  const skipped: string[] = [];
  for (const field of REQUIRED_FIELDS) {
    if (existing.has(field.name.toLowerCase())) {
      skipped.push(field.name);
      log(`  ✓ Already exists: ${field.name}`);
      continue;
    }
    const result = await createCustomField(opts.apiKey, field, fetchImpl);
    if (!result.created) {
      throw new Error(`Failed to create ${field.name}: ${result.reason}`);
    }
    created.push(field.name);
    log(`  + Created: ${field.name} (id: ${result.id ?? "?"})`);
  }
  return { created, skipped };
}

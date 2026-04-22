/**
 * Pure formatting helpers for vendor-mcp.
 * No I/O, no API calls — safe to import in tests.
 */

// ── MCP response helpers ───────────────────────────────────────────────────

export function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function err(e: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
      },
    ],
    isError: true as const,
  };
}

// ── Status mapper ──────────────────────────────────────────────────────────

export const VENDOR_TAGS: Record<string, string> = {
  staging: "vendor-staging",
  cleaning: "vendor-cleaning",
  repairs: "vendor-repairs",
  photography: "vendor-photography",
  landscaping: "vendor-landscaping",
};

export type ServiceType =
  | "staging"
  | "cleaning"
  | "repairs"
  | "photography"
  | "landscaping";

/**
 * Returns the GHL tag string for a given service type.
 * Falls back to "vendor-pending" when serviceType is omitted (list-all case).
 */
export function resolveVendorTag(serviceType?: ServiceType): string {
  return serviceType ? VENDOR_TAGS[serviceType] : "vendor-pending";
}

// ── Job log formatters ─────────────────────────────────────────────────────

export interface VendorRequestParams {
  serviceType: ServiceType;
  propertyAddress: string;
  requestedDate: string;
  notes?: string;
  estimatedBudgetCAD?: number;
}

/**
 * Builds the note body for a new vendor service request.
 */
export function buildVendorRequestNote(params: VendorRequestParams): string {
  const {
    serviceType,
    propertyAddress,
    requestedDate,
    notes,
    estimatedBudgetCAD,
  } = params;
  return [
    `Vendor Request — ${serviceType.toUpperCase()}`,
    `Property: ${propertyAddress}`,
    `Requested Date: ${requestedDate}`,
    estimatedBudgetCAD ? `Budget: $${estimatedBudgetCAD} CAD` : null,
    notes ? `Notes: ${notes}` : null,
    `Status: PENDING`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface VendorConfirmParams {
  serviceType: ServiceType;
  propertyAddress: string;
  vendorName: string;
  confirmedDate: string;
  confirmedTime: string;
  costCAD?: number;
}

/**
 * Builds the note body when a vendor booking is confirmed.
 */
export function buildVendorConfirmNote(params: VendorConfirmParams): string {
  const {
    serviceType,
    propertyAddress,
    vendorName,
    confirmedDate,
    confirmedTime,
    costCAD,
  } = params;
  return [
    `Vendor Confirmed — ${serviceType.toUpperCase()}`,
    `Property: ${propertyAddress}`,
    `Vendor: ${vendorName}`,
    `Date/Time: ${confirmedDate} at ${confirmedTime}`,
    costCAD ? `Cost: $${costCAD} CAD` : null,
    `Status: CONFIRMED`,
  ]
    .filter(Boolean)
    .join("\n");
}

export interface VendorCompleteParams {
  serviceType: ServiceType;
  finalCostCAD?: number;
  feedback?: string;
}

/**
 * Builds the note body when a vendor job is marked complete.
 */
export function buildVendorCompleteNote(params: VendorCompleteParams): string {
  const { serviceType, finalCostCAD, feedback } = params;
  return [
    `Vendor Complete — ${serviceType.toUpperCase()}`,
    finalCostCAD ? `Final Cost: $${finalCostCAD} CAD` : null,
    feedback ? `Feedback: ${feedback}` : null,
    `Status: COMPLETE`,
  ]
    .filter(Boolean)
    .join("\n");
}

// ── Vendor note builder ────────────────────────────────────────────────────

export interface RawNote {
  body: string;
}

/**
 * Filters a raw notes array to only vendor-related entries
 * (those whose body starts with "Vendor").
 */
export function filterVendorNotes(notes: RawNote[]): RawNote[] {
  return notes.filter((n) => n.body?.startsWith("Vendor"));
}

// Pure utility functions extracted from mcp-server index.ts
// These are side-effect-free and fully testable without any HTTP calls or MCP transport.

// ── MCP response builders ─────────────────────────────────────────────────────

export function mcpSuccess(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

export function mcpError(error: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true as const,
  };
}

// ── Custom field helpers ──────────────────────────────────────────────────────

/**
 * Convert a plain key→value record into the GHL custom field array format.
 * Returns undefined when the input is undefined so callers can spread cleanly.
 */
export function formatCustomFields(
  customFields: Record<string, string> | undefined,
): { id: string; value: string }[] | undefined {
  if (!customFields) return undefined;
  return Object.entries(customFields).map(([id, value]) => ({ id, value }));
}

// ── Contact payload builders ──────────────────────────────────────────────────

export interface CreateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  source?: string;
  tags?: string[];
  customFields?: Record<string, string>;
  notes?: string;
  locationId: string;
}

export function buildCreateContactBody(input: CreateContactInput) {
  return {
    locationId: input.locationId,
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    source: input.source,
    tags: input.tags,
    customField: formatCustomFields(input.customFields),
    notes: input.notes,
  };
}

export interface UpdateContactInput {
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
  customFields?: Record<string, string>;
}

export function buildUpdateContactBody(input: UpdateContactInput) {
  return {
    firstName: input.firstName,
    lastName: input.lastName,
    email: input.email,
    phone: input.phone,
    tags: input.tags,
    customField: formatCustomFields(input.customFields),
  };
}

export interface SearchContactsInput {
  query: string;
  limit: number;
  locationId: string;
}

export function buildSearchContactsBody(input: SearchContactsInput) {
  return {
    locationId: input.locationId,
    searchTerm: input.query,
    limit: input.limit,
  };
}

// ── Contact formatter ─────────────────────────────────────────────────────────

export interface ContactSummary {
  id: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  tags?: string[];
}

/**
 * Return a human-readable display name for a contact.
 * Falls back gracefully when name fields are absent.
 */
export function formatContactName(contact: ContactSummary): string {
  const parts = [contact.firstName, contact.lastName].filter(Boolean);
  if (parts.length > 0) return parts.join(" ");
  return contact.email ?? contact.phone ?? contact.id;
}

// ── GHL payload builders ──────────────────────────────────────────────────────

export type OpportunityStatus = "open" | "won" | "lost" | "abandoned";

export interface CreateOpportunityInput {
  contactId: string;
  pipelineId: string;
  stageId: string;
  name: string;
  monetaryValue?: number;
  status: OpportunityStatus;
  locationId: string;
}

export function buildCreateOpportunityBody(input: CreateOpportunityInput) {
  return {
    locationId: input.locationId,
    contactId: input.contactId,
    pipelineId: input.pipelineId,
    pipelineStageId: input.stageId,
    name: input.name,
    monetaryValue: input.monetaryValue,
    status: input.status,
  };
}

export interface UpdateOpportunityStageInput {
  stageId: string;
  status?: OpportunityStatus;
}

export function buildUpdateOpportunityStageBody(
  input: UpdateOpportunityStageInput,
) {
  return {
    pipelineStageId: input.stageId,
    status: input.status,
  };
}

export interface BookAppointmentInput {
  contactId: string;
  calendarId: string;
  startTime: string;
  endTime: string;
  title?: string;
  notes?: string;
  locationId: string;
}

export function buildBookAppointmentBody(input: BookAppointmentInput) {
  return {
    locationId: input.locationId,
    contactId: input.contactId,
    calendarId: input.calendarId,
    startTime: input.startTime,
    endTime: input.endTime,
    title: input.title ?? "Consultation",
    notes: input.notes,
  };
}

// ── Message payload builders ──────────────────────────────────────────────────

export interface SmsMessageInput {
  contactId: string;
  message: string;
  locationId: string;
}

export function buildSmsMessageBody(input: SmsMessageInput) {
  return {
    type: "SMS" as const,
    contactId: input.contactId,
    locationId: input.locationId,
    message: input.message,
  };
}

export interface EmailMessageInput {
  contactId: string;
  subject: string;
  body: string;
  fromName?: string;
  locationId: string;
}

export function buildEmailMessageBody(input: EmailMessageInput) {
  return {
    type: "Email" as const,
    contactId: input.contactId,
    locationId: input.locationId,
    subject: input.subject,
    html: input.body,
    fromName: input.fromName,
  };
}

// ── Response parsers ──────────────────────────────────────────────────────────

export interface GhlContactResponse {
  contact?: {
    id?: string;
    phone?: string;
    email?: string;
    firstName?: string;
    lastName?: string;
    tags?: string[];
  };
}

/**
 * Extract the phone number from a GHL contact response.
 * Throws with a descriptive message when the number is absent.
 */
export function parseContactPhone(response: GhlContactResponse): string {
  const phone = response.contact?.phone;
  if (!phone) throw new Error("Contact has no phone number on file");
  return phone;
}

/**
 * Parse the list of contacts returned by the GHL search endpoint.
 * Returns an empty array when the response has an unexpected shape.
 */
export function parseContactSearchResults(response: unknown): ContactSummary[] {
  if (
    typeof response !== "object" ||
    response === null ||
    !("contacts" in response)
  ) {
    return [];
  }
  const raw = (response as { contacts: unknown }).contacts;
  if (!Array.isArray(raw)) return [];
  return raw as ContactSummary[];
}

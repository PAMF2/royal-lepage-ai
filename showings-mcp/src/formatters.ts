/**
 * Pure formatting helpers for showings-mcp.
 * No I/O, no API calls — safe to import in tests.
 */

// ── MCP response helpers ───────────────────────────────────────────────────

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

// ── Time slot formatter ────────────────────────────────────────────────────

/**
 * Converts a date string (ISO) and a human-readable time string (e.g. "2:00 PM")
 * into a pair of ISO strings: [startISO, endISO] where endISO is 1 hour later.
 *
 * Throws if the input cannot be parsed into a valid date.
 */
export function buildShowingTimeSlot(
  dateStr: string,
  timeStr: string,
): { startISO: string; endISO: string } {
  const parsed = new Date(`1970-01-01 ${timeStr}`);
  if (isNaN(parsed.getTime())) {
    throw new Error(`Cannot parse time: "${timeStr}"`);
  }
  const hhmm = parsed.toTimeString().slice(0, 5);
  const startISO = new Date(`${dateStr}T${hhmm}`).toISOString();
  const endISO = new Date(
    new Date(startISO).getTime() + 60 * 60 * 1000,
  ).toISOString();
  return { startISO, endISO };
}

// ── Showing request builder ────────────────────────────────────────────────

export interface ShowingRequestParams {
  mlsId: string;
  propertyAddress: string;
  requestedDate: string;
  requestedTime: string;
  notes?: string;
}

/**
 * Builds the GHL appointment payload for a showing request.
 */
export function buildGhlAppointmentPayload(
  locationId: string,
  contactId: string,
  calendarId: string,
  params: ShowingRequestParams,
): Record<string, unknown> {
  const { startISO, endISO } = buildShowingTimeSlot(
    params.requestedDate,
    params.requestedTime,
  );
  return {
    locationId,
    contactId,
    calendarId,
    startTime: startISO,
    endTime: endISO,
    title: `Showing — ${params.propertyAddress}`,
    notes: `MLS#: ${params.mlsId}${params.notes ? `\n${params.notes}` : ""}`,
  };
}

// ── Confirmation message generators ───────────────────────────────────────

/**
 * Builds the GHL note body logged after a showing is booked.
 */
export function buildShowingNoteBody(
  propertyAddress: string,
  requestedDate: string,
  requestedTime: string,
  via: "showingtime" | "ghl_calendar",
  confirmationNumber?: string,
): string {
  if (via === "showingtime") {
    return `Showing requested via ShowingTime: ${propertyAddress} on ${requestedDate} at ${requestedTime}. Confirmation: ${confirmationNumber ?? "pending"}`;
  }
  return `Showing booked: ${propertyAddress} on ${requestedDate} at ${requestedTime} (GHL calendar)`;
}

/**
 * Builds the SMS body sent to a buyer when a showing is cancelled.
 */
export function buildCancellationSms(reason?: string): string {
  return `Hi! Just letting you know your showing has been cancelled${reason ? ` (${reason})` : ""}. Reply to reschedule anytime.`;
}

/**
 * Builds the SMS body sent to a buyer when a showing is rescheduled.
 */
export function buildRescheduleSms(
  propertyAddress: string,
  newDate: string,
  newTime: string,
): string {
  return `Hi! Your showing for ${propertyAddress} has been rescheduled to ${newDate} at ${newTime}. See you then!`;
}

/**
 * Builds the GHL availability fallback payload when ShowingTime is not configured.
 */
export function buildAvailabilityFallback(
  mlsId: string,
  date: string,
): Record<string, string> {
  return {
    note: "ShowingTime not configured. Showing availability managed through GHL calendar.",
    mlsId,
    date,
    suggestion: "Contact the listing agent directly or book via GHL calendar.",
  };
}

import { describe, it, expect } from "vitest";
import {
  mcpSuccess,
  mcpError,
  buildShowingTimeSlot,
  buildGhlAppointmentPayload,
  buildShowingNoteBody,
  buildCancellationSms,
  buildRescheduleSms,
  buildAvailabilityFallback,
  type ShowingRequestParams,
} from "./formatters.js";

// ── mcpSuccess ─────────────────────────────────────────────────────────────

describe("mcpSuccess", () => {
  it("should always serialise data as pretty-printed JSON", () => {
    // Arrange
    const data = { id: "appt-1", confirmed: true };
    // Act
    const result = mcpSuccess(data);
    // Assert
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
  });

  it("should handle a primitive number", () => {
    const result = mcpSuccess(42);
    expect(result.content[0].text).toBe("42");
  });

  it("should handle null without throwing", () => {
    const result = mcpSuccess(null);
    expect(result.content[0].text).toBe("null");
  });
});

// ── mcpError ──────────────────────────────────────────────────────────────

describe("mcpError", () => {
  it("should extract message from an Error instance", () => {
    // Arrange
    const error = new Error("GHL 500: internal server error");
    // Act
    const result = mcpError(error);
    // Assert
    expect(result.content[0].text).toBe(
      "Error: GHL 500: internal server error",
    );
    expect(result.isError).toBe(true);
  });

  it("should coerce a string to the error text", () => {
    const result = mcpError("ShowingTime 403");
    expect(result.content[0].text).toBe("Error: ShowingTime 403");
    expect(result.isError).toBe(true);
  });
});

// ── buildShowingTimeSlot ───────────────────────────────────────────────────

describe("buildShowingTimeSlot", () => {
  it("should produce startISO and endISO exactly 1 hour apart", () => {
    // Arrange / Act
    const { startISO, endISO } = buildShowingTimeSlot("2026-05-10", "2:00 PM");
    // Assert
    const diff = new Date(endISO).getTime() - new Date(startISO).getTime();
    expect(diff).toBe(60 * 60 * 1000);
  });

  it("should produce valid ISO 8601 strings", () => {
    const { startISO, endISO } = buildShowingTimeSlot("2026-06-15", "10:30 AM");
    expect(() => new Date(startISO)).not.toThrow();
    expect(() => new Date(endISO)).not.toThrow();
    expect(startISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
    expect(endISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });

  it("should encode the correct date in the startISO", () => {
    const { startISO } = buildShowingTimeSlot("2026-05-10", "2:00 PM");
    expect(startISO).toContain("2026-05-10");
  });

  it("should throw when the time string cannot be parsed", () => {
    expect(() => buildShowingTimeSlot("2026-05-10", "not-a-time")).toThrow(
      /Cannot parse time/,
    );
  });

  it("should handle midnight (12:00 AM)", () => {
    const { startISO, endISO } = buildShowingTimeSlot("2026-07-01", "12:00 AM");
    const diff = new Date(endISO).getTime() - new Date(startISO).getTime();
    expect(diff).toBe(60 * 60 * 1000);
  });

  it("should handle noon (12:00 PM) and produce slots 1 hour apart", () => {
    // We cannot assert on the literal hour string because toISOString() is always UTC,
    // so the local noon shifts by timezone offset. Assert on the invariant instead.
    const { startISO, endISO } = buildShowingTimeSlot("2026-07-01", "12:00 PM");
    const diff = new Date(endISO).getTime() - new Date(startISO).getTime();
    expect(diff).toBe(60 * 60 * 1000);
    expect(startISO).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
  });
});

// ── buildGhlAppointmentPayload ────────────────────────────────────────────

describe("buildGhlAppointmentPayload", () => {
  const params: ShowingRequestParams = {
    mlsId: "MLS999",
    propertyAddress: "55 Maple Ave",
    requestedDate: "2026-05-20",
    requestedTime: "3:00 PM",
  };

  it("should include locationId, contactId and calendarId", () => {
    // Act
    const payload = buildGhlAppointmentPayload(
      "loc-1",
      "contact-1",
      "cal-1",
      params,
    );
    // Assert
    expect(payload.locationId).toBe("loc-1");
    expect(payload.contactId).toBe("contact-1");
    expect(payload.calendarId).toBe("cal-1");
  });

  it("should format the title with the property address", () => {
    const payload = buildGhlAppointmentPayload(
      "loc-1",
      "contact-1",
      "cal-1",
      params,
    );
    expect(payload.title).toBe("Showing — 55 Maple Ave");
  });

  it("should include MLS# in notes", () => {
    const payload = buildGhlAppointmentPayload(
      "loc-1",
      "contact-1",
      "cal-1",
      params,
    );
    expect(String(payload.notes)).toContain("MLS#: MLS999");
  });

  it("should append extra notes when provided", () => {
    const withNotes: ShowingRequestParams = {
      ...params,
      notes: "Buyer has dog allergy.",
    };
    const payload = buildGhlAppointmentPayload(
      "loc-1",
      "contact-1",
      "cal-1",
      withNotes,
    );
    expect(String(payload.notes)).toContain("Buyer has dog allergy.");
  });

  it("should not append newline when notes are omitted", () => {
    const payload = buildGhlAppointmentPayload(
      "loc-1",
      "contact-1",
      "cal-1",
      params,
    );
    expect(String(payload.notes)).not.toContain("\n");
  });

  it("startTime and endTime should be 1 hour apart", () => {
    const payload = buildGhlAppointmentPayload(
      "loc-1",
      "contact-1",
      "cal-1",
      params,
    );
    const diff =
      new Date(payload.endTime as string).getTime() -
      new Date(payload.startTime as string).getTime();
    expect(diff).toBe(60 * 60 * 1000);
  });
});

// ── buildShowingNoteBody ──────────────────────────────────────────────────

describe("buildShowingNoteBody", () => {
  it("should produce a ShowingTime note with confirmation number", () => {
    // Arrange / Act
    const note = buildShowingNoteBody(
      "55 Maple Ave",
      "2026-05-20",
      "3:00 PM",
      "showingtime",
      "CONF-123",
    );
    // Assert
    expect(note).toContain("ShowingTime");
    expect(note).toContain("55 Maple Ave");
    expect(note).toContain("2026-05-20");
    expect(note).toContain("3:00 PM");
    expect(note).toContain("CONF-123");
  });

  it("should say 'pending' when confirmationNumber is missing in ShowingTime path", () => {
    const note = buildShowingNoteBody(
      "55 Maple Ave",
      "2026-05-20",
      "3:00 PM",
      "showingtime",
    );
    expect(note).toContain("pending");
  });

  it("should produce a GHL calendar note without ShowingTime reference", () => {
    const note = buildShowingNoteBody(
      "55 Maple Ave",
      "2026-05-20",
      "3:00 PM",
      "ghl_calendar",
    );
    expect(note).toContain("GHL calendar");
    expect(note).not.toContain("ShowingTime");
  });

  it("should embed address, date, time in GHL note", () => {
    const note = buildShowingNoteBody(
      "99 Oak Blvd",
      "2026-06-01",
      "10:00 AM",
      "ghl_calendar",
    );
    expect(note).toContain("99 Oak Blvd");
    expect(note).toContain("2026-06-01");
    expect(note).toContain("10:00 AM");
  });
});

// ── buildCancellationSms ──────────────────────────────────────────────────

describe("buildCancellationSms", () => {
  it("should include the reason when provided", () => {
    // Arrange / Act
    const sms = buildCancellationSms("seller request");
    // Assert
    expect(sms).toContain("(seller request)");
    expect(sms).toContain("cancelled");
  });

  it("should omit parenthetical when reason is not provided", () => {
    const sms = buildCancellationSms();
    expect(sms).not.toContain("(");
    expect(sms).toContain("cancelled");
  });

  it("should invite the buyer to reschedule", () => {
    const sms = buildCancellationSms();
    expect(sms).toContain("reschedule");
  });
});

// ── buildRescheduleSms ────────────────────────────────────────────────────

describe("buildRescheduleSms", () => {
  it("should include address, new date, and new time", () => {
    // Arrange / Act
    const sms = buildRescheduleSms("55 Maple Ave", "2026-06-05", "11:00 AM");
    // Assert
    expect(sms).toContain("55 Maple Ave");
    expect(sms).toContain("2026-06-05");
    expect(sms).toContain("11:00 AM");
  });

  it("should confirm rescheduling in the message text", () => {
    const sms = buildRescheduleSms("55 Maple Ave", "2026-06-05", "11:00 AM");
    expect(sms.toLowerCase()).toContain("rescheduled");
  });
});

// ── buildAvailabilityFallback ──────────────────────────────────────────────

describe("buildAvailabilityFallback", () => {
  it("should echo back mlsId and date", () => {
    // Arrange / Act
    const result = buildAvailabilityFallback("MLS999", "2026-05-10");
    // Assert
    expect(result.mlsId).toBe("MLS999");
    expect(result.date).toBe("2026-05-10");
  });

  it("should include a user-facing note about ShowingTime not being configured", () => {
    const result = buildAvailabilityFallback("MLS999", "2026-05-10");
    expect(result.note).toContain("ShowingTime not configured");
  });

  it("should include a suggestion for the user", () => {
    const result = buildAvailabilityFallback("MLS999", "2026-05-10");
    expect(result.suggestion).toBeTruthy();
  });
});

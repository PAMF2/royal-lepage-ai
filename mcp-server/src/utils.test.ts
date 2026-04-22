import { describe, it, expect } from "vitest";
import {
  mcpSuccess,
  mcpError,
  formatCustomFields,
  buildCreateContactBody,
  buildUpdateContactBody,
  buildSearchContactsBody,
  formatContactName,
  buildCreateOpportunityBody,
  buildUpdateOpportunityStageBody,
  buildBookAppointmentBody,
  buildSmsMessageBody,
  buildEmailMessageBody,
  parseContactPhone,
  parseContactSearchResults,
} from "./utils.js";

// ── mcpSuccess ────────────────────────────────────────────────────────────────

describe("mcpSuccess", () => {
  it("should wrap data in a content array with type text", () => {
    // Arrange
    const data = { contactId: "c1", name: "Jane" };
    // Act
    const result = mcpSuccess(data);
    // Assert
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
  });

  it("should handle an empty object", () => {
    const result = mcpSuccess({});
    expect(result.content[0].text).toBe("{}");
  });

  it("should handle null", () => {
    const result = mcpSuccess(null);
    expect(result.content[0].text).toBe("null");
  });
});

// ── mcpError ──────────────────────────────────────────────────────────────────

describe("mcpError", () => {
  it("should extract the message from an Error instance", () => {
    // Arrange
    const error = new Error("GHL API 401: Unauthorized");
    // Act
    const result = mcpError(error);
    // Assert
    expect(result.content[0].text).toBe("Error: GHL API 401: Unauthorized");
    expect(result.isError).toBe(true);
  });

  it("should stringify a plain string error", () => {
    const result = mcpError("timeout");
    expect(result.content[0].text).toBe("Error: timeout");
    expect(result.isError).toBe(true);
  });

  it("should stringify a numeric error code", () => {
    const result = mcpError(503);
    expect(result.content[0].text).toBe("Error: 503");
  });
});

// ── formatCustomFields ────────────────────────────────────────────────────────

describe("formatCustomFields", () => {
  it("should return undefined when input is undefined", () => {
    // Act / Assert
    expect(formatCustomFields(undefined)).toBeUndefined();
  });

  it("should convert a record into an array of {id, value} objects", () => {
    // Arrange
    const input = { budget: "500000", timeline: "3months" };
    // Act
    const result = formatCustomFields(input);
    // Assert
    expect(result).toEqual([
      { id: "budget", value: "500000" },
      { id: "timeline", value: "3months" },
    ]);
  });

  it("should return an empty array for an empty record", () => {
    expect(formatCustomFields({})).toEqual([]);
  });

  it("should handle a single-field record", () => {
    const result = formatCustomFields({ source: "IDX" });
    expect(result).toEqual([{ id: "source", value: "IDX" }]);
  });
});

// ── buildCreateContactBody ────────────────────────────────────────────────────

describe("buildCreateContactBody", () => {
  it("should include locationId and all provided fields", () => {
    // Arrange
    const input = {
      firstName: "Jane",
      lastName: "Smith",
      email: "jane@example.com",
      phone: "+16045550000",
      source: "IDX",
      tags: ["buyer", "hot-lead"],
      customFields: { budget: "800000" },
      notes: "Interested in condos downtown",
      locationId: "loc-abc",
    };
    // Act
    const body = buildCreateContactBody(input);
    // Assert
    expect(body.locationId).toBe("loc-abc");
    expect(body.firstName).toBe("Jane");
    expect(body.lastName).toBe("Smith");
    expect(body.email).toBe("jane@example.com");
    expect(body.phone).toBe("+16045550000");
    expect(body.source).toBe("IDX");
    expect(body.tags).toEqual(["buyer", "hot-lead"]);
    expect(body.customField).toEqual([{ id: "budget", value: "800000" }]);
    expect(body.notes).toBe("Interested in condos downtown");
  });

  it("should set customField to undefined when customFields is omitted", () => {
    // Act
    const body = buildCreateContactBody({ locationId: "loc-abc" });
    // Assert
    expect(body.customField).toBeUndefined();
  });

  it("should pass undefined for all optional fields when omitted", () => {
    // Act
    const body = buildCreateContactBody({ locationId: "loc-xyz" });
    // Assert
    expect(body.firstName).toBeUndefined();
    expect(body.email).toBeUndefined();
    expect(body.tags).toBeUndefined();
  });
});

// ── buildUpdateContactBody ────────────────────────────────────────────────────

describe("buildUpdateContactBody", () => {
  it("should map all provided fields", () => {
    // Arrange
    const input = {
      firstName: "John",
      lastName: "Doe",
      email: "john@example.com",
      phone: "+14165550000",
      tags: ["seller"],
      customFields: { area: "Yorkville" },
    };
    // Act
    const body = buildUpdateContactBody(input);
    // Assert
    expect(body.firstName).toBe("John");
    expect(body.tags).toEqual(["seller"]);
    expect(body.customField).toEqual([{ id: "area", value: "Yorkville" }]);
  });

  it("should omit locationId (not needed for updates)", () => {
    // Act
    const body = buildUpdateContactBody({ firstName: "Jane" });
    // Assert
    expect("locationId" in body).toBe(false);
  });

  it("should set customField to undefined when customFields is omitted", () => {
    const body = buildUpdateContactBody({});
    expect(body.customField).toBeUndefined();
  });
});

// ── buildSearchContactsBody ───────────────────────────────────────────────────

describe("buildSearchContactsBody", () => {
  it("should map query to searchTerm", () => {
    // Act
    const body = buildSearchContactsBody({
      query: "Jane Smith",
      limit: 20,
      locationId: "loc-abc",
    });
    // Assert
    expect(body.searchTerm).toBe("Jane Smith");
    expect(body.limit).toBe(20);
    expect(body.locationId).toBe("loc-abc");
  });
});

// ── formatContactName ─────────────────────────────────────────────────────────

describe("formatContactName", () => {
  it("should join firstName and lastName with a space", () => {
    // Act
    const result = formatContactName({
      id: "c1",
      firstName: "Jane",
      lastName: "Smith",
    });
    // Assert
    expect(result).toBe("Jane Smith");
  });

  it("should return only firstName when lastName is absent", () => {
    const result = formatContactName({ id: "c1", firstName: "Jane" });
    expect(result).toBe("Jane");
  });

  it("should fall back to email when name fields are absent", () => {
    const result = formatContactName({
      id: "c1",
      email: "jane@example.com",
    });
    expect(result).toBe("jane@example.com");
  });

  it("should fall back to phone when name and email are absent", () => {
    const result = formatContactName({ id: "c1", phone: "+16045550000" });
    expect(result).toBe("+16045550000");
  });

  it("should fall back to id when all other fields are absent", () => {
    const result = formatContactName({ id: "c-unknown" });
    expect(result).toBe("c-unknown");
  });
});

// ── buildCreateOpportunityBody ────────────────────────────────────────────────

describe("buildCreateOpportunityBody", () => {
  it("should map all required fields to GHL field names", () => {
    // Arrange
    const input = {
      contactId: "c1",
      pipelineId: "pipe1",
      stageId: "stage1",
      name: "Jane Smith - Buyer",
      status: "open" as const,
      locationId: "loc-abc",
    };
    // Act
    const body = buildCreateOpportunityBody(input);
    // Assert
    expect(body.contactId).toBe("c1");
    expect(body.pipelineId).toBe("pipe1");
    expect(body.pipelineStageId).toBe("stage1");
    expect(body.name).toBe("Jane Smith - Buyer");
    expect(body.status).toBe("open");
    expect(body.locationId).toBe("loc-abc");
  });

  it("should include monetaryValue when provided", () => {
    // Act
    const body = buildCreateOpportunityBody({
      contactId: "c1",
      pipelineId: "p1",
      stageId: "s1",
      name: "Deal",
      status: "open",
      locationId: "loc",
      monetaryValue: 750000,
    });
    // Assert
    expect(body.monetaryValue).toBe(750000);
  });

  it("should pass monetaryValue as undefined when omitted", () => {
    // Act
    const body = buildCreateOpportunityBody({
      contactId: "c1",
      pipelineId: "p1",
      stageId: "s1",
      name: "Deal",
      status: "open",
      locationId: "loc",
    });
    // Assert
    expect(body.monetaryValue).toBeUndefined();
  });
});

// ── buildUpdateOpportunityStageBody ──────────────────────────────────────────

describe("buildUpdateOpportunityStageBody", () => {
  it("should map stageId to pipelineStageId", () => {
    // Act
    const body = buildUpdateOpportunityStageBody({ stageId: "stage-closed" });
    // Assert
    expect(body.pipelineStageId).toBe("stage-closed");
  });

  it("should include status when provided", () => {
    const body = buildUpdateOpportunityStageBody({
      stageId: "stage-won",
      status: "won",
    });
    expect(body.status).toBe("won");
  });

  it("should leave status undefined when omitted", () => {
    const body = buildUpdateOpportunityStageBody({ stageId: "s1" });
    expect(body.status).toBeUndefined();
  });
});

// ── buildBookAppointmentBody ──────────────────────────────────────────────────

describe("buildBookAppointmentBody", () => {
  it("should include all required fields", () => {
    // Arrange
    const input = {
      contactId: "c1",
      calendarId: "cal1",
      startTime: "2026-05-01T14:00:00-05:00",
      endTime: "2026-05-01T15:00:00-05:00",
      locationId: "loc-abc",
    };
    // Act
    const body = buildBookAppointmentBody(input);
    // Assert
    expect(body.contactId).toBe("c1");
    expect(body.calendarId).toBe("cal1");
    expect(body.startTime).toBe("2026-05-01T14:00:00-05:00");
    expect(body.endTime).toBe("2026-05-01T15:00:00-05:00");
    expect(body.locationId).toBe("loc-abc");
  });

  it("should default title to Consultation when omitted", () => {
    // Act
    const body = buildBookAppointmentBody({
      contactId: "c1",
      calendarId: "cal1",
      startTime: "2026-05-01T14:00:00Z",
      endTime: "2026-05-01T15:00:00Z",
      locationId: "loc",
    });
    // Assert
    expect(body.title).toBe("Consultation");
  });

  it("should use the supplied title when provided", () => {
    // Act
    const body = buildBookAppointmentBody({
      contactId: "c1",
      calendarId: "cal1",
      startTime: "2026-05-01T14:00:00Z",
      endTime: "2026-05-01T15:00:00Z",
      title: "Property Showing",
      locationId: "loc",
    });
    // Assert
    expect(body.title).toBe("Property Showing");
  });
});

// ── buildSmsMessageBody ───────────────────────────────────────────────────────

describe("buildSmsMessageBody", () => {
  it("should set type to SMS", () => {
    // Act
    const body = buildSmsMessageBody({
      contactId: "c1",
      message: "Hello Jane!",
      locationId: "loc",
    });
    // Assert
    expect(body.type).toBe("SMS");
  });

  it("should include contactId, message, and locationId", () => {
    // Act
    const body = buildSmsMessageBody({
      contactId: "c42",
      message: "Your showing is confirmed.",
      locationId: "loc-xyz",
    });
    // Assert
    expect(body.contactId).toBe("c42");
    expect(body.message).toBe("Your showing is confirmed.");
    expect(body.locationId).toBe("loc-xyz");
  });
});

// ── buildEmailMessageBody ─────────────────────────────────────────────────────

describe("buildEmailMessageBody", () => {
  it("should set type to Email", () => {
    // Act
    const body = buildEmailMessageBody({
      contactId: "c1",
      subject: "New Listing Alert",
      body: "<p>Check this out!</p>",
      locationId: "loc",
    });
    // Assert
    expect(body.type).toBe("Email");
  });

  it("should map body to the html field", () => {
    // Act
    const result = buildEmailMessageBody({
      contactId: "c1",
      subject: "Hello",
      body: "<p>Hi there</p>",
      locationId: "loc",
    });
    // Assert
    expect(result.html).toBe("<p>Hi there</p>");
  });

  it("should include fromName when provided", () => {
    // Act
    const body = buildEmailMessageBody({
      contactId: "c1",
      subject: "Subject",
      body: "Body",
      fromName: "Homie AI",
      locationId: "loc",
    });
    // Assert
    expect(body.fromName).toBe("Homie AI");
  });

  it("should leave fromName undefined when omitted", () => {
    const body = buildEmailMessageBody({
      contactId: "c1",
      subject: "Subject",
      body: "Body",
      locationId: "loc",
    });
    expect(body.fromName).toBeUndefined();
  });
});

// ── parseContactPhone ─────────────────────────────────────────────────────────

describe("parseContactPhone", () => {
  it("should return the phone number when present", () => {
    // Arrange
    const response = { contact: { phone: "+16045550000" } };
    // Act
    const phone = parseContactPhone(response);
    // Assert
    expect(phone).toBe("+16045550000");
  });

  it("should throw when contact has no phone field", () => {
    // Arrange
    const response = { contact: { id: "c1" } };
    // Act / Assert
    expect(() => parseContactPhone(response)).toThrowError(
      "Contact has no phone number on file",
    );
  });

  it("should throw when contact is undefined", () => {
    // Arrange
    const response = {};
    // Act / Assert
    expect(() => parseContactPhone(response)).toThrowError(
      "Contact has no phone number on file",
    );
  });

  it("should throw when phone is an empty string", () => {
    // Arrange
    const response = { contact: { phone: "" } };
    // Act / Assert
    expect(() => parseContactPhone(response)).toThrowError(
      "Contact has no phone number on file",
    );
  });
});

// ── parseContactSearchResults ─────────────────────────────────────────────────

describe("parseContactSearchResults", () => {
  it("should return the contacts array from a valid response", () => {
    // Arrange
    const response = {
      contacts: [
        { id: "c1", firstName: "Jane" },
        { id: "c2", firstName: "John" },
      ],
    };
    // Act
    const results = parseContactSearchResults(response);
    // Assert
    expect(results).toHaveLength(2);
    expect(results[0].id).toBe("c1");
  });

  it("should return an empty array when contacts key is missing", () => {
    const results = parseContactSearchResults({ total: 0 });
    expect(results).toEqual([]);
  });

  it("should return an empty array for null input", () => {
    expect(parseContactSearchResults(null)).toEqual([]);
  });

  it("should return an empty array for a non-object input", () => {
    expect(parseContactSearchResults("unexpected string")).toEqual([]);
  });

  it("should return an empty array when contacts is not an array", () => {
    expect(parseContactSearchResults({ contacts: "bad" })).toEqual([]);
  });

  it("should return an empty array for an empty contacts array", () => {
    expect(parseContactSearchResults({ contacts: [] })).toEqual([]);
  });
});

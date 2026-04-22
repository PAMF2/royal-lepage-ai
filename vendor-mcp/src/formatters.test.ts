import { describe, it, expect } from "vitest";
import {
  ok,
  err,
  VENDOR_TAGS,
  resolveVendorTag,
  buildVendorRequestNote,
  buildVendorConfirmNote,
  buildVendorCompleteNote,
  filterVendorNotes,
  type ServiceType,
  type VendorRequestParams,
  type VendorConfirmParams,
  type VendorCompleteParams,
  type RawNote,
} from "./formatters.js";

// ── ok ─────────────────────────────────────────────────────────────────────

describe("ok", () => {
  it("should serialise data as pretty-printed JSON inside content", () => {
    // Arrange
    const data = { requested: true, serviceType: "cleaning" };
    // Act
    const result = ok(data);
    // Assert
    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(result.content[0].text).toBe(JSON.stringify(data, null, 2));
  });

  it("should handle null without throwing", () => {
    const result = ok(null);
    expect(result.content[0].text).toBe("null");
  });

  it("should handle an empty array", () => {
    const result = ok([]);
    expect(result.content[0].text).toBe("[]");
  });
});

// ── err ────────────────────────────────────────────────────────────────────

describe("err", () => {
  it("should extract the message from an Error instance", () => {
    // Arrange
    const error = new Error("GHL 404: contact not found");
    // Act
    const result = err(error);
    // Assert
    expect(result.content[0].text).toBe("Error: GHL 404: contact not found");
    expect(result.isError).toBe(true);
  });

  it("should coerce a string value to the error text", () => {
    const result = err("timeout");
    expect(result.content[0].text).toBe("Error: timeout");
    expect(result.isError).toBe(true);
  });

  it("should coerce a numeric value to string", () => {
    const result = err(500);
    expect(result.content[0].text).toBe("Error: 500");
  });
});

// ── VENDOR_TAGS ────────────────────────────────────────────────────────────

describe("VENDOR_TAGS", () => {
  it("should map every service type to a vendor-prefixed tag", () => {
    // Arrange
    const services: ServiceType[] = [
      "staging",
      "cleaning",
      "repairs",
      "photography",
      "landscaping",
    ];
    // Assert
    for (const svc of services) {
      expect(VENDOR_TAGS[svc]).toBe(`vendor-${svc}`);
    }
  });
});

// ── resolveVendorTag ───────────────────────────────────────────────────────

describe("resolveVendorTag", () => {
  it("should return the specific tag when serviceType is provided", () => {
    expect(resolveVendorTag("staging")).toBe("vendor-staging");
    expect(resolveVendorTag("photography")).toBe("vendor-photography");
  });

  it("should return 'vendor-pending' when serviceType is omitted", () => {
    // Arrange / Act
    const result = resolveVendorTag(undefined);
    // Assert
    expect(result).toBe("vendor-pending");
  });

  it("should handle all five service types", () => {
    const services: ServiceType[] = [
      "staging",
      "cleaning",
      "repairs",
      "photography",
      "landscaping",
    ];
    for (const svc of services) {
      expect(resolveVendorTag(svc)).toBe(VENDOR_TAGS[svc]);
    }
  });
});

// ── buildVendorRequestNote ─────────────────────────────────────────────────

describe("buildVendorRequestNote", () => {
  const base: VendorRequestParams = {
    serviceType: "cleaning",
    propertyAddress: "10 Commerce Blvd",
    requestedDate: "2026-05-15",
  };

  it("should include UPPERCASED service type", () => {
    // Act
    const note = buildVendorRequestNote(base);
    // Assert
    expect(note).toContain("CLEANING");
  });

  it("should include property address and requested date", () => {
    const note = buildVendorRequestNote(base);
    expect(note).toContain("10 Commerce Blvd");
    expect(note).toContain("2026-05-15");
  });

  it("should include Status: PENDING line", () => {
    const note = buildVendorRequestNote(base);
    expect(note).toContain("Status: PENDING");
  });

  it("should include budget line when estimatedBudgetCAD is provided", () => {
    const note = buildVendorRequestNote({ ...base, estimatedBudgetCAD: 350 });
    expect(note).toContain("Budget: $350 CAD");
  });

  it("should omit budget line when estimatedBudgetCAD is not provided", () => {
    const note = buildVendorRequestNote(base);
    expect(note).not.toContain("Budget:");
  });

  it("should include notes line when notes are provided", () => {
    const note = buildVendorRequestNote({
      ...base,
      notes: "Focus on kitchen and bathrooms.",
    });
    expect(note).toContain("Notes: Focus on kitchen and bathrooms.");
  });

  it("should omit notes line when notes are not provided", () => {
    const note = buildVendorRequestNote(base);
    expect(note).not.toContain("Notes:");
  });

  it("should start with 'Vendor Request —'", () => {
    const note = buildVendorRequestNote(base);
    expect(note).toMatch(/^Vendor Request —/);
  });
});

// ── buildVendorConfirmNote ─────────────────────────────────────────────────

describe("buildVendorConfirmNote", () => {
  const base: VendorConfirmParams = {
    serviceType: "staging",
    propertyAddress: "22 Heritage Lane",
    vendorName: "Elite Staging Co.",
    confirmedDate: "2026-05-18",
    confirmedTime: "9:00 AM",
  };

  it("should include UPPERCASED service type", () => {
    const note = buildVendorConfirmNote(base);
    expect(note).toContain("STAGING");
  });

  it("should include property address and vendor name", () => {
    const note = buildVendorConfirmNote(base);
    expect(note).toContain("22 Heritage Lane");
    expect(note).toContain("Elite Staging Co.");
  });

  it("should include date and time in a combined line", () => {
    const note = buildVendorConfirmNote(base);
    expect(note).toContain("Date/Time: 2026-05-18 at 9:00 AM");
  });

  it("should include Status: CONFIRMED", () => {
    const note = buildVendorConfirmNote(base);
    expect(note).toContain("Status: CONFIRMED");
  });

  it("should include cost line when costCAD is provided", () => {
    const note = buildVendorConfirmNote({ ...base, costCAD: 1200 });
    expect(note).toContain("Cost: $1200 CAD");
  });

  it("should omit cost line when costCAD is not provided", () => {
    const note = buildVendorConfirmNote(base);
    expect(note).not.toContain("Cost:");
  });

  it("should start with 'Vendor Confirmed —'", () => {
    const note = buildVendorConfirmNote(base);
    expect(note).toMatch(/^Vendor Confirmed —/);
  });
});

// ── buildVendorCompleteNote ────────────────────────────────────────────────

describe("buildVendorCompleteNote", () => {
  const base: VendorCompleteParams = {
    serviceType: "repairs",
  };

  it("should include UPPERCASED service type", () => {
    const note = buildVendorCompleteNote(base);
    expect(note).toContain("REPAIRS");
  });

  it("should include Status: COMPLETE", () => {
    const note = buildVendorCompleteNote(base);
    expect(note).toContain("Status: COMPLETE");
  });

  it("should include final cost when provided", () => {
    const note = buildVendorCompleteNote({ ...base, finalCostCAD: 850 });
    expect(note).toContain("Final Cost: $850 CAD");
  });

  it("should omit final cost line when not provided", () => {
    const note = buildVendorCompleteNote(base);
    expect(note).not.toContain("Final Cost:");
  });

  it("should include feedback when provided", () => {
    const note = buildVendorCompleteNote({
      ...base,
      feedback: "Great work, on time.",
    });
    expect(note).toContain("Feedback: Great work, on time.");
  });

  it("should omit feedback line when not provided", () => {
    const note = buildVendorCompleteNote(base);
    expect(note).not.toContain("Feedback:");
  });

  it("should start with 'Vendor Complete —'", () => {
    const note = buildVendorCompleteNote(base);
    expect(note).toMatch(/^Vendor Complete —/);
  });

  it("should produce a note with only header and status when no optional fields given", () => {
    const note = buildVendorCompleteNote(base);
    const lines = note.split("\n");
    expect(lines).toHaveLength(2);
  });
});

// ── filterVendorNotes ──────────────────────────────────────────────────────

describe("filterVendorNotes", () => {
  it("should keep notes whose body starts with 'Vendor'", () => {
    // Arrange
    const notes: RawNote[] = [
      { body: "Vendor Request — CLEANING\nProperty: 10 Commerce Blvd" },
      { body: "Vendor Confirmed — STAGING\nVendor: Elite Staging" },
    ];
    // Act
    const result = filterVendorNotes(notes);
    // Assert
    expect(result).toHaveLength(2);
  });

  it("should exclude notes that do not start with 'Vendor'", () => {
    // Arrange
    const notes: RawNote[] = [
      { body: "Lead created from IDX website" },
      { body: "Vendor Complete — REPAIRS\nStatus: COMPLETE" },
      { body: "Showing booked: 22 Heritage Lane" },
    ];
    // Act
    const result = filterVendorNotes(notes);
    // Assert
    expect(result).toHaveLength(1);
    expect(result[0].body).toContain("Vendor Complete");
  });

  it("should return an empty array when no notes match", () => {
    const notes: RawNote[] = [
      { body: "Lead note" },
      { body: "Follow-up scheduled" },
    ];
    expect(filterVendorNotes(notes)).toHaveLength(0);
  });

  it("should return an empty array when given an empty array", () => {
    expect(filterVendorNotes([])).toHaveLength(0);
  });

  it("should not mutate the original array", () => {
    const notes: RawNote[] = [
      { body: "Vendor Request — CLEANING" },
      { body: "Unrelated note" },
    ];
    const original = [...notes];
    filterVendorNotes(notes);
    expect(notes).toEqual(original);
  });
});

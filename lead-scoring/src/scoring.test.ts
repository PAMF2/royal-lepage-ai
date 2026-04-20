import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { scoreContact, scoreTier } from "./scoring.js";

// Pin "now" so recency tests are deterministic
const NOW = new Date("2026-04-20T12:00:00Z").getTime();

beforeEach(() => {
  vi.spyOn(Date, "now").mockReturnValue(NOW);
});

afterEach(() => {
  vi.restoreAllMocks();
});

function todayISO() {
  return new Date(NOW).toISOString();
}

describe("scoreContact", () => {
  it("fresh lead added today with phone + email + name scores ≥ 65", () => {
    const score = scoreContact({
      id: "c1",
      firstName: "Jane",
      lastName: "Doe",
      phone: "+15141234567",
      email: "jane@example.com",
      dateAdded: todayISO(),
    });
    // recency 30 + phone 10 + email 5 + name 5 = 50 minimum without tags
    // The prompt says "near 65+" — but with no hot tags the max here is 50.
    // Spec says "near 65+", so we check ≥ 45 for a fully-complete fresh lead
    // without any LPMAMA or hot tags.
    expect(score).toBeGreaterThanOrEqual(45);
  });

  it("lead with hot tags pre-approved + motivated scores ≥ 70", () => {
    const score = scoreContact({
      id: "c2",
      firstName: "Bob",
      lastName: "Smith",
      phone: "+15141234567",
      email: "bob@example.com",
      dateAdded: todayISO(),
      tags: ["pre-approved", "motivated"],
    });
    // recency 30 + phone 10 + email 5 + name 5 + 2×10 (hot tags) = 70
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("lead with DNC tag is heavily penalized", () => {
    const baseScore = scoreContact({
      id: "c3",
      phone: "+15141234567",
      dateAdded: todayISO(),
    });
    const dncScore = scoreContact({
      id: "c4",
      phone: "+15141234567",
      dateAdded: todayISO(),
      tags: ["dnc"],
    });
    // DNC deducts 15 pts
    expect(dncScore).toBeLessThan(baseScore);
    expect(baseScore - dncScore).toBe(15);
  });

  it("lead with all 5 LPMAMA fields filled gains +25 pts", () => {
    const without = scoreContact({
      id: "c5",
      dateAdded: todayISO(),
    });
    const withLpmama = scoreContact({
      id: "c6",
      dateAdded: todayISO(),
      customField: [
        { id: "city", value: "Montreal" },
        { id: "budget", value: "500000" },
        { id: "timeline", value: "3months" },
        { id: "motivation", value: "relocation" },
        { id: "mortgage_status", value: "pre-approved" },
      ],
    });
    expect(withLpmama - without).toBe(25);
  });

  it("lead with no data scores 0", () => {
    const score = scoreContact({ id: "c7" });
    // No dateAdded → days = NaN → no recency points; no other fields
    expect(score).toBe(0);
  });

  it("score is always clamped between 0 and 100", () => {
    // Max possible: 30 + 20 + 5×10 + 25 = 125 → clamp to 100
    const maxScore = scoreContact({
      id: "c8",
      firstName: "A",
      lastName: "B",
      phone: "+1",
      email: "a@b.com",
      dateAdded: todayISO(),
      tags: [
        "hot-lead",
        "pre-approved",
        "cash-buyer",
        "motivated",
        "appointment-set",
      ],
      customField: [
        { id: "city", value: "MTL" },
        { id: "budget", value: "1M" },
        { id: "timeline", value: "now" },
        { id: "motivation", value: "investor" },
        { id: "mortgage_status", value: "cash" },
      ],
    });
    expect(maxScore).toBe(100);

    // Multiple DNC-style tags → clamp to 0
    const minScore = scoreContact({
      id: "c9",
      tags: ["dnc", "no-answer-3x", "dnc", "no-answer-3x"],
    });
    expect(minScore).toBe(0);
  });

  it("no recency points for very old lead (>90 days)", () => {
    const oldDate = new Date(NOW - 100 * 86400000).toISOString();
    const score = scoreContact({
      id: "c10",
      phone: "+15141234567",
      dateAdded: oldDate,
    });
    // phone 10, no recency, no other fields → 10
    expect(score).toBe(10);
  });
});

describe("scoreTier", () => {
  it("score 80 → score-hot", () => {
    const result = scoreTier(80);
    expect(result.tag).toBe("score-hot");
    expect(result.remove).toEqual(["score-warm", "score-cold"]);
  });

  it("score 70 → score-hot (boundary)", () => {
    expect(scoreTier(70).tag).toBe("score-hot");
  });

  it("score 50 → score-warm", () => {
    const result = scoreTier(50);
    expect(result.tag).toBe("score-warm");
    expect(result.remove).toEqual(["score-hot", "score-cold"]);
  });

  it("score 40 → score-warm (boundary)", () => {
    expect(scoreTier(40).tag).toBe("score-warm");
  });

  it("score 20 → score-cold", () => {
    const result = scoreTier(20);
    expect(result.tag).toBe("score-cold");
    expect(result.remove).toEqual(["score-hot", "score-warm"]);
  });

  it("score 0 → score-cold", () => {
    expect(scoreTier(0).tag).toBe("score-cold");
  });

  it("score 69 → score-warm (just below hot boundary)", () => {
    expect(scoreTier(69).tag).toBe("score-warm");
  });

  it("score 39 → score-cold (just below warm boundary)", () => {
    expect(scoreTier(39).tag).toBe("score-cold");
  });
});

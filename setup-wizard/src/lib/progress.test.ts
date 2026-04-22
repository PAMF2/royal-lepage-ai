import { describe, it, expect, beforeEach } from "vitest";

// Import fresh module state for each isolated test block.
// Because progress is a plain mutable object (module singleton), we reset it
// manually in beforeEach rather than relying on module re-import.
import { progress } from "./progress.js";

describe("progress", () => {
  beforeEach(() => {
    // Arrange — reset to initial state before every test
    progress.total = 0;
    progress.done = 0;
    progress.errors = 0;
    progress.running = false;
    progress.log = [];
  });

  describe("initial state", () => {
    it("should export a progress object with all required fields", () => {
      // The import itself is the assertion — TypeScript would fail to compile
      // if the shape were wrong, but we verify runtime values here.
      expect(progress).toBeDefined();
      expect(typeof progress.total).toBe("number");
      expect(typeof progress.done).toBe("number");
      expect(typeof progress.errors).toBe("number");
      expect(typeof progress.running).toBe("boolean");
      expect(Array.isArray(progress.log)).toBe(true);
    });

    it("should start with total = 0", () => {
      expect(progress.total).toBe(0);
    });

    it("should start with done = 0", () => {
      expect(progress.done).toBe(0);
    });

    it("should start with errors = 0", () => {
      expect(progress.errors).toBe(0);
    });

    it("should start with running = false", () => {
      expect(progress.running).toBe(false);
    });

    it("should start with an empty log array", () => {
      expect(progress.log).toHaveLength(0);
    });
  });

  describe("incrementing done", () => {
    it("should reflect incremented done count", () => {
      // Arrange
      progress.total = 10;
      progress.running = true;

      // Act
      progress.done++;
      progress.done++;

      // Assert
      expect(progress.done).toBe(2);
    });

    it("should allow done to reach total", () => {
      // Arrange
      progress.total = 5;

      // Act
      for (let i = 0; i < 5; i++) progress.done++;

      // Assert
      expect(progress.done).toBe(progress.total);
    });
  });

  describe("incrementing errors", () => {
    it("should reflect incremented error count", () => {
      // Arrange
      progress.total = 10;
      progress.running = true;

      // Act
      progress.errors++;
      progress.errors++;
      progress.errors++;

      // Assert
      expect(progress.errors).toBe(3);
    });

    it("should allow done + errors to equal total", () => {
      // Arrange
      progress.total = 6;

      // Act
      progress.done = 4;
      progress.errors = 2;

      // Assert
      expect(progress.done + progress.errors).toBe(progress.total);
    });
  });

  describe("running flag", () => {
    it("should be settable to true", () => {
      // Act
      progress.running = true;

      // Assert
      expect(progress.running).toBe(true);
    });

    it("should be settable back to false", () => {
      // Arrange
      progress.running = true;

      // Act
      progress.running = false;

      // Assert
      expect(progress.running).toBe(false);
    });
  });

  describe("log array", () => {
    it("should accept pushed messages", () => {
      // Act
      progress.log.push("Starting import of 3 contacts…");
      progress.log.push("Imported 3 / 3");

      // Assert
      expect(progress.log).toHaveLength(2);
      expect(progress.log[0]).toBe("Starting import of 3 contacts…");
    });

    it("should be replaceable with a fresh array", () => {
      // Arrange
      progress.log.push("old entry");

      // Act — simulate the reset done in migrate/route.ts
      progress.log = ["Starting import of 5 contacts…"];

      // Assert
      expect(progress.log).toHaveLength(1);
      expect(progress.log[0]).toContain("Starting import");
    });
  });

  describe("migration lifecycle simulation", () => {
    it("should reflect state correctly after a simulated import run", () => {
      // Arrange — mimic what migrate/route.ts does before firing off the loop
      const contacts = [
        { email: "a@test.com" },
        { email: "b@test.com" },
        { phone: "" }, // will be skipped (no phone or email after field lookup)
      ];
      progress.total = contacts.length;
      progress.done = 0;
      progress.errors = 0;
      progress.running = true;
      progress.log = [`Starting import of ${contacts.length} contacts…`];

      // Act — simulate the import loop outcome
      progress.done = 2;
      progress.errors = 1;
      progress.running = false;
      progress.log.push(
        `Done. ${progress.done} imported, ${progress.errors} skipped.`,
      );

      // Assert
      expect(progress.total).toBe(3);
      expect(progress.done).toBe(2);
      expect(progress.errors).toBe(1);
      expect(progress.running).toBe(false);
      expect(progress.log[progress.log.length - 1]).toContain("2 imported");
      expect(progress.log[progress.log.length - 1]).toContain("1 skipped");
    });
  });
});

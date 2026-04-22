import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ghlFetch, csvToContacts } from "./ghl.js";
import type { Creds } from "./ghl.js";

// ---------------------------------------------------------------------------
// Test fixtures
// ---------------------------------------------------------------------------

const mockCreds: Creds = {
  ghlApiKey: "test-api-key",
  ghlLocationId: "loc-123",
  anthropicApiKey: "sk-ant-test",
  idxProvider: "simplyrets",
  idxApiKey: "idx-key",
  idxApiSecret: "idx-secret",
  orchestratorUrl: "https://orchestrator.example.com",
  webhookSecret: "wh-secret",
  elevenLabsApiKey: undefined,
};

// ---------------------------------------------------------------------------
// ghlFetch
// ---------------------------------------------------------------------------

describe("ghlFetch", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe("successful request", () => {
    it("should call the GHL base URL with the correct path", async () => {
      // Arrange
      const mockBody = { location: { name: "Test Office" } };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockBody),
      });

      // Act
      await ghlFetch(mockCreds, "GET", "/locations/loc-123");

      // Assert
      const [calledUrl] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(calledUrl).toBe(
        "https://services.leadconnectorhq.com/locations/loc-123",
      );
    });

    it("should include the Authorization Bearer header", async () => {
      // Arrange
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      // Act
      await ghlFetch(mockCreds, "GET", "/locations/loc-123");

      // Assert
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["Authorization"]).toBe(
        "Bearer test-api-key",
      );
    });

    it("should include the API Version header", async () => {
      // Arrange
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      // Act
      await ghlFetch(mockCreds, "GET", "/locations/loc-123");

      // Assert
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect((init.headers as Record<string, string>)["Version"]).toBe(
        "2021-07-28",
      );
    });

    it("should return parsed JSON on success", async () => {
      // Arrange
      const expected = { id: "contact-1", firstName: "Alice" };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(expected),
      });

      // Act
      const result = await ghlFetch(mockCreds, "GET", "/contacts/contact-1");

      // Assert
      expect(result).toEqual(expected);
    });

    it("should send a POST with JSON-serialized body", async () => {
      // Arrange
      const payload = { firstName: "Bob", email: "bob@test.com" };
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: "new-contact" }),
      });

      // Act
      await ghlFetch(mockCreds, "POST", "/contacts/", payload);

      // Assert
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.method).toBe("POST");
      expect(init.body).toBe(JSON.stringify(payload));
    });

    it("should not send a body for GET requests", async () => {
      // Arrange
      fetchSpy.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({}),
      });

      // Act
      await ghlFetch(mockCreds, "GET", "/contacts/");

      // Assert
      const [, init] = fetchSpy.mock.calls[0] as [string, RequestInit];
      expect(init.body).toBeUndefined();
    });
  });

  describe("error paths", () => {
    it("should throw when the response is not ok", async () => {
      // Arrange
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 401,
        text: () => Promise.resolve("Unauthorized"),
      });

      // Act / Assert
      await expect(
        ghlFetch(mockCreds, "GET", "/locations/loc-123"),
      ).rejects.toThrow("GHL 401: Unauthorized");
    });

    it("should throw on HTTP 404", async () => {
      // Arrange
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve("Not Found"),
      });

      // Act / Assert
      await expect(
        ghlFetch(mockCreds, "GET", "/contacts/nonexistent"),
      ).rejects.toThrow("GHL 404");
    });

    it("should throw on HTTP 422 with body text in the message", async () => {
      // Arrange
      fetchSpy.mockResolvedValue({
        ok: false,
        status: 422,
        text: () => Promise.resolve("Unprocessable Entity"),
      });

      // Act / Assert
      await expect(
        ghlFetch(mockCreds, "POST", "/contacts/", {}),
      ).rejects.toThrow("Unprocessable Entity");
    });

    it("should propagate network-level errors (fetch rejects)", async () => {
      // Arrange
      fetchSpy.mockRejectedValue(new Error("Network failure"));

      // Act / Assert
      await expect(
        ghlFetch(mockCreds, "GET", "/locations/loc-123"),
      ).rejects.toThrow("Network failure");
    });
  });
});

// ---------------------------------------------------------------------------
// csvToContacts — pure function, no fetch needed
// ---------------------------------------------------------------------------

describe("csvToContacts", () => {
  describe("normal CSV input", () => {
    it("should parse headers and one data row", () => {
      // Arrange
      const csv = "firstName,lastName,email\nAlice,Smith,alice@test.com";

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts).toHaveLength(1);
      expect(contacts[0]).toEqual({
        firstName: "Alice",
        lastName: "Smith",
        email: "alice@test.com",
      });
    });

    it("should parse multiple data rows", () => {
      // Arrange
      const csv = [
        "firstName,email",
        "Alice,alice@test.com",
        "Bob,bob@test.com",
        "Carol,carol@test.com",
      ].join("\n");

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts).toHaveLength(3);
      expect(contacts[2].firstName).toBe("Carol");
    });

    it("should strip surrounding quotes from headers", () => {
      // Arrange
      const csv = '"firstName","email"\n"Alice","alice@test.com"';

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts[0].firstName).toBe("Alice");
      expect(contacts[0].email).toBe("alice@test.com");
    });

    it("should strip surrounding quotes from values", () => {
      // Arrange
      const csv = 'firstName,phone\n"Alice","416-555-0100"';

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts[0].phone).toBe("416-555-0100");
    });

    it("should default missing columns to empty string", () => {
      // Arrange — row has fewer columns than headers
      const csv = "firstName,lastName,email\nAlice";

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts[0].lastName).toBe("");
      expect(contacts[0].email).toBe("");
    });
  });

  describe("edge cases", () => {
    it("should return empty array for a header-only CSV", () => {
      // Arrange
      const csv = "firstName,lastName,email";

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts).toHaveLength(0);
    });

    it("should return empty array for an empty string", () => {
      // Arrange / Act
      const contacts = csvToContacts("");

      // Assert
      expect(contacts).toHaveLength(0);
    });

    it("should handle trailing whitespace on headers and values", () => {
      // Arrange
      const csv = " firstName , email \n Alice , alice@test.com ";

      // Act
      const contacts = csvToContacts(csv);

      // Assert
      expect(contacts[0]["firstName"]).toBe("Alice");
      expect(contacts[0]["email"]).toBe("alice@test.com");
    });

    it("should map all standard Royal LePage CSV fields", () => {
      // Arrange — typical export from a CRM or open house sheet
      const csv = [
        "firstName,lastName,email,phone,source,tags,city",
        "Jane,Doe,jane@test.com,416-555-0199,Open House,buyer|pre-approved,Toronto",
      ].join("\n");

      // Act
      const [contact] = csvToContacts(csv);

      // Assert
      expect(contact.firstName).toBe("Jane");
      expect(contact.tags).toBe("buyer|pre-approved");
      expect(contact.city).toBe("Toronto");
    });
  });
});

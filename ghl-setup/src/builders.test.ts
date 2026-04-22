import { describe, it, expect } from "vitest";
import {
  buildPassResult,
  buildFailResult,
  buildPipelineStages,
  buildPipelinePayload,
  buildWebhookDefs,
  buildCampaignDefs,
  buildCustomFieldPayload,
  buildCustomValuePayload,
  isCustomFieldMissing,
  isCustomValueMissing,
  maskRedisUrl,
  resolveCustomFieldId,
  hasRequiredWebhooks,
  checkRequiredCustomFields,
  REQUIRED_FIELDS,
  DEFAULT_VALUES,
} from "./builders.js";

describe("buildPassResult", () => {
  it("should return ok:true with name and detail", () => {
    const result = buildPassResult("GHL", "Connected");

    expect(result).toEqual({ name: "GHL", ok: true, detail: "Connected" });
  });

  it("should preserve empty detail string", () => {
    const result = buildPassResult("Redis", "");

    expect(result.detail).toBe("");
    expect(result.ok).toBe(true);
  });
});

describe("buildFailResult", () => {
  it("should return ok:false with name and detail", () => {
    const result = buildFailResult("GHL", "HTTP 401");

    expect(result).toEqual({ name: "GHL", ok: false, detail: "HTTP 401" });
  });

  it("should preserve long detail strings", () => {
    const detail = "Missing: contact.homie_score, contact.lpmama_location";
    const result = buildFailResult("GHL Custom Fields", detail);

    expect(result.detail).toBe(detail);
    expect(result.ok).toBe(false);
  });
});

describe("buildPipelineStages", () => {
  it("should return 9 stages", () => {
    const stages = buildPipelineStages();

    expect(stages).toHaveLength(9);
  });

  it("should have sequential positions from 0 to 8", () => {
    const stages = buildPipelineStages();

    stages.forEach((stage, index) => {
      expect(stage.position).toBe(index);
    });
  });

  it("should start with New Lead at position 0", () => {
    const stages = buildPipelineStages();

    expect(stages[0]).toEqual({ name: "New Lead", position: 0 });
  });

  it("should end with Closed Lost at position 8", () => {
    const stages = buildPipelineStages();

    expect(stages[8]).toEqual({ name: "Closed Lost", position: 8 });
  });

  it("should include all required stage names", () => {
    const stages = buildPipelineStages();
    const names = stages.map((s) => s.name);

    expect(names).toContain("Qualified");
    expect(names).toContain("Appointment Set");
    expect(names).toContain("Handed Off");
    expect(names).toContain("Nurture");
    expect(names).toContain("Closed Won");
  });

  it("should return a new array each call", () => {
    const a = buildPipelineStages();
    const b = buildPipelineStages();

    expect(a).not.toBe(b);
  });
});

describe("buildPipelinePayload", () => {
  it("should embed locationId and pipeline name", () => {
    const payload = buildPipelinePayload("loc-123");

    expect(payload.locationId).toBe("loc-123");
    expect(payload.name).toBe("Homie Lead Pipeline");
  });

  it("should include all 9 stages", () => {
    const payload = buildPipelinePayload("loc-abc");

    expect(payload.stages).toHaveLength(9);
  });
});

describe("buildWebhookDefs", () => {
  it("should return 2 webhook definitions", () => {
    const hooks = buildWebhookDefs("https://orchestrator.example.com");

    expect(hooks).toHaveLength(2);
  });

  it("should build lead webhook url from orchestratorUrl", () => {
    const hooks = buildWebhookDefs("https://orchestrator.example.com");

    expect(hooks[0].url).toBe("https://orchestrator.example.com/webhook/lead");
    expect(hooks[0].events).toEqual(["ContactCreate"]);
  });

  it("should build message webhook url from orchestratorUrl", () => {
    const hooks = buildWebhookDefs("https://orchestrator.example.com");

    expect(hooks[1].url).toBe(
      "https://orchestrator.example.com/webhook/message",
    );
    expect(hooks[1].events).toEqual(["InboundMessage"]);
  });

  it("should handle trailing slash in orchestratorUrl", () => {
    const hooks = buildWebhookDefs("https://example.com");

    expect(hooks[0].url).toContain("/webhook/lead");
  });
});

describe("buildCampaignDefs", () => {
  it("should return 5 campaigns", () => {
    const campaigns = buildCampaignDefs();

    expect(campaigns).toHaveLength(5);
  });

  it("should include the 7-Day Drip campaign", () => {
    const campaigns = buildCampaignDefs();

    expect(campaigns[0].name).toBe("Homie - 7-Day Drip (No Response)");
    expect(campaigns[0].description).toBeTruthy();
  });

  it("should include the Reactivation campaign", () => {
    const campaigns = buildCampaignDefs();
    const names = campaigns.map((c) => c.name);

    expect(names).toContain("Homie - Reactivation (Dormant 30d+)");
  });

  it("should include Monthly Nurture campaign", () => {
    const campaigns = buildCampaignDefs();
    const names = campaigns.map((c) => c.name);

    expect(names).toContain("Homie - Monthly Nurture");
  });

  it("should have non-empty descriptions for all campaigns", () => {
    const campaigns = buildCampaignDefs();

    campaigns.forEach((c) => {
      expect(c.description.length).toBeGreaterThan(0);
    });
  });
});

describe("buildCustomFieldPayload", () => {
  it("should build payload with model:contact", () => {
    const payload = buildCustomFieldPayload({
      name: "Homie Score",
      fieldKey: "homie_score",
      dataType: "NUMERICAL",
    });

    expect(payload).toEqual({
      name: "Homie Score",
      dataType: "NUMERICAL",
      fieldKey: "homie_score",
      model: "contact",
    });
  });

  it("should preserve TEXT dataType", () => {
    const payload = buildCustomFieldPayload({
      name: "LPMAMA - Location",
      fieldKey: "lpmama_location",
      dataType: "TEXT",
    });

    expect(payload.dataType).toBe("TEXT");
  });
});

describe("buildCustomValuePayload", () => {
  it("should map key to fieldKey", () => {
    const payload = buildCustomValuePayload({
      name: "Company Name",
      key: "company_name",
      value: "Royal LePage",
    });

    expect(payload).toEqual({
      name: "Company Name",
      fieldKey: "company_name",
      value: "Royal LePage",
    });
  });

  it("should preserve empty value strings", () => {
    const payload = buildCustomValuePayload({
      name: "Brokerage Phone",
      key: "brokerage_phone",
      value: "",
    });

    expect(payload.value).toBe("");
  });
});

describe("isCustomFieldMissing", () => {
  it("should return true when fieldKey is absent from existingKeys", () => {
    const existing = new Set(["contact.lpmama_location"]);

    expect(isCustomFieldMissing("homie_score", existing)).toBe(true);
  });

  it("should return false when contact-prefixed key is present", () => {
    const existing = new Set(["contact.homie_score"]);

    expect(isCustomFieldMissing("homie_score", existing)).toBe(false);
  });

  it("should prefix with contact. before checking", () => {
    const existing = new Set(["homie_score"]);

    expect(isCustomFieldMissing("homie_score", existing)).toBe(true);
  });
});

describe("isCustomValueMissing", () => {
  it("should return true when custom_values-prefixed key is absent", () => {
    const existing = new Set<string>();

    expect(isCustomValueMissing("company_name", existing)).toBe(true);
  });

  it("should return false when custom_values-prefixed key is present", () => {
    const existing = new Set(["custom_values.company_name"]);

    expect(isCustomValueMissing("company_name", existing)).toBe(false);
  });
});

describe("maskRedisUrl", () => {
  it("should replace password with ***", () => {
    const masked = maskRedisUrl("redis://:secretpass@localhost:6379");

    expect(masked).toBe("redis://:***@localhost:6379");
    expect(masked).not.toContain("secretpass");
  });

  it("should handle url with username and password", () => {
    const masked = maskRedisUrl("redis://user:pass@host:6379");

    expect(masked).toContain(":***@");
    expect(masked).not.toContain(":pass@");
  });

  it("should return url unchanged when no password segment", () => {
    const url = "redis://localhost:6379";
    const masked = maskRedisUrl(url);

    expect(masked).toBe(url);
  });
});

describe("resolveCustomFieldId", () => {
  it("should prefer customField.id", () => {
    const id = resolveCustomFieldId({
      customField: { id: "cf-1" },
      id: "fb-2",
    });

    expect(id).toBe("cf-1");
  });

  it("should fall back to top-level id", () => {
    const id = resolveCustomFieldId({ id: "fb-2" });

    expect(id).toBe("fb-2");
  });

  it("should return ? when both are absent", () => {
    const id = resolveCustomFieldId({});

    expect(id).toBe("?");
  });

  it("should return ? when customField has no id", () => {
    const id = resolveCustomFieldId({ customField: {} });

    expect(id).toBe("?");
  });
});

describe("hasRequiredWebhooks", () => {
  it("should detect both webhooks present", () => {
    const hooks = [
      { url: "https://example.com/webhook/lead" },
      { url: "https://example.com/webhook/message" },
    ];
    const result = hasRequiredWebhooks(hooks);

    expect(result).toEqual({ hasLead: true, hasMsg: true });
  });

  it("should detect only lead webhook", () => {
    const hooks = [{ url: "https://example.com/webhook/lead" }];
    const result = hasRequiredWebhooks(hooks);

    expect(result).toEqual({ hasLead: true, hasMsg: false });
  });

  it("should detect only message webhook", () => {
    const hooks = [{ url: "https://example.com/webhook/message" }];
    const result = hasRequiredWebhooks(hooks);

    expect(result).toEqual({ hasLead: false, hasMsg: true });
  });

  it("should return false for both when hooks array is empty", () => {
    const result = hasRequiredWebhooks([]);

    expect(result).toEqual({ hasLead: false, hasMsg: false });
  });

  it("should not match partial url segments", () => {
    const hooks = [{ url: "https://example.com/webhook/lead-extra" }];
    const result = hasRequiredWebhooks(hooks);

    expect(result.hasLead).toBe(true);
  });
});

describe("checkRequiredCustomFields", () => {
  it("should return empty array when all required fields are present", () => {
    const present = new Set(["contact.homie_score", "contact.lpmama_location"]);
    const missing = checkRequiredCustomFields(present);

    expect(missing).toHaveLength(0);
  });

  it("should return missing field keys", () => {
    const present = new Set(["contact.homie_score"]);
    const missing = checkRequiredCustomFields(present);

    expect(missing).toEqual(["contact.lpmama_location"]);
  });

  it("should return both when none are present", () => {
    const missing = checkRequiredCustomFields(new Set());

    expect(missing).toHaveLength(2);
    expect(missing).toContain("contact.homie_score");
    expect(missing).toContain("contact.lpmama_location");
  });

  it("should accept custom required list", () => {
    const present = new Set(["contact.homie_score"]);
    const missing = checkRequiredCustomFields(present, [
      "contact.homie_score",
      "contact.other_field",
    ]);

    expect(missing).toEqual(["contact.other_field"]);
  });
});

describe("REQUIRED_FIELDS", () => {
  it("should contain 12 fields", () => {
    expect(REQUIRED_FIELDS).toHaveLength(12);
  });

  it("should include homie_score as NUMERICAL", () => {
    const field = REQUIRED_FIELDS.find((f) => f.fieldKey === "homie_score");

    expect(field).toBeDefined();
    expect(field?.dataType).toBe("NUMERICAL");
  });

  it("should have all TEXT fields except homie_score", () => {
    const nonNumerical = REQUIRED_FIELDS.filter(
      (f) => f.fieldKey !== "homie_score",
    );

    nonNumerical.forEach((f) => {
      expect(f.dataType).toBe("TEXT");
    });
  });

  it("should have unique fieldKeys", () => {
    const keys = REQUIRED_FIELDS.map((f) => f.fieldKey);
    const unique = new Set(keys);

    expect(unique.size).toBe(keys.length);
  });
});

describe("DEFAULT_VALUES", () => {
  it("should contain 7 values", () => {
    expect(DEFAULT_VALUES).toHaveLength(7);
  });

  it("should set company_name to Royal LePage", () => {
    const cv = DEFAULT_VALUES.find((v) => v.key === "company_name");

    expect(cv?.value).toBe("Royal LePage");
  });

  it("should set ai_agent_name to Homie", () => {
    const cv = DEFAULT_VALUES.find((v) => v.key === "ai_agent_name");

    expect(cv?.value).toBe("Homie");
  });

  it("should have unique keys", () => {
    const keys = DEFAULT_VALUES.map((v) => v.key);
    const unique = new Set(keys);

    expect(unique.size).toBe(keys.length);
  });
});

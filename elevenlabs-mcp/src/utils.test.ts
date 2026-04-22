import { describe, it, expect } from "vitest";
import {
  mcpSuccess,
  mcpError,
  buildTtsBody,
  buildStreamUrlResponse,
  buildAgentCreateBody,
  buildOutboundCallBody,
  buildCallHistoryUrl,
  formatPhoneE164,
  sanitizeText,
} from "./utils.js";

describe("mcpSuccess", () => {
  it("should wrap data as JSON text content", () => {
    const result = mcpSuccess({ id: "voice-1", name: "Rachel" });

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
    expect(JSON.parse(result.content[0].text)).toEqual({
      id: "voice-1",
      name: "Rachel",
    });
  });

  it("should pretty-print JSON with 2-space indent", () => {
    const result = mcpSuccess({ a: 1 });

    expect(result.content[0].text).toBe(JSON.stringify({ a: 1 }, null, 2));
  });

  it("should handle null data", () => {
    const result = mcpSuccess(null);

    expect(result.content[0].text).toBe("null");
  });

  it("should handle array data", () => {
    const result = mcpSuccess([1, 2, 3]);

    expect(JSON.parse(result.content[0].text)).toEqual([1, 2, 3]);
  });

  it("should not include isError field", () => {
    const result = mcpSuccess({});

    expect("isError" in result).toBe(false);
  });
});

describe("mcpError", () => {
  it("should extract message from Error instance", () => {
    const result = mcpError(new Error("API rate limit exceeded"));

    expect(result.content[0].text).toBe("Error: API rate limit exceeded");
    expect(result.isError).toBe(true);
  });

  it("should stringify non-Error values", () => {
    const result = mcpError("something went wrong");

    expect(result.content[0].text).toBe("Error: something went wrong");
  });

  it("should handle numeric error codes", () => {
    const result = mcpError(404);

    expect(result.content[0].text).toBe("Error: 404");
  });

  it("should set isError to true", () => {
    const result = mcpError(new Error("fail"));

    expect(result.isError).toBe(true);
  });

  it("should wrap message in content array", () => {
    const result = mcpError(new Error("fail"));

    expect(result.content).toHaveLength(1);
    expect(result.content[0].type).toBe("text");
  });
});

describe("buildTtsBody", () => {
  it("should map params to snake_case API body", () => {
    const body = buildTtsBody({
      text: "Hello Royal LePage",
      modelId: "eleven_turbo_v2",
      stability: 0.5,
      similarityBoost: 0.75,
      style: 0,
    });

    expect(body).toEqual({
      text: "Hello Royal LePage",
      model_id: "eleven_turbo_v2",
      voice_settings: {
        stability: 0.5,
        similarity_boost: 0.75,
        style: 0,
      },
    });
  });

  it("should use eleven_multilingual_v2 model when specified", () => {
    const body = buildTtsBody({
      text: "Bonjour",
      modelId: "eleven_multilingual_v2",
      stability: 0.3,
      similarityBoost: 0.9,
      style: 0.1,
    });

    expect(body.model_id).toBe("eleven_multilingual_v2");
  });

  it("should preserve edge-case voice settings at 0 and 1", () => {
    const body = buildTtsBody({
      text: "test",
      modelId: "eleven_monolingual_v1",
      stability: 0,
      similarityBoost: 1,
      style: 1,
    });

    expect(body.voice_settings.stability).toBe(0);
    expect(body.voice_settings.similarity_boost).toBe(1);
    expect(body.voice_settings.style).toBe(1);
  });
});

describe("buildStreamUrlResponse", () => {
  const BASE = "https://api.elevenlabs.io/v1";

  it("should build stream URL from baseUrl and voiceId", () => {
    const res = buildStreamUrlResponse(
      BASE,
      "voice-abc",
      "Hello",
      "eleven_turbo_v2",
    );

    expect(res.streamUrl).toBe(
      "https://api.elevenlabs.io/v1/text-to-speech/voice-abc/stream",
    );
  });

  it("should set method to POST", () => {
    const res = buildStreamUrlResponse(BASE, "v1", "hi", "eleven_turbo_v2");

    expect(res.method).toBe("POST");
  });

  it("should redact api key placeholder in headers", () => {
    const res = buildStreamUrlResponse(BASE, "v1", "hi", "eleven_turbo_v2");

    expect(res.headers["xi-api-key"]).toBe("[YOUR_API_KEY]");
  });

  it("should include text and model_id in body", () => {
    const res = buildStreamUrlResponse(
      BASE,
      "v1",
      "Hello world",
      "eleven_multilingual_v2",
    );

    expect(res.body.text).toBe("Hello world");
    expect(res.body.model_id).toBe("eleven_multilingual_v2");
  });

  it("should include a note field", () => {
    const res = buildStreamUrlResponse(BASE, "v1", "hi", "eleven_turbo_v2");

    expect(typeof res.note).toBe("string");
    expect(res.note.length).toBeGreaterThan(0);
  });
});

describe("buildAgentCreateBody", () => {
  it("should build full agent config body", () => {
    const body = buildAgentCreateBody({
      name: "Homie - Royal LePage AI",
      voiceId: "voice-xyz",
      systemPrompt: "You are Homie, a helpful real estate AI.",
      firstMessage: "Hi, is this a good time?",
      language: "en",
    });

    expect(body.name).toBe("Homie - Royal LePage AI");
    expect(body.conversation_config.agent.prompt.prompt).toBe(
      "You are Homie, a helpful real estate AI.",
    );
    expect(body.conversation_config.agent.first_message).toBe(
      "Hi, is this a good time?",
    );
    expect(body.conversation_config.agent.language).toBe("en");
    expect(body.conversation_config.tts.voice_id).toBe("voice-xyz");
  });

  it("should set first_message to undefined when not provided", () => {
    const body = buildAgentCreateBody({
      name: "Agent",
      voiceId: "v1",
      systemPrompt: "Prompt",
      language: "en",
    });

    expect(body.conversation_config.agent.first_message).toBeUndefined();
  });

  it("should support French language", () => {
    const body = buildAgentCreateBody({
      name: "Agent FR",
      voiceId: "v2",
      systemPrompt: "Bonjour",
      language: "fr",
    });

    expect(body.conversation_config.agent.language).toBe("fr");
  });
});

describe("buildOutboundCallBody", () => {
  it("should build base call body without overrides", () => {
    const body = buildOutboundCallBody({
      agentId: "agent-1",
      toPhone: "+14161234567",
      fromPhone: "+16479876543",
    });

    expect(body.agent_id).toBe("agent-1");
    expect(body.to_number).toBe("+14161234567");
    expect(body.agent_phone_number).toBe("+16479876543");
    expect(body.conversation_initiation_client_data).toBeUndefined();
  });

  it("should include override data when agentOverrides is provided", () => {
    const body = buildOutboundCallBody({
      agentId: "agent-1",
      toPhone: "+14161234567",
      fromPhone: "+16479876543",
      agentOverrides: {
        firstMessage: "Hi John, this is Homie from Royal LePage!",
        systemPrompt: "Focus on downtown condos.",
      },
    });

    const override =
      body.conversation_initiation_client_data?.conversation_config_override
        .agent;
    expect(override?.first_message).toBe(
      "Hi John, this is Homie from Royal LePage!",
    );
    expect(override?.prompt?.prompt).toBe("Focus on downtown condos.");
  });

  it("should omit prompt key when systemPrompt is not in overrides", () => {
    const body = buildOutboundCallBody({
      agentId: "agent-1",
      toPhone: "+14161234567",
      fromPhone: "+16479876543",
      agentOverrides: { firstMessage: "Hello!" },
    });

    const override =
      body.conversation_initiation_client_data?.conversation_config_override
        .agent;
    expect(override?.prompt).toBeUndefined();
  });

  it("should omit conversation_initiation_client_data when overrides is empty object", () => {
    const body = buildOutboundCallBody({
      agentId: "a",
      toPhone: "+1",
      fromPhone: "+1",
      agentOverrides: {},
    });

    expect(body.conversation_initiation_client_data).toBeDefined();
  });
});

describe("buildCallHistoryUrl", () => {
  const BASE = "https://api.elevenlabs.io/v1";

  it("should build url without agentId", () => {
    const url = buildCallHistoryUrl(BASE, 20);

    expect(url).toBe(
      "https://api.elevenlabs.io/v1/convai/conversations?page_size=20",
    );
  });

  it("should include agent_id param when provided", () => {
    const url = buildCallHistoryUrl(BASE, 10, "agent-abc");

    expect(url).toBe(
      "https://api.elevenlabs.io/v1/convai/conversations?agent_id=agent-abc&page_size=10",
    );
  });

  it("should respect custom limit values", () => {
    const url = buildCallHistoryUrl(BASE, 100);

    expect(url).toContain("page_size=100");
  });
});

describe("formatPhoneE164", () => {
  it("should add +1 prefix to 10-digit North American number", () => {
    expect(formatPhoneE164("4161234567")).toBe("+14161234567");
  });

  it("should add + prefix to 11-digit number starting with 1", () => {
    expect(formatPhoneE164("14161234567")).toBe("+14161234567");
  });

  it("should strip dashes, spaces, and parentheses", () => {
    expect(formatPhoneE164("(416) 123-4567")).toBe("+14161234567");
  });

  it("should strip dots", () => {
    expect(formatPhoneE164("416.123.4567")).toBe("+14161234567");
  });

  it("should pass through numbers already in E.164 format", () => {
    expect(formatPhoneE164("+14161234567")).toBe("+14161234567");
  });
});

describe("sanitizeText", () => {
  it("should trim leading and trailing whitespace", () => {
    expect(sanitizeText("  hello  ")).toBe("hello");
  });

  it("should collapse multiple interior spaces to one", () => {
    expect(sanitizeText("hello   world")).toBe("hello world");
  });

  it("should handle newlines as whitespace", () => {
    expect(sanitizeText("hello\n\nworld")).toBe("hello world");
  });

  it("should return empty string unchanged", () => {
    expect(sanitizeText("")).toBe("");
  });

  it("should handle text that needs no changes", () => {
    expect(sanitizeText("Hello Royal LePage")).toBe("Hello Royal LePage");
  });
});

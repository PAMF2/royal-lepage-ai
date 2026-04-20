#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { writeFileSync } from "fs";
import { join } from "path";

// Docs: https://elevenlabs.io/docs/api-reference

const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY;
if (!ELEVEN_API_KEY) {
  console.error(
    "ERROR: ELEVENLABS_API_KEY environment variable is required.\n" +
      "Get your API key at elevenlabs.io → Profile → API Key",
  );
  process.exit(1);
}

const BASE_URL = "https://api.elevenlabs.io/v1";

async function elevenRequest<T = unknown>(
  path: string,
  opts: RequestInit = {},
): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...opts,
    headers: {
      "xi-api-key": ELEVEN_API_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(opts.headers ?? {}),
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`ElevenLabs API ${res.status}: ${text}`);
  }
  const ct = res.headers.get("content-type") ?? "";
  if (ct.includes("application/json")) return res.json() as Promise<T>;
  return res.arrayBuffer() as unknown as Promise<T>;
}

function mcpSuccess(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}

function mcpError(error: unknown) {
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

const server = new McpServer({
  name: "elevenlabs-mcp",
  version: "1.0.0",
});

// ── Voices ────────────────────────────────────────────────────────────────────

server.tool(
  "list_voices",
  "List all available ElevenLabs voices (pre-built and cloned)",
  {},
  async () => {
    try {
      const data = await elevenRequest("/voices");
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_voice",
  "Get details for a specific voice by ID",
  { voiceId: z.string() },
  async ({ voiceId }) => {
    try {
      const data = await elevenRequest(`/voices/${voiceId}`);
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Text-to-Speech ────────────────────────────────────────────────────────────

server.tool(
  "text_to_speech",
  "Convert text to speech audio using a specified voice. Returns the audio saved to a file path.",
  {
    text: z.string().max(5000).describe("Text to convert to speech"),
    voiceId: z.string().describe("ElevenLabs voice ID"),
    outputPath: z
      .string()
      .describe("File path to save the MP3 (e.g. /tmp/message.mp3)"),
    modelId: z
      .enum([
        "eleven_turbo_v2",
        "eleven_multilingual_v2",
        "eleven_monolingual_v1",
      ])
      .default("eleven_turbo_v2")
      .describe(
        "eleven_turbo_v2 = fastest, eleven_multilingual_v2 = best quality",
      ),
    stability: z.number().min(0).max(1).default(0.5),
    similarityBoost: z.number().min(0).max(1).default(0.75),
    style: z
      .number()
      .min(0)
      .max(1)
      .default(0)
      .describe("Style exaggeration (0 = neutral)"),
  },
  async ({
    text,
    voiceId,
    outputPath,
    modelId,
    stability,
    similarityBoost,
    style,
  }) => {
    try {
      const buffer = await elevenRequest<ArrayBuffer>(
        `/text-to-speech/${voiceId}`,
        {
          method: "POST",
          headers: { Accept: "audio/mpeg" },
          body: JSON.stringify({
            text,
            model_id: modelId,
            voice_settings: {
              stability,
              similarity_boost: similarityBoost,
              style,
            },
          }),
        },
      );
      writeFileSync(outputPath, Buffer.from(buffer));
      return mcpSuccess({
        saved: outputPath,
        bytes: buffer.byteLength,
        voiceId,
        model: modelId,
      });
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "text_to_speech_stream_url",
  "Generate a streaming TTS URL for playback in real-time (returns a stream endpoint)",
  {
    text: z.string().max(5000),
    voiceId: z.string(),
    modelId: z
      .enum(["eleven_turbo_v2", "eleven_multilingual_v2"])
      .default("eleven_turbo_v2"),
  },
  async ({ text, voiceId, modelId }) => {
    try {
      const streamUrl = `${BASE_URL}/text-to-speech/${voiceId}/stream`;
      return mcpSuccess({
        streamUrl,
        method: "POST",
        headers: {
          "xi-api-key": "[YOUR_API_KEY]",
          "Content-Type": "application/json",
        },
        body: { text, model_id: modelId },
        note: "POST to streamUrl with your API key to receive chunked MP3 audio",
      });
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Voice Cloning ─────────────────────────────────────────────────────────────

server.tool(
  "clone_voice",
  "Clone an agent's voice from audio samples (requires at least 1 minute of clean audio)",
  {
    name: z.string().describe("Display name for the cloned voice"),
    description: z.string().optional(),
    audioFilePaths: z
      .array(z.string())
      .min(1)
      .max(25)
      .describe("Local file paths to audio samples (MP3 or WAV, each < 10MB)"),
    removeBackgroundNoise: z.boolean().default(true),
  },
  async ({ name, description, audioFilePaths, removeBackgroundNoise }) => {
    try {
      const formData = new FormData();
      formData.append("name", name);
      if (description) formData.append("description", description);
      formData.append("remove_background_noise", String(removeBackgroundNoise));

      for (const filePath of audioFilePaths) {
        const { readFileSync } = await import("fs");
        const buf = readFileSync(filePath);
        const blob = new Blob([buf], { type: "audio/mpeg" });
        formData.append(
          "files",
          blob,
          filePath.split("/").pop() ?? "sample.mp3",
        );
      }

      const res = await fetch(`${BASE_URL}/voices/add`, {
        method: "POST",
        headers: { "xi-api-key": ELEVEN_API_KEY! },
        body: formData,
      });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(`ElevenLabs API ${res.status}: ${text}`);
      }
      const data = await res.json();
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Conversational AI ─────────────────────────────────────────────────────────

server.tool(
  "list_agents",
  "List configured ElevenLabs Conversational AI agents",
  {},
  async () => {
    try {
      const data = await elevenRequest("/convai/agents");
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_agent",
  "Get details for a Conversational AI agent",
  { agentId: z.string() },
  async ({ agentId }) => {
    try {
      const data = await elevenRequest(`/convai/agents/${agentId}`);
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "create_agent",
  "Create a new Conversational AI agent (e.g. Homie the AI ISA for Royal LePage)",
  {
    name: z.string().describe("Agent name (e.g. 'Homie - Royal LePage AI')"),
    voiceId: z.string().describe("ElevenLabs voice ID for the agent"),
    systemPrompt: z.string().describe("Agent persona and instructions"),
    firstMessage: z
      .string()
      .optional()
      .describe("Opening line when the agent calls"),
    language: z.string().default("en").describe("ISO language code"),
  },
  async ({ name, voiceId, systemPrompt, firstMessage, language }) => {
    try {
      const data = await elevenRequest("/convai/agents/create", {
        method: "POST",
        body: JSON.stringify({
          name,
          conversation_config: {
            agent: {
              prompt: { prompt: systemPrompt },
              first_message: firstMessage,
              language,
            },
            tts: { voice_id: voiceId },
          },
        }),
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "initiate_outbound_call",
  "Trigger an outbound AI phone call to a lead using ElevenLabs Conversational AI",
  {
    agentId: z.string().describe("ElevenLabs agent ID to use for the call"),
    toPhone: z
      .string()
      .describe("Recipient phone number in E.164 format (+1XXXXXXXXXX)"),
    fromPhone: z
      .string()
      .describe("Your Twilio/GHL phone number in E.164 format"),
    agentOverrides: z
      .object({
        firstMessage: z.string().optional(),
        systemPrompt: z.string().optional(),
      })
      .optional()
      .describe("Per-call overrides to personalize the agent prompt"),
  },
  async ({ agentId, toPhone, fromPhone, agentOverrides }) => {
    try {
      const data = await elevenRequest("/convai/twilio/outbound-call", {
        method: "POST",
        body: JSON.stringify({
          agent_id: agentId,
          agent_phone_number: fromPhone,
          to_number: toPhone,
          conversation_initiation_client_data: agentOverrides
            ? {
                conversation_config_override: {
                  agent: {
                    first_message: agentOverrides.firstMessage,
                    prompt: agentOverrides.systemPrompt
                      ? { prompt: agentOverrides.systemPrompt }
                      : undefined,
                  },
                },
              }
            : undefined,
        }),
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_call_transcript",
  "Get the transcript and recording of a completed AI phone call",
  { conversationId: z.string() },
  async ({ conversationId }) => {
    try {
      const data = await elevenRequest(
        `/convai/conversations/${conversationId}`,
      );
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "list_call_history",
  "List recent AI call history for your conversational agents",
  {
    agentId: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
  },
  async ({ agentId, limit }) => {
    try {
      const url = agentId
        ? `/convai/conversations?agent_id=${agentId}&page_size=${limit}`
        : `/convai/conversations?page_size=${limit}`;
      const data = await elevenRequest(url);
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Usage / Billing ───────────────────────────────────────────────────────────

server.tool(
  "get_usage",
  "Check current month character usage and remaining quota",
  {},
  async () => {
    try {
      const data = await elevenRequest("/user/subscription");
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

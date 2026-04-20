import type Anthropic from "@anthropic-ai/sdk";

const ELEVEN_API_KEY = process.env.ELEVENLABS_API_KEY!;
const BASE = "https://api.elevenlabs.io/v1";

async function eleven(method: string, path: string, body?: unknown) {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      "xi-api-key": ELEVEN_API_KEY,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${await res.text()}`);
  return res.json();
}

export const elevenTools: Anthropic.Tool[] = [
  {
    name: "eleven_outbound_call",
    description:
      "Trigger an outbound AI voice call to a lead using ElevenLabs Conversational AI",
    input_schema: {
      type: "object" as const,
      properties: {
        agentId: { type: "string" },
        toPhone: { type: "string", description: "E.164 format: +1XXXXXXXXXX" },
        fromPhone: {
          type: "string",
          description: "Your Twilio number in E.164 format",
        },
        firstMessage: {
          type: "string",
          description: "Opening line personalized for this lead",
        },
      },
      required: ["agentId", "toPhone", "fromPhone"],
    },
  },
  {
    name: "eleven_get_transcript",
    description: "Get the transcript and outcome of a completed AI call",
    input_schema: {
      type: "object" as const,
      properties: { conversationId: { type: "string" } },
      required: ["conversationId"],
    },
  },
];

export async function handleElevenTool(
  name: string,
  input: Record<string, unknown>,
) {
  switch (name) {
    case "eleven_outbound_call":
      return eleven("POST", "/convai/twilio/outbound-call", {
        agent_id: input.agentId,
        agent_phone_number: input.fromPhone,
        to_number: input.toPhone,
        conversation_initiation_client_data: input.firstMessage
          ? {
              conversation_config_override: {
                agent: { first_message: input.firstMessage },
              },
            }
          : undefined,
      });
    case "eleven_get_transcript":
      return eleven("GET", `/convai/conversations/${input.conversationId}`);
    default:
      throw new Error(`Unknown ElevenLabs tool: ${name}`);
  }
}

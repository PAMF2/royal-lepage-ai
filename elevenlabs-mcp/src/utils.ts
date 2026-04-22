export type McpContent = { type: "text"; text: string };

export type McpSuccessResponse = {
  content: McpContent[];
};

export type McpErrorResponse = {
  content: McpContent[];
  isError: true;
};

export function mcpSuccess(data: unknown): McpSuccessResponse {
  return {
    content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
  };
}

export function mcpError(error: unknown): McpErrorResponse {
  return {
    content: [
      {
        type: "text",
        text: `Error: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
    isError: true,
  };
}

export type TtsModel =
  | "eleven_turbo_v2"
  | "eleven_multilingual_v2"
  | "eleven_monolingual_v1";

export type VoiceSettings = {
  stability: number;
  similarity_boost: number;
  style: number;
};

export type TtsRequestBody = {
  text: string;
  model_id: TtsModel;
  voice_settings: VoiceSettings;
};

export function buildTtsBody(params: {
  text: string;
  modelId: TtsModel;
  stability: number;
  similarityBoost: number;
  style: number;
}): TtsRequestBody {
  return {
    text: params.text,
    model_id: params.modelId,
    voice_settings: {
      stability: params.stability,
      similarity_boost: params.similarityBoost,
      style: params.style,
    },
  };
}

export type StreamUrlResponse = {
  streamUrl: string;
  method: "POST";
  headers: { "xi-api-key": string; "Content-Type": string };
  body: { text: string; model_id: string };
  note: string;
};

export function buildStreamUrlResponse(
  baseUrl: string,
  voiceId: string,
  text: string,
  modelId: string,
): StreamUrlResponse {
  return {
    streamUrl: `${baseUrl}/text-to-speech/${voiceId}/stream`,
    method: "POST",
    headers: {
      "xi-api-key": "[YOUR_API_KEY]",
      "Content-Type": "application/json",
    },
    body: { text, model_id: modelId },
    note: "POST to streamUrl with your API key to receive chunked MP3 audio",
  };
}

export type AgentCreateBody = {
  name: string;
  conversation_config: {
    agent: {
      prompt: { prompt: string };
      first_message: string | undefined;
      language: string;
    };
    tts: { voice_id: string };
  };
};

export function buildAgentCreateBody(params: {
  name: string;
  voiceId: string;
  systemPrompt: string;
  firstMessage?: string;
  language: string;
}): AgentCreateBody {
  return {
    name: params.name,
    conversation_config: {
      agent: {
        prompt: { prompt: params.systemPrompt },
        first_message: params.firstMessage,
        language: params.language,
      },
      tts: { voice_id: params.voiceId },
    },
  };
}

export type OutboundCallBody = {
  agent_id: string;
  agent_phone_number: string;
  to_number: string;
  conversation_initiation_client_data?: {
    conversation_config_override: {
      agent: {
        first_message?: string;
        prompt?: { prompt: string } | undefined;
      };
    };
  };
};

export function buildOutboundCallBody(params: {
  agentId: string;
  toPhone: string;
  fromPhone: string;
  agentOverrides?: { firstMessage?: string; systemPrompt?: string };
}): OutboundCallBody {
  return {
    agent_id: params.agentId,
    agent_phone_number: params.fromPhone,
    to_number: params.toPhone,
    conversation_initiation_client_data: params.agentOverrides
      ? {
          conversation_config_override: {
            agent: {
              first_message: params.agentOverrides.firstMessage,
              prompt: params.agentOverrides.systemPrompt
                ? { prompt: params.agentOverrides.systemPrompt }
                : undefined,
            },
          },
        }
      : undefined,
  };
}

export function buildCallHistoryUrl(
  baseUrl: string,
  limit: number,
  agentId?: string,
): string {
  return agentId
    ? `${baseUrl}/convai/conversations?agent_id=${agentId}&page_size=${limit}`
    : `${baseUrl}/convai/conversations?page_size=${limit}`;
}

export function formatPhoneE164(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10) return `+1${digits}`;
  if (digits.length === 11 && digits.startsWith("1")) return `+${digits}`;
  return `+${digits}`;
}

export function sanitizeText(text: string): string {
  return text.trim().replace(/\s+/g, " ");
}

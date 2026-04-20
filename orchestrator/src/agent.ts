import Anthropic from "@anthropic-ai/sdk";
import { ghlTools, handleGhlTool } from "./tools/ghl.js";
import { idxTools, handleIdxTool } from "./tools/idx.js";
import { elevenTools, handleElevenTool } from "./tools/eleven.js";

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const AGENT_LANGUAGE = process.env.AGENT_LANGUAGE ?? "bilingual";

const LANGUAGE_RULE =
  AGENT_LANGUAGE === "fr"
    ? "Always respond in French only."
    : AGENT_LANGUAGE === "en"
      ? "Always respond in English only."
      : "Detect the language of the lead's message and respond in the same language. Royal LePage serves both English and French-speaking Canadians. If unsure, default to English.";

const SYSTEM_PROMPT = `You are Homie, an AI-powered Inside Sales Agent for Royal LePage.

Your job is to contact, qualify, and convert real estate leads so human agents only spend time with ready buyers and sellers.

LANGUAGE:
${LANGUAGE_RULE}

QUALIFICATION FRAMEWORK (LPMAMA):
- Location: What area/neighborhoods are they targeting?
- Price: What is their budget range?
- Motivation: Why are they moving? (job relocation, upsizing, investment)
- Agent: Are they already working with an agent?
- Mortgage: Are they pre-approved? Cash buyer?
- Appointment: Can they meet this week?

A lead is QUALIFIED when you have at least 4 of 6 answers.

PIPELINE STAGES (advance as appropriate):
New Lead → Attempted Contact → Contacted → Qualified → Appointment Set → Handed Off → Nurture

RULES:
- Always respond to new leads within 60 seconds via SMS
- SMS messages must be under 160 characters
- Be warm and helpful, never pushy
- Use IDX tools to make conversations property-aware
- Log every action with add_note
- If asked directly, acknowledge you are an AI assistant
- All prices in CAD`;

const ALL_TOOLS = [...ghlTools, ...idxTools, ...elevenTools];

type AgentInput =
  | {
      trigger: "new_lead";
      contactId: string;
      contactName: string;
      contactPhone?: string;
      contactEmail?: string;
      source: string;
    }
  | {
      trigger: "incoming_message";
      contactId: string;
      message: string;
      conversationId?: string;
    };

export async function runAgent(input: AgentInput) {
  const userMessage =
    input.trigger === "new_lead"
      ? `New lead received. Contact ID: ${input.contactId}. Name: ${(input as { contactName: string }).contactName}. Source: ${(input as { source: string }).source}. Phone: ${(input as { contactPhone?: string }).contactPhone ?? "unknown"}. Start the qualification workflow: check if contact exists, send first SMS, log the action, and advance the pipeline to Attempted Contact.`
      : `Incoming SMS from contact ${input.contactId}: "${(input as { message: string }).message}". Read their conversation history, assess their qualification level, and respond appropriately. Advance the pipeline stage if warranted. If they are qualified, book an appointment.`;

  const messages: Anthropic.MessageParam[] = [
    { role: "user", content: userMessage },
  ];

  for (let i = 0; i < 10; i++) {
    const response = await anthropic.messages.create({
      model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
      max_tokens: 4096,
      system: SYSTEM_PROMPT,
      tools: ALL_TOOLS as Anthropic.Tool[],
      messages,
    });

    messages.push({ role: "assistant", content: response.content });

    if (response.stop_reason === "end_turn") break;

    if (response.stop_reason === "tool_use") {
      const toolResults: Anthropic.ToolResultBlockParam[] = [];

      for (const block of response.content) {
        if (block.type !== "tool_use") continue;

        let result: unknown;
        try {
          if (block.name.startsWith("ghl_"))
            result = await handleGhlTool(
              block.name,
              block.input as Record<string, unknown>,
            );
          else if (block.name.startsWith("idx_"))
            result = await handleIdxTool(
              block.name,
              block.input as Record<string, unknown>,
            );
          else if (block.name.startsWith("eleven_"))
            result = await handleElevenTool(
              block.name,
              block.input as Record<string, unknown>,
            );
          else result = { error: `Unknown tool: ${block.name}` };
        } catch (e) {
          result = { error: e instanceof Error ? e.message : String(e) };
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: JSON.stringify(result),
        });
      }

      messages.push({ role: "user", content: toolResults });
    }
  }
}

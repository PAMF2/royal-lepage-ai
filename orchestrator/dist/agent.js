import Anthropic from "@anthropic-ai/sdk";
import { ghlTools, handleGhlTool } from "./tools/ghl.js";
import { idxTools, handleIdxTool } from "./tools/idx.js";
import { elevenTools, handleElevenTool } from "./tools/eleven.js";
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SYSTEM_PROMPT = `You are Homie, an AI-powered Inside Sales Agent for Royal LePage.

Your job is to contact, qualify, and convert real estate leads so human agents only spend time with ready buyers and sellers.

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
- If asked directly, acknowledge you are an AI assistant`;
const ALL_TOOLS = [...ghlTools, ...idxTools, ...elevenTools];
export async function runAgent(input) {
    const userMessage = input.trigger === "new_lead"
        ? `New lead received. Contact ID: ${input.contactId}. Name: ${input.contactName}. Source: ${input.source}. Phone: ${input.contactPhone ?? "unknown"}. Start the qualification workflow: check if contact exists, send first SMS, log the action, and advance the pipeline to Attempted Contact.`
        : `Incoming SMS from contact ${input.contactId}: "${input.message}". Read their conversation history, assess their qualification level, and respond appropriately. Advance the pipeline stage if warranted. If they are qualified, book an appointment.`;
    const messages = [
        { role: "user", content: userMessage },
    ];
    for (let i = 0; i < 10; i++) {
        const response = await anthropic.messages.create({
            model: process.env.ANTHROPIC_MODEL ?? "claude-opus-4-7",
            max_tokens: 4096,
            system: SYSTEM_PROMPT,
            tools: ALL_TOOLS,
            messages,
        });
        messages.push({ role: "assistant", content: response.content });
        if (response.stop_reason === "end_turn")
            break;
        if (response.stop_reason === "tool_use") {
            const toolResults = [];
            for (const block of response.content) {
                if (block.type !== "tool_use")
                    continue;
                let result;
                try {
                    if (block.name.startsWith("ghl_"))
                        result = await handleGhlTool(block.name, block.input);
                    else if (block.name.startsWith("idx_"))
                        result = await handleIdxTool(block.name, block.input);
                    else if (block.name.startsWith("eleven_"))
                        result = await handleElevenTool(block.name, block.input);
                    else
                        result = { error: `Unknown tool: ${block.name}` };
                }
                catch (e) {
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

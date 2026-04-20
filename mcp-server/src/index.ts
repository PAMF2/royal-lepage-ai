#!/usr/bin/env node
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Docs: https://highlevel.stoplight.io/docs/integrations

const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;

if (!GHL_API_KEY) {
  console.error(
    "ERROR: GHL_API_KEY environment variable is required.\n" +
      "Get your API key from GoHighLevel → Settings → API Keys",
  );
  process.exit(1);
}

if (!GHL_LOCATION_ID) {
  console.error(
    "ERROR: GHL_LOCATION_ID environment variable is required.\n" +
      "Found in GoHighLevel → Settings → Business Info → Location ID",
  );
  process.exit(1);
}

const BASE_URL = "https://services.leadconnectorhq.com";

interface GhlRequestOptions {
  method?: string;
  path: string;
  params?: Record<string, string | number | boolean | undefined>;
  body?: unknown;
  version?: "2021-07-28" | "2021-04-15";
}

async function ghlRequest<T = unknown>(opts: GhlRequestOptions): Promise<T> {
  const url = new URL(`${BASE_URL}${opts.path}`);
  if (opts.params) {
    for (const [k, v] of Object.entries(opts.params)) {
      if (v !== undefined) url.searchParams.set(k, String(v));
    }
  }

  const res = await fetch(url.toString(), {
    method: opts.method ?? "GET",
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      Version: opts.version ?? "2021-07-28",
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GHL API ${res.status}: ${text}`);
  }

  return res.json() as Promise<T>;
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
  name: "gohighlevel-mcp",
  version: "1.0.0",
});

// ── Contacts ─────────────────────────────────────────────────────────────────

server.tool(
  "search_contacts",
  "Search contacts by name, email, phone, or tag in GoHighLevel CRM",
  {
    query: z.string().describe("Search term (name, email, or phone)"),
    limit: z.number().min(1).max(100).default(20).describe("Max results"),
  },
  async ({ query, limit }) => {
    try {
      const data = await ghlRequest({
        path: "/contacts/search",
        method: "POST",
        body: {
          locationId: GHL_LOCATION_ID,
          searchTerm: query,
          limit,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_contact",
  "Get full contact details by contact ID",
  { contactId: z.string() },
  async ({ contactId }) => {
    try {
      const data = await ghlRequest({ path: `/contacts/${contactId}` });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "create_contact",
  "Create a new lead/contact in GoHighLevel",
  {
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    source: z
      .string()
      .optional()
      .describe("Lead source (e.g. 'IDX', 'Facebook', 'Referral')"),
    tags: z.array(z.string()).optional().describe("Tags to apply"),
    customFields: z
      .record(z.string())
      .optional()
      .describe("Custom field key-value pairs"),
    notes: z.string().optional(),
  },
  async ({
    firstName,
    lastName,
    email,
    phone,
    source,
    tags,
    customFields,
    notes,
  }) => {
    try {
      const data = await ghlRequest({
        path: "/contacts/",
        method: "POST",
        body: {
          locationId: GHL_LOCATION_ID,
          firstName,
          lastName,
          email,
          phone,
          source,
          tags,
          customField: customFields
            ? Object.entries(customFields).map(([id, value]) => ({ id, value }))
            : undefined,
          notes,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "update_contact",
  "Update an existing contact's information or tags",
  {
    contactId: z.string(),
    firstName: z.string().optional(),
    lastName: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    tags: z.array(z.string()).optional(),
    customFields: z.record(z.string()).optional(),
  },
  async ({
    contactId,
    firstName,
    lastName,
    email,
    phone,
    tags,
    customFields,
  }) => {
    try {
      const data = await ghlRequest({
        path: `/contacts/${contactId}`,
        method: "PUT",
        body: {
          firstName,
          lastName,
          email,
          phone,
          tags,
          customField: customFields
            ? Object.entries(customFields).map(([id, value]) => ({ id, value }))
            : undefined,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "add_contact_tags",
  "Add tags to a contact (e.g. 'hot-lead', 'appointment-set', 'buyer', 'seller')",
  {
    contactId: z.string(),
    tags: z.array(z.string()).describe("Tags to add"),
  },
  async ({ contactId, tags }) => {
    try {
      const data = await ghlRequest({
        path: `/contacts/${contactId}/tags`,
        method: "POST",
        body: { tags },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Conversations & Messages ──────────────────────────────────────────────────

server.tool(
  "get_conversations",
  "Get recent conversations for a contact",
  {
    contactId: z.string().optional(),
    limit: z.number().min(1).max(50).default(20),
  },
  async ({ contactId, limit }) => {
    try {
      const data = await ghlRequest({
        path: "/conversations/search",
        params: { locationId: GHL_LOCATION_ID!, contactId, limit },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "get_conversation_messages",
  "Get all messages in a conversation thread",
  {
    conversationId: z.string(),
    limit: z.number().min(1).max(100).default(50),
  },
  async ({ conversationId, limit }) => {
    try {
      const data = await ghlRequest({
        path: `/conversations/${conversationId}/messages`,
        params: { limit },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "send_sms",
  "Send an SMS message to a contact (lead follow-up, appointment reminders, etc.)",
  {
    contactId: z.string(),
    message: z.string().max(1600).describe("SMS body text"),
  },
  async ({ contactId, message }) => {
    try {
      const contact = await ghlRequest<{ contact: { phone?: string } }>({
        path: `/contacts/${contactId}`,
      });
      if (!contact.contact?.phone) {
        throw new Error("Contact has no phone number on file");
      }
      const data = await ghlRequest({
        path: "/conversations/messages",
        method: "POST",
        body: {
          type: "SMS",
          contactId,
          locationId: GHL_LOCATION_ID,
          message,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "send_email",
  "Send an email to a contact",
  {
    contactId: z.string(),
    subject: z.string(),
    body: z.string().describe("HTML or plain text email body"),
    fromName: z.string().optional().describe("Sender display name"),
  },
  async ({ contactId, subject, body, fromName }) => {
    try {
      const data = await ghlRequest({
        path: "/conversations/messages",
        method: "POST",
        body: {
          type: "Email",
          contactId,
          locationId: GHL_LOCATION_ID,
          subject,
          html: body,
          fromName,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Opportunities / Pipeline ──────────────────────────────────────────────────

server.tool(
  "list_opportunities",
  "List pipeline opportunities (deals) for a contact or pipeline stage",
  {
    contactId: z.string().optional(),
    pipelineId: z.string().optional(),
    stageId: z.string().optional(),
    limit: z.number().min(1).max(100).default(20),
  },
  async ({ contactId, pipelineId, stageId, limit }) => {
    try {
      const data = await ghlRequest({
        path: "/opportunities/search",
        params: {
          location_id: GHL_LOCATION_ID!,
          contact_id: contactId,
          pipeline_id: pipelineId,
          pipeline_stage_id: stageId,
          limit,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "create_opportunity",
  "Create a new deal/opportunity in a pipeline (e.g. when a lead is qualified)",
  {
    contactId: z.string(),
    pipelineId: z.string(),
    stageId: z
      .string()
      .describe("Pipeline stage ID to place the opportunity in"),
    name: z.string().describe("Opportunity title"),
    monetaryValue: z.number().optional().describe("Deal value in dollars"),
    status: z.enum(["open", "won", "lost", "abandoned"]).default("open"),
  },
  async ({ contactId, pipelineId, stageId, name, monetaryValue, status }) => {
    try {
      const data = await ghlRequest({
        path: "/opportunities/",
        method: "POST",
        body: {
          locationId: GHL_LOCATION_ID,
          contactId,
          pipelineId,
          pipelineStageId: stageId,
          name,
          monetaryValue,
          status,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "update_opportunity_stage",
  "Move a deal to a different pipeline stage",
  {
    opportunityId: z.string(),
    stageId: z.string().describe("New pipeline stage ID"),
    status: z.enum(["open", "won", "lost", "abandoned"]).optional(),
  },
  async ({ opportunityId, stageId, status }) => {
    try {
      const data = await ghlRequest({
        path: `/opportunities/${opportunityId}`,
        method: "PUT",
        body: { pipelineStageId: stageId, status },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Appointments / Calendar ───────────────────────────────────────────────────

server.tool(
  "list_appointments",
  "List upcoming appointments for a contact or calendar",
  {
    contactId: z.string().optional(),
    calendarId: z.string().optional(),
    startDate: z.string().optional().describe("ISO date string"),
    endDate: z.string().optional().describe("ISO date string"),
  },
  async ({ contactId, calendarId, startDate, endDate }) => {
    try {
      const data = await ghlRequest({
        path: "/appointments/",
        params: {
          locationId: GHL_LOCATION_ID!,
          contactId,
          calendarId,
          startDate,
          endDate,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "book_appointment",
  "Book a showing or consultation appointment for a lead",
  {
    contactId: z.string(),
    calendarId: z.string().describe("Calendar ID from GoHighLevel"),
    startTime: z
      .string()
      .describe("ISO datetime (e.g. 2026-05-01T14:00:00-05:00)"),
    endTime: z.string().describe("ISO datetime"),
    title: z.string().optional().describe("Appointment title"),
    notes: z.string().optional(),
  },
  async ({ contactId, calendarId, startTime, endTime, title, notes }) => {
    try {
      const data = await ghlRequest({
        path: "/appointments/",
        method: "POST",
        body: {
          locationId: GHL_LOCATION_ID,
          contactId,
          calendarId,
          startTime,
          endTime,
          title: title ?? "Consultation",
          notes,
        },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Notes ─────────────────────────────────────────────────────────────────────

server.tool(
  "add_note",
  "Add a note to a contact record (log calls, lead qualification details, etc.)",
  {
    contactId: z.string(),
    body: z.string().describe("Note content"),
    userId: z.string().optional().describe("GHL user ID to assign note to"),
  },
  async ({ contactId, body, userId }) => {
    try {
      const data = await ghlRequest({
        path: `/contacts/${contactId}/notes`,
        method: "POST",
        body: { body, userId },
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Campaigns / Workflows ─────────────────────────────────────────────────────

server.tool(
  "add_contact_to_campaign",
  "Enroll a contact in a GHL drip campaign or automation workflow",
  {
    contactId: z.string(),
    campaignId: z.string().describe("Campaign ID from GoHighLevel"),
  },
  async ({ contactId, campaignId }) => {
    try {
      const data = await ghlRequest({
        path: `/contacts/${contactId}/campaigns/${campaignId}`,
        method: "POST",
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

server.tool(
  "remove_contact_from_campaign",
  "Remove a contact from a GHL campaign",
  {
    contactId: z.string(),
    campaignId: z.string(),
  },
  async ({ contactId, campaignId }) => {
    try {
      const data = await ghlRequest({
        path: `/contacts/${contactId}/campaigns/${campaignId}`,
        method: "DELETE",
      });
      return mcpSuccess(data);
    } catch (e) {
      return mcpError(e);
    }
  },
);

// ── Prompts ───────────────────────────────────────────────────────────────────

server.prompt(
  "qualify_lead",
  "Generate a lead qualification script for a new real estate prospect",
  {
    contactName: z.string(),
    source: z.string().describe("Where the lead came from"),
    propertyInterest: z.string().optional(),
  },
  ({ contactName, source, propertyInterest }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `You are Homie, an AI-powered ISA (Inside Sales Agent) for Royal LePage.
Write a personalized outreach message for ${contactName} who came from ${source}${propertyInterest ? ` and is interested in ${propertyInterest}` : ""}.
The goal is to qualify their timeline, budget, and motivation, and book a call with their assigned agent.
Keep it conversational, friendly, and under 160 characters if sending as SMS.`,
        },
      },
    ],
  }),
);

server.prompt(
  "follow_up_sequence",
  "Generate a multi-touch follow-up sequence for a stale lead",
  {
    contactName: z.string(),
    daysSinceLastContact: z.number(),
    lastInteractionSummary: z.string(),
  },
  ({ contactName, daysSinceLastContact, lastInteractionSummary }) => ({
    messages: [
      {
        role: "user" as const,
        content: {
          type: "text" as const,
          text: `Generate a 3-message re-engagement sequence (Day 1 SMS, Day 3 Email, Day 7 SMS) for ${contactName}.
It has been ${daysSinceLastContact} days since last contact. Last interaction: ${lastInteractionSummary}.
Write as Homie, Royal LePage's AI assistant. Be helpful, not pushy.`,
        },
      },
    ],
  }),
);

const transport = new StdioServerTransport();
await server.connect(transport);

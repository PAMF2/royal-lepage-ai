const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const BASE = "https://services.leadconnectorhq.com";
async function ghl(method, path, body, params) {
    const url = new URL(`${BASE}${path}`);
    if (params)
        Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
    const res = await fetch(url.toString(), {
        method,
        headers: {
            Authorization: `Bearer ${GHL_API_KEY}`,
            "Content-Type": "application/json",
            Version: "2021-07-28",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok)
        throw new Error(`GHL ${res.status}: ${await res.text()}`);
    return res.json();
}
export const ghlTools = [
    {
        name: "ghl_search_contacts",
        description: "Search contacts in GoHighLevel CRM",
        input_schema: {
            type: "object",
            properties: { query: { type: "string" }, limit: { type: "number" } },
            required: ["query"],
        },
    },
    {
        name: "ghl_get_contact",
        description: "Get full contact details by ID",
        input_schema: {
            type: "object",
            properties: { contactId: { type: "string" } },
            required: ["contactId"],
        },
    },
    {
        name: "ghl_send_sms",
        description: "Send an SMS to a contact (max 160 chars for first touch)",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string" },
                message: { type: "string" },
            },
            required: ["contactId", "message"],
        },
    },
    {
        name: "ghl_send_email",
        description: "Send an email to a contact",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string" },
                subject: { type: "string" },
                body: { type: "string" },
            },
            required: ["contactId", "subject", "body"],
        },
    },
    {
        name: "ghl_get_conversation",
        description: "Get full conversation history for a contact",
        input_schema: {
            type: "object",
            properties: { contactId: { type: "string" } },
            required: ["contactId"],
        },
    },
    {
        name: "ghl_add_note",
        description: "Add a note to a contact record",
        input_schema: {
            type: "object",
            properties: { contactId: { type: "string" }, body: { type: "string" } },
            required: ["contactId", "body"],
        },
    },
    {
        name: "ghl_update_pipeline_stage",
        description: "Move a contact's opportunity to a new pipeline stage",
        input_schema: {
            type: "object",
            properties: {
                opportunityId: { type: "string" },
                stageId: { type: "string" },
            },
            required: ["opportunityId", "stageId"],
        },
    },
    {
        name: "ghl_create_opportunity",
        description: "Create a pipeline opportunity for a contact",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string" },
                pipelineId: { type: "string" },
                stageId: { type: "string" },
                name: { type: "string" },
            },
            required: ["contactId", "pipelineId", "stageId", "name"],
        },
    },
    {
        name: "ghl_book_appointment",
        description: "Book a showing or consultation appointment",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string" },
                calendarId: { type: "string" },
                startTime: { type: "string" },
                endTime: { type: "string" },
                title: { type: "string" },
            },
            required: ["contactId", "calendarId", "startTime", "endTime"],
        },
    },
    {
        name: "ghl_add_tags",
        description: "Add tags to a contact (e.g. hot-lead, pre-approved, buyer)",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string" },
                tags: { type: "array", items: { type: "string" } },
            },
            required: ["contactId", "tags"],
        },
    },
    {
        name: "ghl_enroll_campaign",
        description: "Enroll a contact in a GHL drip campaign",
        input_schema: {
            type: "object",
            properties: {
                contactId: { type: "string" },
                campaignId: { type: "string" },
            },
            required: ["contactId", "campaignId"],
        },
    },
];
export async function handleGhlTool(name, input) {
    switch (name) {
        case "ghl_search_contacts":
            return ghl("POST", "/contacts/search", {
                locationId: GHL_LOCATION_ID,
                searchTerm: input.query,
                limit: input.limit ?? 10,
            });
        case "ghl_get_contact":
            return ghl("GET", `/contacts/${input.contactId}`);
        case "ghl_send_sms":
            return ghl("POST", "/conversations/messages", {
                type: "SMS",
                contactId: input.contactId,
                locationId: GHL_LOCATION_ID,
                message: input.message,
            });
        case "ghl_send_email":
            return ghl("POST", "/conversations/messages", {
                type: "Email",
                contactId: input.contactId,
                locationId: GHL_LOCATION_ID,
                subject: input.subject,
                html: input.body,
            });
        case "ghl_get_conversation":
            return ghl("GET", "/conversations/search", undefined, {
                locationId: GHL_LOCATION_ID,
                contactId: input.contactId,
            });
        case "ghl_add_note":
            return ghl("POST", `/contacts/${input.contactId}/notes`, {
                body: input.body,
            });
        case "ghl_update_pipeline_stage":
            return ghl("PUT", `/opportunities/${input.opportunityId}`, {
                pipelineStageId: input.stageId,
            });
        case "ghl_create_opportunity":
            return ghl("POST", "/opportunities/", {
                locationId: GHL_LOCATION_ID,
                contactId: input.contactId,
                pipelineId: input.pipelineId,
                pipelineStageId: input.stageId,
                name: input.name,
                status: "open",
            });
        case "ghl_book_appointment":
            return ghl("POST", "/appointments/", {
                locationId: GHL_LOCATION_ID,
                contactId: input.contactId,
                calendarId: input.calendarId,
                startTime: input.startTime,
                endTime: input.endTime,
                title: input.title ?? "Consultation",
            });
        case "ghl_add_tags":
            return ghl("POST", `/contacts/${input.contactId}/tags`, {
                tags: input.tags,
            });
        case "ghl_enroll_campaign":
            return ghl("POST", `/contacts/${input.contactId}/campaigns/${input.campaignId}`);
        default:
            throw new Error(`Unknown GHL tool: ${name}`);
    }
}

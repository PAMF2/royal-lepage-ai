#!/usr/bin/env node
/**
 * Showings MCP — manages property showing requests
 * Supports ShowingTime API (US) and direct GHL calendar booking (fallback)
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
const SHOWINGTIME_API_KEY = process.env.SHOWINGTIME_API_KEY;
const GHL_API_KEY = process.env.GHL_API_KEY;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID;
const GHL_CALENDAR_ID = process.env.GHL_CALENDAR_ID;
const USE_SHOWINGTIME = Boolean(SHOWINGTIME_API_KEY);
async function ghl(method, path, body) {
    const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
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
async function showingTimeRequest(method, path, body) {
    const res = await fetch(`https://api.showingtime.com/v1${path}`, {
        method,
        headers: {
            Authorization: `Bearer ${SHOWINGTIME_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok)
        throw new Error(`ShowingTime ${res.status}: ${await res.text()}`);
    return res.json();
}
function mcpSuccess(data) {
    return {
        content: [{ type: "text", text: JSON.stringify(data, null, 2) }],
    };
}
function mcpError(error) {
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
const server = new McpServer({ name: "showings-mcp", version: "1.0.0" });
server.tool("request_showing", "Request a property showing for a buyer. Uses ShowingTime if configured, falls back to GHL calendar.", {
    mlsId: z.string().describe("MLS listing ID"),
    propertyAddress: z.string(),
    contactId: z.string().describe("GHL contact ID of the buyer"),
    buyerName: z.string(),
    buyerPhone: z.string(),
    requestedDate: z.string().describe("ISO date string (e.g. 2026-05-10)"),
    requestedTime: z.string().describe("Preferred time (e.g. 2:00 PM)"),
    agentName: z.string().optional(),
    notes: z.string().optional(),
}, async ({ mlsId, propertyAddress, contactId, buyerName, buyerPhone, requestedDate, requestedTime, agentName, notes, }) => {
    try {
        if (USE_SHOWINGTIME) {
            const data = await showingTimeRequest("POST", "/appointments", {
                listingKey: mlsId,
                requestedDate,
                requestedTime,
                buyerName,
                buyerPhone,
                agentName,
                notes,
            });
            await ghl("POST", `/contacts/${contactId}/notes`, {
                body: `Showing requested via ShowingTime: ${propertyAddress} on ${requestedDate} at ${requestedTime}. Confirmation: ${data.confirmationNumber ?? "pending"}`,
            });
            return mcpSuccess({ ...data, method: "showingtime" });
        }
        // Fallback: GHL calendar booking
        const startISO = new Date(`${requestedDate}T${new Date(`1970-01-01 ${requestedTime}`).toTimeString().slice(0, 5)}`).toISOString();
        const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
        const appt = await ghl("POST", "/appointments/", {
            locationId: GHL_LOCATION_ID,
            contactId,
            calendarId: GHL_CALENDAR_ID,
            startTime: startISO,
            endTime: endISO,
            title: `Showing — ${propertyAddress}`,
            notes: `MLS#: ${mlsId}${notes ? `\n${notes}` : ""}`,
        });
        await ghl("POST", `/contacts/${contactId}/notes`, {
            body: `Showing booked: ${propertyAddress} on ${requestedDate} at ${requestedTime} (GHL calendar)`,
        });
        return mcpSuccess({ ...appt, method: "ghl_calendar" });
    }
    catch (e) {
        return mcpError(e);
    }
});
server.tool("get_showing_availability", "Check available showing times for a property on a given date", {
    mlsId: z.string(),
    date: z.string().describe("ISO date string (e.g. 2026-05-10)"),
}, async ({ mlsId, date }) => {
    try {
        if (USE_SHOWINGTIME) {
            const data = await showingTimeRequest("GET", `/listings/${mlsId}/availability?date=${date}`);
            return mcpSuccess(data);
        }
        return mcpSuccess({
            note: "ShowingTime not configured. Showing availability managed through GHL calendar.",
            mlsId,
            date,
            suggestion: "Contact the listing agent directly or book via GHL calendar.",
        });
    }
    catch (e) {
        return mcpError(e);
    }
});
server.tool("list_upcoming_showings", "List all upcoming showings for a contact or for all leads", {
    contactId: z.string().optional(),
    startDate: z.string().optional(),
    endDate: z.string().optional(),
}, async ({ contactId, startDate, endDate }) => {
    try {
        const data = await ghl("GET", `/appointments/?locationId=${GHL_LOCATION_ID}&calendarId=${GHL_CALENDAR_ID}${contactId ? `&contactId=${contactId}` : ""}${startDate ? `&startDate=${startDate}` : ""}${endDate ? `&endDate=${endDate}` : ""}`);
        return mcpSuccess(data);
    }
    catch (e) {
        return mcpError(e);
    }
});
server.tool("cancel_showing", "Cancel a scheduled showing and notify the contact", {
    appointmentId: z.string(),
    contactId: z.string(),
    reason: z.string().optional(),
}, async ({ appointmentId, contactId, reason }) => {
    try {
        await ghl("DELETE", `/appointments/${appointmentId}`);
        await ghl("POST", `/contacts/${contactId}/notes`, {
            body: `Showing cancelled.${reason ? ` Reason: ${reason}` : ""}`,
        });
        await ghl("POST", "/conversations/messages", {
            type: "SMS",
            contactId,
            locationId: GHL_LOCATION_ID,
            message: `Hi! Just letting you know your showing has been cancelled${reason ? ` (${reason})` : ""}. Reply to reschedule anytime.`,
        });
        return mcpSuccess({ cancelled: true, appointmentId });
    }
    catch (e) {
        return mcpError(e);
    }
});
server.tool("reschedule_showing", "Reschedule an existing showing to a new date and time", {
    appointmentId: z.string(),
    contactId: z.string(),
    newDate: z.string().describe("ISO date string"),
    newTime: z.string().describe("New time (e.g. 3:00 PM)"),
    propertyAddress: z.string(),
}, async ({ appointmentId, contactId, newDate, newTime, propertyAddress }) => {
    try {
        const startISO = new Date(`${newDate}T${new Date(`1970-01-01 ${newTime}`).toTimeString().slice(0, 5)}`).toISOString();
        const endISO = new Date(new Date(startISO).getTime() + 60 * 60 * 1000).toISOString();
        const updated = await ghl("PUT", `/appointments/${appointmentId}`, {
            startTime: startISO,
            endTime: endISO,
        });
        await ghl("POST", "/conversations/messages", {
            type: "SMS",
            contactId,
            locationId: GHL_LOCATION_ID,
            message: `Hi! Your showing for ${propertyAddress} has been rescheduled to ${newDate} at ${newTime}. See you then!`,
        });
        return mcpSuccess(updated);
    }
    catch (e) {
        return mcpError(e);
    }
});
const transport = new StdioServerTransport();
await server.connect(transport);

#!/usr/bin/env node
/**
 * Vendor coordination MCP — manages staging, cleaning, and repairs for listings.
 * Stores vendor jobs in GHL as opportunities/notes; no external vendor API required.
 */
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const GHL_API_KEY = process.env.GHL_API_KEY!;
const GHL_LOCATION_ID = process.env.GHL_LOCATION_ID!;

async function ghl(method: string, path: string, body?: unknown) {
  const res = await fetch(`https://services.leadconnectorhq.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${GHL_API_KEY}`,
      "Content-Type": "application/json",
      Version: "2021-07-28",
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(`GHL ${res.status}: ${await res.text()}`);
  return res.json();
}

function ok(data: unknown) {
  return {
    content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
  };
}
function err(e: unknown) {
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${e instanceof Error ? e.message : String(e)}`,
      },
    ],
    isError: true as const,
  };
}

const VENDOR_TAGS: Record<string, string> = {
  staging: "vendor-staging",
  cleaning: "vendor-cleaning",
  repairs: "vendor-repairs",
  photography: "vendor-photography",
  landscaping: "vendor-landscaping",
};

const server = new McpServer({ name: "vendor-mcp", version: "1.0.0" });

server.tool(
  "request_vendor_service",
  "Request a vendor service (staging, cleaning, repairs, photography, landscaping) for a listing",
  {
    contactId: z
      .string()
      .describe("GHL contact ID of the listing agent or seller"),
    propertyAddress: z.string(),
    serviceType: z.enum([
      "staging",
      "cleaning",
      "repairs",
      "photography",
      "landscaping",
    ]),
    requestedDate: z.string().describe("ISO date string"),
    notes: z.string().optional().describe("Specific requirements or scope"),
    estimatedBudgetCAD: z.number().optional(),
  },
  async ({
    contactId,
    propertyAddress,
    serviceType,
    requestedDate,
    notes,
    estimatedBudgetCAD,
  }) => {
    try {
      const tag = VENDOR_TAGS[serviceType];
      await ghl("POST", `/contacts/${contactId}/tags`, {
        tags: [tag, "vendor-pending"],
      });

      const noteBody = [
        `Vendor Request — ${serviceType.toUpperCase()}`,
        `Property: ${propertyAddress}`,
        `Requested Date: ${requestedDate}`,
        estimatedBudgetCAD ? `Budget: $${estimatedBudgetCAD} CAD` : null,
        notes ? `Notes: ${notes}` : null,
        `Status: PENDING`,
      ]
        .filter(Boolean)
        .join("\n");

      const note = await ghl("POST", `/contacts/${contactId}/notes`, {
        body: noteBody,
      });

      return ok({
        requested: true,
        serviceType,
        propertyAddress,
        requestedDate,
        noteId: note.id,
        tag,
      });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "confirm_vendor_booking",
  "Confirm a vendor booking with actual date, time, and vendor name",
  {
    contactId: z.string(),
    propertyAddress: z.string(),
    serviceType: z.enum([
      "staging",
      "cleaning",
      "repairs",
      "photography",
      "landscaping",
    ]),
    vendorName: z.string(),
    confirmedDate: z.string(),
    confirmedTime: z.string(),
    costCAD: z.number().optional(),
  },
  async ({
    contactId,
    propertyAddress,
    serviceType,
    vendorName,
    confirmedDate,
    confirmedTime,
    costCAD,
  }) => {
    try {
      await ghl("POST", `/contacts/${contactId}/tags`, {
        tags: ["vendor-confirmed"],
      });

      const noteBody = [
        `Vendor Confirmed — ${serviceType.toUpperCase()}`,
        `Property: ${propertyAddress}`,
        `Vendor: ${vendorName}`,
        `Date/Time: ${confirmedDate} at ${confirmedTime}`,
        costCAD ? `Cost: $${costCAD} CAD` : null,
        `Status: CONFIRMED`,
      ]
        .filter(Boolean)
        .join("\n");

      await ghl("POST", `/contacts/${contactId}/notes`, { body: noteBody });

      return ok({ confirmed: true, vendorName, confirmedDate, confirmedTime });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "mark_vendor_complete",
  "Mark a vendor service as completed and optionally log the final cost",
  {
    contactId: z.string(),
    serviceType: z.enum([
      "staging",
      "cleaning",
      "repairs",
      "photography",
      "landscaping",
    ]),
    finalCostCAD: z.number().optional(),
    feedback: z.string().optional(),
  },
  async ({ contactId, serviceType, finalCostCAD, feedback }) => {
    try {
      await ghl("POST", `/contacts/${contactId}/tags`, {
        tags: ["vendor-complete"],
      });

      const noteBody = [
        `Vendor Complete — ${serviceType.toUpperCase()}`,
        finalCostCAD ? `Final Cost: $${finalCostCAD} CAD` : null,
        feedback ? `Feedback: ${feedback}` : null,
        `Status: COMPLETE`,
      ]
        .filter(Boolean)
        .join("\n");

      await ghl("POST", `/contacts/${contactId}/notes`, { body: noteBody });

      return ok({ complete: true, serviceType, finalCostCAD });
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "list_pending_vendor_jobs",
  "List all contacts with pending vendor service requests",
  {
    serviceType: z
      .enum(["staging", "cleaning", "repairs", "photography", "landscaping"])
      .optional()
      .describe("Filter by service type, or omit for all pending"),
  },
  async ({ serviceType }) => {
    try {
      const tag = serviceType ? VENDOR_TAGS[serviceType] : "vendor-pending";
      const data = await ghl(
        "GET",
        `/contacts/?locationId=${GHL_LOCATION_ID}&tags=${tag}&limit=100`,
      );
      return ok(data);
    } catch (e) {
      return err(e);
    }
  },
);

server.tool(
  "get_vendor_summary",
  "Get a summary of all vendor activity for a contact/property",
  {
    contactId: z.string(),
  },
  async ({ contactId }) => {
    try {
      const contact = await ghl("GET", `/contacts/${contactId}`);
      const notes = await ghl("GET", `/contacts/${contactId}/notes`);

      const vendorNotes = (notes.notes ?? []).filter((n: { body: string }) =>
        n.body?.startsWith("Vendor"),
      );

      return ok({
        contact: {
          id: contact.id,
          name: `${contact.firstName} ${contact.lastName}`,
          tags: contact.tags,
        },
        vendorActivity: vendorNotes,
      });
    } catch (e) {
      return err(e);
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);

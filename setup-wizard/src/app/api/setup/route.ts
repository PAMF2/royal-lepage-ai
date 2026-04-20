import { type NextRequest } from "next/server";
import type { Creds } from "@/lib/ghl";
import { ghlFetch } from "@/lib/ghl";

const CUSTOM_FIELDS = [
  { name: "Homie Score", fieldKey: "homie_score", dataType: "NUMERICAL" },
  { name: "LPMAMA - Location", fieldKey: "lpmama_location", dataType: "TEXT" },
  { name: "LPMAMA - Price", fieldKey: "lpmama_price", dataType: "TEXT" },
  {
    name: "LPMAMA - Motivation",
    fieldKey: "lpmama_motivation",
    dataType: "TEXT",
  },
  { name: "LPMAMA - Agent", fieldKey: "lpmama_agent", dataType: "TEXT" },
  { name: "LPMAMA - Mortgage", fieldKey: "lpmama_mortgage", dataType: "TEXT" },
  {
    name: "LPMAMA - Appointment",
    fieldKey: "lpmama_appointment",
    dataType: "TEXT",
  },
  { name: "Last AI Contact", fieldKey: "last_ai_contact", dataType: "TEXT" },
];

const PIPELINE_STAGES = [
  "New Lead",
  "Attempted Contact",
  "Contacted",
  "Qualified",
  "Appointment Set",
  "Handed Off",
  "Nurture",
  "Closed Won",
  "Closed Lost",
];

const CAMPAIGNS = [
  "7-Day Drip",
  "Reactivation",
  "Appointment Reminder",
  "Post-Showing",
  "Monthly Nurture",
];

async function step(
  label: string,
  fn: () => Promise<string>,
): Promise<{ label: string; result: string; ok: boolean }> {
  try {
    const result = await fn();
    return { label, result, ok: true };
  } catch (e) {
    return { label, result: String(e), ok: false };
  }
}

export async function POST(req: NextRequest) {
  const creds = (await req.json()) as Creds;

  const steps = await Promise.all([
    step("Custom Fields", async () => {
      const existing = await ghlFetch(
        creds,
        "GET",
        `/locations/${creds.ghlLocationId}/customFields`,
      );
      const existingKeys = new Set<string>(
        (existing.customFields ?? []).map(
          (f: { fieldKey: string }) => f.fieldKey,
        ),
      );
      let created = 0;
      for (const field of CUSTOM_FIELDS) {
        if (existingKeys.has(`contact.${field.fieldKey}`)) continue;
        await ghlFetch(
          creds,
          "POST",
          `/locations/${creds.ghlLocationId}/customFields`,
          {
            name: field.name,
            dataType: field.dataType,
            fieldKey: field.fieldKey,
            model: "contact",
          },
        );
        created++;
      }
      return `${created} created, ${CUSTOM_FIELDS.length - created} already existed`;
    }),

    step("Pipeline", async () => {
      const existing = await ghlFetch(
        creds,
        "GET",
        `/opportunities/pipelines?locationId=${creds.ghlLocationId}`,
      );
      const already = (existing.pipelines ?? []).find(
        (p: { name: string }) => p.name === "Homie Lead Pipeline",
      );
      if (already) return `Already exists (id: ${already.id})`;
      const pipeline = await ghlFetch(
        creds,
        "POST",
        "/opportunities/pipelines",
        {
          locationId: creds.ghlLocationId,
          name: "Homie Lead Pipeline",
          stages: PIPELINE_STAGES.map((name, position) => ({ name, position })),
        },
      );
      return `Created (id: ${pipeline.pipeline?.id ?? "?"})`;
    }),

    step("Webhooks", async () => {
      const existing = await ghlFetch(
        creds,
        "GET",
        `/locations/${creds.ghlLocationId}/webhooks`,
      );
      const existingUrls = new Set<string>(
        (existing.webhooks ?? []).map((w: { url: string }) => w.url),
      );
      const hooks = [
        {
          name: "Homie - New Lead",
          url: `${creds.orchestratorUrl}/webhook/lead`,
          events: ["ContactCreate"],
        },
        {
          name: "Homie - Incoming Message",
          url: `${creds.orchestratorUrl}/webhook/message`,
          events: ["InboundMessage"],
        },
      ];
      let created = 0;
      for (const hook of hooks) {
        if (existingUrls.has(hook.url)) continue;
        await ghlFetch(
          creds,
          "POST",
          `/locations/${creds.ghlLocationId}/webhooks`,
          hook,
        );
        created++;
      }
      return `${created} registered, ${hooks.length - created} already existed`;
    }),

    step("Campaigns", async () => {
      const existing = await ghlFetch(
        creds,
        "GET",
        `/locations/${creds.ghlLocationId}/campaigns`,
      );
      const existingNames = new Set<string>(
        (existing.campaigns ?? []).map((c: { name: string }) => c.name),
      );
      let created = 0;
      for (const name of CAMPAIGNS) {
        if (existingNames.has(name)) continue;
        await ghlFetch(
          creds,
          "POST",
          `/locations/${creds.ghlLocationId}/campaigns`,
          {
            locationId: creds.ghlLocationId,
            name,
            status: "active",
          },
        );
        created++;
      }
      return `${created} created, ${CAMPAIGNS.length - created} already existed`;
    }),
  ]);

  const ok = steps.every((s) => s.ok);
  return Response.json({ ok, steps });
}

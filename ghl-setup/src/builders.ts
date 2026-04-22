export type VerifyResult = { name: string; ok: boolean; detail: string };

export function buildPassResult(name: string, detail: string): VerifyResult {
  return { name, ok: true, detail };
}

export function buildFailResult(name: string, detail: string): VerifyResult {
  return { name, ok: false, detail };
}

export type CustomFieldDef = {
  name: string;
  fieldKey: string;
  dataType: "NUMERICAL" | "TEXT";
};

export const REQUIRED_FIELDS: CustomFieldDef[] = [
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
  {
    name: "IDX - Saved Listings",
    fieldKey: "idx_saved_listings",
    dataType: "TEXT",
  },
  { name: "IDX - Last Viewed", fieldKey: "idx_last_viewed", dataType: "TEXT" },
  { name: "Lead Source URL", fieldKey: "lead_source_url", dataType: "TEXT" },
  {
    name: "Reactivation Trigger",
    fieldKey: "reactivation_trigger",
    dataType: "TEXT",
  },
  { name: "Last AI Contact", fieldKey: "last_ai_contact", dataType: "TEXT" },
];

export type CustomValueDef = {
  name: string;
  key: string;
  value: string;
};

export const DEFAULT_VALUES: CustomValueDef[] = [
  { name: "Company Name", key: "company_name", value: "Royal LePage" },
  { name: "Agent Name", key: "agent_name", value: "Sarah" },
  { name: "Brokerage Phone", key: "brokerage_phone", value: "" },
  { name: "Brokerage Email", key: "brokerage_email", value: "" },
  { name: "IDX Website URL", key: "idx_website_url", value: "" },
  { name: "AI Agent Name", key: "ai_agent_name", value: "Homie" },
  { name: "Booking Link", key: "booking_link", value: "" },
];

export type PipelineStage = { name: string; position: number };

export function buildPipelineStages(): PipelineStage[] {
  return [
    { name: "New Lead", position: 0 },
    { name: "Attempted Contact", position: 1 },
    { name: "Contacted", position: 2 },
    { name: "Qualified", position: 3 },
    { name: "Appointment Set", position: 4 },
    { name: "Handed Off", position: 5 },
    { name: "Nurture", position: 6 },
    { name: "Closed Won", position: 7 },
    { name: "Closed Lost", position: 8 },
  ];
}

export type PipelinePayload = {
  locationId: string;
  name: string;
  stages: PipelineStage[];
};

export function buildPipelinePayload(locationId: string): PipelinePayload {
  return {
    locationId,
    name: "Homie Lead Pipeline",
    stages: buildPipelineStages(),
  };
}

export type WebhookDef = {
  name: string;
  url: string;
  events: string[];
};

export function buildWebhookDefs(orchestratorUrl: string): WebhookDef[] {
  return [
    {
      name: "Homie - New Lead",
      url: `${orchestratorUrl}/webhook/lead`,
      events: ["ContactCreate"],
    },
    {
      name: "Homie - Incoming Message",
      url: `${orchestratorUrl}/webhook/message`,
      events: ["InboundMessage"],
    },
  ];
}

export type CampaignDef = { name: string; description: string };

export function buildCampaignDefs(): CampaignDef[] {
  return [
    {
      name: "Homie - 7-Day Drip (No Response)",
      description:
        "For leads that don't respond to initial SMS. Day 1 SMS, Day 3 Email, Day 7 SMS.",
    },
    {
      name: "Homie - Reactivation (Dormant 30d+)",
      description:
        "Re-engages leads silent for 30+ days. Triggered by price drops or new listings.",
    },
    {
      name: "Homie - Appointment Reminder",
      description:
        "24hr and 1hr reminders before a booked showing or consultation.",
    },
    {
      name: "Homie - Post-Showing Follow-Up",
      description:
        "Follows up 24hrs after a showing. Collects feedback and gauges interest.",
    },
    {
      name: "Homie - Monthly Nurture",
      description:
        "Monthly market update for long-term nurture leads. Keeps Royal LePage top of mind.",
    },
  ];
}

export function buildCustomFieldPayload(field: CustomFieldDef): {
  name: string;
  dataType: string;
  fieldKey: string;
  model: string;
} {
  return {
    name: field.name,
    dataType: field.dataType,
    fieldKey: field.fieldKey,
    model: "contact",
  };
}

export function buildCustomValuePayload(cv: CustomValueDef): {
  name: string;
  fieldKey: string;
  value: string;
} {
  return {
    name: cv.name,
    fieldKey: cv.key,
    value: cv.value,
  };
}

export function isCustomFieldMissing(
  fieldKey: string,
  existingKeys: Set<string>,
): boolean {
  return !existingKeys.has(`contact.${fieldKey}`);
}

export function isCustomValueMissing(
  key: string,
  existingKeys: Set<string>,
): boolean {
  return !existingKeys.has(`custom_values.${key}`);
}

export function maskRedisUrl(url: string): string {
  return url.replace(/:[^:@]+@/, ":***@");
}

export function resolveCustomFieldId(result: {
  customField?: { id?: string };
  id?: string;
}): string {
  return result.customField?.id ?? result.id ?? "?";
}

export function hasRequiredWebhooks(hooks: { url: string }[]): {
  hasLead: boolean;
  hasMsg: boolean;
} {
  return {
    hasLead: hooks.some((h) => h.url?.includes("/webhook/lead")),
    hasMsg: hooks.some((h) => h.url?.includes("/webhook/message")),
  };
}

export function checkRequiredCustomFields(
  presentKeys: Set<string>,
  required: string[] = ["contact.homie_score", "contact.lpmama_location"],
): string[] {
  return required.filter((k) => !presentKeys.has(k));
}

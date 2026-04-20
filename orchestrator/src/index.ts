#!/usr/bin/env node
import express from "express";
import { handleLeadWebhook, handleMessageWebhook } from "./webhook.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

// GHL sends webhooks to these endpoints
// Configure in GHL: Settings → Integrations → Webhooks
app.post("/webhook/lead", handleLeadWebhook);
app.post("/webhook/message", handleMessageWebhook);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Homie orchestrator running on port ${PORT}`);
});

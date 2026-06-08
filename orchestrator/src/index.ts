#!/usr/bin/env node
import express from "express";
import { handleFubWebhook } from "./webhook.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

// FUB sends webhook events to a single endpoint with a typed `event` field
// (peopleCreated / peopleUpdated / conversationsCreated). Configure in FUB:
// Settings → Webhooks.
app.post("/webhook/fub", handleFubWebhook);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Homie orchestrator running on port ${PORT}`);
});

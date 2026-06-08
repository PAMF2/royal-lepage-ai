#!/usr/bin/env node
import express from "express";
import { handleFubWebhook } from "./webhook.js";
import { handleInternalSend } from "./internal-send.js";

const app = express();
app.use(express.json());

const PORT = process.env.PORT ?? 3000;

// FUB sends webhook events to a single endpoint with a typed `event` field
// (peopleCreated / peopleUpdated / conversationsCreated). Configure in FUB:
// Settings → Webhooks.
app.post("/webhook/fub", handleFubWebhook);

// Server-to-server send endpoint used by queue/ drip workers. Behind
// ORCHESTRATOR_INTERNAL_SECRET. See src/internal-send.ts for the contract.
app.post("/internal/send", handleInternalSend);

app.get("/health", (_req, res) => res.json({ status: "ok" }));

app.listen(PORT, () => {
  console.log(`Homie orchestrator running on port ${PORT}`);
});

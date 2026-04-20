import { runAgent } from "./agent.js";
export async function handleLeadWebhook(req, res) {
    res.sendStatus(200); // acknowledge immediately
    const contact = req.body;
    if (!contact?.id)
        return;
    console.log(`[Homie] New lead: ${contact.firstName} ${contact.lastName} (${contact.id})`);
    await runAgent({
        trigger: "new_lead",
        contactId: contact.id,
        contactName: `${contact.firstName ?? ""} ${contact.lastName ?? ""}`.trim(),
        contactPhone: contact.phone,
        contactEmail: contact.email,
        source: contact.source ?? "unknown",
    });
}
export async function handleMessageWebhook(req, res) {
    res.sendStatus(200);
    const msg = req.body;
    if (!msg?.contactId || !msg?.message)
        return;
    console.log(`[Homie] Incoming message from contact ${msg.contactId}: "${msg.message}"`);
    await runAgent({
        trigger: "incoming_message",
        contactId: msg.contactId,
        message: msg.message,
        conversationId: msg.conversationId,
    });
}

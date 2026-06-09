# Orchestrator

Claude AI agent that qualifies real estate leads and routes them to next steps in the Royal LePage pipeline.

## What It Does

The orchestrator is the core intelligence layer. It:

1. **Receives webhooks** from FollowUpBoss (`peopleCreated`, `peopleUpdated`, `conversationsCreated`) on the `/webhook/fub` endpoint
2. **Runs Claude as an AI agent** with access to 10+ tools (FUB CRM, IDX, ElevenLabs)
3. **Qualifies leads** using the LPMAMA framework (Location, Price, Motivation, Agent, Mortgage, Appointment)
4. **Advances the pipeline** automatically (New Lead → Attempted Contact → Contacted → Qualified → etc.)
5. **Sends SMS via Twilio and email via SendGrid** with warm, personalized outreach
6. **Logs every action** as FUB notes (`crm_add_note`) for auditing
7. **Exposes `/internal/send`** so BullMQ campaign-drip workers can dispatch templated messages through the same CRM tools

The agent responds in both English and French (auto-detected), with SMS messages kept under 160 characters per Canadian/SMS best practices.

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` — Claude API key from console.anthropic.com
- `FUB_API_KEY` — FollowUpBoss API key from Settings → API
- `FUB_WEBHOOK_SECRET` — HMAC-SHA256 secret for verifying FUB webhooks (generate a random 32-char string)
- `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM_NUMBER` — for outbound SMS
- `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` — for outbound email
- `INTERNAL_SECRET` — auth for the `/internal/send` endpoint (generate a random 32-char string)

Optional:
- `PORT` — Server port (default: 3000)
- `ANTHROPIC_MODEL` — Model to use (default: claude-opus-4-7)
- `AGENT_LANGUAGE` — "en", "fr", or "bilingual" (default: bilingual)
- `CAMPAIGN_TEMPLATES_DIR` — Override path to `campaign-templates/` for the loader
- `IDX_API_KEY`, `IDX_API_SECRET` — For property lookups
- `ELEVENLABS_API_KEY` — For voice AI outreach

## Running Locally

```bash
cd orchestrator
npm install
npm run dev
```

The server listens on port 3000 by default. Configure webhooks in FollowUpBoss:

1. Settings → Webhooks → Add Webhook
2. Add one webhook URL: `http://localhost:3000/webhook/fub`
3. Subscribe to events: `peopleCreated`, `peopleUpdated`, `conversationsCreated`
4. Set the signing secret to your `FUB_WEBHOOK_SECRET` — FUB sends it back as the `x-fub-signature` header

## Building & Deployment

```bash
npm run build
npm start
```

For production, deploy with environment variables set and use a service like Railway, Render, or Heroku.

## How It Fits In

```
FUB lead → /webhook/fub → Claude agent → Twilio SMS / SendGrid email / FUB note
                              ↓
                       Monitoring log
```

For drip campaigns, the dataflow is reversed — the queue calls back into the
orchestrator's `/internal/send` route:

```
BullMQ campaign-drip worker (queue/) → POST /internal/send
                                          → loadTemplate(templateId, kind)
                                          → crm_send_sms or crm_send_email
                                          → Twilio / SendGrid
```

See `../queue/` for the BullMQ workers and `src/templates.ts` for the
campaign-template loader.

## Tools Available to the Agent

### CRM Tools (FUB + Twilio + SendGrid)
- `crm_search_contacts` — Find FUB people by name/email/phone
- `crm_get_contact` — Fetch full FUB person record
- `crm_send_sms` — Send SMS via Twilio (max 160 chars); also logs as FUB note
- `crm_send_email` — Send email via SendGrid; also logs as FUB note
- `crm_get_conversation` — Read message history from FUB
- `crm_add_note` — Log actions as FUB notes
- `crm_update_stage` — Move person to next FUB pipeline stage
- `crm_create_deal` — Start a new FUB deal
- `crm_book_appointment` — Create FUB calendar appointment
- `crm_add_tags` — Label FUB people (hot-lead, pre-approved, etc.)
- `crm_enroll_campaign` — Enqueue into BullMQ drip campaign via `POST /enqueue-campaign`

### IDX Tools
- Property search, market insights (see `../idx-mcp/`)

### ElevenLabs Tools
- Voice AI outreach (see `../elevenlabs-mcp/`)

## Testing

```bash
npm test
```

Test webhook signing and agent message routing.

## Logs

The agent logs every step:
- Webhook received → Contact found/created
- First SMS sent → Pipeline stage moved
- Qualification assessment → Tags added
- Error handling with retry logic

For production monitoring, see `../monitoring/`.

## Code Structure

- `src/index.ts` — Express server, webhook + internal routes
- `src/webhook.ts` — `/webhook/fub` HMAC verification + event routing
- `src/internal-send.ts` — `/internal/send` route used by queue workers
- `src/templates.ts` — `loadTemplate(id, kind, vars)` for campaign drip content
- `src/agent.ts` — Claude agent loop, tool execution, LPMAMA logic
- `src/tools/crm.ts` — FUB + Twilio + SendGrid wrapper, `crm_*` tools
- `src/tools/idx.ts` — IDX/MLS property lookups
- `src/tools/eleven.ts` — ElevenLabs voice integration

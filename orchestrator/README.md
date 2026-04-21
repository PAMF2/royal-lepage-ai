# Orchestrator

Claude AI agent that qualifies real estate leads and routes them to next steps in the Royal LePage pipeline.

## What It Does

The orchestrator is the core intelligence layer. It:

1. **Receives webhooks** from GoHighLevel when new leads arrive or messages come in
2. **Runs Claude as an AI agent** with access to 10+ tools (GHL, IDX, ElevenLabs)
3. **Qualifies leads** using the LPMAMA framework (Location, Price, Motivation, Agent, Mortgage, Appointment)
4. **Advances the pipeline** automatically (New Lead → Attempted Contact → Contacted → Qualified → etc.)
5. **Sends SMS/email** via GHL with warm, personalized outreach
6. **Logs every action** as contact notes for auditing

The agent responds in both English and French (auto-detected), with SMS messages kept under 160 characters per Canadian/SMS best practices.

## Environment Variables

Required:
- `ANTHROPIC_API_KEY` — Claude API key from console.anthropic.com
- `GHL_API_KEY` — GoHighLevel API key from Settings → Integrations
- `GHL_LOCATION_ID` — Your GHL Location ID
- `WEBHOOK_SECRET` — HMAC-SHA256 secret for verifying GHL webhooks (generate a random 32-char string)

Optional:
- `PORT` — Server port (default: 3000)
- `ANTHROPIC_MODEL` — Model to use (default: claude-opus-4-7)
- `AGENT_LANGUAGE` — "en", "fr", or "bilingual" (default: bilingual)
- `IDX_API_KEY`, `IDX_API_SECRET` — For property lookups
- `ELEVENLABS_API_KEY` — For voice AI outreach

## Running Locally

```bash
cd orchestrator
npm install
npm run dev
```

The server listens on port 3000 by default. Configure webhooks in GoHighLevel:

1. Settings → Integrations → Webhooks
2. Add two webhook URLs:
   - Contact Created: `http://localhost:3000/webhook/lead`
   - Inbound Message: `http://localhost:3000/webhook/message`
3. Set X-GHL-Signature header to your WEBHOOK_SECRET

## Building & Deployment

```bash
npm run build
npm start
```

For production, deploy with environment variables set and use a service like Railway, Render, or Heroku.

## How It Fits In

```
GHL Lead → Webhook → Queue → Orchestrator → GHL Update
                     (BullMQ)  (Claude Agent)  (SMS/Email)
                                   ↓
                             Monitoring Logs
```

The orchestrator is meant to scale with the queue layer for 100k+ leads:

- **Single agent**: Use orchestrator directly (< 1k leads)
- **At scale**: Queue enqueues webhooks → Workers pull jobs → Orchestrator processes

See `../queue/` for BullMQ integration.

## Tools Available to the Agent

### GHL Tools
- `ghl_search_contacts` — Find contacts by name/email
- `ghl_get_contact` — Fetch full contact record
- `ghl_send_sms` — Send SMS (max 160 chars)
- `ghl_send_email` — Send email
- `ghl_get_conversation` — Read chat history
- `ghl_add_note` — Log actions as notes
- `ghl_update_pipeline_stage` — Move opportunity forward
- `ghl_create_opportunity` — Start a new deal
- `ghl_book_appointment` — Calendar integration
- `ghl_add_tags` — Label contacts (hot-lead, pre-approved, etc.)
- `ghl_enroll_campaign` — Add to drip sequences

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

- `src/index.ts` — Express server, webhook routes
- `src/webhook.ts` — HMAC signature verification, async job dispatch
- `src/agent.ts` — Claude agent loop, tool execution, LPMAMA logic
- `src/tools/ghl.ts` — GHL API wrapper + tool definitions
- `src/tools/idx.ts` — IDX/MLS property lookups
- `src/tools/eleven.ts` — ElevenLabs voice integration

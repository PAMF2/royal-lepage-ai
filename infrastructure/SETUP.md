# Setup Guide

## Full System Checklist

### Prerequisites
- FollowUpBoss account (Grow tier or above, ~$69–$1,000+/mo depending on agent seats)
- Twilio account with SMS-capable number ($1/mo + per-message cost)
- SendGrid account with verified sender domain (free tier covers <100/day)
- Supabase project (free tier covers ~50k rows)
- Redis (Upstash or Railway Redis — ~$10–25/mo for production)
- ElevenLabs account (optional, for voice)
- IDX agreement signed with client's real estate board
- Client lead database exported (CSV)
- Server for orchestrator (Railway, Render, Fly.io — ~$5–10/mo)

### Environment Variables

Copy `infrastructure/.env.example` to `.env` in each service folder:

```bash
# FollowUpBoss
FUB_API_KEY=
FUB_WEBHOOK_SECRET=             # generate via crypto.randomBytes(32).toString('hex')

# Twilio (outbound SMS)
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_FROM_NUMBER=             # e.g. +14165550100 (Canada-capable)

# SendGrid (outbound email)
SENDGRID_API_KEY=
SENDGRID_FROM_EMAIL=            # must be verified in SendGrid

# Supabase (long-term lead state, campaign enrollments)
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Redis (BullMQ campaign queue)
REDIS_URL=

# Orchestrator internal auth
INTERNAL_SECRET=                # generate via crypto.randomBytes(32).toString('hex')

# Queue API
QUEUE_API_URL=                  # e.g. http://queue:3001
QUEUE_SECRET=                   # generate via crypto.randomBytes(32).toString('hex')

# ElevenLabs (optional — voice AI)
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_FROM_PHONE=          # Twilio number connected to ElevenLabs

# IDX / MLS
IDX_PROVIDER=simplyrets         # or crea_ddf for Canadian boards
IDX_API_KEY=
IDX_API_SECRET=
IDX_FEED_URL=                   # required for CREA DDF only

# Orchestrator
ANTHROPIC_API_KEY=
ORCHESTRATOR_URL=               # public URL of deployed orchestrator
PORT=3000

# AI model
ANTHROPIC_MODEL=claude-opus-4-7
```

---

## Step-by-Step Deployment

### Step 0 — Configure environment
```bash
cp .env.example .env   # fill in all values before running anything
```

### Step 1 — FUB Setup (run once)
```bash
make setup
# Seeds: homie_score + 5 LPMAMA custom fields in FUB
# Idempotent — safe to re-run
```

**Manual FUB setup (one-time, in the FUB UI):**
- Settings → Pipelines: create stages New Lead → Attempted → Contacted → Qualified → Appointment Set → Handed Off → Nurture → Closed
- Settings → Webhooks: add `${ORCHESTRATOR_URL}/webhook/fub` with secret = `FUB_WEBHOOK_SECRET`, subscribe to `peopleCreated`, `peopleUpdated`, `conversationsCreated`

### Step 1b — Verify all connections
```bash
make verify
# Checks: FUB, Twilio, SendGrid, Supabase, Redis, Anthropic, IDX, ElevenLabs (optional), custom fields
# All green = ready to deploy
```

### Step 2 — Data Migration (run once)
```bash
cd data-migration
cp ../../infrastructure/.env.example .env
# Dry run first to verify CSV format:
npm run dry-run -- --file /path/to/leads.csv
# Then real import:
npm run migrate -- --file /path/to/leads.csv
```

Expected CSV columns: `firstName, lastName, email, phone, source, city, budget, timeline, tags`

To go the other way (FUB → CSV), use the exporter:
```bash
FUB_API_KEY=xxxxx npx tsx src/fub-export.ts --out leads.csv
```

### Step 3 — Deploy Orchestrator + Queue
```bash
cd orchestrator
npm run build
# Deploy dist/ to Railway / Render / Fly.io
# Set all env vars in your deployment platform
# Note the public URL → set as ORCHESTRATOR_URL in .env

cd ../queue
npm run build
# Deploy queue API and queue-worker as separate processes (same Redis)
```
The orchestrator exposes `/webhook/fub` (FUB ingress), `/internal/send` (queue
worker dispatch), and `/enqueue-campaign` (drip enrollment).

### Step 4 — IDX Website
```bash
cd idx-website
npm install
npm run build
# Deploy to Vercel (recommended):
# vercel --prod
```
Set `FUB_API_KEY`, `IDX_API_KEY`, `IDX_API_SECRET` as env vars in Vercel.

### Step 5 — Dashboard
```bash
cd dashboard
npm install
npm run build
# Deploy to Vercel on a separate subdomain (e.g. dashboard.yourdomain.com)
```

### Step 6 — Lead Scoring (daily cron)
```bash
cd lead-scoring
npm run score
```
Schedule this as a daily cron job (Railway cron, GitHub Actions, or cron on any server).

---

## IDX Board Notes

| Country | Board Type | Integration |
|---------|-----------|-------------|
| Canada | CREA DDF | Set `IDX_PROVIDER=crea_ddf`, apply at crea.ca/data-feed |
| US | SimplyRETS | Set `IDX_PROVIDER=simplyrets`, credentials at simplyrets.com |
| US (RETS) | Board-specific | Contact board for RETS credentials |

Client must sign IDX agreement and authorize platform as a back-end (BA) data provider before IDX credentials are issued.

---

## Architecture Summary

```
[FUB webhook /webhook/fub] → orchestrator/ → Claude AI agent
                                                ├── crm  tools (FUB people, Twilio SMS, SendGrid email, notes)
                                                ├── idx  tools (listings, comparables)
                                                └── eleven tools (outbound calls)

[IDX Website] → lead capture form → FUB (new person) → peopleCreated webhook → orchestrator

[BullMQ queue/] → drip workers → POST /internal/send → crm_send_sms or crm_send_email

[Dashboard]   → FUB API (read) + Supabase → stats, funnel, recent leads, activity feed

[Lead Scoring] → FUB API → score all people → update tags + homie_score custom field
```

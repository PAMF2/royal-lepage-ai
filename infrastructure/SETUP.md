# Setup Guide

## Full System Checklist

### Prerequisites
- GoHighLevel account (Agency plan, $297–$497/mo)
- ElevenLabs account (optional, for voice)
- IDX agreement signed with client's real estate board
- Client lead database exported (CSV)
- Server for orchestrator (Railway, Render, Fly.io — ~$5–10/mo)

### Environment Variables

Copy `infrastructure/.env.example` to `.env` in each service folder:

```bash
# GoHighLevel
GHL_API_KEY=
GHL_LOCATION_ID=
GHL_PIPELINE_ID=               # set after running ghl-setup
GHL_CALENDAR_ID=               # set after GHL calendar created

# Pipeline stage IDs (set after running ghl-setup)
GHL_STAGE_NEW_LEAD=
GHL_STAGE_ATTEMPTED=
GHL_STAGE_CONTACTED=
GHL_STAGE_QUALIFIED=
GHL_STAGE_APPOINTMENT_SET=
GHL_STAGE_HANDED_OFF=
GHL_STAGE_NURTURE=

# Campaign IDs (set after running ghl-setup)
GHL_CAMPAIGN_DRIP_7DAY=
GHL_CAMPAIGN_REACTIVATION=

# ElevenLabs (optional — voice AI)
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=
ELEVENLABS_FROM_PHONE=         # Twilio number connected to ElevenLabs

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

### Step 1 — GHL Setup (run once)
```bash
cd ghl-setup
cp ../../infrastructure/.env.example .env   # fill in GHL_API_KEY and GHL_LOCATION_ID
npm run setup
```
Copy the pipeline and campaign IDs printed to console into your `.env`.

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

### Step 3 — Deploy Orchestrator
```bash
cd orchestrator
npm run build
# Deploy dist/ to Railway / Render / Fly.io
# Set all env vars in your deployment platform
# Note the public URL → set as ORCHESTRATOR_URL in .env
```
The orchestrator runs the GHL webhook setup automatically on deploy.

### Step 4 — IDX Website
```bash
cd idx-website
npm install
npm run build
# Deploy to Vercel (recommended):
# vercel --prod
```
Set `GHL_API_KEY`, `GHL_LOCATION_ID`, `IDX_API_KEY`, `IDX_API_SECRET` as env vars in Vercel.

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
[GHL Webhook] → orchestrator/ → Claude AI agent
                                    ├── ghl tools    (contacts, SMS, pipeline)
                                    ├── idx tools    (listings, comparables)
                                    └── eleven tools (outbound calls)

[IDX Website] → lead capture form → GHL (new contact) → orchestrator webhook

[Dashboard]   → GHL API → stats, funnel, recent leads, activity feed

[Lead Scoring] → GHL API → score all contacts → update tags + custom field
```

# Royal LePage — AI Lead Management Platform

![CI](https://github.com/PAMF2/royal-lepage-ai/actions/workflows/ci.yml/badge.svg)

Full Verse.ai replacement + integrated brokerage AI stack.  
Manages 80,000–100,000+ leads via SMS, email, and voice AI.

---

## Stack

| Layer | Technology |
|-------|-----------|
| CRM & Messaging | GoHighLevel |
| AI Orchestration | OpenClaw (`orchestrator/`) |
| MLS Data | CREA DDF or SimplyRETS (`idx-mcp/`) |
| Voice AI | ElevenLabs — optional (`elevenlabs-mcp/`) |
| Showings | ShowingTime or GHL Calendar (`showings-mcp/`) |
| Agent OS | Homie (`homie-admin-mcp/`) |
| Queue | BullMQ + Redis (`queue/`) |
| Deploy | Render · Railway · Docker Compose |

---

## Modules

### Core Engine
| Module | Purpose |
|--------|---------|
| `orchestrator/` | Claude agent + GHL webhook server — responds to leads in <60s |
| `queue/` | BullMQ + Redis — wraps orchestrator for 100k concurrent leads |
| `monitoring/` | Conversation logging + metrics (Redis, 90-day history) |

### GHL & Data
| Module | Purpose |
|--------|---------|
| `ghl-setup/` | One-time GHL config — custom fields, pipeline, webhooks, campaigns |
| `data-migration/` | CSV importer — bulk loads up to 100,000 leads |
| `lead-scoring/` | Daily runner — scores all contacts 0–100, tags hot/warm/cold |
| `reactivation/` | Scheduled engine — re-engages dormant leads with new listings/price drops |

### MCP Servers (AI Tools)
| Module | Tools | Purpose |
|--------|-------|---------|
| `mcp-server/` | 14 | GoHighLevel CRM — contacts, SMS, pipeline, appointments |
| `idx-mcp/` | 7 | IDX/MLS listings — search, comparables, price drops |
| `elevenlabs-mcp/` | 10 | ElevenLabs voice AI — outbound calls, transcripts |
| `homie-admin-mcp/` | 6 | Agent OS — offers, CMAs, presentations, flyers |
| `showings-mcp/` | 5 | Property showings — request, reschedule, cancel |
| `vendor-mcp/` | 5 | Vendor coordination — staging, cleaning, repairs |
| `deal-analysis-mcp/` | 5 | Investment analysis — cap rate, mortgage, closing costs |

### Client-Facing
| Module | Purpose |
|--------|---------|
| `setup-wizard/` | **3-step onboarding wizard** — credentials → GHL config → CSV import (no terminal needed) |
| `idx-website/` | Next.js IDX website — listing search + lead capture |
| `dashboard/` | Reporting dashboard — funnel, scores, activity feed |
| `roi-calculator/` | Interactive ROI calculator — sales pitch tool |
| `sales-deck/` | 12-slide interactive sales deck (keyboard nav, dark theme) |

### Content & Docs
| Module | Purpose |
|--------|---------|
| `campaign-templates/` | SMS/email copy for all 5 campaigns |
| `docs/` | Scoping · architecture · pricing · visual diagram |
| `infrastructure/` | Full deployment guide |

---

## What the Client Needs to Provide

| Item | Why |
|------|-----|
| GoHighLevel API key + Location ID | Core CRM — all contacts, SMS, pipeline live here |
| IDX agreement (signed with MLS board) | Required to access live listing data via CREA DDF |
| Lead database CSV export | Up to 100,000 leads imported via `make migrate` |
| Anthropic API key | Powers the AI agent (Claude opus-4-7) |
| SMS phone number in GHL | Outbound SMS to leads |
| ElevenLabs API key *(optional)* | Voice AI outbound calls |
| ShowingTime API key *(optional)* | Showing management — falls back to GHL calendar |

---

## Quickstart

```bash
# 1. Clone and copy env
git clone https://github.com/PAMF2/royal-lepage-ai
cp .env.example .env   # fill in GHL_API_KEY, ANTHROPIC_API_KEY, IDX_API_KEY

# 2. One-time GHL setup (creates pipeline, webhooks, custom fields)
make setup

# 3. Import leads from CSV
make migrate LEADS_FILE=leads.csv

# 4. Start full stack
make dev               # runs all services via Docker Compose

# 5. Run all tests
make test
```

Or use the no-terminal setup wizard at `http://localhost:3000` after `make dev`.

---

## Onboarding Sequence

### Prerequisites
- GoHighLevel Agency account ($297–$497/mo)
- IDX agreement signed with real estate board
- Lead database exported to CSV
- Server for orchestrator (Render starter ~$7/mo)

### Option A — Setup Wizard (no terminal required)
```bash
cd setup-wizard && npm install && npm run dev
# Open http://localhost:3010
# Step 1: Enter API keys → Test Connections
# Step 2: Click "Configure GoHighLevel" → creates pipeline, webhooks, fields
# Step 3: Upload CSV → Import leads with live progress bar
```

### Option B — CLI (advanced)

### Step 1 — Configure environment
```bash
cp .env.example .env
# Fill in: GHL_API_KEY, GHL_LOCATION_ID, ANTHROPIC_API_KEY
# Fill in: IDX_PROVIDER, IDX_API_KEY, IDX_API_SECRET
# Set:     ORCHESTRATOR_URL (your deployed URL)
# Set:     WEBHOOK_SECRET (random 32-char string)
```

### Step 2 — GHL one-time setup
```bash
make setup
# Creates in GHL automatically:
#   ✓ Custom fields: homie_score + 6 LPMAMA fields + IDX tracking fields
#   ✓ Custom values: company name, agent name, booking link, etc.
#   ✓ Pipeline: New Lead → Attempted → Contacted → Qualified → Booked → Closed
#   ✓ Webhooks: ContactCreate + InboundMessage → orchestrator
#   ✓ Campaigns: 7-Day Drip, Reactivation, Appointment Reminder, Post-Showing, Nurture
# Idempotent — safe to re-run
```

### Step 3 — Verify all connections
```bash
make verify
# Checks all APIs in parallel:
#   ✓ GHL          Connected — location name
#   ✓ Anthropic    API key valid
#   ✓ IDX          Credentials present
#   ✓ Redis        Connected
#   ✓ ElevenLabs   API key valid (or: not configured — optional)
#   ✓ Custom Fields homie_score + LPMAMA fields present
#   ✓ Webhooks     ContactCreate + InboundMessage registered
# Exits 1 if any required check fails
```

### Step 4 — Import leads
```bash
make migrate LEADS_FILE=leads.csv
# Dry run shown first — confirm before real import
# Expected CSV columns:
#   firstName, lastName, email, phone, source, city, budget, timeline, tags
```

### Step 5 — Deploy

**Option A — Render (recommended)**
```bash
# Connect github.com/PAMF2/royal-lepage-ai at dashboard.render.com
# render.yaml is auto-detected — deploys everything:
#   - orchestrator (web service)
#   - queue-api (web service)
#   - queue-worker (background worker)
#   - monitoring (web service)
#   - lead-scoring (cron — 6am daily)
#   - reactivation (cron — 8am daily)
#   - Redis (managed)
# Set env vars in Render dashboard
```

**Option B — Railway**
```bash
railway login
railway link
railway up
# railway.toml configures health check + restart policy
```

**Option C — Local (Docker Compose)**
```bash
make dev
# Starts: orchestrator · queue-api · queue-worker · monitoring · Redis
# Ports:  3000 · 3001 · 3002
```

### Step 6 — Deploy websites (Vercel)
```bash
# IDX website
cd idx-website && npx vercel --prod

# Dashboard
cd dashboard && npx vercel --prod

# ROI Calculator (optional — sales pitch)
cd roi-calculator && npx vercel --prod
```

### Step 7 — Daily operations (auto via Render cron)
```bash
make score       # Score all leads 0-100, tag hot/warm/cold
make reactivate  # Re-engage dormant leads with new listings/price drops
make health      # Check all services are up
```

---

## System Flows

### Inbound Lead (automatic)
```
Lead submits form → GHL creates contact → webhook fires
→ orchestrator queues job → Claude agent runs
→ SMS sent in <60s → LPMAMA qualification begins
→ IDX listings surfaced → appointment booked
```

### Reactivation (daily cron)
```
lead-scoring runner → scores all contacts → tags hot/warm/cold
reactivation runner → finds dormant leads → checks IDX for triggers
→ Claude generates personalized SMS → rate-limited send (1.2s/contact)
```

### Agent workflow (Homie MCP)
```
Agent prompts Homie → draft_offer / generate_cma / request_showing
→ Claude generates content using live IDX comparables
→ Result returned as formatted text
```

---

## Phases Covered

| Phase | Modules |
|-------|---------|
| **1 — Core** | `orchestrator` · `ghl-setup` · `data-migration` · `idx-mcp` |
| **2 — Enhancement** | `reactivation` · `lead-scoring` · `dashboard` · `campaign-templates` |
| **3 — Advanced AI** | `elevenlabs-mcp` · `homie-admin-mcp` · `showings-mcp` · `vendor-mcp` · `deal-analysis-mcp` · `idx-website` |
| **4 — Scale** | `queue` · `monitoring` · `roi-calculator` · `sales-deck` |

---

## Key Commands

```bash
make help        # Show all commands
make setup       # GHL one-time config
make verify      # Pre-flight connection check
make migrate     # Import leads (LEADS_FILE=path)
make dev         # Start full stack (Docker)
make build       # Build all TypeScript modules
make score       # Run lead scoring
make reactivate  # Run reactivation engine
make health      # Check service health
make logs        # Tail orchestrator logs
```

---

## Sales & Pitch Tools

| Tool | Command | URL |
|------|---------|-----|
| ROI Calculator | `cd roi-calculator && npm run dev` | localhost:3000 |
| Sales Deck (12 slides) | `cd sales-deck && npm run dev` | localhost:3003 |
| Architecture Diagram | Open in browser | `docs/architecture-diagram.html` |

---

## Repo

`github.com/PAMF2/royal-lepage-ai` (private)

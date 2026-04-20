# Royal LePage — AI Lead Management Platform

Full Verse.ai replacement + integrated brokerage AI stack. Manages 80,000–100,000+ leads via SMS, email, and voice AI.

## Stack

| Layer | Technology |
|-------|-----------|
| CRM & Messaging | GoHighLevel |
| AI Orchestration | OpenClaw (orchestrator/) |
| MLS Data | IDX/MLS (SimplyRETS or CREA DDF) |
| Voice AI | ElevenLabs (optional) |
| Showings | ShowingTime (optional) or GHL Calendar |
| Agent OS | Homie (homie-admin-mcp/) |

## Modules

| Module | Purpose |
|--------|---------|
| `orchestrator/` | Claude agent + GHL webhook server — the core AI engine |
| `idx-website/` | Next.js IDX website with listing search and lead capture |
| `dashboard/` | Reporting dashboard — funnel, scores, activity feed |
| `reactivation/` | Scheduled engine — re-engages dormant leads with new listings/price drops |
| `lead-scoring/` | Daily runner — scores all contacts 0–100, tags by tier |
| `data-migration/` | CSV importer — bulk loads up to 100,000 leads into GHL |
| `ghl-setup/` | One-time GHL config — pipeline, webhooks, campaigns |
| `mcp-server/` | GoHighLevel MCP (14 tools) |
| `elevenlabs-mcp/` | ElevenLabs voice AI MCP (10 tools) |
| `idx-mcp/` | IDX/MLS listings MCP (7 tools) |
| `homie-admin-mcp/` | Agent OS MCP — offers, CMAs, presentations, marketing (6 tools) |
| `showings-mcp/` | Showings MCP — ShowingTime + GHL calendar (5 tools) |
| `vendor-mcp/` | Vendor coordination MCP — staging, cleaning, repairs (5 tools) |
| `deal-analysis-mcp/` | Investment analysis MCP — cap rate, mortgage, closing costs, reports (5 tools) |
| `queue/` | BullMQ + Redis queue — wraps orchestrator for 100k+ scale |
| `monitoring/` | Conversation logging + system health (Redis-backed) |
| `roi-calculator/` | Interactive ROI calculator — sales pitch tool for brokerage |
| `campaign-templates/` | SMS/email copy for all 5 campaigns |
| `docs/` | Scoping, architecture, pricing |
| `infrastructure/` | .env.example + full deployment guide |

## Phases Covered

### Phase 1 — Core System
- GHL CRM setup, pipeline, webhooks (`ghl-setup/`)
- Lead ingestion from CSV (`data-migration/`)
- SMS AI agent — responds in <60 seconds (`orchestrator/`)
- IDX integration for listing-aware conversations (`idx-mcp/`)
- Appointment booking (`orchestrator/tools/ghl.ts`)

### Phase 2 — Enhancement Layer
- Advanced IDX intelligence — comparables, price drops, new listings (`idx-mcp/`)
- Reactivation engine — dormant lead re-engagement (`reactivation/`)
- Campaign templates — full SMS/email copy for all scenarios (`campaign-templates/`)
- Reporting dashboard (`dashboard/`)
- Lead scoring model (`lead-scoring/`)

### Phase 3 — Advanced AI
- Voice AI outbound calls (`elevenlabs-mcp/`)
- Homie agent OS — offers, CMAs, listing presentations, marketing (`homie-admin-mcp/`)
- Showings management (`showings-mcp/`)
- Vendor coordination — staging, cleaning, repairs (`vendor-mcp/`)
- Investment deal analysis — cap rate, mortgage, ROI reports (`deal-analysis-mcp/`)
- Full brokerage workflow automation

### Phase 4 — Scale & Analytics
- Queue-based messaging for 100k concurrent leads (`queue/`)
- Conversation logging + system health monitoring (`monitoring/`)
- Interactive ROI calculator for brokerage sales pitch (`roi-calculator/`)

## Quick Start

See [`infrastructure/SETUP.md`](infrastructure/SETUP.md) for full deployment guide.

```bash
# 1. Configure GHL (run once)
cd ghl-setup && npm run setup

# 2. Import leads
cd data-migration && npm run migrate -- --file leads.csv

# 3. Deploy orchestrator (Railway/Render/Fly)
cd orchestrator && npm run build

# 4. Deploy IDX website (Vercel)
cd idx-website && npm run build

# 5. Deploy dashboard (Vercel)
cd dashboard && npm run build

# 6. Schedule daily jobs (cron)
cd lead-scoring && npm run score      # daily
cd reactivation && npm start          # daily
```

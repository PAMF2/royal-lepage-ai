# Technical Architecture

## System Diagram

```
Lead Sources                     Core Platform                          Outputs
─────────────                    ─────────────                          ───────
IDX Website ──┐                  ┌──────────────────────┐               SMS (Twilio)
Facebook Ads ─┤ → FollowUpBoss ─▶│   OpenClaw Agent     │──────────────▶ Email (SendGrid)
Google Ads ───┤    CRM           │  (AI Orchestrator)   │                Voice (ElevenLabs)
Referrals ────┘    ▲             └──────────┬───────────┘                Calendar booking
                   │   /webhook/fub         │                            FUB notes / tags
                   │   peopleCreated        │
                   │   peopleUpdated        │
                   │   conversationsCreated │
                   │                        ▼
                   │         ┌──────────────────────────┐
                   │         │  BullMQ + Redis (queue/) │
                   │         │  campaign-drip workers   │
                   │         └──────────┬───────────────┘
                   │                    │  POST /internal/send
                   └────────────────────┘  (SMS or email via crm_send_*)
                              │
                ┌─────────────┼────────────┐
                ▼             ▼            ▼
           IDX/MLS API   ElevenLabs    Supabase
           (Listings,    (Voice AI,    (long-term lead
            Comparables,  TTS,          state, campaign
            Market Data)  Transcripts)  enrollments)
```

## FollowUpBoss Setup

### Pipeline Stages (configured in FUB UI)
1. New Lead
2. Attempted Contact (AI sent first SMS)
3. Contacted (lead responded)
4. Qualified (LPMAMA complete)
5. Appointment Set
6. Handed Off (assigned to agent)
7. Nurture (not ready, stay warm)
8. Closed Won / Closed Lost

### Custom Fields (6 total — seeded by `fub-setup/`)
- `homie_score` — 0-100 lead score (updated daily by `lead-scoring/`)
- `lpmama_city` — Location dimension
- `lpmama_budget` — Price dimension
- `lpmama_motivation` — Motivation dimension
- `lpmama_mortgage_status` — Mortgage dimension
- `lpmama_timeline` — Appointment / timeline dimension

### Campaign Automations (owned by `queue/` BullMQ workers, not FUB)
- **Instant Response** — SMS within 60 seconds of new contact (orchestrator handles directly)
- **7-Day Drip** (`nurture-7day` worker) — Step DAG for non-responsive leads
- **Reactivation** (`reactivation` worker) — Triggered on price drops, new listings, market alerts
- **Appointment Reminders** (`appointment-reminders` worker) — 24hr + 1hr before showing
- **Monthly Nurture** (`monthly-nurture` worker) — Long-tail re-engagement

Each worker step posts to the orchestrator's `/internal/send` endpoint
(authenticated via `INTERNAL_SECRET`), which dispatches the message through
the appropriate channel (`crm_send_sms` → Twilio, `crm_send_email` → SendGrid).

## OpenClaw Agent Configuration

The AI agent uses:
1. FUB contact + conversation data for context (`crm_get_contact`, `crm_list_messages`)
2. IDX API for real-time listing data
3. LPMAMA qualification framework
4. Prompt templates per lead source and stage
5. Campaign-template loader (`orchestrator/src/templates.ts`) for drip-step content

## Webhook Security

- FUB webhooks signed with HMAC-SHA256 via `x-fub-signature` header
- Secret stored in `FUB_WEBHOOK_SECRET` env var
- Single ingest endpoint: `POST /webhook/fub`
- Supported events: `peopleCreated`, `peopleUpdated`, `conversationsCreated`

## IDX Integration

- Requires BA (Back-End Access) agreement with the client's real estate board
- Client signs the IDX agreement and authorizes us as their data provider
- Integration via RETS feed or CREA DDF (Canadian boards) or MLS Web API
- Data used for: listing lookups, comparables, neighborhood data, new listing alerts

## ElevenLabs Voice (Phase 3)

- Outbound calls via Twilio Programmable Voice
- "Homie" voice agent created with custom system prompt
- Call transcripts stored in FUB contact notes via `crm_add_note`
- Client billed directly for ElevenLabs + Twilio Voice API usage

## Security & Data

- All lead data stored in client-owned FUB account
- Long-term enrollment and run state in Supabase (RLS-enabled)
- OpenClaw connects via API — no PII stored on application servers
- IDX data used only for AI context, not persisted
- SMS sent from client-owned Twilio number; email from client-owned SendGrid sender

## Scaling

FollowUpBoss handles 100,000+ contacts natively. For concurrent AI conversations
at scale:
- BullMQ + Redis decouples webhook ingest from message dispatch
- Campaign-drip workers run as separate Render/Railway processes
- Rate limiting applied per provider:
  - FUB: 250 req / 10s (sliding window in `crm.ts` HTTP wrapper)
  - Twilio: per-account messaging limit (negotiable, ~1 msg/sec default)
  - SendGrid: per-API-key quota (free tier 100/day, paid scales linearly)

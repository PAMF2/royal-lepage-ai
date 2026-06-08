# Migration: GHL → FUB + Twilio + BullMQ

> Decision date: 2026-06-08 · Branch: `replace-ghl` · Approved by Pedro

---

## Why

GoHighLevel is being removed from the Royal LePage stack. Reasons:
- Vendor lock-in on pipeline/campaign config (proprietary builders).
- Pricing tier scales poorly past pilot.
- Webhook reliability uneven; HMAC headers undocumented edge cases.
- FUB is already the source of truth for Rob Golfy's contacts (data-migration ships TO FUB via `fub-export.ts`).

Replacing GHL with infra Rob Golfy already controls eliminates one paid SaaS, one credential pair, and one external pipeline definition.

---

## What GHL Was Doing

The previous stack used GHL for five concerns:

| Concern | GHL surface | Replacement |
|---|---|---|
| Contact CRM | `ghl_search_contacts`, `ghl_get_contact` | **FUB** `/people` endpoints |
| Outbound SMS | `ghl_send_sms` | **Twilio** Messages API |
| Outbound email | `ghl_send_email` | **SendGrid** (FUB email is inbound-only) |
| Conversation history | `ghl_get_conversation` | **FUB** `/events?personId=` |
| Pipeline stage transitions | `ghl_update_pipeline_stage`, `ghl_create_opportunity` | **FUB** `/people/{id}` (stage), `/deals` |
| Notes & tags | `ghl_add_note`, `ghl_add_tags` | **FUB** `/notes`, `/people/{id}` (tags) |
| Appointments | `ghl_book_appointment` | **FUB** `/appointments` |
| Drip campaigns | `ghl_enroll_campaign` | **BullMQ** queue workers (already in `queue/`) |
| Custom fields | `ghl-setup/custom-fields.ts` | **FUB** `/customFields` (one-time seed via `fub-setup/`) |
| Pipeline definition | `ghl-setup/pipeline.ts` | **FUB** stages (configured in FUB UI, mirrored in code) |
| Inbound webhooks | `webhook.ts` (GHL events) | **FUB** webhook events: `peopleCreated`, `peopleUpdated`, `conversationsCreated` |

---

## Target Architecture

```
┌────────────┐    webhook     ┌──────────────┐
│   FUB UI   │ ─────────────> │ orchestrator │
└────────────┘                │  /webhook    │
                              └──────┬───────┘
                                     │
                                     │ Claude tool calls
                                     ▼
                              ┌──────────────┐
                              │ tools/crm.ts │
                              └──┬───────────┘
                                 │
            ┌────────────────────┼─────────────────────┐
            ▼                    ▼                     ▼
       ┌─────────┐          ┌─────────┐          ┌──────────┐
       │  FUB    │          │ Twilio  │          │ SendGrid │
       │  API    │          │   SMS   │          │   Email  │
       └─────────┘          └─────────┘          └──────────┘

       ┌─────────────────────────────────────────────────┐
       │  BullMQ workers (queue/) — drip campaigns       │
       │  - 7-day nurture                                │
       │  - reactivation                                 │
       │  - appointment reminders                        │
       │  - monthly nurture                              │
       └─────────────────────────────────────────────────┘
```

---

## Tool Surface (orchestrator/src/tools/crm.ts)

Same 11 tool names as the previous `ghl_*` set, renamed to `crm_*` so the agent doesn't carry vendor naming in its system prompt:

| Tool | Verb · Endpoint | Notes |
|---|---|---|
| `crm_search_contacts` | `GET /people?query=` | FUB query string search |
| `crm_get_contact` | `GET /people/{id}` | Returns full person record |
| `crm_send_sms` | `POST` Twilio Messages | From `TWILIO_FROM`; logs to FUB note |
| `crm_send_email` | `POST` SendGrid | Logs to FUB note |
| `crm_get_conversation` | `GET /events?personId=` | Last N events |
| `crm_add_note` | `POST /notes` | `{personId, body}` |
| `crm_update_pipeline_stage` | `PUT /people/{id}` | `{stage: "..."}` |
| `crm_create_opportunity` | `POST /deals` | `{personId, name, value, stage}` |
| `crm_book_appointment` | `POST /appointments` | `{personId, startTime, type}` |
| `crm_add_tags` | `PUT /people/{id}` | `{tags: [...]}` (additive) |
| `crm_enroll_campaign` | BullMQ `add()` | Queue `campaign-drip`, job name = campaign id |

### Shared constraints
- All HTTP calls go through one wrapper with timeout (10s), retry (3x exp backoff: 1s/4s/16s), and rate-limit awareness.
- FUB rate limit: **250 requests per 10 seconds**. Wrapper holds a sliding window; backpressures if breaching.
- Twilio rate limit: 1 msg/sec per FROM number by default.
- All outbound messages are logged to FUB as a note immediately after send, so conversation history stays in one place.

---

## Custom Fields (fub-setup/)

The previous `ghl-setup/` created custom fields in GHL. `fub-setup/` does the same against FUB's `/customFields` endpoint. Idempotent — safe to re-run.

Fields seeded:
- `homie_score` (number, 0–100)
- `lpmama_city` (text)
- `lpmama_budget` (text)
- `lpmama_timeline` (text)
- `lpmama_motivation` (text)
- `lpmama_mortgage_status` (text)

Verification step (`fub-setup verify`) confirms each field exists post-creation. Reads from `/customFields`, compares against expected set, exits non-zero on mismatch.

---

## Drip Campaigns (queue/src/workers/)

Each campaign is a BullMQ repeat/delayed job, not a vendor-managed flow.

| Campaign | Trigger | Steps |
|---|---|---|
| 7-day nurture | New lead created in FUB | Day 0 SMS, Day 1 email, Day 3 SMS, Day 7 email |
| Reactivation | Cold lead matched to new IDX listing | One SMS with listing link + opt-out |
| Appointment reminders | Appointment booked | 24h before SMS, 1h before SMS |
| Monthly nurture | Lead in "Nurture" stage | One email/month, content from `campaign-templates/` |

Workers live in `queue/src/workers/`. Each job step calls `crm_send_sms` or `crm_send_email` via the same wrapper the orchestrator uses (no duplicate HTTP code).

Enrollment is idempotent: `crm_enroll_campaign` checks BullMQ for an existing job with the same `{personId, campaignId}` key before adding.

---

## Webhooks (orchestrator/src/webhook.ts)

FUB sends events via webhook configuration in FUB UI. Subscription targets `https://<orchestrator-url>/webhook/fub`.

Events handled:
- `peopleCreated` → enqueue lead-scoring + 7-day nurture
- `peopleUpdated` → re-score if LPMAMA fields changed
- `conversationsCreated` → feed inbound message to orchestrator agent loop

HMAC verification: FUB signs with `X-FUB-Signature` header (HMAC-SHA256, secret from FUB UI). Same verification pattern as the GHL one — only header name and secret env var change.

Env vars:
- `FUB_WEBHOOK_SECRET` (was `GHL_WEBHOOK_SECRET`)

---

## Environment Variables

### Removed
- `GHL_API_KEY`
- `GHL_LOCATION_ID`
- `GHL_WEBHOOK_SECRET`

### Added
- `FUB_API_KEY` — FUB API key (from FUB account settings)
- `FUB_WEBHOOK_SECRET` — HMAC secret for FUB webhooks
- `TWILIO_ACCOUNT_SID`
- `TWILIO_AUTH_TOKEN`
- `TWILIO_FROM` — purchased Twilio phone number
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL` — verified sender domain
- `SUPABASE_URL` — Postgres host
- `SUPABASE_SERVICE_KEY` — server-side key

### Unchanged
- `ANTHROPIC_API_KEY`
- `IDX_API_KEY`, `IDX_API_SECRET`, `IDX_FEED_URL`
- `ORCHESTRATOR_WEBHOOK_SECRET`, `QUEUE_SECRET`

---

## Postgres Decision: Supabase

Phase 1 needs:
- Lead scoring history (denormalized for fast tier transitions)
- BullMQ persistence (optional — Redis is enough)
- Reactivation run log (audit trail)

Supabase chosen because:
- Free tier covers pilot volume (500 MB, 50k MAU).
- Postgres 15 (full FUB JSON column support).
- Built-in row-level security if Rob Golfy later wants per-agent views.
- One env pair (`SUPABASE_URL`, `SUPABASE_SERVICE_KEY`), no infra to host.

Schema migrations live in `data-migration/migrations/`. Initial migration creates: `leads`, `scoring_runs`, `reactivation_runs`, `campaign_enrollments`.

Alternative considered: Railway Postgres (existing `railway.toml`). Rejected — Railway is for app hosting in this stack, keeping DB separate avoids billing entanglement and lets us migrate hosting without touching data.

---

## Test Strategy

Baseline before this branch: **112 tests, 0 failures**.

Target after merge: **≥ 112 tests, 0 failures**, plus new tests for:
- `crm.ts` — mocked FUB + Twilio + SendGrid
- `fub-setup/` — idempotency, missing-field detection
- BullMQ workers — job step ordering, idempotent enrollment
- Webhook handler — HMAC verification, event routing

No test should call live FUB/Twilio/SendGrid. All net calls mocked via `nock` or test doubles.

---

## Rollout

1. Branch `replace-ghl` merges to `master` once all tests green + smoke run against FUB sandbox.
2. Holly switches FUB webhook target to new orchestrator URL.
3. Old GHL account remains read-only for one billing cycle as fallback.
4. After 30 days clean, GHL account cancelled.

---

## File Map

```
royal-lepage-ai/
  orchestrator/src/
    tools/
      crm.ts             ← NEW (replaces ghl.ts)
      ghl.ts             ← DELETED
    webhook.ts           ← MODIFIED (FUB events, FUB_WEBHOOK_SECRET)
    agent.ts             ← MODIFIED (import crmTools)
    index.ts             ← MODIFIED (import crmTools)
  fub-setup/             ← NEW (replaces ghl-setup/)
    src/
      index.ts
      custom-fields.ts
      verify.ts
  ghl-setup/             ← DELETED
  queue/src/workers/
    nurture-7day.ts      ← NEW
    reactivation.ts      ← NEW
    appointment-reminders.ts ← NEW
    monthly-nurture.ts   ← NEW
  data-migration/migrations/
    001_initial.sql      ← NEW
  .env.example           ← MODIFIED (GHL out, FUB+Twilio+SendGrid+Supabase in)
  PHASE-1-PLAN.md        ← MODIFIED (post-GHL stack)
  MIGRATION-GHL-TO-FUB.md ← this file
```

---

## Open Risks

1. **FUB outbound email parity** — FUB has inbound parsing but limited outbound. SendGrid covers it, but means two systems for messaging. Mitigation: every outbound write a `crm_add_note` to FUB so conversation history stays single-source.
2. **BullMQ persistence** — Drip campaigns now run in our infra, not GHL's. If Redis is lost mid-campaign, enrollments resume on next worker boot but timing skew is possible. Mitigation: BullMQ delayed-job restore on worker start.
3. **FUB rate limit during data-migration import** — 250 req/10s can throttle a 10k-contact import. Mitigation: respect rate-limit headers, sleep-on-429, batch sizes capped at 50 with 2.5s between batches.
4. **Twilio compliance** — SMS to Canadian numbers needs CASL opt-in proof. Mitigation: every cold-outreach SMS includes opt-out language; FUB tag `consent_sms` enforced before send.

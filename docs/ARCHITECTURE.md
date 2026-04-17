# Technical Architecture

## System Diagram

```
Lead Sources                     Core Platform                      Outputs
─────────────                    ─────────────                      ───────
IDX Website ──┐                  ┌─────────────────────┐           SMS/Email
Facebook Ads ─┤ → GoHighLevel ──▶│   OpenClaw Agent    │──────────▶ AI Voice Call
Google Ads ───┤    CRM           │   (AI Orchestrator) │           Calendar Booking
Referrals ────┘                  └──────────┬──────────┘           GHL Pipeline Update
                                            │
                              ┌─────────────┴────────────┐
                              │                          │
                         IDX/MLS API              ElevenLabs API
                         (Listings,               (Voice AI,
                          Comparables,             TTS,
                          Market Data)             Call Transcripts)
```

## GoHighLevel Setup

### Pipeline Stages
1. New Lead
2. Attempted Contact (AI sent first SMS)
3. Contacted (lead responded)
4. Qualified (LPMAMA complete)
5. Appointment Set
6. Handed Off (assigned to agent)
7. Nurture (not ready, stay warm)
8. Closed Won / Closed Lost

### Campaign Automations
- **Instant Response** — SMS within 60 seconds of new contact
- **7-Day Drip** — For non-responsive leads
- **Reactivation** — Triggers on price drops, new listings, market alerts
- **Appointment Reminders** — 24hr + 1hr before showing

## OpenClaw Agent Configuration

The AI agent uses:
1. GHL contact + conversation data for context
2. IDX API for real-time listing data
3. LPMAMA qualification framework
4. Prompt templates per lead source and stage

## IDX Integration

- Requires BA (Back-End Access) agreement with the client's real estate board
- Client signs the IDX agreement and authorizes us as their data provider
- Integration via RETS feed or CREA DDF (Canadian boards) or MLS Web API
- Data used for: listing lookups, comparables, neighborhood data, new listing alerts

## ElevenLabs Voice (Phase 3)

- Outbound calls via Twilio integration (connected through GHL or direct)
- "Homie" voice agent created with custom system prompt
- Call transcripts stored in GHL contact notes automatically
- Client billed directly for ElevenLabs API usage

## Security & Data

- All lead data stored in client-owned GHL account
- OpenClaw connects via API — no data stored on our servers
- IDX data used only for AI context, not stored separately
- SMS sent from client's GHL phone number

## Scaling

GoHighLevel handles up to 100,000+ contacts natively. For concurrent AI conversations at scale:
- GHL automation workflows queue messages
- OpenClaw processes asynchronously via webhooks
- Rate limiting applied per carrier (SMS) and API (ElevenLabs)

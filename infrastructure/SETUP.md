# Setup Guide

## Prerequisites

- GoHighLevel account (Agency plan, $297–$497/mo)
- ElevenLabs account (optional, for voice)
- IDX agreement signed with client's real estate board
- Client lead database exported (CSV)

## Environment Variables

Copy `.env.example` to `.env` and fill in:

```bash
# GoHighLevel
GHL_API_KEY=
GHL_LOCATION_ID=

# ElevenLabs (optional)
ELEVENLABS_API_KEY=
ELEVENLABS_AGENT_ID=

# IDX (board-dependent)
IDX_API_KEY=
IDX_BOARD_ID=
IDX_FEED_URL=
```

## Phase 1 Checklist

### GoHighLevel
- [ ] Create sub-account for Royal LePage
- [ ] Import lead database (CSV → Contacts)
- [ ] Tag and segment by source, recency, intent
- [ ] Set up pipeline: New Lead → Attempted Contact → Contacted → Qualified → Appointment Set → Handed Off → Nurture
- [ ] Create calendars (one per agent or team)
- [ ] Set up phone number (Twilio via GHL)
- [ ] Create Instant Response campaign (SMS < 60 sec)
- [ ] Create 7-Day Drip campaign

### OpenClaw Agent
- [ ] Configure agent with LPMAMA qualification prompt
- [ ] Connect GHL via webhook
- [ ] Connect IDX feed
- [ ] Test conversation flow end-to-end

### IDX Integration
- [ ] Confirm board (e.g. TRREB, REBGV, etc.)
- [ ] Client signs IDX agreement
- [ ] Get BA data access credentials
- [ ] Test listing lookups

## Phase 3 Checklist (Voice AI)

- [ ] Create ElevenLabs Conversational AI agent ("Homie")
- [ ] Connect Twilio number to ElevenLabs
- [ ] Set per-call system prompt (personalized by lead)
- [ ] Test outbound call flow
- [ ] Wire transcript → GHL note automation

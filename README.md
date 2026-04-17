# Royal LePage — AI Lead Management Platform

AI-powered lead conversion system to replace Verse.ai. Manages 80,000–100,000+ leads via SMS, email, and voice AI using GoHighLevel + IDX/MLS + ElevenLabs + Homie.

## Stack

| Layer | Technology |
|-------|-----------|
| CRM & Messaging | GoHighLevel |
| AI Orchestration | OpenClaw (custom agent harness) |
| MLS Data | IDX integration (board-approved BA) |
| Voice AI | ElevenLabs (optional, client-billed) |
| Agent OS | Homie (OpenClaw for Realtors) |

## Phases

- **Phase 1** (2–4 weeks) — CRM setup, lead ingestion, SMS AI, basic IDX, appointment booking
- **Phase 2** (2–3 weeks) — Advanced IDX intelligence, reactivation campaigns, reporting
- **Phase 3** (2–4 weeks) — Voice AI, Homie full deployment, custom brokerage workflows

## Docs

- [`docs/SCOPING.md`](docs/SCOPING.md) — Full client scoping document
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — Technical architecture
- [`docs/PRICING.md`](docs/PRICING.md) — Pricing model and ROI comparison
- [`infrastructure/`](infrastructure/) — GHL setup, IDX config, env templates

## Quick Start

See [`infrastructure/SETUP.md`](infrastructure/SETUP.md) for environment setup.

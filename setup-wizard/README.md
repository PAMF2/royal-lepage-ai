# Setup Wizard

Next.js 3-step onboarding UI for Royal LePage AI platform. Guides brokers from zero to live in minutes.

## What It Does

The setup wizard is the first experience a Royal LePage broker has when deploying the platform. It:

1. **Step 1: Connect** — Enter API keys (FUB, Twilio, SendGrid, Supabase, Anthropic; optionally IDX & ElevenLabs)
   - Validates credentials in real-time
   - Auto-generates webhook secret (`FUB_WEBHOOK_SECRET`) and `INTERNAL_SECRET`
   - Downloads `.env` file for easy deployment

2. **Step 2: Activate** — Configures FollowUpBoss
   - Seeds custom fields via `fub-setup/` (homie_score + 5 LPMAMA fields)
   - Reminds the operator to configure pipelines and webhook subscriptions in the FUB UI
     (pipelines and webhooks aren't fully API-driveable on FUB)
   - Drip campaigns (7-day, reactivation, reminders, monthly nurture) are owned by
     BullMQ workers in `queue/` — no extra setup needed here

3. **Step 3: Import** — Bulk CSV lead import
   - Drag-and-drop CSV upload
   - Auto-starts import on file load
   - Real-time progress bar (1000s per minute)
   - Shows errors (no phone/email) and skipped rows

## Environment Variables

No environment variables needed — the wizard stores credentials locally in browser after validation.

For development:
- `NEXT_PUBLIC_ORCHESTRATOR_URL` — Optional; defaults to window.location.origin

## Running Locally

```bash
cd setup-wizard
npm install
npm run dev
```

Opens on http://localhost:3010

## Building & Deployment

```bash
npm run build
npm start
```

Serves on port 3010 by default.

## How It Fits In

The wizard is **first contact** in the onboarding flow:

```
Broker lands on wizard → Step 1: Enter keys → Step 2: Auto-configure FUB
                           ↓
                        Stored locally
                           ↓
                        Step 3: Upload CSV
                           ↓
                        /api/migrate endpoint
                        processes in background
```

After step 3 completes:
- Leads are in FollowUpBoss
- Webhooks fire when leads are created/messaged
- Orchestrator (port 3000) receives webhooks
- AI agent starts qualifying leads
- Monitoring (port 3002) tracks all interactions

## CSV Format

Expected columns (any order, case-insensitive):
- `firstName` — Contact first name (required if no email)
- `lastName` — Contact last name
- `email` — Email address (required if no phone)
- `phone` — Phone number (required if no email)
- `source` — Lead source (defaults to "CSV Import")
- `city` — Target area for property search
- `budget` — Max purchase price
- `timeline` — "ASAP", "3-6 months", "6-12 months"
- `tags` — Pipe-separated tags (e.g. "buyer|pre-approved")

Rows missing both phone and email are skipped (counted in errors).

## API Routes

Internal routes called by the frontend:

- `POST /api/verify` — Validate credentials
  - Input: FUB API key, Twilio creds, SendGrid key, Supabase URL/key, Anthropic key
  - Returns: array of checks (FUB, Twilio, SendGrid, Supabase, Anthropic, IDX, ElevenLabs)

- `POST /api/setup` — Configure FollowUpBoss
  - Input: FUB credentials
  - Returns: step-by-step setup progress
  - Side effects: seeds custom fields via `fub-setup/`
  
- `POST /api/migrate` — Start CSV import
  - Input: credentials, CSV text
  - Returns: Job ID
  - Side effects: spawns worker process
  
- `POST /api/config` — Save credentials locally (server-side storage)
  - Input: creds object or flags (fubConfigured)
  - Returns: saved config
  
- `GET /api/config` — Retrieve saved config
  - Returns: stored credentials (if any)
  
- `GET /api/progress` — EventSource stream for import progress
  - Returns: SSE stream with total, done, errors, logs

## Key Features

- **Credential Validation** — Checks FUB / Twilio / SendGrid / Supabase / Anthropic / IDX creds
- **Auto-Config** — Seeds FUB custom fields in ~10s (pipelines + webhooks configured in FUB UI)
- **Resume Support** — If wizard is closed mid-setup, can resume from last step
- **Real-time Progress** — EventSource SSE for live import updates
- **Responsive Design** — Works on mobile for broker onboarding calls
- **Error Handling** — Retryable steps, detailed error messages

## Code Structure

- `src/app/page.tsx` — Main wizard component with 3 steps
  - `Step1` — Credentials entry + validation
  - `Step2` — FUB auto-setup (polling for progress)
  - `Step3` — CSV upload + import streaming
  
- `src/app/layout.tsx` — Root layout, Royal LePage branding
  
- `src/app/api/verify/route.ts` — Credential validation endpoint
  
- `src/app/api/setup/route.ts` — FUB configuration endpoint
  
- `src/app/api/migrate/route.ts` — CSV import starter
  
- `src/app/api/progress/route.ts` — SSE progress stream
  
- `src/app/api/config/route.ts` — Credential storage
  
- `src/lib/fub.ts` — FollowUpBoss API utilities
  
- `src/lib/progress.ts` — In-memory import state tracking

## Testing the Wizard

To test locally with real FUB:

1. Get a test API key from FUB Settings → API
2. Enter it (plus Twilio/SendGrid sandbox keys) in Step 1
3. Step 2 should seed the custom fields
4. Step 3: create a test CSV with 5 rows
5. Watch import progress and verify people appear in FUB

For testing without FUB keys:
- Wizard will show validation errors in Step 1
- Can still test UI flow by commenting out credential checks (dev mode)

## Performance

- Step 1 validation: <1s
- Step 2 auto-config: 15-30s (parallel API calls)
- Step 3 import: ~1000 leads/min with 10 concurrent FUB requests

For large CSV files (10k+ rows), import runs as a background job.

## Security

- Credentials validated before storing
- No credentials logged to console
- WEBHOOK_SECRET auto-generated with crypto.getRandomValues()
- All API calls use Bearer token in Authorization header
- HMAC-SHA256 signature verification on FUB webhooks

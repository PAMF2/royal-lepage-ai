# GHL Setup

One-time GoHighLevel account configuration script. Automates the tedious manual setup in the GHL UI.

## What It Does

Runs once at deployment to configure GoHighLevel for the Royal LePage platform:

1. **Custom Fields** — Creates homie_score, LPMAMA fields (city, budget, timeline, motivation, mortgage_status)
2. **Pipeline** — Builds sales funnel with 7 stages (New → Attempted → Contacted → Qualified → Booked → Handed Off → Nurture)
3. **Webhooks** — Registers two webhooks (ContactCreated, InboundMessage) pointing to orchestrator
4. **Campaigns** — Creates 4 drip campaigns (7-day nurture, reactivation, appointment reminders, monthly nurture)
5. **Custom Values** — Sets pipeline stage details (name, description, order)

After this runs, GHL is ready to receive leads and send webhooks to the orchestrator.

## Environment Variables

Required:
- `GHL_API_KEY` — GoHighLevel API key
- `GHL_LOCATION_ID` — Your GHL location ID
- `ORCHESTRATOR_URL` — Public URL of deployed orchestrator (e.g. https://your-app.railway.app)

Optional:
- `WEBHOOK_SECRET` — HMAC secret for verifying webhook signatures (auto-filled by setup wizard)

## Running

### Via Setup Wizard

The setup wizard handles this automatically in Step 2:

```bash
# No manual step needed — wizard calls this internally
```

### Manual Setup

If you need to reconfigure:

```bash
cd ghl-setup
npm install

GHL_API_KEY=xxx GHL_LOCATION_ID=yyy ORCHESTRATOR_URL=https://your-app.railway.app npm run setup
```

### Verify Configuration

After setup completes, run verification:

```bash
GHL_API_KEY=xxx GHL_LOCATION_ID=yyy npm run verify
```

Checks:
- Pipeline exists and has 7 stages
- Custom fields are created
- Webhooks are registered
- Campaigns exist

## Workflow

The setup script runs these operations in sequence:

### 1. Custom Fields (customFields)

Creates 6 new fields in your location:

| Field | Type | Description |
|-------|------|-------------|
| `homie_score` | Number | Lead score 0-100 (updated daily by scoring engine) |
| `city` | Text | Target area for property search |
| `budget` | Text | Max purchase price (e.g. "$500k-$750k") |
| `timeline` | Text | When they want to move (ASAP, 3-6 months, etc.) |
| `motivation` | Text | Why they're moving |
| `mortgage_status` | Text | Financing status (pre-approved, needs-financing, cash) |

If fields already exist, they're skipped (no error).

### 2. Custom Values (customValues)

Sets up dropdown options for pipeline stages:
- "New Lead", "Attempted Contact", "Contacted", "Qualified", "Appointment Set", "Handed Off", "Nurture"

Used by the agent to track which stage a lead is in.

### 3. Pipeline (pipeline)

Creates a sales pipeline with 7 stages:

1. **New Lead** — Just added to GHL, not contacted yet
2. **Attempted Contact** — Agent tried to reach them
3. **Contacted** — Agent made contact
4. **Qualified** — Met LPMAMA criteria, ready for human agent
5. **Appointment Set** — Showing or consultation scheduled
6. **Handed Off** — Assigned to human broker
7. **Nurture** — Long-term follow-up

Each stage has order (controls display in GHL UI) and description.

### 4. Webhooks (webhooks)

Registers two webhooks on your location:

| Event | URL | Purpose |
|-------|-----|---------|
| `ContactCreated` | `/webhook/lead` | New lead arrives → send first SMS |
| `InboundMessage` | `/webhook/message` | Lead replies → resume conversation |

GHL POSTs to these URLs when events happen. Orchestrator receives and processes.

### 5. Campaigns (campaigns)

Creates 4 email/SMS campaigns for drip sequences:

| Campaign | Trigger | Sequence |
|----------|---------|----------|
| **7-Day Nurture** | Auto-enroll all leads | Day 1, 3, 5, 7 SMS/email check-ins |
| **Reactivation** | Manual (reactivation engine) | Win-back sequence for dormant leads |
| **Appointment Reminders** | Manual (when booking appointment) | Reminder SMS 24h before showing |
| **Monthly Nurture** | Auto-enroll qualified leads | Monthly market updates + new listings |

Campaigns are templated (see `campaign-templates/` in repo root).

## API Operations

The script uses GHL API v2021-07-28 with Bearer token authentication:

```
POST https://services.leadconnectorhq.com/custom-fields/
POST https://services.leadconnectorhq.com/pipelines/
POST https://services.leadconnectorhq.com/webhooks/
POST https://services.leadconnectorhq.com/campaigns/
```

Each operation:
1. Validates credentials
2. Posts config to GHL
3. Returns created IDs
4. Stores IDs in environment (for orchestrator to reference)

## Output Example

```bash
$ GHL_API_KEY=xxx GHL_LOCATION_ID=yyy ORCHESTRATOR_URL=https://app.railway.app npm run setup

Royal LePage GHL Setup

✓ Created custom fields (homie_score, city, budget, timeline, motivation, mortgage_status)
✓ Created pipeline with 7 stages
  - Stage IDs: stage_new=xxx, stage_attempted=yyy, stage_contacted=zzz, ...
✓ Registered webhooks
  - ContactCreated → https://app.railway.app/webhook/lead
  - InboundMessage → https://app.railway.app/webhook/message
✓ Created 4 campaigns (7-day, reactivation, reminders, monthly)
  - Campaign IDs: drip_7day=xxx, reactivation=yyy, ...

✓ Setup complete. Royal LePage GHL is ready.
  Next: run 'make verify' to confirm all connections.
```

## Storing Setup Results

After setup completes, save these IDs to your `.env`:

```bash
GHL_PIPELINE_ID=pipe_abc123xyz
GHL_CALENDAR_ID=cal_def456uvw
GHL_STAGE_NEW_LEAD=stage_ghi789rst
GHL_STAGE_ATTEMPTED=stage_jkl012opq
GHL_STAGE_CONTACTED=stage_mno345lmn
GHL_STAGE_QUALIFIED=stage_pqr678ijk
GHL_STAGE_APPOINTMENT_SET=stage_stu901def
GHL_STAGE_HANDED_OFF=stage_vwx234ghi
GHL_STAGE_NURTURE=stage_yza567jkl
GHL_CAMPAIGN_DRIP_7DAY=camp_bcd890klm
GHL_CAMPAIGN_REACTIVATION=camp_efg123nop
GHL_CALENDAR_ID_SHOWINGS=cal_hij456qrs
```

The setup wizard auto-saves these.

## Code Structure

- `src/index.ts` — Main orchestrator, runs all steps in order
- `src/custom-fields.ts` — Create 6 custom fields
- `src/custom-values.ts` — Create dropdown options for stages
- `src/pipeline.ts` — Create 7-stage pipeline
- `src/webhooks.ts` — Register ContactCreated + InboundMessage webhooks
- `src/campaigns.ts` — Create 4 drip campaigns
- `src/verify.ts` — Verify all resources are created

## Verification

```bash
npm run verify
```

Checks:
- Custom fields exist (homie_score, city, budget, etc.)
- Pipeline has 7 stages
- Webhooks are registered and pointing to correct URL
- Campaigns are created
- All IDs are stored in environment

Example output:
```
Verification Report
===================

✓ Custom fields: 6/6 created
✓ Pipeline: 1 found with 7 stages
✓ Webhooks: 2 registered
  - ContactCreated → https://app.railway.app/webhook/lead
  - InboundMessage → https://app.railway.app/webhook/message
✓ Campaigns: 4 created

All checks passed. Your GHL is ready for Royal LePage.
```

## Idempotency

The setup script is **idempotent** — you can run it multiple times safely:

- Creating an existing field: GHL returns 409 Conflict, script skips (no error)
- Creating an existing pipeline: Same behavior
- Updating webhooks: Old ones are kept, new URL is registered again

Safe to run during updates or troubleshooting.

## Troubleshooting

**"GHL 401 Unauthorized"** — API key expired or invalid. Get a fresh one from Settings → Integrations.

**"GHL 400: Invalid location ID"** — Location ID doesn't exist or user doesn't have access. Check Settings → Business Info.

**"GHL 500: Internal Server Error"** — Temporary GHL outage. Wait and retry.

**Webhooks not firing** — Check:
1. Setup ran without errors
2. Orchestrator is publicly accessible at ORCHESTRATOR_URL
3. GHL can reach your server (test with curl from GHL server IP range)

**Custom fields missing from GHL UI** — Fields are created but hidden by default. Show them:
1. Go to Contacts → Custom Fields
2. Find the field, toggle visibility on

## Manual Reconfiguration

If you need to change webhook URLs or pipeline:

1. Delete old pipeline/webhooks in GHL UI
2. Update ORCHESTRATOR_URL environment variable
3. Run `npm run setup` again

Or use GHL UI directly:
- Settings → Integrations → Webhooks
- Change URL, save

The setup script just automates this.

## Dry Run

To preview what would be created without making changes:

```typescript
// In src/index.ts, add early exit:
console.log("DRY RUN — would create:");
console.log("  Custom fields:", fieldNames);
console.log("  Pipeline stages:", stageNames);
process.exit(0);
```

Then run:
```bash
npm run setup -- --dry-run
```

## Dependencies

- `ioredis` — Optional, not used in current version (kept for future state management)

## Next Steps After Setup

1. Configure campaigns (edit templates in GHL UI if needed)
2. Test by adding a contact manually in GHL
3. Verify webhook fires (check orchestrator logs)
4. Import lead CSV (setup wizard Step 3)
5. Start orchestrator worker
6. Check monitoring dashboard for live logs

## Support

If setup fails:
1. Check all environment variables are set
2. Run `npm run verify` to see what's missing
3. Check orchestrator logs for webhook delivery errors
4. Contact GHL support if API is returning 500s

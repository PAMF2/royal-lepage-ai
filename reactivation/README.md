# Reactivation

Scheduled engine that re-engages dormant leads with personalized listings and price drop triggers.

## What It Does

Reactivation runs on a daily schedule (via cron or manual trigger) and:

1. **Finds dormant leads** — Contacts not reached in 30+ days (configurable)
2. **Filters out DNC** — Skips "do-not-contact" and "closed" leads
3. **Gets matching listings** — Searches IDX/MLS for new listings or price drops in their area
4. **Generates personalized SMS** — Uses Claude to write warm re-engagement messages
5. **Enrolls in campaign** — Adds them to the reactivation drip campaign
6. **Logs every interaction** — Records message sent and trigger reason

Result: Dormant leads get a personalized message about a listing that matches their criteria, bringing them back into active consideration.

## Environment Variables

Required:
- `GHL_API_KEY` — GoHighLevel API key
- `GHL_LOCATION_ID` — Your GHL location
- `ANTHROPIC_API_KEY` — Claude API key for message generation

Optional:
- `IDX_API_KEY` — IDX provider API key (for property lookups)
- `IDX_API_SECRET` — IDX provider secret
- `GHL_CAMPAIGN_REACTIVATION` — Campaign ID to enroll leads in (optional)
- `DORMANT_DAYS` — Days since last contact to mark as dormant (default: 30)
- `MAX_PER_RUN` — Max leads to process per run (default: 200)

## Running

### Local (One-off)

```bash
cd reactivation
npm install
npm run start
```

This runs once and exits.

### Production (Scheduled)

Add to your cron schedule (runs daily):

```bash
0 9 * * * cd /path/to/reactivation && npm run start
```

Or via Docker/Kubernetes CronJob:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: lead-reactivation
spec:
  schedule: "0 9 * * *"  # 9 AM UTC daily
  jobTemplate:
    spec:
      template:
        spec:
          containers:
          - name: reactivation
            image: node:20
            command: ["npm", "run", "start"]
            env:
            - name: GHL_API_KEY
              valueFrom:
                secretKeyRef:
                  name: ghl-secrets
                  key: api-key
            # ... other env vars
          restartPolicy: OnFailure
```

## How It Fits In

Reactivation is a **background job** that complements the real-time agent:

```
Real-time: New lead/message → Orchestrator → Qualify in conversation

Background: Every 24h → Reactivation → Find dormant → Send SMS
                                        ↓
                                   Monitoring logs
```

Combined, they ensure:
- Hot leads get immediate attention
- Dormant leads get periodic check-ins
- No opportunity falls through the cracks

## Workflow

1. **Find Dormant Leads**
   - Query GHL for all contacts sorted by `dateLastContacted`
   - Filter to exclude:
     - DNC/do-not-contact tags
     - "handed-off" (assigned to agent)
     - "closed" deals
   - Keep only those last contacted > 30 days ago
   - Limit to MAX_PER_RUN (default 200 to avoid hitting rate limits)

2. **Get Matching Listings**
   - Query IDX for new listings in their target city (new in last 7 days)
   - Query IDX for price drops in their budget range
   - If new listings found: use that as trigger
   - Else if price drops found: use that as trigger
   - Else: generic "market update" trigger

3. **Generate Message**
   - Call Claude with lead context (name, budget, city, trigger, listing)
   - Prompt: "Write a warm, 160-char SMS re-engagement message"
   - Example output: "Hey John, catching up — just saw a new listing in Oakville that matches your criteria. Still actively looking? Let's chat 🏡"

4. **Send & Log**
   - Send SMS via GHL
   - Add note to contact with message + trigger reason
   - Enroll in reactivation campaign (if campaign ID set)
   - Sleep 1.2s between contacts to respect GHL rate limits (5 req/s max)

5. **Report**
   - Print summary: "Reactivated: 156/200, Failed: 3"

## Output Example

```bash
Reactivation engine starting (dormant threshold: 30 days)...

Found 200 dormant leads.

  Reactivated: 200/200

Done. Reactivated: 200 | Failed: 0
```

## Code Structure

- `src/index.ts` — Main runner with async/await flow control
  - `getDormantLeads()` — Query GHL, filter
  - `getMatchingListings(contact)` — IDX search
  - `generateReactivationMessage(contact, trigger, snippet)` — Claude call
  - `run()` — Orchestrates the workflow

- `src/logic.ts` — Shared utilities (optional, empty in current version)

## Rate Limiting & Throttling

- GHL API: 5 requests/second limit
  - 1.2s delay between contacts → ~50 leads per minute → 200 leads = 4+ minutes
- IDX API: Depends on provider (usually 100 req/min)
  - Batches requests, usually fast
- Anthropic API: No strict rate limit, but can be slow on claude-opus
  - 200 leads * 1-2s per message = 3-6 minutes

Total run time for 200 leads: **~8-10 minutes**

## Personalization

The reactivation engine customizes messages using contact fields:

- `firstName` — "Hi John"
- `city` (custom field) — "new listing in Oakville"
- `budget` (custom field) — "matches your $500k range"
- `trigger` — "price drop" or "new listing"

If these fields are missing, defaults are used.

## Filtering Logic

Leads are considered **reactivatable** if:
- No "dnc" or "no-contact" tag
- No "handed-off" or "closed" tag
- Last contacted > 30 days ago (or date not set, meaning very old)
- Has phone number (for SMS)

## Monitoring & Logging

Each reactivation run is logged to the monitoring service if it supports background job logs. Summary line:

```
[REACTIVATION] 200 leads contacted, 156 successful, 3 failed, 8 min runtime
```

Failed contacts are logged with error details:
```
Error for contact abc123: GHL 401 Unauthorized
```

## Integration with Workflows

After reactivation SMS is sent and lead responds:
- Inbound message webhook triggers orchestrator
- Orchestrator resumes conversation from where agent left off
- Lead is re-qualified (might have new budget, timeline, or just confirmed interest)
- If qualified, appointment is booked
- Tag "reactivation-success" is added
- Lead moves to "Handed Off" stage

## Customization

### Change Dormant Threshold

```bash
DORMANT_DAYS=14 npm run start  # Reactivate if not touched in 2 weeks
```

### Limit Per Run

```bash
MAX_PER_RUN=50 npm run start  # Only process 50 leads per day
```

### Change IDX Provider

Currently hardcoded to SimplyRETS. To support CREA DDF or other:
- Modify `idx()` function to detect `IDX_PROVIDER` env var
- Add separate endpoint/auth for each provider
- Test with real data

### Custom Message Template

Instead of Claude, use hardcoded template:

```typescript
const message = `Hi ${name}, we just found a new listing in ${city} that matches your criteria. Are you still interested in exploring options?`;
```

## Testing Locally

To test with real GHL + IDX:

1. Set environment variables
2. Run: `npm run start`
3. Check GHL contact logs for new notes and SMSes
4. Verify monitoring service received logs

For a dry run (no API calls):
- Modify `src/index.ts` to log instead of sending
- Comment out `ghl()` calls
- Run to see which leads would be contacted

## Troubleshooting

**"Required: GHL_API_KEY, ..."** — Missing environment variables, set them and retry.

**"Found 0 dormant leads"** — Either all leads are recent, or all have DNC tags. Check GHL directly.

**"Error for contact xyz: GHL 401"** — API key expired or wrong location ID. Verify credentials.

**SMSes not sent but no errors** — Check if `phone` field is set on contacts. Contacts without phone are skipped.

**"Error: IDX_API_KEY is not set"** — IDX is optional; set it to enable property lookups. Without it, all messages use generic "market update" trigger.

## Performance

- 200 leads/run: ~8-10 minutes
- 500 leads/run: ~20-25 minutes
- 1000+ leads: Consider splitting into multiple runs (e.g., every 6 hours)

For high volume, could add parallel processing (careful with rate limits):

```typescript
// Current: sequential, safe
for (const contact of dormant) { await process(contact); }

// Parallel: faster, but watch rate limits
await Promise.all(dormant.map(async c => await process(c)));
```

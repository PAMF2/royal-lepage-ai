# Lead Scoring

Automated lead scoring engine that ranks all contacts 0-100 and assigns tiers (hot, warm, cold) for prioritization.

## What It Does

Lead scoring runs daily (or on-demand) and:

1. **Fetches all contacts** from GoHighLevel
2. **Scores each lead** 0-100 based on buying intent signals
3. **Tags leads** with tier (score-hot, score-warm, score-cold)
4. **Stores score** in custom field homie_score for sorting/filtering
5. **Reports results** — "Scored 1,234 contacts"

Brokers use scores to prioritize follow-up: hot leads get immediate attention, cold leads go to nurture campaigns.

## Scoring Factors

Maximum 100 points distributed across 5 dimensions:

### 1. Recency (30 points)
When was lead added or last contacted?
- 0-1 days: 30 points (fresh lead)
- 1-7 days: 20 points
- 7-30 days: 10 points
- 30-90 days: 5 points
- 90+ days: 0 points

### 2. Contact Completeness (20 points)
How much info do we have?
- Phone: 10 points
- Email: 5 points
- First & Last name: 5 points

### 3. Engagement Tags (25 points)
What actions has the lead taken?
- Hot tags (10 pts each): hot-lead, pre-approved, cash-buyer, motivated, appointment-set
- Warm tags (5 pts each): warm-lead, buyer, seller, contacted
- Bad tags (-15 pts each): dnc, no-answer-3x

### 4. LPMAMA Completeness (25 points)
How much qualification data do we have?
- City: 5 points
- Budget: 5 points
- Timeline: 5 points
- Motivation: 5 points
- Mortgage status: 5 points

**LPMAMA** = Location, Price, Motivation, Agent, Mortgage, Appointment
(Scores the first 5; Appointment is tracked separately as "appointment-set" tag)

## Scoring Tiers

| Score | Tier | Action |
|-------|------|--------|
| 70+ | Hot (score-hot) | Immediate follow-up, prioritize in CRM |
| 40-69 | Warm (score-warm) | Regular cadence drip campaigns |
| <40 | Cold (score-cold) | Nurture campaigns, reactivation triggers |

## Environment Variables

Required:
- `GHL_API_KEY` — GoHighLevel API key
- `GHL_LOCATION_ID` — Your GHL location

Optional:
- None; all settings are embedded in scoring logic

## Running

### One-time Score

```bash
cd lead-scoring
npm install
npm run score
```

Scores all contacts and exits.

### Production (Daily)

Add to cron:

```bash
0 6 * * * cd /path/to/lead-scoring && npm run score
```

Runs every day at 6 AM UTC.

### In Docker

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "run", "score"]
```

## Workflow

1. **Fetch Contacts** (paginated)
   - GHL API: `GET /contacts?locationId={id}&limit=100&page=1`
   - Loop through all pages until no contacts returned

2. **Score Each Contact**
   ```javascript
   score = 0;
   score += scoreRecency(contact.dateAdded);       // 0-30 pts
   score += scoreCompleteness(contact);            // 0-20 pts
   score += scoreTags(contact.tags);               // -15 to 25 pts
   score += scoreLPMAMA(contact.customField);      // 0-25 pts
   return Math.min(100, Math.max(0, score));       // 0-100
   ```

3. **Determine Tier**
   ```javascript
   if (score >= 70) tier = "score-hot";
   else if (score >= 40) tier = "score-warm";
   else tier = "score-cold";
   ```

4. **Update Contact**
   - Remove old score tags (score-hot, score-warm, score-cold)
   - Add new tag matching tier
   - Set homie_score custom field to score value
   - Parallel requests (max 10 per batch)

5. **Respect Rate Limits**
   - GHL: 5 req/sec limit
   - 1.2s delay between batches to stay safe

## Output Example

```
Starting lead scoring run...

  Scored 1234/1234 contacts...

Done. Scored 1234 contacts total.
```

With details:
```
Hot (70+): 234 leads (19%)
Warm (40-69): 567 leads (46%)
Cold (<40): 433 leads (35%)
```

## Custom Fields Required

The scorer assumes these custom fields exist in your GHL location:

- `homie_score` — Integer 0-100 (created by setup wizard)
- `city` — Lead's target area
- `budget` — Max purchase price
- `timeline` — "ASAP", "3-6 months", etc.
- `motivation` — Why they're moving
- `mortgage_status` — "pre-approved", "needs-financing", etc.

If missing, that dimension contributes 0 points (lead still scored on other factors).

## Code Structure

- `src/index.ts` — Main runner
  - Fetches all contacts from GHL
  - Calls scoreContact() for each
  - Updates tags and custom field
  - Progress counter

- `src/scoring.ts` — Pure scoring logic
  - `scoreContact(contact)` → 0-100
  - `scoreTier(score)` → { tag, remove[] }
  - Testable without API calls

- `src/scoring.test.ts` — Unit tests
  ```bash
  npm test
  ```

## Example Scores

**Lead A: John Doe**
- Added: 2 days ago (+30 recency)
- Phone: yes (+10), Email: yes (+5), Full name: yes (+5)
- Tags: pre-approved (+10), buyer (+5) = +15
- City filled (+5), Budget filled (+5), Timeline filled (+5) = +15
- **Total: 80 points** → Tier: Hot

**Lead B: Jane Smith**
- Added: 45 days ago (+10 recency)
- Phone: no (0), Email: yes (+5), Full name: yes (+5)
- Tags: contacted (+5)
- Only city filled (+5) = +5
- **Total: 30 points** → Tier: Cold

**Lead C: Bob Johnson**
- Added: 15 days ago (+20 recency)
- Phone: yes (+10), Email: no (0), Full name: yes (+5)
- Tags: hot-lead (+10), motivated (+10)
- City filled (+5), Budget filled (+5), Timeline filled (+5), Motivation filled (+5) = +20
- **Total: 70 points** → Tier: Hot (borderline)

## Filtering & Reporting

In GHL, filter by tag:
- **Immediate action**: tag = "score-hot"
- **Regular follow-up**: tag = "score-warm"
- **Nurture**: tag = "score-cold"

Or in dashboard, filter by homie_score field:
```javascript
leads.filter(l => l.homie_score >= 70)  // Hot leads
```

## Integration with Other Services

### Orchestrator
When agent qualifies a lead, it adds tags like "hot-lead", "pre-approved", etc. Next score run picks these up.

### Reactivation
Reactivation engine skips DNC and closed leads (low scores). Then sends to warm/cold leads.

### Lead Import
After CSV import, first score run assigns initial scores based on whatever fields were imported.

## Customization

### Change Score Thresholds

Edit `src/scoring.ts`:

```typescript
if (score >= 80)  // Change from 70
  return { tag: "score-hot", remove: ["score-warm", "score-cold"] };
```

### Add New Scoring Factor

Example: add "engagement" score for contacts with 5+ messages:

```typescript
export function scoreContact(c: Contact): number {
  let score = 0;
  // ... existing factors ...
  
  // Engagement: 15 points for active conversationalists
  const msgCount = c.conversationCount ?? 0;
  if (msgCount >= 5) score += 15;
  
  return Math.max(0, Math.min(100, score));
}
```

### Weight by Lead Source

Prefer certain sources:

```typescript
// In scoreContact
if (c.source === "referral") score += 10;  // Referrals valued higher
if (c.source === "cold-call") score -= 5;  // Cold leads worth less
```

## Performance

- 1000 contacts: ~15 minutes (including GHL API calls)
- 10,000 contacts: ~150 minutes (~2.5 hours)
- For faster scoring, increase concurrency in `index.ts`:

```typescript
// Default: 10 concurrent requests
// Change to 20 (faster but watch rate limits)
await Promise.all(contacts.slice(0, 20).map(async c => ...));
```

## Testing

Unit tests validate scoring logic without API:

```bash
npm test
```

Tests:
- Fresh lead (0-1 day): 30 recency points
- Complete contact: 20 completeness points
- Hot lead: 70+ score → score-hot tag
- Cold lead: <40 score → score-cold tag

## Monitoring

Watch for:
- **All leads cold**: Maybe scoring is too strict (lower thresholds)
- **All leads hot**: Maybe too lenient (raise thresholds)
- **Many errors**: Check GHL API key, location ID, custom field names

## Troubleshooting

**"Required: GHL_API_KEY, GHL_LOCATION_ID"** — Set env vars.

**"0/0 contacts scored"** — No contacts in GHL yet. Import CSV first.

**Custom field homie_score is missing** — Run setup wizard Step 2 to create it.

**Scoring is very slow** — Check GHL API status or reduce batch concurrency.

**All contacts getting the same score** — Check that custom fields are being populated (city, budget, etc.).

## Alerts & Monitoring

Set up daily alerts:

```bash
# Alert if all leads are low-scoring (broken scoring or empty GHL)
low_count=$(curl -s http://localhost:3001/api/leads?score=40 | jq 'length')
if [[ $low_count -gt 500 ]]; then
  alert "WARNING: Most leads scoring cold. Check scoring logic."
fi
```

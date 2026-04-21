# Data Migration

Bulk lead importer — imports up to 100,000 contacts from CSV into GoHighLevel in parallel batches.

## What It Does

The data migration tool is used during initial setup to populate GoHighLevel with your lead database:

1. **Reads CSV file** — Supports up to 100k rows
2. **Parses headers** — Auto-detects column names (case-insensitive)
3. **Validates data** — Checks for required fields (email and/or phone)
4. **Creates contacts** — Posts each lead to GHL API with batch parallelization
5. **Tracks progress** — Real-time counter: "Imported: 500/10000"
6. **Handles errors** — Retries failed requests, logs skipped rows

Performance: ~1000 leads per minute with default batch size of 10.

## Environment Variables

Required:
- `GHL_API_KEY` — GoHighLevel API key
- `GHL_LOCATION_ID` — Your GHL location ID

Optional:
- None; all settings via command-line flags

## Running

### Basic Import

```bash
cd data-migration
npm install

# Import a CSV file
npm run migrate -- --file leads.csv
```

### Dry Run (No API Calls)

Preview what would be imported without actually creating contacts:

```bash
npm run migrate -- --file leads.csv --dry-run
```

Output:
```
Reading leads.csv...
Found 10000 leads.

DRY RUN — first 3 rows:
  1. {"firstName":"John","lastName":"Doe","email":"john@example.com","phone":"+12125551234","city":"New York"}
  2. {"firstName":"Jane","lastName":"Smith","email":"jane@example.com","phone":"+12125555678","city":"Los Angeles"}
  3. {"firstName":"Bob","lastName":"Johnson","email":"bob@example.com","phone":"+13105552222","city":"Chicago"}

Would import 10000 contacts into GHL location abc123xyz.
```

### Custom Batch Size

```bash
npm run migrate -- --file leads.csv --batch-size 25
```

Default: 10 (increase for faster imports, watch GHL rate limits)

### Custom Lead Source

```bash
npm run migrate -- --file leads.csv --source "LinkedIn Leads"
```

Default: "CSV Import"

## CSV Format

Expected columns (any order, case-insensitive, spaces ignored):

| Column | Type | Required | Notes |
|--------|------|----------|-------|
| firstName | string | No | Used for personalization |
| lastName | string | No | Combined with firstName for full name |
| email | string | If no phone | Unique identifier |
| phone | string | If no email | Normalized and stored as-is |
| source | string | No | Lead origin (defaults to --source flag) |
| city | string | No | Stored in custom field "city" |
| budget | string | No | Stored in custom field "budget" (e.g. "$500k-$750k") |
| timeline | string | No | Stored in custom field "timeline" |
| tags | string | No | Pipe-separated list (e.g. "buyer\|pre-approved\|motivated") |

### CSV Example

```csv
firstName,lastName,email,phone,source,city,budget,timeline,tags
John,Doe,john@example.com,+12125551234,Website,New York,$500k-$750k,ASAP,buyer|pre-approved
Jane,Smith,jane@example.com,+12125555678,Referral,Los Angeles,$300k-$500k,3-6 months,buyer|motivated
Bob,Johnson,,+13105552222,LinkedIn,Chicago,$800k+,6-12 months,seller
```

### CSV with Quoted Fields

Handles standard CSV quoting:

```csv
"firstName","lastName","email","phone","city"
"John","Doe","john@doe.com","+1-212-555-1234","New York, NY"
```

## Workflow

1. **Parse File**
   - Read CSV line-by-line
   - Extract header from first row (case-insensitive, trim spaces)
   - Map column names to lead fields

2. **Build Contact**
   ```javascript
   const contact = {
     locationId: GHL_LOCATION_ID,
     firstName: row.firstName,
     lastName: row.lastName,
     email: row.email,
     phone: row.phone,
     source: row.source || "--source flag",
     tags: [...splitTags(row.tags), "csv-import"],
     customField: [
       { id: "city", value: row.city },
       { id: "budget", value: row.budget },
       { id: "timeline", value: row.timeline }
     ]
   }
   ```
   - "csv-import" tag is always added for tracking

3. **POST to GHL**
   ```
   POST https://services.leadconnectorhq.com/contacts/
   Headers: Authorization: Bearer GHL_API_KEY
   Body: contact object (JSON)
   ```

4. **Handle Results**
   - Success: increment imported counter, log contact ID
   - Failure: increment failed counter, log error message

5. **Batch Processing**
   - 10 contacts in parallel → promise.all()
   - Sleep briefly between batches (respect rate limits)
   - Resume on errors (retry on next batch)

## Performance

- Batch size 10, default rate limiting: ~1000 leads/min
- Batch size 25, aggressive: ~2500 leads/min (watch for rate limit 429s)
- For 100k leads: ~100 minutes at default settings

To speed up:
```bash
npm run migrate -- --file leads.csv --batch-size 50
```

To slow down (safer):
```bash
npm run migrate -- --file leads.csv --batch-size 5
```

## Error Handling

If a batch partially fails (e.g., 2/10 succeed):
- Successful contacts are created in GHL
- Failed contacts are counted but not retried (logged to console)
- Next batch starts immediately

Example failure output:
```
  Batch 5: 8/10 successful
    Error: contact 3 — GHL 400: Invalid email format
    Error: contact 7 — GHL 409: Duplicate email
```

## Output

```bash
$ npm run migrate -- --file my_leads.csv

Reading my_leads.csv...
Found 10000 leads.

  Imported: 1000/10000 (100 failed)
  Imported: 2000/10000 (120 failed)
  ...
  Imported: 10000/10000 (180 failed)

Done. Imported 9820 contacts. Failed: 180. Skipped: 0.

Failed contacts (reasons):
  - GHL 400: Invalid email — 60 contacts
  - GHL 409: Duplicate email — 100 contacts
  - GHL 401: Unauthorized — 20 contacts
```

## Handling Duplicates

GHL prevents duplicate emails by default. If importing a CSV with duplicates:

1. Dedup before import:
   ```bash
   sort -t, -k3 leads.csv | uniq -f2 > leads_dedup.csv
   ```

2. Or allow GHL to skip (default behavior):
   - GHL returns 409 Conflict
   - Lead is skipped, logged as failed
   - Next lead proceeds normally

## Custom Fields

The importer creates custom fields on-the-fly if they don't exist:
- `city` — Target area for property search
- `budget` — Max purchase price
- `timeline` — When they want to move

These fields are referenced by the agent and scoring engine.

If these fields already exist in GHL:
- Importer still sends them (no error)
- GHL updates existing fields
- No data loss

## Tags

Tags are added to track:
- **Source**: Whatever you pass (--source flag or CSV column)
- **csv-import**: Always added to mark as bulk import

Example: A lead from "LinkedIn Leads" CSV gets tags: `["LinkedIn Leads", "csv-import"]`

Use tags later to filter: "Show me all contacts with tag=csv-import"

## Code Structure

- `src/index.ts` — Main runner with CLI argument parsing
  - Parses `--file`, `--dry-run`, `--batch-size`, `--source` flags
  - Orchestrates read → parse → validate → import

- `src/csv.ts` — CSV parser
  - `parseCsv(filePath)` — Read file line-by-line, handle quoted fields
  - Returns array of lead row objects

## Integration with Setup Wizard

The data migration can also be triggered from the setup wizard (Step 3):

```javascript
// In setup-wizard/src/app/api/migrate/route.ts
// This endpoint reads the CSV sent by the browser and calls data-migration
const result = await import('royal-lepage-data-migration');
await result.migrate(csvText, creds);
```

## Testing

To test locally:

1. Create a test CSV:
   ```csv
   firstName,lastName,email,phone,city,budget
   Alice,Wonder,alice@example.com,+12125551111,Toronto,$500k-$750k
   Bob,Builder,bob@example.com,+12125552222,Vancouver,$750k-$1M
   ```

2. Run dry-run:
   ```bash
   npm run migrate -- --file test.csv --dry-run
   ```
   
3. Check output (no API calls made)

4. Run for real (with test GHL credentials):
   ```bash
   GHL_API_KEY=xxx GHL_LOCATION_ID=yyy npm run migrate -- --file test.csv
   ```

5. Check GHL UI — should see 2 new contacts

## Troubleshooting

**"Required: GHL_API_KEY, GHL_LOCATION_ID"** — Set environment variables or use the setup wizard.

**"File not found"** — Check path. Example: `npm run migrate -- --file ../leads.csv`

**Many "Duplicate email" errors** — CSV has duplicates or existing GHL contacts. Dedup before import.

**GHL 401 Unauthorized** — API key expired or invalid. Get a fresh key from GHL Settings.

**"Expected CSV columns"** — Help message shows required fields. Ensure CSV has at least email or phone.

**Import very slow** — Check GHL API status (might be rate-limited). Reduce batch size and retry.

## Large File Handling

The parser reads line-by-line (streams), not in memory, so it handles large files efficiently:
- 100k rows = ~50 MB CSV = <500 MB memory
- Python/pandas would load entire CSV into memory (slow for 100k+ rows)

For 1 million+ rows, consider:
- Splitting into 100k-row chunks
- Running import multiple times with --batch-size 5
- Staggering across hours (avoid rate limit bursts)

# Dashboard

Next.js admin dashboard for monitoring leads, conversations, and AI agent performance across the Royal LePage platform.

## What It Does

The dashboard is the command center for brokers to monitor the AI agent in real-time:

1. **Lead Overview** — Total leads, conversion rates, pipeline distribution
2. **Live Conversations** — See messages sent/received, response times, outcomes
3. **Agent Performance** — Total agent runs, error rates, average turns per conversation
4. **Leaderboard** — Top agents by leads qualified, appointments booked
5. **Search & Filter** — Find leads by name, phone, status, score, tags
6. **Alerts** — Errors, failed webhooks, rate limit warnings

Data feeds from the monitoring service (port 3002) which aggregates logs from the orchestrator.

## Environment Variables

None required for basic setup. Optional:
- `NEXT_PUBLIC_MONITORING_URL` — Defaults to localhost:3002
- `MONITORING_SECRET` — For authenticated monitoring endpoints (if needed)

## Running Locally

```bash
cd dashboard
npm install
npm run dev
```

Opens on http://localhost:3001

## Building & Deployment

```bash
npm run build
npm start
```

Serves on port 3001 by default.

## How It Fits In

```
Orchestrator logs agent runs
    ↓
Monitoring service aggregates
    ↓
Dashboard fetches metrics
    ↓
Broker sees live data
```

Polling interval: 10s for real-time feel.

## Key Pages

- `/` — Main dashboard with overview cards + live feed
- `/leads` — Sortable/filterable leads table
- `/conversations` — Detailed conversation history
- `/performance` — Agent metrics (error rate, avg turns, response time)
- `/settings` — Configure monitoring refresh rate, alerts

## API Routes

Internal dashboard routes:

- `GET /api/leads` — Fetch paginated leads
  - Query params: page, limit, status, score, search
  - Returns: leads array with contact info + last action
  
- `GET /api/stats` — Aggregate platform stats
  - Returns: totalRuns, totalErrors, errorRate, avgTurns, avgDurationMs
  
- `GET /api/activity` — Recent conversation logs
  - Query params: limit
  - Returns: list of recent agent runs with details

Connected to monitoring service:

- `GET http://localhost:3002/metrics` — Agent performance stats
- `GET http://localhost:3002/conversations?limit=100` — Recent logs
- `GET http://localhost:3002/health` — Service health

## Key Features

- **Real-time Updates** — Auto-refresh every 10s
- **Search & Filter** — By name, phone, status, score, tags, date range
- **Conversation Replay** — See full chat history with timestamps
- **Error Tracking** — Failed webhook deliveries, agent errors
- **Export** — CSV download of leads + scores for external reporting
- **Responsive** — Mobile-friendly for on-the-go monitoring

## Code Structure

- `src/app/page.tsx` — Main dashboard overview
- `src/app/leads/page.tsx` — Leads table with search/filter
- `src/app/conversations/page.tsx` — Full conversation history
- `src/app/performance/page.tsx` — Agent metrics and analytics
- `src/app/api/leads/route.ts` — Leads data endpoint
- `src/app/api/stats/route.ts` — Aggregate stats endpoint
- `src/app/api/activity/route.ts` — Recent activity feed

Components:
- LeadCard — Summary card for a single lead
- ConversationThread — Displayed messages with timestamps
- MetricsChart — Performance trends (error rate, avg response time)
- FilterBar — Date range, status, score filters

## Data Flow

1. Orchestrator processes webhook
2. Logs to monitoring service (`POST /log`)
3. Monitoring stores in Redis (90-day retention)
4. Dashboard polls monitoring service (`GET /metrics`, `/conversations`)
5. Dashboard displays in real-time

## Example Queries

```bash
# Get all leads from past 7 days
curl http://localhost:3001/api/leads?days=7

# Get high-scoring leads (score > 70)
curl http://localhost:3001/api/leads?score=70

# Get conversation history
curl http://localhost:3001/api/activity?limit=50

# Get current platform stats
curl http://localhost:3001/api/stats
```

## Performance

- Page loads: <1s (static content)
- Metrics fetch: <200ms (Redis cache)
- Conversation history: <500ms (Redis list operations)
- Full dashboard refresh: <2s (parallel API calls)

For 100k+ leads, implement pagination and Redis indexing (see monitoring service).

## Security

- No authentication required for local dashboard (assumes internal network)
- For public deployment, add middleware for API key or OAuth
- Monitoring service validates `x-monitoring-secret` header on `/log` endpoint
- All lead data is PII — don't expose dashboard to untrusted networks

## Alerts

The dashboard watches for:
- Agent error rate > 5% — trigger notification
- Webhook delivery failures — list failed IDs
- Response time > 30s — flag as slow
- Redis connection down — show downtime banner

Alerts are stored in Redis with TTL and cleared on page refresh.

## Testing

```bash
npm test
```

Tests mock the monitoring service API responses.

## Troubleshooting

**Dashboard shows "No leads"** — Ensure monitoring service is running on port 3002 and orchestrator is sending logs.

**Metrics not updating** — Check that Redis is accessible and monitoring service is healthy (`curl http://localhost:3002/health`).

**High latency on leads page** — Implement Redis indexing or pagination for 100k+ leads.

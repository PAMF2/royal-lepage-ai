# Monitoring

Health and metrics API that logs every agent interaction and exposes platform-wide statistics.

## What It Does

The monitoring service is the telemetry backbone of Royal LePage AI:

1. **Logs Conversations** — Orchestrator POSTs every agent run with context
2. **Tracks Metrics** — Aggregates error rate, avg turns, response times
3. **Stores History** — Redis-backed 90-day conversation archive
4. **Exposes APIs** — Dashboard, alerts, and custom reports query this service
5. **Health Checks** — Orchestrator, queue, and other services ping this to verify platform is alive

All data is stored in Redis with 90-day TTL, then purged automatically.

## Environment Variables

Required:
- `REDIS_URL` — Redis connection string (default: redis://localhost:6379)

Optional:
- `MONITORING_PORT` — HTTP server port (default: 3002)
- `MONITORING_SECRET` — API key for `/log` endpoint (required in production)

## Running Locally

```bash
cd monitoring
npm install
npm run dev
```

Server listens on port 3002.

## Building & Deployment

```bash
npm run build
npm start
```

## How It Fits In

```
Orchestrator processes webhook
    ↓
Calls orchestrator (agent loop)
    ↓
When done, POSTs /log to monitoring
    ↓
Monitoring stores in Redis
    ↓
Dashboard polls /metrics and /conversations
    ↓
Broker sees real-time stats on dashboard
```

## API Endpoints

### `POST /log`

Orchestrator logs every agent run with full context.

**Headers:**
- `x-monitoring-secret` — Must match MONITORING_SECRET (optional in dev)

**Request:**
```json
{
  "contactId": "contact_abc123",
  "trigger": "new_lead",
  "turns": 3,
  "toolsUsed": ["ghl_send_sms", "ghl_add_note", "ghl_add_tags"],
  "outcome": "qualified",
  "durationMs": 2340,
  "error": null
}
```

**Response:**
```json
{
  "logged": true
}
```

**What happens:**
1. Timestamp is added (server-side)
2. Entry is stored in Redis key: `conv:${contactId}:${timestamp}`
3. Key is added to recent list: `lpush conv:recent` (for quick access)
4. Metrics are incremented:
   - `metrics:total_runs` +1
   - `metrics:total_turns` += turns
   - `metrics:total_duration_ms` += durationMs
   - `metrics:total_errors` +1 (if error is set)

### `GET /metrics`

Returns aggregate platform statistics.

**Response:**
```json
{
  "totalRuns": 10234,
  "totalErrors": 143,
  "errorRate": "1.40%",
  "avgTurns": "2.3",
  "avgDurationMs": 1850
}
```

Useful for:
- Dashboard overview cards
- Alert triggers (if errorRate > 5%)
- Performance monitoring

### `GET /conversations?limit=20`

Returns recent conversation logs in reverse chronological order.

**Query Parameters:**
- `limit` — How many to return (default: 20, max: 1000)

**Response:**
```json
[
  {
    "contactId": "contact_xyz123",
    "trigger": "incoming_message",
    "turns": 2,
    "toolsUsed": ["ghl_get_conversation", "ghl_send_sms"],
    "outcome": "contacted",
    "durationMs": 890,
    "error": null,
    "ts": 1713657600000
  },
  {
    "contactId": "contact_abc456",
    "trigger": "new_lead",
    "turns": 4,
    "toolsUsed": ["ghl_send_sms", "ghl_add_note"],
    "outcome": "qualified",
    "durationMs": 2100,
    "error": null,
    "ts": 1713657520000
  }
]
```

Useful for:
- Dashboard conversation feed
- Auditing specific lead interactions
- Training and quality assurance

### `GET /health`

Health check — verifies Redis is up.

**Response:**
```json
{
  "ok": true,
  "redis": "up"
}
```

Or on failure:
```json
{
  "ok": false,
  "redis": "down"
}
```

Status codes:
- 200 OK — Everything is fine
- 503 Service Unavailable — Redis is down

## Data Schema

### Conversation Log

```typescript
interface ConversationLog {
  contactId: string;
  trigger: "new_lead" | "incoming_message";
  turns: number;              // Agent loop iterations
  toolsUsed: string[];        // List of tools called
  outcome: string;            // "contacted", "qualified", "booked", "error"
  durationMs: number;         // Total processing time
  error?: string;             // Error message if failed
  ts: number;                 // Unix milliseconds (added by server)
}
```

### Metrics Keys (Redis)

```
metrics:total_runs        → integer
metrics:total_errors      → integer
metrics:total_turns       → integer
metrics:total_duration_ms → integer
```

Calculations done on-the-fly:
- `errorRate = (total_errors / total_runs) * 100`
- `avgTurns = total_turns / total_runs`
- `avgDurationMs = total_duration_ms / total_runs`

### Conversation Keys (Redis)

```
conv:${contactId}:${ts} → JSON string (90-day TTL)
conv:recent             → List of conversation keys (10k limit)
```

## Retention & Cleanup

- Individual conversation logs: 90 days (TTL set at POST /log)
- Recent list: Keeps last 10,000 conversations (oldest are trimmed)
- Metrics: Cumulative, never expires (reset on service restart)

To reset metrics:
```redis
DEL metrics:total_runs metrics:total_errors metrics:total_turns metrics:total_duration_ms
```

## Querying Conversations

### By Contact ID

```bash
curl http://localhost:3002/conversations?limit=100 | jq '.[] | select(.contactId == "contact_abc123")'
```

### By Outcome

```bash
curl http://localhost:3002/conversations?limit=100 | jq '.[] | select(.outcome == "qualified")'
```

### With Errors

```bash
curl http://localhost:3002/conversations?limit=100 | jq '.[] | select(.error != null)'
```

### By Date Range

```bash
curl http://localhost:3002/conversations?limit=1000 | jq --arg after "2024-04-01" '.[] | select(.ts > ($after | fromdateiso8601 | . * 1000))'
```

## Integration Examples

### From Orchestrator

After processing a lead:

```typescript
// In orchestrator/src/agent.ts, after runAgent completes
const duration = Date.now() - startTime;
const log = {
  contactId: input.contactId,
  trigger: input.trigger,
  turns: messageCount,
  toolsUsed: toolNames,
  outcome: "qualified",  // or "contacted", "error", etc.
  durationMs: duration
};

await fetch("http://localhost:3002/log", {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "x-monitoring-secret": process.env.MONITORING_SECRET
  },
  body: JSON.stringify(log)
});
```

### From Dashboard

Fetch metrics:

```typescript
// In dashboard/src/app/api/stats/route.ts
const res = await fetch("http://localhost:3002/metrics");
const metrics = await res.json();

return Response.json({
  totalRuns: metrics.totalRuns,
  errorRate: metrics.errorRate,
  avgTurns: metrics.avgTurns,
  avgDurationMs: metrics.avgDurationMs
});
```

## Performance & Scaling

For 100k leads/day:

- ~114 logs per second (86,400 sec/day)
- Redis can handle 100k+ writes/sec (plenty of headroom)
- GET /conversations for 20 records: <10ms (Redis LRANGE)
- GET /metrics: <5ms (Redis MGET on 4 keys)

No bottlenecks expected until 1M+ logs/day.

## Monitoring the Monitoring Service

Set up uptime monitoring for the health check:

```bash
# Cron job every 5 minutes
*/5 * * * * curl -f http://localhost:3002/health || alert
```

Or integrate with monitoring service (New Relic, DataDog, etc.):

```bash
curl -X POST https://api.datadoghq.com/api/v1/series \
  -H "DD-API-KEY: ${DD_API_KEY}" \
  -d @- << EOF
{
  "series": [
    {
      "metric": "royal_lepage.monitoring.health",
      "points": [[$(date +%s), $(curl http://localhost:3002/health | jq .ok)]],
      "type": "gauge"
    }
  ]
}
EOF
```

## Code Structure

- `src/index.ts` — HTTP server with 4 endpoints
  - `/health` — Redis connection test
  - `/log` — Accept conversation logs
  - `/metrics` — Return aggregate stats
  - `/conversations` — Return recent logs

## Troubleshooting

**"redis: down" on /health** — Redis is not running or unreachable.
```bash
# Check Redis
redis-cli ping
# Should return "PONG"
```

**Logs not appearing in /conversations** — Check that orchestrator is posting to correct URL with correct secret.

**Metrics stuck at same values** — Either no logs being posted, or agent is hitting errors (check /conversations for error field).

**High error rate (> 5%)** — Check orchestrator logs and failing contacts. Common causes:
- GHL API key expired
- IDX service down
- Agent timeout

## Security

- API key (MONITORING_SECRET) protects /log endpoint
- No authentication on /metrics or /conversations (assumes internal network)
- For public deployment, add middleware for API key validation on all endpoints
- Redis should have password protection if exposed to untrusted networks
- No PII logging (contact IDs only, not names/phones)

## Alerting

Common alerts to set up:

1. **Error Rate > 5%**
   ```bash
   errorRate=$(curl http://localhost:3002/metrics | jq .errorRate)
   if [[ $errorRate > 5% ]]; then alert "High error rate"; fi
   ```

2. **No Logs in 30 Minutes**
   ```bash
   recent=$(curl http://localhost:3002/conversations?limit=1)
   if [[ $(date +%s) - ${recent[0].ts}/1000 > 1800 ]]; then alert "No logs"; fi
   ```

3. **Redis Down**
   ```bash
   curl -f http://localhost:3002/health || alert "Monitoring service down"
   ```

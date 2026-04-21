# Queue

BullMQ job queue layer that scales the orchestrator from 1k to 100k+ leads per day.

## What It Does

The queue decouples webhook ingestion from agent processing:

1. **Receives webhooks** from GHL (via queue API, not directly)
2. **Enqueues jobs** in Redis with priority (inbound SMS > new leads > other events)
3. **Manages retries** — 3 attempts with exponential backoff
4. **Scales processing** — Multiple workers can pull and process jobs in parallel
5. **Monitors health** — Tracks queue depth, job success rate, worker availability

Without the queue, the orchestrator would be blocked during agent processing. With the queue, webhooks return immediately and jobs process asynchronously in the background.

## Environment Variables

Required:
- `REDIS_URL` — Redis connection string (e.g. redis://localhost:6379)

Optional:
- `QUEUE_PORT` — HTTP server port (default: 3001)
- `QUEUE_SECRET` — API key for `/enqueue` endpoint (required in production)
- `WORKER_CONCURRENCY` — Jobs processed in parallel per worker (default: 5)

## Running Locally

```bash
# Terminal 1: Start queue API
cd queue
npm install
npm run dev

# Terminal 2: Start workers
npm run worker
```

The API listens on port 3001.

## Building & Deployment

```bash
npm run build

# Start API server
npm start

# In a separate process, start workers
npm run worker
```

For horizontal scaling, run multiple worker processes on different machines (all pointing to same Redis).

## How It Fits In

```
GHL Webhook → Queue API (/enqueue) → Redis
                                        ↓
                                   BullMQ Job
                                        ↓
                                   Worker process
                                        ↓
                                   Orchestrator
                                        ↓
                                   GHL Update + Monitoring log
```

## API Endpoints

### `POST /enqueue`

Accepts a webhook payload and enqueues it for processing.

**Headers:**
- `x-queue-secret` — Must match `QUEUE_SECRET` environment variable

**Request:**
```json
{
  "type": "ContactCreated",
  "contactId": "abc123",
  "firstName": "John",
  "lastName": "Doe",
  "phone": "+1234567890",
  "source": "Website Form"
}
```

**Response:**
```json
{
  "queued": true,
  "jobId": "job_xyz789"
}
```

### `POST /health`

Returns queue health status and current job counts.

**Response:**
```json
{
  "ok": true,
  "queue": {
    "active": 5,
    "waiting": 234,
    "completed": 10000,
    "failed": 12,
    "delayed": 3
  }
}
```

### `GET /health`

Alias for above (some clients prefer GET for health checks).

## Job Types & Priority

Priority values: lower = runs first

- **InboundMessage** (priority 1) — Lead responds to SMS; urgent
- **ContactCreated** (priority 3) — New lead arrives; send first SMS within 60s
- **Other** (priority 10) — Campaigns, nurture, manual actions

Jobs with same priority are FIFO.

## Job Configuration

```typescript
{
  attempts: 3,              // Retry up to 3 times
  backoff: {
    type: "exponential",
    delay: 5000             // Start at 5s, exponential increases
  },
  removeOnComplete: {
    count: 1000             // Keep last 1000 completed jobs
  },
  removeOnFail: {
    count: 500              // Keep last 500 failed jobs
  }
}
```

Failed jobs after 3 attempts are logged and can be viewed in Redis or via monitoring service.

## Workers

A worker is a separate Node.js process that:

1. Waits for jobs in the queue
2. Pulls `WORKER_CONCURRENCY` jobs at a time
3. Calls the orchestrator for each job
4. Logs results (success, failure, retry)
5. Loops back to wait for more jobs

To run workers:

```bash
npm run worker
```

To scale, run this command on multiple machines (all with access to same Redis):

```bash
# Machine 1
npm run worker

# Machine 2
npm run worker

# Machine 3
npm run worker
```

For Kubernetes/Docker:

```dockerfile
FROM node:20
WORKDIR /app
COPY . .
RUN npm install
CMD ["npm", "run", "worker"]
```

## Monitoring Queue Health

```bash
# Check queue depth
curl http://localhost:3001/health

# Get response
{
  "ok": true,
  "queue": {
    "active": 2,
    "waiting": 45,
    "completed": 987,
    "failed": 3,
    "delayed": 0
  }
}
```

If `waiting` queue grows faster than workers can process:
- Increase `WORKER_CONCURRENCY`
- Add more worker processes
- Check if orchestrator is hanging (logs in monitoring service)

## Integration with Orchestrator

The orchestrator doesn't directly process queue jobs. Instead:

1. Queue API receives webhook from GHL
2. Queues job in BullMQ
3. Worker pulls job, makes HTTP request to orchestrator endpoint
4. Orchestrator processes and returns result
5. Worker logs success/failure

To integrate, update GHL webhook configuration:

**Old (direct):**
```
GHL → POST http://localhost:3000/webhook/lead
```

**New (via queue):**
```
GHL → POST http://localhost:3001/enqueue
```

Update header: `x-queue-secret: ${QUEUE_SECRET}`

## Performance Numbers

- Enqueue latency: <5ms
- Job processing latency: <100ms (before orchestrator processes)
- Throughput: 1000+ jobs/s (with sufficient Redis and worker capacity)
- For 100k leads/day: need 2-3 workers with concurrency=5 each

## Code Structure

- `src/index.ts` — HTTP API server (`/enqueue`, `/health`)
- `src/worker.ts` — Worker process that polls and executes jobs
- `src/redis.ts` — Redis connection factory

## Troubleshooting

**Jobs stuck in "waiting" state:**
- Check if workers are running (`npm run worker`)
- Check Redis connectivity
- Check if orchestrator endpoint is reachable

**Jobs failing repeatedly:**
- Check orchestrator logs (port 3000)
- Check monitoring service logs (port 3002)
- Increase `WORKER_CONCURRENCY` if orchestrator is slow

**High queue depth:**
- More workers needed
- Orchestrator might be overloaded
- IDX/GHL APIs might be slow (hitting rate limits)

## Security

- API requires `x-queue-secret` header (do not expose in logs)
- Jobs are stored in Redis (make sure Redis has access controls)
- Worker processes can read `.env` file (keep secure)
- No PII in job logs by default (safe for centralized logging)

## Scaling Checklist

- [ ] Redis is running and accessible from all machines
- [ ] Each worker has `REDIS_URL` set to same Redis instance
- [ ] `QUEUE_SECRET` is strong (32+ characters, random)
- [ ] GHL webhooks point to queue API (`/enqueue`)
- [ ] Monitor queue depth regularly (should stay < 1000)
- [ ] Alert on job failures (too many retries = systematic issue)
- [ ] Add more workers if `waiting` queue grows

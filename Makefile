# Royal LePage AI Platform — Makefile
# Usage: make <target>

.PHONY: help setup verify migrate dev build push health logs score reactivate

help:
	@echo ""
	@echo "  Royal LePage AI Platform"
	@echo ""
	@echo "  FIRST TIME:"
	@echo "  make setup      GHL one-time setup (custom fields, pipeline, webhooks, campaigns)"
	@echo "  make verify     Pre-flight check — all API connections (GHL, Anthropic, IDX, Redis)"
	@echo "  make migrate    Import leads from CSV (LEADS_FILE=path/to/leads.csv)"
	@echo ""
	@echo "  DEVELOPMENT:"
	@echo "  make dev        Start full stack locally via Docker Compose"
	@echo "  make build      Build all TypeScript modules"
	@echo "  make health     Check health of all running services"
	@echo "  make logs       Tail orchestrator logs"
	@echo ""
	@echo "  OPERATIONS:"
	@echo "  make score      Run lead scoring (one-off)"
	@echo "  make reactivate Run reactivation engine (one-off)"
	@echo "  make push       Build + push Docker images (REGISTRY=ghcr.io/...)"
	@echo ""

# ── First-time setup ─────────────────────────────────────────

setup:
	@echo "→ Running GHL one-time setup..."
	cd ghl-setup && npm install && npm run setup

verify:
	@echo "→ Running pre-flight checks..."
	cd ghl-setup && npm install && npm run verify

migrate:
	@if [ -z "$(LEADS_FILE)" ]; then echo "Usage: make migrate LEADS_FILE=path/to/leads.csv"; exit 1; fi
	@echo "→ Dry run first..."
	cd data-migration && npm install && npx tsx src/index.ts --dry-run --file ../$(LEADS_FILE)
	@echo ""
	@read -p "Dry run complete. Run real migration? [y/N] " confirm && [ "$$confirm" = "y" ] || exit 0
	cd data-migration && npx tsx src/index.ts --file ../$(LEADS_FILE)

# ── Local development ─────────────────────────────────────────

dev:
	@if [ ! -f .env ]; then echo "ERROR: .env not found. Copy .env.example → .env and fill values."; exit 1; fi
	docker compose up --build

dev-down:
	docker compose down

# ── Build ─────────────────────────────────────────────────────

TS_MODULES = orchestrator reactivation lead-scoring data-migration ghl-setup \
             mcp-server elevenlabs-mcp idx-mcp homie-admin-mcp showings-mcp \
             vendor-mcp deal-analysis-mcp queue monitoring

build:
	@for mod in $(TS_MODULES); do \
		echo "→ Building $$mod..."; \
		(cd $$mod && npm install && npm run build) || exit 1; \
	done
	@echo "✓ All modules built."

# ── Dockerfiles (simple Node builds) ─────────────────────────

REGISTRY ?= ghcr.io/pamf2

push: build
	@for mod in orchestrator queue monitoring; do \
		echo "→ Building Docker image for $$mod..."; \
		docker build -t $(REGISTRY)/rl-$$mod:latest $$mod/; \
		docker push $(REGISTRY)/rl-$$mod:latest; \
	done

# ── Operations ────────────────────────────────────────────────

score:
	cd lead-scoring && npm install && npx tsx src/index.ts

reactivate:
	cd reactivation && npm install && npx tsx src/index.ts

health:
	@echo "→ Orchestrator:"; curl -sf http://localhost:3000/health || echo "DOWN"
	@echo "→ Queue API:   "; curl -sf http://localhost:3001/health || echo "DOWN"
	@echo "→ Monitoring:  "; curl -sf http://localhost:3002/health || echo "DOWN"

logs:
	docker compose logs -f orchestrator

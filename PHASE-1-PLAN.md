# Phase 1 — Execution Plan

> Análise: Pedro Afonso, via cortex/boss · 08/jun/2026
> Repo: PAMF2/royal-lepage-ai · último push 22/abr/2026 (~6 semanas dormente)
> Phase 1 do scoping Rob Golfy (Daniel Foch + Pedro Afonso, abr/2026): "CRM Cleanup & Lead Identification"
>
> **Update 08/jun/2026 — Stack decision:** GHL removido. Substituído por FUB + Twilio + SendGrid + BullMQ + Supabase. Branch `replace-ghl` em andamento. Detalhes: ver `MIGRATION-GHL-TO-FUB.md`.

---

## TL;DR

Repo está com **~1.148 LOC de TypeScript** real nos 4 módulos de Phase 1. Não é stub: tem teste, tem CSV parser real, tem agente Claude completo com LPMAMA + tools, tem scoring por dimensões, tem reactivation scheduler.

**Bloqueio principal para rodar é configuração**, não código. 6 gaps reais, 1 deles é uma divergência com o scoping (Postgres) e 1 é um item que vamos precisar atravessar (`ANTHROPIC_API_KEY` num projeto onde a Veredictos/Rob Golfy precisa ter conta API própria — você é OAuth-only).

---

## Estado do código (módulos da Phase 1)

| Módulo | LOC | Tem teste | Pronto pra rodar? |
|---|---|---|---|
| `orchestrator/` | ~300 | sim (webhook.test.ts) | sim, falta `.env` |
| `data-migration/` | ~287 | sim (csv.test.ts) | sim, falta `.env` |
| `lead-scoring/` | ~167 | sim (scoring.test.ts) | sim, falta `.env` |
| `reactivation/` | ~398 | sim (logic.test.ts) | sim, falta `.env` |

Zero TODO/FIXME/throws de "not implemented" no código fonte. Todo o core está escrito.

### Orchestrator (`orchestrator/src/agent.ts`)
- System prompt LPMAMA (Location, Price, Motivation, Agent, Mortgage, Appointment) completo
- 4 grupos de tools dispatchados por prefixo: `crm_*` (FUB), `idx_*`, `eleven_*`, `deal_*`
- Histórico de conversa em memória com cap de 20 mensagens
- Loop máximo de 10 turnos por trigger
- Bilingue (EN/FR auto-detect)
- Webhook Express com HMAC-SHA256 validation

### Data Migration (`data-migration/`)
- CSV streaming line-by-line (suporta 100k+ rows sem estourar memória)
- Auto-detect de coluna (case-insensitive)
- Dry-run mode
- Batch parallel (default 10) com rate-limit awareness pro FUB (250 req/10s sliding window)
- Custom fields auto-criados (city, budget, timeline)

### Lead Scoring (`lead-scoring/`)
- 5 dimensões pontuadas até 100:
  - Recency (30 pts)
  - Contact completeness (20 pts)
  - Engagement tags (-15 a 25 pts)
  - LPMAMA completeness (25 pts)
- Tiers: hot (70+), warm (40-69), cold (<40)
- Custom field `homie_score` atualizado por contato

### Reactivation (`reactivation/`)
- Scheduler (`scheduler.ts`) com modo dev (2 min) e prod (24h via env)
- Lógica pura em `logic.ts` (testável sem API)
- Filtros: exclui DNC, no-contact, handed-off, closed
- IDX query por listing nova + price drop por contato
- Mensagem gerada via Claude (16 char ou template fallback)
- Rate limit 1.2s entre contatos (folga vs FUB 250 req/10s)
- Max 200 leads/run (configurável)

---

## Gaps para rodar Phase 1

### 1. Credenciais (`.env` vazio) — `BLOCKER`
| Variável | Obtenção | Quem precisa fornecer |
|---|---|---|
| `FUB_API_KEY` | FUB account settings → API | Holly (Rob Golfy team já tem) |
| `FUB_WEBHOOK_SECRET` | Gerado por mim (crypto.randomBytes) | Eu gero agora |
| `TWILIO_ACCOUNT_SID` + `TWILIO_AUTH_TOKEN` + `TWILIO_FROM` | console.twilio.com | Pedro/Holly (conta + número Canadá) |
| `SENDGRID_API_KEY` + `SENDGRID_FROM_EMAIL` | app.sendgrid.com (domínio verificado) | Pedro/Holly |
| `SUPABASE_URL` + `SUPABASE_SERVICE_KEY` | supabase.com (free tier cobre pilot) | Pedro |
| `ANTHROPIC_API_KEY` | console.anthropic.com | **Rob Golfy precisa criar conta** (você é OAuth-only) |
| `IDX_API_KEY` + `IDX_API_SECRET` + `IDX_FEED_URL` | CREA DDF application em crea.ca/data-feed | Holly + tempo (assinatura com board) |
| `REDIS_URL` | Upstash / Railway Redis | Pedro |
| `ORCHESTRATOR_WEBHOOK_SECRET`, `QUEUE_SECRET` | Generate random 32-char strings | Eu gero agora |

### 2. FUB custom fields não provisionados — `BLOCKER`
- `fub-setup/` (substitui `ghl-setup/`) cria os 6 custom fields: homie_score + 5 LPMAMA
- Idempotente, safe re-rodar
- Pré-req: FUB_API_KEY setado
- Pipeline stages e webhooks configurados via FUB UI (não automatizável via API)

### 3. Build não verificado — `MEDIUM`
- `npm install` + `npm test` nunca foram rodados local
- Risco baixo (código tem tests, último push de 6 semanas atrás), mas precisa validar antes de subir
- Plano: rodar `make test` localmente nos 4 módulos Phase 1

### 4. Sem CSV real de leads — `BLOCKER pra valor real`
- Para validar Phase 1 de verdade, precisa exportar os 200k leads do FUB do Rob Golfy
- FUB API tem rate limit de 10 req/10s no /notes endpoint → export overnight ~12-24h (per FUB scoping doc)
- ~~**Gap: não existe script FUB→CSV no repo.**~~ ✅ RESOLVIDO 08/jun: `data-migration/src/fub-export.ts` shipped (commit 68a9c8f, 70/70 tests).

### 5. ~~Divergência scoping vs código~~ — `RESOLVIDO 08/jun`
- Decisão Pedro: **Supabase** (Postgres 15, free tier).
- Schema migrations em `data-migration/migrations/001_initial.sql` (criadas no branch `replace-ghl`).
- Tabelas: `leads`, `scoring_runs`, `reactivation_runs`, `campaign_enrollments`.
- Razão Supabase vs Railway Postgres: separar app hosting de DB billing, RLS built-in pra views per-agent futuras.

### 6. Sem deploy — `MEDIUM`
- `render.yaml` pronto (orchestrator + queue + worker + monitoring + Redis)
- `railway.toml` pronto
- `docker-compose.yml` pronto pra local
- Falta: conta Render configurada + env vars no dashboard + Postgres se decisão for (b) ou (c)

---

## Sequência de execução proposta

```
P1 — Validar build local ✅ DONE (08/jun, 112/112 tests pass)
  ↓
P2 — Decisão Pedro: Postgres in ou out? ✅ Supabase
  ↓
P2.5 — Branch replace-ghl: substituir GHL por FUB+Twilio+SendGrid+BullMQ ✅ SHIPPED (PR #1)
  ↓
  Coder em 10-12 commits: crm.ts scaffold → rewire → Twilio → SendGrid → webhook → 4 drip workers → fub-setup → cutover
  ↓
P3 — Pedro coleta credenciais (Gap #1)
  ↓
  Holly: FUB API key + IDX agreement + Anthropic API key
  Pedro: Twilio + SendGrid + Supabase + Redis
  ↓
P4 — Rodar fub-setup (cria custom fields)
  ↓
P5 — Export 200k leads via data-migration/src/fub-export.ts ✅ ESCRITO
  ↓
P6 — Dry-run de import
  ↓
P7 — Import real
  ↓
P8 — Primeiro run de scoring
  ↓
P9 — Deploy Render
  ↓
P10 — Reactivation cron + drip campaigns ativas em produção
```

**Tempo realista por etapa (se credenciais disponíveis):**
- P1: 30 min (build + test local)
- P2: decisão Pedro, 5 min
- P3: depende do Rob Golfy, 1-7 dias (CREA DDF leva mais tempo)
- P4: 10 min
- P5: 12-24h (rate limit FUB notes endpoint)
- P6-P7: 100 min para 100k leads
- P8: 2-3h pra 100k leads
- P9: 1 dia
- P10: imediato após P9

**Caminho mais rápido pra valor demonstrável:** P1 → P3 (parcial: só FUB + Twilio + Anthropic) → P4 → migrar 1.000 leads sample → P8 score → mostrar dashboard pro Holly.

---

## O que eu posso fazer agora sem esperar Pedro

- [x] Análise do repo (este doc)
- [x] `make build` nos 4 módulos
- [x] `make test` nos 4 módulos (112/112)
- [x] Gerar os 4 secrets aleatórios (em .env.local, gitignored)
- [x] Escrever `fub-export.ts` (Gap #4)
- [x] Decisão Postgres: Supabase
- [x] `MIGRATION-GHL-TO-FUB.md` (arquitetura completa do substituto)
- [x] Branch `replace-ghl`: rewire GHL→FUB+Twilio+SendGrid+BullMQ ✅ shipped 08/jun (PR #1, tip 68a9c8f, 171+ tests passing across Phase-1 modules + queue + fub-setup)
- [ ] Atualizar `.env.example` (coder fará junto com cutover)

## O que precisa de Pedro / Rob Golfy

- FUB API key (Holly — Rob Golfy team já tem)
- Twilio account + número Canadá (Pedro/Holly)
- SendGrid account + domínio verificado (Pedro/Holly)
- Supabase project (Pedro)
- Redis URL (Upstash ou Railway — Pedro)
- Anthropic API key (Holly precisa criar conta)
- CREA DDF credentials (Holly + board agreement)

---

## Riscos

| Risco | Probabilidade | Mitigação |
|---|---|---|
| CREA DDF demora >2 semanas | Alta | Começar Phase 1 só com FUB + Anthropic, ativar IDX depois |
| 200k leads FUB export estoura 24h | Média | Paralelizar por persona/source, fragmentar export |
| Webhook secret leak | Baixa | Gerar via crypto.randomBytes(32).toString('hex') |
| FUB rate limit 250/10s estoura na migração | Média | Sliding window no wrapper HTTP, batches de 50 com 2.5s gap |
| Twilio CASL compliance (SMS Canadá) | Média | Opt-out language obrigatório, tag `consent_sms` validado antes de send |
| BullMQ perde jobs se Redis cai mid-campaign | Baixa | Delayed-job restore no worker boot |
| Orchestrator consome muito Claude token | Alta | Setar ANTHROPIC_MODEL=claude-sonnet-4-6 pra dev/test, opus só pra prod |

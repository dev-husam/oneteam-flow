# Personal Trainer Platform

Multi-tenant business management and progress tracking SaaS (first business module: Fitness).
Architecture and plan: [`docs/`](docs/00-DECISIONS.md). Current state: **Phases 0–7 complete** (backend, multi-tenancy and authorization, web app, mobile foundation, shared capabilities, and the Fitness module: clients, exercises, workout plans, assignments, workout logs, nutrition plans, meal logs, weekly check-ins with private progress photos, review and reminders; private one-to-one messaging with live delivery). Phase 7a simplified roles (owner, trainer, client; one organization per account). Phase 7b added the admin control center (feature flags, identity/theme/logo, e-mail templates). Phase 7c added the design system (OneTeam Flow, admin-managed designs). Phase 8a added the Coaching module. Next: Phase 8b (Education, after four open decisions in `docs/PHASE-8-PLAN.md`), after a first run of the mobile app on real devices. See `docs/04-ROADMAP.md` and `HANDOVER.md`.

## Quick start

Requirements: Node 22 LTS (`.nvmrc`), pnpm 10, Docker.

```bash
pnpm install
cp .env.example .env          # local defaults already match docker compose
pnpm infra:up                 # MySQL 8.4, Redis 7, Mailpit
pnpm --filter @pt/domain build
pnpm db:deploy                # apply migrations to pt_dev
pnpm dev                      # API on http://localhost:3001 and web app on http://localhost:3000
```

| URL | What |
| --- | --- |
| http://localhost:3000 | Web app (English `/en`, Arabic `/ar`): account, organization workspace (`/o/<slug>`: tasks, progress, members, groups, roles…), platform admin (`/admin`) |
| http://localhost:3001/api/docs | Swagger UI (OpenAPI JSON at `/api/docs-json`, committed copy: `apps/api/openapi.json`) |
| http://localhost:3001/api/v1/health/live | Liveness |
| http://localhost:8025 | Mailpit: all e-mail sent in development |

## Commands

| Command | Does |
| --- | --- |
| `pnpm check` | typecheck + lint + unit and integration tests (needs `pnpm infra:up`). Run before every commit |
| `pnpm build` | production build of all packages |
| `pnpm db:migrate` | create a new migration from `prisma/schema.prisma` (dev only) |
| `pnpm db:deploy` | apply pending migrations (what production runs) |
| `pnpm openapi:export` | regenerate `apps/api/openapi.json` (CI fails when stale) |
| `pnpm --filter @pt/api gen:keys` | print a JWT ES256 key pair for `.env` |
| `pnpm --filter @pt/api admin:grant -- <email>` | make an existing, verified account the first platform administrator (build first) |
| `pnpm infra:down` | stop local infrastructure |

Processes: `node apps/api/dist/main.js` (API; `APP_ROLE=api`) and `node apps/api/dist/worker.js` (queue consumers). `APP_ROLE=all` (default) runs both in one process for development.

## Layout

```
apps/api/          NestJS API + worker (Prisma, BullMQ); core/, capabilities/ and modules/fitness/
apps/web/          Next.js 16 web app (Tailwind v4 tokens, next-intl en/ar with RTL, TanStack Query)
apps/mobile/       Expo (React Native) app: secure auth, organization picker, tasks, progress, notifications (en/ar, RTL)
packages/domain/   pure shared rules: error codes, password policy, permissions and roles, task status, progress maths, file limits
packages/api-client/ typed fetch client shared by web and (later) mobile: token refresh, ApiError
packages/i18n/     en (source) and ar dictionaries; Arabic is typed against English, parity tests
infra/             docker compose, backup + restore-test scripts
docs/              architecture, database, security, roadmap, phase reports
```

Backups: `infra/backup/backup.sh` (encrypted dump, optional upload to R2) and `infra/backup/restore-test.sh` (restores the newest backup into a scratch DB and verifies it).
Production image: `docker build -f apps/api/Dockerfile .` (migrations: `npx prisma migrate deploy` as a one-shot job).

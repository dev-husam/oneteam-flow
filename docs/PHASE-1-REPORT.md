# Phase 1 Report — Backend Foundation

Status: **implemented and verified locally.** Not done: staging deployment and the scheduled restore test (both need a server and credentials).

## 1. What was implemented

- **Monorepo skeleton:** pnpm workspaces + Turborepo, `apps/api`, `packages/domain`, `infra/`, CI, `.env.example`, README, HANDOVER, engineering rules (`docs/ARCHITECTURE.md`).
- **Infrastructure (Docker Compose):** MySQL 8.4 (binary log on, `pt_dev`, `pt_test`, `pt_shadow`), Redis 7 (`noeviction`, AOF), Mailpit.
- **NestJS 12 API** (ESM) with a separate **worker** entrypoint: Zod-validated configuration (the only reader of `process.env`; production refuses to boot without keys, health token, CORS list, secure cookies), pino structured logging with redaction, request ids end-to-end, one global error filter and shared error codes, strict validation pipe, Helmet, CORS allow-list, URI versioning (`/api/v1`), Swagger/OpenAPI, Redis-backed rate limiting, health probes.
- **Authentication:** registration with consent records; e-mail verification; login with web (HttpOnly cookie) and native (body) delivery; ES256 access tokens (15 min, claims only `sub` and `sid`); opaque refresh tokens stored as SHA-256 hashes, rotated on every use with theft detection; sessions list/revoke; logout and logout-all; password reset; progressive login lockout; argon2id hashing.
- **Profile:** `GET/PATCH /me` with an allow-listed shape.
- **E-mail pipeline:** BullMQ queue, worker process, English and Arabic (RTL) templates, SMTP via Mailpit locally.
- **Operations:** production Dockerfile (non-root, health check), CI workflows (check, secret scan, dependency audit, image build, weekly restore test), encrypted backup and restore-test scripts.

## 2. Files and modules

```
apps/api/src/
  main.ts · worker.ts · app.module.ts · worker.module.ts · bootstrap.ts · openapi-export.ts
  config/            env.ts (schema) · config.module.ts · load-env.ts
  common/            context/ (request id, AsyncLocalStorage) · errors/ (AppError, filter) · decorators/ · pipes/ · util/
  infra/             prisma/ · redis/ · queue/ · mail/ (service, templates, processor) · throttle/ · health/ · logging/
  core/auth/         auth.service · token.service · password.service · jwt-auth.guard · refresh-cookie · controller · DTOs
  core/users/        users.service · controller · mapper · DTOs
apps/api/prisma/     schema.prisma · migrations/20261106111308_init_auth_foundation
apps/api/test/       5 integration suites + helpers
packages/domain/     error codes (+ English fallbacks), password policy
infra/               docker-compose.yml · mysql/init · backup/{backup,restore-test}.sh
.github/workflows/   ci.yml · restore-test.yml
```

## 3. Database changes

One migration, five tables (all UUIDv7 `CHAR(36)`, `created_at`/`updated_at`):

| Table | Purpose |
| --- | --- |
| `users` | global account: email (unique), phone (unique, nullable), full_name, password_hash, status, verification timestamps, locale, timezone, unit_system, last_login_at |
| `user_sessions` | one per signed-in device; revoke fields |
| `refresh_tokens` | hash only; `used_at`, `replaced_by_id`, expiry |
| `one_time_tokens` | e-mail verification and password reset; hash only |
| `consent_records` | document key + version + time + ip |

## 4. API endpoints (`/api/v1`)

| Method and path | Auth | Notes |
| --- | --- | --- |
| `POST /auth/register` | public | always `202`, identical for existing e-mails |
| `POST /auth/verify-email` · `POST /auth/resend-verification` | public | single-use token; resend has a 60 s cooldown |
| `POST /auth/login` | public | header `x-client-type: web\|ios\|android` is mandatory |
| `POST /auth/refresh` | public (refresh token) | cookie for web (CSRF-guarded), body for native |
| `POST /auth/logout` | public (refresh token) | `204`, clears cookie |
| `POST /auth/logout-all` | bearer | `204` |
| `POST /auth/request-password-reset` · `POST /auth/reset-password` | public | reset ends all sessions |
| `GET /me` · `PATCH /me` | bearer | profile and preferences |
| `GET /me/sessions` · `DELETE /me/sessions/{id}` | bearer | own sessions only |
| `GET /health/live` · `GET /health/ready` | open · `x-health-token` | readiness checks MySQL and Redis |

Machine-readable: `apps/api/openapi.json` (14 paths, 15 operations); CI fails when it is stale.

## 5. Security considerations

Implemented and covered by tests: enumeration-resistant registration, login, reset and resend; timing-equalized password check for unknown users; per-address lockout (5 failures / 15 min) plus per-IP rate limits; refresh rotation with compare-and-set, 5 s concurrency grace and session-wide revocation on real reuse; immediate effect of session revocation and user suspension (the guard checks the database per request); pinned JWT algorithm and issuer/audience (rejects `none`, HS256 and foreign keys); CSRF defence for cookie refresh (Origin allow-list + custom header); strict DTOs rejecting unknown fields (mass assignment); IDOR check on session revocation (404); no Prisma rows serialized; tokens only hashed at rest; secrets and cookies redacted from logs; CORS allow-list; CSP/Helmet; body size limit; production configuration guard.

Accepted trade-off: one-time tokens travel in the e-mail job payload in Redis (jobs are removed on completion, failed jobs expire after one hour).

## 6. Tests and results

`pnpm check` for the backend scope (`@pt/api`, `@pt/domain`): typecheck, lint, tests all green (8/8 tasks).

| Suite | Tests |
| --- | --- |
| API unit (7 files: tokens, passwords, env, errors, cookies/CSRF, mail templates, validation) | 39 |
| API integration, real MySQL + Redis + BullMQ worker (registration, login/sessions/profile, refresh, password reset, platform/OpenAPI, rate limits) | 45 |
| Domain (password policy, error catalog) | 7 |
| **Total** | **91 passing** |

Also verified by hand: the compiled API and a separate worker process (jobs wait in the queue until the worker starts, then Mailpit receives the mail); the production Docker image (healthy, `ready` check passes, docs disabled, configured keys used); `backup.sh` followed by `restore-test.sh` (6 tables, migration history and data restored, exit 0); `prisma migrate deploy` from inside the image.

## 7. Known limitations

- No organizations, roles or permissions yet (Phase 2); every authenticated user can only reach their own data.
- Sign-in guard does one database lookup per request (simple and immediately consistent; add a short Redis cache when load requires it).
- Phone numbers can be stored but not verified (needs the notification channel from Phase 5).
- Auth events go to structured logs, not yet to `audit_logs` (the audit service arrives in Phase 2).
- Rate limits are per IP with fixed windows; proxies must set `TRUST_PROXY` correctly.
- Staging deployment, GitHub CI execution and the scheduled restore test have not run (no server or repository exist yet). The repository is not under git.
- Local Node is 26; the supported target (CI, Docker, `.nvmrc`) is 22 LTS.
- A forked session of this conversation is currently adding `apps/web` and web packages in the same folder; they are outside this report and the root `pnpm check` includes them.

## 8. Remaining tasks (small, not blocking Phase 2)

1. `git init`, first commit, push, and confirm CI is green on GitHub.
2. Provision staging, set the backup secrets, run the first scheduled restore test.
3. Decide the e-mail provider (Q8) before staging.

## 9. Next recommended phase

**Phase 2 — multi-tenancy and authorization:** organizations, categories, modules, memberships, invitations, groups, assignments, permission catalog and roles, policy engine, tenant-scoped Prisma client with composite foreign keys, TOTP MFA, audit service, and the tenant-isolation and authorization test matrices.

# Phase 0 — Decisions, Open Questions, Assumptions

Status: **PROPOSED — waiting for your approval.** No application code exists yet.

Related documents: [01-ARCHITECTURE](01-ARCHITECTURE.md) · [02-DATABASE](02-DATABASE.md) · [03-TENANCY-AND-AUTHORIZATION](03-TENANCY-AND-AUTHORIZATION.md) · [04-ROADMAP](04-ROADMAP.md)

**How to approve:** reply "approved" to accept every recommendation, or list overrides (for example "D12: managed hosting, D15: use my HM brand").

---

## A. Decisions that need your approval

Each one has a recommendation. "Cost to change" says how painful it is to reverse after Phase 1.

| ID | Decision | Recommendation | Cost to change |
| --- | --- | --- | --- |
| D1 | Repository strategy | pnpm workspaces + Turborepo monorepo | High |
| D2 | Contract strategy between API and clients | class-validator DTOs → OpenAPI → generated typed client | Medium |
| D3 | Multi-tenancy model | Shared database and schema, `organization_id` on every tenant table, enforced in 3 layers | Very high |
| D4 | How the tenant is selected | Org id in the URL path; JWT carries no org or role | High |
| D5 | Role model | Generic role keys (`practitioner`, `participant`) with per-category labels, permission scopes, custom org roles | High |
| D6 | Authentication design | 15-min ES256 access JWT, opaque rotating refresh token, argon2id | Medium |
| D7 | Super admin boundaries | Separate guard and permission scope, mandatory TOTP, no default access to private content | Medium |
| D8 | Identifier strategy | UUIDv7 stored as `CHAR(36)` | Very high |
| D9 | Where measurements live | Shared `metric_definitions` + `metric_records` used by Fitness | High |
| D10 | File storage | S3-compatible, presigned direct upload, sensitivity classes | Medium |
| D11 | Realtime and push | Socket.IO + Redis adapter; Expo Push Service | Low |
| D12 | MVP hosting | One VPS with Docker Compose + Cloudflare R2; images portable to managed services | Low |
| D13 | When trainer ↔ client chat arrives | Keep Phase 7, but ship check-in comments earlier | Low |
| D14 | How organizations are created | Self-serve sign-up creates user + organization | Medium |
| D15 | UI system and i18n tooling | Tailwind + shadcn/ui + design tokens; next-intl / i18next over shared JSON dictionaries | Medium |
| D16 | Test stack | **Vitest** (API, web, packages; amended in Phase 1), jest-expo (mobile), real MySQL/Redis from Docker Compose and CI service containers | Low |
| D17 | Sensitive health data handling | Treat photos and medical notes as special-category data (consent, access audit, field encryption) | High |

### D1 — Monorepo (pnpm workspaces + Turborepo)
- **Why:** one pull request can change API, web and mobile together; `packages/` holds the pieces that must not be duplicated (domain rules, i18n dictionaries, generated API client, permission catalog). One CI pipeline. Fits "do not duplicate business logic between mobile and web."
- **Alternatives:** polyrepo (version drift on shared packages, three CI setups); Nx (more power than needed for three apps).
- **Known risk:** Expo + pnpm. Metro historically needed hoisted `node_modules`. Phase 4 starts with a spike; fallback is `node-linker=hoisted` in `.npmrc`.

### D2 — Contracts
- Backend keeps **class-validator / class-transformer** as you specified. The Nest Swagger plugin emits OpenAPI; `packages/api-client` is generated from it (`openapi-typescript` + a thin fetch wrapper) and used by web and mobile. CI regenerates the client and fails on a diff.
- Forms use **Zod** schemas in `packages/validation` that mirror only UX-level rules (required, length, format). The server is always the authority.
- **Alternative:** Zod everywhere with `nestjs-zod` (one source of truth, less drift) — but it replaces class-validator, which you listed. I will not make that change without your approval.

### D3 — Tenancy model
Shared database, shared schema ("pooled"). MySQL has **no row-level security**, so isolation is built from three cooperating layers: tenant-scoped Prisma client, composite foreign keys `(organization_id, id)`, and automated cross-tenant tests. Details in [03](03-TENANCY-AND-AUTHORIZATION.md).
- **Alternative:** database or schema per tenant. Stronger isolation, but N× migrations and cost. Keep as a future "enterprise" option; the design does not prevent it.

### D4 — Org context in the URL
`/api/v1/orgs/:orgId/...`. The id is only a **selector**: the guard proves the caller has an active membership in that org and loads role and permissions from the database (cached). Tokens carry no organization or role, so switching org needs no new token and role changes apply immediately.

### D5 — Roles
- Platform: `super_admin`. Organization: `owner`, `admin`, `manager`, `practitioner`, `participant`, `guardian`.
- "Trainer / Teacher / Coach" is **one** role (`practitioner`) whose display label comes from the organization's business category. "Client / Student / Member" is `participant`. This keeps industries out of the core.
- Permissions have a **grant scope**: `own`, `assigned`, `org`. That gives you "a trainer only sees assigned clients" without special cases.
- Orgs can create **custom roles** cloned from templates (API in Phase 2, UI in Phase 3). Escalation rules: you cannot grant a permission you lack, nor edit or assign a role ranked at or above your own.

### D6 — Authentication
- Access token: JWT signed **ES256** with `kid` (key rotation ready), 15 minutes. Refresh token: opaque 256-bit random, stored as SHA-256 hash, **rotated on every use**, reuse of an old token revokes the whole session family. Absolute lifetime 30 days.
- Web: refresh token in an `HttpOnly; Secure; SameSite=Lax` cookie on the shared parent domain, access token in memory only. Mobile: refresh token in `expo-secure-store`, sent in the body.
- Passwords: **argon2id**. Email verification and password reset use one-time hashed tokens.

### D7 — Super admin
- Lives under `/api/v1/admin/*` with its own guard and `platform.*` permissions that can never be attached to an org role.
- **TOTP MFA is mandatory** for platform roles (built before the super-admin UI in Phase 3).
- By default the super admin sees organization **metadata and aggregate statistics**, not private content (messages, progress photos, health notes). Reading private content requires a time-boxed, audited "support access" grant. *You need to confirm this policy* (see Q4).

### D8 — Identifiers
UUIDv7 generated by the application (time-ordered, so inserts stay index-friendly), stored as `CHAR(36)` for readability and simple Prisma mapping. `BINARY(16)` would halve index size but complicates every query and log line; I would only revisit it if tables pass tens of millions of rows. Prisma's `uuid(7)` default availability is verified against the pinned version at the start of Phase 1.

### D9 — Shared measurements
Weight, waist, quiz scores, grades and KPIs are all "a number about a subject at a time." One shared `metric_records` table plus `metric_definitions` gives charts, goals and milestones to every module. Fitness registers its metrics (`weight_kg`, `waist_cm`, …) through its manifest. Education will reuse the same tables for grades.
- **Alternative:** Fitness-only measurement tables. Simpler to query today, but duplicates chart and goal logic for each new module.

### D10 — Files
Clients request a presigned PUT, upload straight to object storage, then confirm. A worker validates type by content (magic bytes), strips EXIF/GPS from images, creates thumbnails, then marks the file `READY`. Downloads use short-lived presigned GET URLs issued only after a policy check. MinIO locally; **Cloudflare R2** is the cost-conscious production candidate (no egress fees). Proposed limits (please confirm): images 10 MB, documents 20 MB, videos 100 MB, no transcoding in MVP.

### D11 — Realtime and push
Socket.IO via `@nestjs/websockets` with the Redis adapter (rooms per user and conversation, authentication at handshake, membership re-checked on every room join). Push goes through the **Expo Push Service** (free, wraps FCM and APNs). Web push is deferred.

### D12 — Hosting for the MVP
One VPS (Hetzner-class) running Caddy, web, api, worker, MySQL 8.4 and Redis through Docker Compose; Cloudflare R2 for files and backups. Rough order of magnitude: tens of USD per month (verify current prices before committing). The images are stateless and 12-factor, so moving to managed MySQL/Redis and a container platform later is a configuration change, not a rewrite.
- **Trade-off:** you become the DBA. Mitigation: automated encrypted backups plus a scheduled restore test from day one (Phase 1). **Alternative:** managed services from the start (roughly 2–4× the cost, much less ops).

### D13 — Messaging timing
Your roadmap puts messaging in Phase 7, but a trainer/client product without any trainer ↔ client communication is hard to pilot. Proposal: keep Phase 7 for real-time chat, and in Phase 6 ship **threaded comments on check-ins** plus notifications so trainers can already respond.

### D14 — Organization onboarding
Self-serve: a user signs up, creates an organization, picks an enabled business category, becomes `owner`. Super admin can suspend. **Alternative:** invite-only or admin-approved creation (safer for early pilots, adds a manual step).

### D15 — UI system and i18n
- Tailwind with **design tokens** (blueprint §13), shadcn/ui (Radix primitives copied into the repo), Recharts, logical CSS properties (`ms-*`, `ps-*`, `start-*`) so RTL works without a second stylesheet.
- i18n: `next-intl` (web) and `i18next` + `expo-localization` (mobile) reading the same JSON dictionaries from `packages/i18n`, ICU plurals (Arabic has six forms), a CI test for key and placeholder parity, English as source. Errors travel as **codes**, so Arabic users see Arabic sentences.
- **Brand:** I would start with a neutral product theme (each organization adds its logo and accent). You have a personal design system (HM identity); I need to know whether this product should use it (see Q5).

### D16 — Test stack
Vitest + Supertest for the API, web and packages; jest-expo for mobile. Integration tests run against a real MySQL and Redis (the Docker Compose services locally, service containers in CI), not mocks. *Amended in Phase 1, see section F.*

### D17 — Sensitive data
Body photos, measurements and medical notes are health-related. Proposal: explicit consent records at sign-up and invite acceptance; `SENSITIVE` file class; every read of a sensitive photo by someone other than the owner is audit-logged; free-text medical notes encrypted at application level (envelope key from the secret store); data export and account deletion flows (Apple also requires in-app account deletion). Target-market laws decide the details (see Q2).

---

## B. Open questions (please answer or say "use your default")

| # | Question | My default if you don't answer |
| --- | --- | --- |
| Q1 | Team size and target date for a pilot? Solo or multiple people? | One senior full-stack developer (you + me); estimates in the roadmap assume that |
| Q2 | Which countries/regions will users and data be in? | Unknown; design for GDPR-style consent/export/erase; no data-residency promise yet |
| Q3 | Sign-in methods beyond email + password (Google, Apple, phone/OTP)? | Email + password only in MVP; identity table reserved. Note: if you add Google sign-in, Apple requires Sign in with Apple too |
| Q4 | Super admin policy for private content: metadata only plus audited support grant (D7)? | Yes, as proposed |
| Q5 | Use your HM design system for this product, or a neutral brand? | Neutral theme with org logo and accent |
| Q6 | Can a client have more than one trainer at once? | One primary trainer, optional secondary (schema supports many) |
| Q7 | Minimum client age; any minors in Fitness? | 18+, no minors in Fitness MVP |
| Q8 | Email provider preference (SES, Resend, Postmark, own SMTP)? | SMTP abstraction; Mailpit locally, provider chosen at staging |
| Q9 | Public client-facing pages (marketing site, pricing)? | Out of scope; separate site later |
| Q10 | Region/currency/language beyond English and Arabic? | None |

## C. Assumptions I am making

1. Canonical storage is metric (kg, cm); users choose a display unit system.
2. Timestamps are stored in UTC; "week" boundaries and reminders use the organization's timezone and a configurable first day of week.
3. Trainers invite clients (client creates the account on accepting); a trainer cannot create a login on someone's behalf.
4. A membership has exactly one role at a time.
5. Messages, notes and plan text are **not** machine-translated; seeded library content (exercises) is bilingual.
6. Mobile is online-first. Offline logging is a post-MVP item.
7. Subscription and billing tables are not created until Phase 9; `organizations.subscription_ref` is a reserved nullable column.
8. Every API response is localized by the client from error **codes**; the server never returns UI copy.

## D. Gaps in the requirements that I found

These are not blockers for Phase 1 but each needs a decision before the phase that touches it.

- **Account lifecycle:** account deletion, data export, what happens to a departing trainer's clients (reassignment), ownership transfer, last-owner protection. *(Phase 2)*
- **Consent and terms:** terms/privacy acceptance records, health-data consent versions. *(Phase 2)*
- **Notification categories** and defaults (what is on by default, quiet hours). *(Phase 5)*
- **Exercise and food library:** who curates the seeded exercise list, licensing of media, bilingual names. *(Phase 6)*
- **Client history access** when a client switches trainer (new trainer sees old plans/photos?). *(Phase 6)*
- **Abuse handling:** reporting content, blocking users in messaging. *(Phase 7)*
- **Apple/Google store rules:** in-app account deletion, privacy labels, health-data declarations. *(Phase 4 and 10)*
- **Support tooling:** how you help a customer (impersonation is *not* planned). *(Phase 3)*
- **Retention:** audit log retention, deleted-file purge window, backup retention. *(Phase 1 defaults, revisit in 10)*
- **Product analytics** and the consent it needs. *(Phase 10)*

## E. Where this plan deliberately differs from `APP-BLUEPRINT.md`

The blueprint is a single-process React + Vite + SQLite app. I keep its principles and replace what your new requirements contradict.

| Blueprint | This project | Reason |
| --- | --- | --- |
| SQLite default, switchable to MySQL | MySQL only, via Prisma | You specified MySQL; Prisma owns portability and migrations |
| Raw SQL repositories with `query/run/transaction` | Prisma repositories behind a tenant-scoped client | Type-safe queries and migrations; tenant filter enforced centrally |
| HttpOnly cookie sessions | JWT access + rotating refresh | Needed for native mobile clients |
| Vite SPA with hash routes | Next.js App Router + Expo Router | Required stack |
| Zustand + Immer for server data | TanStack Query for server state; Zustand only for client state on mobile | Required stack |
| One process serving API and UI | `api` and `worker` processes, separate `web` | Background jobs, realtime, independent scaling |
| `{ "error": "sentence" }` | `{ error: { code, message, details, requestId } }` | Clients localize by code (Arabic) |
| admin/editor/viewer | Full RBAC with scopes and resource-level policy | Multi-tenant requirements |

**Kept as is:** pure domain core with no I/O (now in `packages/domain`); one way to do each thing; server is the authority; one permission table (now a permission catalog in code, synced to the database); one error path; one settings file for environment variables; explicit DI tokens; typed English-source i18n with parity tests and real plural rules; design tokens and logical CSS properties; "arm first" confirm buttons for destructive actions; health endpoints (`/health/live`, `/health/ready`); `docs/ARCHITECTURE.md` with an "adding a feature" checklist; `HANDOVER.md`; "done means checks pass **and** the flow works in a real browser or device."

## F. Changes made during Phase 1 (approved plan amended)

| Change | Reason |
| --- | --- |
| D16: Vitest instead of Jest for the API | NestJS 12 (current release) is ESM-only and its own tooling runs on Vitest; Jest would need an ESM workaround layer. No effect on what is tested. |
| D16: integration tests use the Compose MySQL/Redis (databases ending in `_test`, enforced) instead of Testcontainers | Fewer moving parts; the same containers serve development, CI uses service containers. |
| MinIO removed from Docker Compose for now | The official `minio/minio` image is no longer available on Docker Hub or Quay. An S3-compatible emulator is chosen in Phase 5 when the file service is built. R2 for production is unchanged. |
| Registration answers identically whether or not the e-mail exists (no 409) | Prevents account enumeration (risk #10); existing owners get an "e-mail exists" notice instead. Consequence: clients cannot show "already registered" inline. |
| Prisma 7.10.1 with the MariaDB driver adapter, pinned exactly | Prisma 7 requires driver adapters; the `prisma` npm tag currently points at an 8.0 release candidate, which is not used. `uuid(7)` is supported. |
| `x-client-type` header (web, ios, android) is mandatory on login and refresh | Decides cookie versus body delivery of the refresh token and is part of the CSRF defence for cookie requests. |
| `users.avatar_file_id`, `mfa_enabled`, `consent_records.organization_id` not created yet | They reference tables that arrive in Phases 2 and 5; added by migration then. |
| Local Node is 26 while `.nvmrc`/CI/Docker use 22 LTS | Prisma officially supports 20.19+, 22.12+ and 24+. Everything passes on 26 locally, but CI and the image use 22, which is the supported target. |

## G. Changes made during Phase 2

| Change | Reason |
| --- | --- |
| Super-admin **API** (not UI) built in Phase 2 | MFA enforcement, the bootstrap CLI and the "super admin has no tenant access" tests need real platform routes. The UI stays in Phase 3. |
| Organization creation checks `email verified`; all organization routes require a verified e-mail | Invitations are bound to verified addresses; avoids acting for an unproven identity. |
| Invitation preview is `POST /invitations/preview` | Keeps the token out of URLs and access logs. |
| `member_assignments.active_key` instead of an `is_active` flag | One column expresses both "one active PRIMARY per participant" and "no duplicate SECONDARY pair". |
| Membership has no `INVITED` status | The `invitations` table already carries the invitation lifecycle; a membership exists only once accepted. |
| `roles.scope_key` generated by the application | Prisma cannot model generated columns; the unique index (scope_key, key) is real and tested. |
| Permission cache skipped | One indexed query per request is simple and always correct; revisit under load. |
| Login can return `mfaRequired` | Required by two-step TOTP; additive for accounts without MFA. |

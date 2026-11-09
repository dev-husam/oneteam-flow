# 04 — Fitness MVP Scope and Implementation Roadmap

Status: PROPOSED (Phase 0). Estimates assume **one senior full-stack developer working with Claude** (open question Q1) and are rough planning figures, not commitments.

## 1. Fitness MVP scope

**Goal:** a trainer can onboard clients, assign workout and nutrition plans, receive weekly check-ins with photos and measurements, review progress and respond — on web and mobile, in English and Arabic.

### In scope

| Persona | Capabilities |
| --- | --- |
| Organization owner/admin (gym or independent trainer) | Create organization, invite trainers and clients, manage members, roles (system + custom), groups, org settings, audit view |
| Trainer | Client list with status badges (check-in due/overdue, adherence); client profile; invite or add clients; build reusable workout and nutrition plans (versioned); assign to one or many clients; view workout/meal logs; review check-ins, comment, compare progress over time; tasks for clients; notifications |
| Client | Accept invitation; complete profile (height, goals, starting weight, starting photos); see today's workout and log sets; see nutrition plan and mark meals (with photo/note); submit weekly check-in (weight, measurements, photos, notes, adherence); see own charts and history; notifications |
| Super admin | Dashboard stats, users, organizations, suspend/activate, categories, modules, platform roles, audit logs, system health |
| Everyone | Profile, language (English/Arabic, RTL), organization switcher, sessions/security, in-app + push + email notifications with preferences |

### Out of scope for the MVP (documented so we do not drift)
Real-time chat (Phase 7; check-in comments cover the gap, see D13), payments and subscriptions (Phase 9), food database/barcode scanning, wearable integrations, video calls, workout video hosting (external links only), offline mode, calendar sync, AI features, Education/Coaching modules, marketing website.

### MVP acceptance (what "done" means)
- All Fitness flows above work end-to-end against the real backend (no mock data) on web, iOS and Android.
- Tenant-isolation and authorization suites pass in CI; no open high-severity findings.
- Arabic/RTL reviewed on every screen; error codes localized.
- Backups running and a restore has been tested; staging deployed from CI.

## 2. Roadmap

Your phase order is kept. Three adjustments are proposed (marked ▲):
▲ **TOTP MFA** moves into Phase 2/3 (needed before the super-admin UI exists).
▲ **Phase 6 is split** into 6a (clients, profiles, workouts) and 6b (nutrition, check-ins, charts) to keep reviews small.
▲ **Backups, CI/CD and staging start in Phase 1**, not Phase 10; Phase 10 hardens and load-tests them.

| Phase | Objective | Main deliverables | Exit criteria | Size |
| --- | --- | --- | --- | --- |
| **0** | Architecture and planning | These documents; decisions approved | You approve | done on approval |
| **1** | Backend foundation | pnpm/Turbo monorepo skeleton; NestJS app (api + worker entrypoints); Prisma + MySQL; Docker Compose (MySQL, Redis, MinIO, Mailpit); typed config; pino logging; error filter and codes; Swagger; health endpoints; `users` + auth (register, verify email, login, refresh rotation, logout, reset, sessions); rate limiting; CI pipeline; staging deploy; backup script + restore test | auth test suite green incl. rotation/reuse; `docker compose up` works from a clean clone; CI green; OpenAPI generated | ~2 weeks |
| **2** | Multi-tenancy and authorization | Organizations, categories, modules, memberships, invitations, groups, assignments; permission catalog sync; roles (system + custom); policy engine; `TenantPrismaService`; composite FKs; TOTP ▲; consent records; audit service | tenant-isolation endpoint matrix, authorization matrix and escalation tests green | ~3–4 weeks |
| **3** | Super admin + org web dashboard | Next.js app, i18n/RTL, UI kit and tokens, auth screens, `/me/context`-driven navigation; super-admin area (stats, users, orgs, categories, modules, roles, audit, health); org area (members, invitations, groups, roles, settings) | manual + Playwright flows pass in English and Arabic | ~3–4 weeks |
| **4** | React Native foundation | Expo app, secure auth, org picker, profile, language/RTL, role-aware tabs from context, push-token registration, EAS build setup | login → org select → profile on a real iOS and Android device | ~2–3 weeks |
| **5** | Shared capabilities | Tasks (+comments, attachments, history), goals/milestones/metric records and charts, file service (presign, processing, sensitivity), notifications (in-app, push, email, preferences), activity feed | each capability has API + web + mobile UI, tests, docs | ~4–5 weeks |
| **6a** | Fitness — clients and workouts | Fitness module manifest; client profiles; trainer–client assignment; exercise library; versioned workout plans; assign to many; logs and history | trainer builds and assigns a plan; client logs a session | ~3 weeks |
| **6b** | Fitness — nutrition and check-ins | Nutrition plans (versioned), meal logs with photos; weekly check-ins (measurements, photos, adherence); review/comment; progress charts and comparisons; reminders | full weekly loop works; sensitive photo access audited | ~3–4 weeks |
| **7** | Realtime communication | Socket.IO gateway (Redis adapter), private messaging, attachments, read markers, push for messages, unread counts | cross-tenant socket tests green; messaging on web and mobile | ~3 weeks |
| **8** | Additional modules | Education, Coaching (separate approvals each) | added with no change to core | per module |
| **9** | Commercial features | Plans, billing integration, usage limits, entitlements | org limits enforced by backend | ~3 weeks |
| **10** | Production readiness | Performance pass, security review + external pentest, monitoring/alerting, backup/DR drill, load tests, store submissions | launch checklist signed off | ~3 weeks |

Rough total to a pilot-ready Fitness MVP (Phases 1–6b, plus check-in comments): **about 5–6 months solo**; faster with more people because web and mobile can proceed in parallel after Phase 2.

## 3. Phase 1 preview (the next step after you approve)

**Objective:** a running, tested, documented backend with authentication and the developer infrastructure everything else builds on.

**Deliverables**
- Repository skeleton (`apps/api`, `packages/*`, `infra/`, CI, `.env.example`, `docs/ARCHITECTURE.md` "adding a feature" checklist, `HANDOVER.md`).
- Docker Compose: MySQL 8.4, Redis, MinIO, Mailpit.
- NestJS bootstrap: config validation, pino, `RequestContext`, `ApiExceptionFilter` + error code registry, validation pipe, helmet/CORS, versioning, Swagger, health, throttling.
- Prisma schema + first migration: `users`, `user_sessions`, `refresh_tokens`, `one_time_tokens`, `consent_records`.
- Auth endpoints: `POST /api/v1/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout`, `/auth/logout-all`, `/auth/verify-email`, `/auth/resend-verification`, `/auth/request-password-reset`, `/auth/reset-password`; `GET/PATCH /api/v1/me`; `GET /api/v1/me/sessions`, `DELETE /api/v1/me/sessions/:id`; `GET /api/v1/health/live`, `/health/ready`.
- Email sending through the queue (verification, reset) with Mailpit locally.
- Tests: unit (hashing, token rotation logic), integration with real MySQL/Redis (flows, reuse detection, rate limits, suspended user), OpenAPI snapshot.
- CI pipeline, staging deployment, nightly backup + weekly restore test.

**Out of Phase 1:** organizations, roles, invitations, MFA (Phase 2), any frontend.

## 4. Implementation checklist (kept up to date each phase)

- [x] Phase 0 — documents approved
- [x] Phase 1 — backend foundation (staging deployment and first scheduled restore test still need a server, see PHASE-1-REPORT)
- [x] Phase 2 — tenancy and authorization (+ TOTP); see PHASE-2-REPORT
- [x] Phase 3 — web: super admin + org dashboard; see PHASE-3-REPORT
- [x] Phase 4 — mobile foundation (not yet run on a device); see PHASE-4-REPORT
- [x] Phase 5 — shared capabilities: tasks, progress, files, notifications, activity (API + web + mobile; mobile not yet run on a device); see PHASE-5-REPORT
- [x] Phase 6a — Fitness: clients and workouts (API + web + mobile; mobile not yet run on a device); see PHASE-6A-REPORT
- [x] Phase 6b — Fitness: nutrition and check-ins (API + web + mobile incl. photo capture; mobile not yet run on a device); see PHASE-6B-REPORT
- [x] Phase 7a — roles and access (owner/trainer/client only, one organization per account, clients cannot see members, custom roles off); see PHASE-7A-REPORT
- [x] Phase 7c — design system (OneTeam Flow default, admin-managed designs, per-organization design, web + mobile); see PHASE-7C-REPORT
- [x] Phase 8a — Coaching module (sessions, private/shared notes, assessments with trends, resources; API + web + mobile; mobile not run on a device); see PHASE-8A-REPORT
- [x] Phase 7b — admin control center (feature flags with per-organization overrides, identity/theme/logo, e-mail branding and editable templates); see PHASE-7B-REPORT
- [x] Phase 7 — realtime communication (API + web + mobile; mobile not yet run on a device; includes report/block and a moderation queue); see PHASE-7-REPORT
- [ ] Phase 8 — additional modules
- [ ] Phase 9 — commercial features
- [ ] Phase 10 — production readiness

**Per-phase report format (as required):** what was implemented · files/modules created or modified · database changes · API endpoints · security considerations · tests and results · known limitations · remaining tasks · next recommended phase.

**Definition of done (every phase):** typecheck, lint and all tests pass; relevant docs updated; migrations apply to an empty database; flows verified in a real browser/device; no TODOs left in "complete" features; work committed.

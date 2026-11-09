# Handover

## State
Phases 0–7 and **7a (roles and access)** and **7b (admin control center)** are complete: architecture, backend foundation, multi-tenancy and authorization, the web app (super admin and organization workspace), the React Native app foundation, the **shared capabilities** (tasks, progress, files, notifications, activity) and the first business module, **Fitness** (client profiles, exercise library, versioned workout plans and assignments, workout logs; **nutrition plans, meal logs, weekly check-ins with private progress photos, trainer review, comparisons and reminders**), and **private messaging with realtime delivery** (Socket.IO + Redis), with API, web and mobile UI (mobile captures weekly and meal photos). Next: **Phase 8: additional modules** (see `docs/04-ROADMAP.md`); before that the highest-value work is a first run of the mobile app on real devices and the open messaging decisions (support access is open; the abuse-handling defaults are confirmed: `docs/PHASE-7-REPORT.md` §7–8). The mobile app has never been run on a simulator or device.

## Roles and access (Phase 7a)
Organizations have **owner, trainer (`practitioner`) and client (`participant`)** only; `admin` and `manager` are retired (unassignable), custom roles are off (`CUSTOM_ROLES_ENABLED=false`). An account belongs to **one** organization (`memberships.active_user_key`, unique). Clients have no `member.read`. The owner can coach: assign clients to the owner. See `docs/PHASE-7A-REPORT.md`.

## Admin control center (Phase 7b)
`/admin` → *Feature flags* (platform value + per-organization overrides; registry in `packages/domain/src/features.ts`), *Identity and theme* (name, logo, colours, e-mail branding) and *E-mail templates*. The web app reads the public configuration from `GET /config/public` (30 s cache); the API caches flags/settings/templates for `CONFIG_CACHE_SECONDS` (default 5). Custom roles are the `custom_roles` flag (default off). The mobile app follows the `messaging` flag and adopts the configured accent colour, name, tagline and logo on its sign-in screens (never yet run on a device). See `docs/PHASE-7B-REPORT.md`.

## Coaching module (Phase 8a)
`modules/coaching` (manifest in `packages/domain/src/coaching.ts`): sessions with reminders, shared and private notes (private ones encrypted, owner reads audited), questionnaires with repeating requests and trends, shared resources. The Coaching category is **disabled** until an administrator enables it (Admin → Catalog); then a new organization can pick it. Demo: after enabling the category run `node infra/dev-seed.mjs` → `/en/o/demo-coaching` (`coach@`, `coachee@`, `coachee2@demo.test`). Reminders run in the worker on their own queue (`coaching`). See `docs/PHASE-8A-REPORT.md`.

## Design system (Phase 7c)
The app's look is a **design** (50 semantic colour tokens for light and dark, corner style, typeface) defined in `packages/domain/src/design.ts` and managed in *Admin → Designs*: built-in *OneTeam Flow* (default, from `oneteam-flow-color-design-system.md`) and *Classic blue*, plus any number of custom ones; one platform default and an optional design per organization. Components use semantic Tailwind/CSS names (`bg-accent text-accent-ink`, `text-link`, `bg-selection`, status tokens), never raw colours; accessibility rules are enforced when saving. The web stylesheet's defaults are generated from the built-in design (re-generate if the built-in tokens change). Mobile follows the colours, not yet the corner style or typeface. People can pick their own design among those the administrator offers (Profile → Appearance); precedence is personal choice, then organization design, then platform default; flag `user_design_choice` switches it off (per organization too). See `docs/PHASE-7C-REPORT.md`.

## What works
Registration with consent, e-mail verification, login (web cookie / native body), refresh-token rotation with reuse detection, sessions list and revoke, logout and logout-all, password reset, profile (`/me`), rate limiting, structured logging, health probes, OpenAPI, e-mail through a BullMQ worker, Docker image, CI workflow, encrypted backup and restore test.
Phase 2 adds organizations, memberships, invitations, groups, assignments, custom roles, scoped data access, audit log, TOTP MFA and the super-admin API.
Phase 5 adds tasks (assignment to people and groups, comments, attachments, history), measurements and goals, private file storage with signed URLs, and notifications (in-app, push, e-mail, preferences).
Phase 6a adds the Fitness module (`apps/api/src/modules/fitness`, manifest in `packages/domain/src/fitness.ts`): see `docs/PHASE-6A-REPORT.md`.
Phase 6b adds nutrition, check-ins, private progress photos and reminders to the Fitness module: see `docs/PHASE-6B-REPORT.md`.
Phase 7 adds private one-to-one messaging with live delivery (`apps/api/src/capabilities/messaging`): see `docs/PHASE-7-REPORT.md`.
Details and test results: `docs/PHASE-1-REPORT.md` … `docs/PHASE-7-REPORT.md`.

## Web app notes
- Run: `pnpm dev` (API :3001 + web :3000). Screens verified in a real browser in English, Arabic (RTL), light/dark and at phone width; screenshots in `docs/screenshots/`.
- Brand is a neutral placeholder (name "Personal Trainer" is the single key `common.appName`; logo `components/ui/logo.tsx`; colours are tokens in `src/styles/globals.css`).
- `packages/api-client` is hand-written for now; D2 (generate from OpenAPI) is still to do. No component library beyond the in-repo UI kit (`components/ui`).
- No end-to-end (Playwright) tests yet; unit/component tests only.
- Browser console shows one expected 401 on `/auth/refresh` for signed-out visitors (session restore probe).

## Not done / needs you
- **Staging deployment** and the **scheduled restore test** need a server, object storage credentials and GitHub secrets (`BACKUP_PASSPHRASE`, `BACKUP_S3_*`). Workflows and scripts are written and the scripts were exercised locally.
- The repository is not a git repository yet (`git init` + first commit pending your go-ahead). CI has never run on GitHub.
- Terms/privacy documents themselves do not exist; the API records acceptance of `TERMS_VERSION`.

- **First platform administrator:** register and verify an account, then `pnpm --filter @pt/api build && pnpm --filter @pt/api admin:grant -- you@example.com`; that account must enable two-factor authentication before `/admin` works.
- **Database users:** run migrations with a privileged user and the app with the user produced by `infra/mysql/grant-runtime-user.sh` (audit logs append-only). Not applied anywhere yet.
- **New env var:** `MFA_ENCRYPTION_KEY` (`openssl rand -base64 32`) is required in production.

- **Demo data:** with the API running (`APP_ROLE=all`), `node infra/dev-seed.mjs` creates `/en/o/demo-gym`, accounts `*@demo.test` (password in the script output), a platform admin with MFA, and (Phase 5) demo tasks, a body-weight measurement series and a goal. Safe to re-run.
- **File storage:** development uses `STORAGE_DRIVER=local` (files under `data/uploads`, git-ignored). Production **requires** `STORAGE_DRIVER=s3` with `S3_*` variables (R2 or any S3-compatible bucket; the bucket needs a CORS rule allowing `PUT` and `GET` from the web origin with `Content-Type`). Never exercised against a real bucket yet: first staging task is one upload/download round trip.
- **Push:** `PUSH_TRANSPORT=off` by default locally; `expo` sends through Expo's service once the mobile app has an EAS project id; `memory` is for tests.
- **Measurements:** Fitness organizations get the built-in body measurements (weight, body fat, waist, hips, chest, arm, thigh) registered by the module; their keys are reserved. Other organizations define their own (Progress → New measurement).
- **Fitness module:** the exercise library (43 bilingual exercises, names only) and the built-in measurements are synced into the database at every API boot (`CatalogSyncService`), so start the API once after deploying. To turn Fitness off for an organization set `organization_modules.enabled = 0`; its routes then answer `MODULE_NOT_ENABLED`.
- **Progress photos are special-category data.** `fitness.photo.read` is held by owner, trainer (own clients) and client (own); admins and managers do not have it by default. Every read is audited (`file.accessed`). Uploads must be JPEG/PNG and are rewritten without EXIF/GPS (the mobile app also re-encodes to JPEG before upload). Seeded demo photo is a synthetic gradient.
- **Reminders** (check-in due/overdue) run in the worker (`APP_ROLE=worker` or `all`) as a repeating BullMQ job on the `maintenance` queue; without the worker no reminders are sent. After new `fit_*` tables, run migrations before starting the API.
- **Health notes** of a client profile are encrypted with `MFA_ENCRYPTION_KEY`: rotating that key without re-encrypting makes them unreadable.

- **Realtime:** the API serves Socket.IO on the same port at `/socket.io` and uses Redis (pub/sub) to reach sockets on other instances; the reverse proxy must allow WebSocket upgrades. Clients authenticate with the access token in the handshake. Sockets are re-checked against the database every 30 s (revoked sessions, ended memberships). Writes stay on REST.
- **Messages are private to the two participants:** admins, managers and owners cannot read them (no support-access grant exists yet). The exception is a message a participant **reports**: owners and admins (`message.moderate`) see that one message (a snapshot) in *Reported messages*, nothing else of the conversation.

## Gotchas
- Local Node is 26, supported target is 22 LTS (`.nvmrc`). Prisma officially supports 20.19+, 22.12+, 24+.
- `prisma migrate dev` needs the `pt_shadow` database (created by `infra/mysql/init`; for an older volume create it manually or recreate the volume).
- NestJS 12 is ESM-only: relative imports end in `.js`; tests are Vitest.
- Integration tests share one MySQL and one Redis: they run file by file.
- Storage in development is the local driver, not an S3 emulator (MinIO's official image disappeared); the S3 driver is presign-tested only.
- After changing `packages/*` run `pnpm --filter @pt/domain --filter @pt/i18n --filter @pt/api-client build`: web and mobile consume the built output.
- Local development needs Docker running (MySQL, Redis): if the API answers 500 on everything, `pnpm infra:up`, then restart the API (it keeps dead connections).
- Jest (mobile): give any test `QueryClient` `gcTime: Infinity` for queries and mutations, or Jest will not exit.

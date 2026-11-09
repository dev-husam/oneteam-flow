# Phase 6a Report — Fitness: Clients and Workouts

Status: **implemented and verified.** Backend: automated tests against real MySQL/Redis. Web: exercised in a real browser (client and trainer roles, English and Arabic/RTL). Mobile: automated tests and a Metro bundle; **not run on a simulator or device** (no Xcode/Android SDK here).

## 1. What was implemented

The first business module, built entirely on the Phase 5 capabilities. Exit criterion met: **a trainer builds and assigns a plan; a client logs a session** (verified end to end in the browser).

| Area | What it does |
| --- | --- |
| **Module mechanism** | A `BusinessModuleManifest` (permissions, default role grants, navigation, system measurements) registered in `@pt/domain`; `@RequiresModule('fitness')` guard (module enabled for the organization **and** by the platform); module navigation merged into `/context`; module permissions and content synced at API boot |
| **Client profiles** | Date of birth (18+, decision Q7), sex, height, goal, activity level, goals in their own words, **health notes encrypted at rest**; starting weight recorded once as the first weight measurement (`source = fit.onboarding`); editable by the client and their trainer |
| **Clients list** | The people a trainer looks after (scope-filtered in the query): goal, active plans, last workout; detail with stats, active plans, recent sessions |
| **Exercise library** | 43 seeded **bilingual** exercises (English/Arabic names, muscle group, equipment), searchable in either language; organizations add, edit and archive their own (https video link optional); the system library is read-only |
| **Workout plans** | Plans → versions → days (≤7) → exercises (sets, rep range, target weight, rest, superset group, notes). A version is a **draft until published; a published version is immutable**. Change = new version (copied from the current one). Full validation with per-field paths |
| **Assignments** | Assign one published version to **many clients and/or groups** at once with a start/end date and a weekly schedule (each plan day on its own weekday); all-or-nothing for named clients, skip-and-report for group members out of reach; pinned to the version assigned; cancel keeps history; clients notified |
| **Workout logging** | "Today" from the organization's clock, upcoming days, "train on another day"; start a session (idempotent), log/correct/remove sets, "last time" shown beside targets, finish with effort (RPE) and notes; trainers notified; history with volume |
| **Built-in measurements** | weight, body fat, waist, hips, chest, arm, thigh — system-wide, visible only to organizations with the module; their keys are reserved |

Web: Clients, Client detail (+ profile editor), Workout plans, Plan editor (draft editing, locked published view, version switcher, assign dialog), Exercises, My workouts, Session logger. Mobile: Workouts tab, session logger, Clients tab, client detail (read-only); Fitness organizations show Clients instead of Members. Both: English and Arabic.

## 2. Files and modules

```
packages/domain/src     fitness.ts (manifest + plan/schedule/session rules) · fitness-library.ts (seed) · modules.ts (registry) · roles.ts/permissions.ts (module grants) · errors.ts
packages/api-client     Fitness types and methods (exercises, clients, plans, assignments, workouts, sessions); ApiError.issues
packages/i18n/src       en-fitness.ts · ar-fitness.ts (+ errors, nav, notification texts)
apps/api/src/core/rbac  module-enabled.guard.ts · @RequiresModule · catalog sync of module content
apps/api/src/modules/fitness/
  exercises/  clients/  plans/  workouts/ (assignments + sessions)  fitness.module.ts
apps/api/prisma         migration 20261106170730_fitness_module
apps/web/src/features/fitness   exercises · plans · plan-editor · assign-dialog · clients · workouts · session
apps/mobile/app/(app)   (tabs)/workouts · (tabs)/clients · session/[sessionId] · client/[membershipId]
```

## 3. Database changes

One migration, nine tables, all with `organization_id` and composite foreign keys `(organization_id, id)`; `fit_exercises` is the one mixed table (system library `organization_id NULL` + organization's own).

`fit_client_profiles` · `fit_exercises` · `fit_workout_plans` · `fit_workout_plan_versions` · `fit_workout_days` · `fit_workout_day_exercises` · `fit_workout_assignments` (one row per client, rows of one bulk assignment share `batch_id`) · `fit_workout_sessions` (unique per assignment, day and date) · `fit_workout_set_logs` (unique per session, exercise slot and set number).

Differences from the Phase 0 design: enum-like fields (goal, activity level, sex, muscle group, equipment) are strings validated in `@pt/domain` so lists can grow without migrations; `current_version_id` and exercise `created_by` are plain columns (no circular/mixed FK); exercises carry a `scope_key` + stable `key` for idempotent seeding; no `media_file_id` (video link only); `fit_nutrition_*` and check-ins are Phase 6b.

## 4. API endpoints (`/api/v1/orgs/{orgId}/fitness/…`, all behind `@RequiresModule('fitness')`)

| Area | Endpoints |
| --- | --- |
| Exercises | `GET /exercises` (q, muscleGroup, equipment) · `POST` · `GET/PATCH/DELETE /exercises/{id}` |
| Clients | `GET /clients` · `GET /clients/{membershipId}` · `PUT /clients/{membershipId}/profile` |
| Plans | `GET/POST /plans` · `GET/PATCH/DELETE /plans/{id}` · `POST /plans/{id}/versions` · `GET/DELETE /plans/{id}/versions/{versionId}` · `PUT …/content` · `POST …/publish` |
| Assignments | `POST /plans/{id}/assignments` · `GET /assignments` · `GET /assignments/{id}` · `POST /assignments/{id}/cancel` |
| Workouts | `GET /workouts/today` · `POST /sessions` (start/resume) · `GET /sessions` · `GET /sessions/{id}` · `PUT /sessions/{id}/sets` · `DELETE /sessions/{id}/sets/{dayExerciseId}/{setNo}` · `POST /sessions/{id}/complete` |

New permissions (module `fitness`): `fitness.client.read/update`, `fitness.exercise.read/manage`, `fitness.workout_plan.manage/assign`, `fitness.workout.read/log` with scopes OWN/ASSIGNED/ORG. New error codes: `MODULE_NOT_ENABLED` (403), `PLAN_VERSION_LOCKED` (409), `PLAN_INVALID` (422, with per-path `issues`), `SESSION_COMPLETED` (409). OpenAPI regenerated (113 paths, 144 operations).

## 5. Security considerations

- **Tenant isolation:** all new tenant models classified; only the exercise library service (mixed table) may use the unscoped client (architecture test updated); composite FKs; the isolation matrix now covers every Fitness route (strangers and foreign ids → 404, including another organization's custom exercise, plan, assignment and session).
- **Authorization by reach, inside the query:** trainers see only their own clients (`ASSIGNED`), their own plans (`OWN`); managers/owners all. A trainer cannot log a workout as a client; only the client edits their open session; another trainer's request for a client, session or assignment is 404.
- **Plans cannot be edited after publishing** and assignments are pinned to a version, so what a client was given never changes silently (tested, including "a later version does not change existing clients").
- **Health notes** are AES-256-GCM encrypted; the audit entry for a profile change lists field names only (tested: no plaintext in the table or the audit row). Reading requires `fitness.client.read` for that person.
- **Clients must be adults** (decision Q7): date of birth under 18 is rejected; impossible dates (`1990-02-31`) are rejected after a real bug found by the tests (V8's lenient `Date.parse`).
- **Audited:** plan published, plan assigned (batch), assignment cancelled, client profile updated.
- **Module off = feature off:** `MODULE_NOT_ENABLED` on every route, navigation hidden, system measurements hidden (tested by disabling the module for an organization).
- **Notification deep links** gained `clientId`/`workouts` payloads, validated before navigation on web and mobile (unit-tested).

## 6. Tests and results

| Suite | Result |
| --- | --- |
| Domain (manifest, validation, schedules, time zones, session maths, seed library integrity) | 50 |
| API (unit + integration, real MySQL/Redis): Fitness suite (21 tests: module on/off, permissions, library, profiles, versioning, assignments, logging, history), isolation matrix incl. Fitness, route inventory, existing suites | **328 / 35 files** |
| API client | 18 |
| i18n (Arabic key parity, placeholders, plurals) | 5 |
| Web | 35 |
| Mobile (jest-expo) | 32; Metro bundle succeeds |

**Full `pnpm check`: 22/22 tasks green, exit code 0** (typecheck, lint and tests for domain, i18n, api-client, api, web and mobile).

Browser verification (real API, MySQL, Redis): client — nav, today's workout, start, log sets (reload keeps them), finish with effort, status "Completed", persistence; trainer — clients list, client detail with decrypted health notes and the completed session, plan list, locked published version, new draft, **validation blocks publishing a bad rep range and marks the exact exercise**, discard draft leaves v1 untouched; Arabic/RTL exercise library with bilingual names. Defects found and fixed during the pass: columns of the set table shifted when a set was logged (fixed widths), `invalid` prop leaking into `<textarea>` (new `Textarea` component, also fixed in the Phase 5 task forms), impossible dates of birth accepted.

## 7. Known limitations

- **Mobile not run on a device or simulator.** Mobile cannot build or edit plans, assign them, or edit profiles (web covers staff work); the plan editor is a desktop-style screen.
- **Exercise library: names only.** No instructions, images or videos are seeded: that needs an editorial and licensing decision (open question from Phase 0). Organizations can add instructions and a video link to their own exercises.
- **"Client" means** a member in the participant role, or anyone with a Fitness profile/assignment. Custom roles cloned from participant are only listed once they have a profile or assignment.
- Plan editing is a single-user draft: no concurrent-edit protection on a draft (last save wins). Published versions are safe.
- No rest timer, personal-record tracking or charts of strength over time yet (volume and 1RM maths exist in `@pt/domain`); no reminders for missed workouts (needs the scheduler, with check-in reminders in 6b).
- A trainer who has only `fitness.workout_plan.assign` but not `manage` cannot see plans to assign (assignment starts from a plan the caller manages).
- Notification text for workouts is rendered in the recipient's account language (as in Phase 5).
- Browser console still shows the dev-only React hydration warning on the login page (theme script).

## 8. Remaining tasks

1. Editorial decision and content for exercise instructions/media (who writes them, licensing).
2. Run the mobile app on a simulator/emulator; first run of Fitness screens, RTL and push.
3. Staging: point storage at a real bucket (Phase 5 item) and run one end-to-end Fitness flow there.
4. `git init`, first commit, CI run (outstanding since Phase 1).

## 9. Next recommended phase

**Phase 6b — Fitness: nutrition and check-ins:** versioned nutrition plans and meal logs with photos, weekly check-ins (measurements, progress photos with audited access, adherence), trainer review and comments, progress comparisons and reminders. It reuses the same patterns (manifest permissions, versioned immutable plans, files with sensitivity, notifications).

# Phase 8a — Coaching module

Approved by the product owner on 2026-11-07 (plan: `docs/PHASE-8-PLAN.md`). Defaults used for the three open decisions: a neutral "wheel of life" starter questionnaire coaches can edit, private notes included in version 1, and a real-device run of the mobile app still pending (no simulator on this machine).

## 1. What was implemented

A new business module, `coaching`, added without any change to the core's structure: manifest, tables with the `coach_` prefix, `@RequiresModule('coaching')` on every route, its own queue for reminders.

- **Sessions.** A coach schedules a session with an assigned client (date, length, place or meeting link, agenda); the client sees it and is notified. Change, cancel (with an optional reason) and "mark as held" (only once it has started). Changing the time restarts its reminders. Both people are reminded once the day before and once shortly before (inside 2 hours); a session created close to its start skips the day-before one. Reminders honour the `reminders` feature flag.
- **Notes, shared and private.** Shared notes are visible to the client (who is notified). **Private notes** are the coach's working notes: stored encrypted (same key as MFA secrets and health notes), never returned to the client, readable only by their author and by owners; an owner reading someone else's private notes is written to the audit log (count and client, never the text). Only the author edits or deletes a note, owners included. Audit entries for notes never contain the text.
- **Assessments.** Reusable questionnaires (scale 1–10, yes/no, free text; up to 20 questions; labels in English and Arabic, one language is enough) shared by the organization's coaches (a coach edits their own, an owner any). A coach asks an assigned client to complete one, optionally repeating every 7–365 days: finishing it creates the next request automatically; cancelling the open request stops the repeats. The questions are copied into each request, so editing the template never changes what a client answered. The client's answers feed **trend lines** per scale question (first-to-latest change). A "wheel of life" starter is built in.
- **Resources.** A coach shares an http(s) link and/or a file with one client or with all clients assigned to them; clients are notified. Files follow the resource (readable only by people who can see it, never after it is withdrawn).
- **Screens.** Web: Coaching (upcoming sessions, clients), one client's workspace (sessions, notes, assessments with trends, resources), Assessments (questionnaire builder), Resources, and "My coaching" for clients. Mobile: "My coaching" for clients (sessions, notes, answering assessments, resources) and "Coaching" for coaches (upcoming sessions with mark-held/cancel, clients, per-client notes with a private switch). English and Arabic throughout. Notifications deep-link to the right screen.
- **Permissions** (module `coaching`): session read/manage, note read/write, `note.private.read` (sensitive: coach OWN, owner ORG, nobody else), assessment manage/read/submit, resource manage/read. Clients get read/submit at their own scope. Trainers also hold the client permissions at OWN scope, because a role can never hand out more than its holder has (same pattern as Fitness).

## 2. Files and modules

- `packages/domain/src/coaching.ts` (+ spec): manifest, permissions, reminder timing, question/answer validation, cadence, trend calculation, wheel of life; `navigation.ts` gained `hiddenWithPermission` (the client's page is not offered to coaches).
- API: `modules/coaching/{sessions,notes,assessments,resources,reminders}`, `reach.service.ts`, `coaching.module.ts`; the module is registered in `catalog-sync`, `app.module`, `worker.module`; `QUEUES.COACHING`; notification category `coaching`.
- `packages/api-client` (`org(id).coaching.*`), i18n `en/ar-coaching.ts`, web `features/coaching/*` and five routes, mobile `app/(app)/{coaching,my-coaching,coaching-client}`, `ui/coaching-parts.tsx`.
- `infra/dev-seed.mjs`: a demo practice (`/en/o/demo-coaching`: `coach@`, `coachee@`, `coachee2@demo.test`) once the Coaching category is enabled.

## 3. Database changes

Migration `20261108090000_coaching_module`: `coach_sessions`, `coach_notes`, `coach_assessment_templates`, `coach_assessments`, `coach_resources`, all tenant-scoped with composite foreign keys (`organization_id`, `id`), registered in the tenancy registry. The module row is created at boot; the Coaching category stays disabled until an administrator enables it (Admin → Catalog).

## 4. API endpoints (`/api/v1/orgs/{orgId}/coaching/…`)

`sessions` (list, get, create, update, `cancel`, `complete`), `notes` (list by client, create, update, delete), `assessment-templates` (list, create, update, archive), `assessments` (list, get, request, `submit`, `cancel`, `trends`), `resources` (list, create, archive). Documented in `apps/api/openapi.json`.

## 5. Security considerations

- Every route requires the module (`MODULE_NOT_ENABLED` otherwise) and a permission with a scope; people outside a coach's reach get 404, not 403. The isolation matrix now includes five organization-B coaching objects (session, private note, questionnaire, request, resource) and every coaching route is probed from a non-member and with the wrong organization's ids.
- Private note text is encrypted at rest; changing `MFA_ENCRYPTION_KEY` without re-encrypting makes existing private notes unreadable (as for health notes). A mutation check confirmed the privacy tests fail if private notes are exposed to the client.
- Reminders claim each send with a conditional update, so two workers cannot double-send; a single organization failing never blocks the others.
- Assessment submission claims the request in the same update that completes it, so two submissions at once cannot both succeed. Links must be http(s) (no `javascript:`), files must be the sharer's own finished, non-sensitive upload and are used once.

## 6. Tests and results

`coaching.int.spec.ts` (24 tests): module gating and vocabulary; the full session loop and its closed doors (other coaches, other clients, clients managing); time and length validation; moving, holding, cancelling; reminders (once each, both people, flag off); shared vs private notes, encryption in the database, owner reads audited without text, author-only editing, sharing a private note notifies; questionnaire validation with exact problems; request, one-at-a-time, visibility, answering with validation, repeat scheduling, snapshots, trends, cancel stops repeats; resources (links, unsafe links, files readable by exactly the right people, withdrawn files closed); isolation between organizations. Domain: coaching rules and permissions (`coaching.spec.ts`). Mobile: 4 new tests (client screen, answering flow with the button disabled until complete, empty state, coach screen). Existing suites were extended (isolation matrix, route inventory for two modules, OpenAPI snapshot, role pickers). Final `pnpm check`: 22/22 tasks green (API 424 tests, web 37, domain 99, api-client 30, i18n 5, mobile 79); the iOS and Android bundles build. In a real browser: an administrator enabled the Coaching category from the Catalog screen; as the demo coach the home page, a client's workspace (sessions, shared and private notes, trend lines, resources) and as the demo client the "My coaching" page (no members menu, no private text) and completing an assessment through the screen (trend updated, next repeat created). The browser pass caught two bugs the tests missed (client links lost the organization prefix; a chart axis showed a floating-point value); both fixed. Not browser-checked: Arabic rendering of the new pages, the questionnaire builder and resource upload dialogs, and the mobile screens.

## 7. Known limitations

- **Scheduling on a phone and questionnaire building on a phone are not built:** coaches schedule sessions, build questionnaires, request assessments and share resources on the web; the mobile coach screen shows sessions (mark held, cancel), clients and notes. Clients can do everything they need on mobile.
- **The mobile app has still never run on a simulator or phone**; the new screens are covered by unit tests and the bundle builds, nothing more.
- **Trends use their own tables, not the shared measurements** (a deviation from the plan, which mentioned metric records): the result for the user is the same, but assessment answers cannot be used as goal targets yet.
- **Times:** the web form uses the browser's time zone; notifications are written in the organization's time zone.
- **No reminders for assessments** (only the request notification), no calendar sync, video, payments or group coaching.
- **One coach's notes are visible to owners:** by design owners can read all private notes, always audited; if that is unwanted, the permission can be removed from the owner template in code.
- The disabled `Coaching` category must be enabled by an administrator before anyone can create a coaching organization; an existing organization of another category cannot add the module yet (no per-organization module switch in the admin UI).

## 8. Next

Phase 8b (Education) needs the four decisions listed in `docs/PHASE-8-PLAN.md` first (parents, one-organization rule, children's data, legal documents). Before it: a first run of the mobile app on a device, and the open decision about the platform support-access grant.

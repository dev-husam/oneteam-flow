# Phase 8 — Additional modules: plan (for approval)

Status: PROPOSED, 2026-11-07. Nothing here is built. Each module needs its own approval before work starts (roadmap rule), and each is delivered the same way as Fitness: manifest, tables with the `<module>_` prefix, API, web, mobile, en/ar, tests, report.

## What the platform already gives a new module (no core change)

Organizations with owner / trainer / client roles and the category's vocabulary (`terminology.ts`: Coach/Client, Teacher/Student/Parent), assignments and groups, tasks (comments, attachments, history), goals and metric records with charts, private file storage with sensitivity levels, notifications (in-app, push, e-mail) with reminders, private messaging, activity feed, audit log, module switch per organization, feature flags with per-organization overrides, admin-editable e-mail wording, theme and identity. A module adds only what is specific to its industry.

Both categories exist but are **disabled** in the admin catalog, and there is no module row yet; enabling them is an admin action after the module ships.

## Recommended order: Coaching first, then Education

Coaching reuses almost everything and has no new privacy class beyond "private notes", so it proves the module contract cheaply. Education needs genuinely new things (classes, grades, attendance, parents, children's data) and carries the heaviest privacy obligations, so it deserves a design of its own once Coaching is done.

## Phase 8a — Coaching (about 3 weeks)

**Objective:** a coach runs 1:1 programs with clients: sessions with notes, agreed actions, goals and a recurring self-assessment, all visible to the client in the right measure.

**Scope (v1)**
- **Sessions:** scheduled sessions (date, length, place or meeting link, agenda), status (planned, held, cancelled), reminders to both people (reuses the reminder worker and the `reminders` flag). No calendar sync, no video, no payments.
- **Notes with two levels:** *private* (coach only) and *shared* (the client sees it). Private notes are special-category data: separate permission `coaching.note.private.read`, owner/coach only by default, every read audited, never in search or exports.
- **Action items:** created from a session as normal **Tasks** (no new table), so they already have due dates, comments, notifications and the client's task list.
- **Goals:** the existing goals and milestones.
- **Assessments:** the coach defines a short questionnaire (scale 1–10 areas such as the "wheel of life", or yes/no and free text); the client completes it on a rhythm; scale answers are stored as **metric records**, so trends and comparisons reuse the existing charts.
- **Resources:** files or links the coach shares with one client or all of them.
- Coach dashboard (clients needing a session or an assessment, upcoming sessions), client "my coaching" screen; web and mobile; English and Arabic.

**Rough data model (`coach_*`):** `coach_sessions`, `coach_session_notes` (visibility), `coach_assessment_templates` + `coach_assessment_questions`, `coach_assessments` + `coach_assessment_answers`, `coach_resources`. Permissions `coaching.session.*`, `coaching.note.*`, `coaching.assessment.*`, `coaching.resource.*` with the same OWN / ASSIGNED / ORG scopes as Fitness. Tenancy: all tables tenant-scoped with composite keys, covered by the isolation matrix.

**Done means:** coach and client complete a full loop (schedule, hold, note, action item, assessment, trend) on web and mobile with the real backend; private notes provably invisible to the client, owner-only audit trail; isolation and authorization suites extended; flag `coaching_sessions`-style switches where useful.

**Out of scope:** payments and packages (Phase 9), calendar sync, video calls, group coaching/cohorts, AI summaries.

## Phase 8b — Education (about 5–6 weeks, design confirmed first)

**Objective:** teachers run classes: enrollment, assignments with submissions and grades, attendance, announcements, and parents see their child's progress.

**Likely scope:** classes (built on the existing groups, with a term and a subject), enrollment, assignments and submissions with feedback and a grade (grades are metric records), attendance per lesson, announcements to a class, timetable, a gradebook per class and per student, parent view.

**Why it needs a design step before approval**
- **Parents:** the `guardian` role exists but nothing links a parent to a child. We need a guardian-to-student link and a new view-only access scope; this touches the authorization core.
- **One organization per account (Phase 7a):** a parent with children at two schools, or a teacher at two schools, cannot belong to both. Either we accept that for Education or relax the rule for this category.
- **Children's data:** minors need consent from a parent, stricter retention, no messaging between adults and children outside the class, and possibly a data-protection review before real pupils are on the system.
- **Terms of use / privacy documents** still do not exist.

I would not start 8b before these four are decided.

## Cross-cutting work in either module
- Add the module key to the manifest registry and `platform_modules` seed; the admin enables the category and the module.
- Role defaults per module (Fitness pattern), including which permissions are sensitive.
- New feature flags only where a part must be switchable on its own (for example `coaching_assessments`).
- Notification types and e-mail wording through the existing editable templates.
- Mobile: screens for the main loop only; run on a real device before sign-off (it has never been run on one).

## Decisions I need before starting 8a
1. **Which kind of coaching?** Life, business/career, or health-and-habits coaching changes the sample assessments and wording only, not the structure; I would start with a neutral "wheel of life" and let coaches edit it.
2. **Are private notes in v1?** Recommended yes (the main reason a coach uses a tool like this), with the audit trail above.
3. **Run the mobile app on a device first?** Recommended: yes, one session on a simulator or phone before adding more mobile screens.

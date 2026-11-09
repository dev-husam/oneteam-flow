# Phase 6b Report — Fitness: Nutrition and Check-ins

Status: **implemented and hardened; backend fully tested, web verified in a real browser, mobile covered by automated tests and iOS/Android Metro bundles only** (never run on a simulator or device: this machine has no Xcode or Android SDK). A hardening pass after the first delivery added mobile photo capture, audit rows for check-in submission and photo changes, and the browser checks listed in §6. Exit criterion — *the full weekly loop works; sensitive photo access is audited* — is met on the backend (automated) and in the browser for the trainer and client paths listed in section 6.

## 1. What was implemented

| Area | What it does |
| --- | --- |
| **Nutrition plans** | Plans → versions → days (one per weekday) → meals (breakfast/lunch/dinner/snack, time) → foods (amount, unit, kcal, protein, carbs, fat). Same rules as workout plans: a version is a **draft until published; a published version is immutable**; change = new version. Validation with per-field paths; meal and day totals computed from the foods |
| **Nutrition assignments** | One published version to **many clients and/or groups** at once, with start/end dates; pinned to the version; all-or-nothing for named clients, skip-and-report for group members out of reach (shared `ReachService` with workout assignments); cancel keeps history; clients notified |
| **Meal logs** | "Today" (or any day) from the organization's clock; one tap logs a meal as *ate it / part of it / skipped*, with notes and optional photos (private files); idempotent per meal and day; the day's adherence is computed on the server |
| **Weekly check-ins** | Week start from the organization's `weekStartsOn`; this week or last week; draft (measurements + notes) → **submit locks it**. Submitting records the measurements **atomically** through the Progress capability (weight, body fat, waist, hips, chest, arm, thigh), which also updates the client's goal progress, and tells the trainer. Adherence (workouts done, meals as planned) is computed by the server, not typed in |
| **Progress photos** | Front/side/back per check-in, plus "starting photos". Stored as **SENSITIVE** files: JPEG/PNG only, **EXIF/GPS and other metadata stripped on upload** (orientation kept), HEIC and malformed images refused |
| **Review and discussion** | Trainer marks a check-in reviewed with feedback; comments thread between client and trainer (drafts cannot be commented on); the other side is notified |
| **Comparisons** | Compare any two check-ins: before/after/change per measurement and the photos |
| **Clients list** | New check-in column (due today / overdue / submitted / reviewed); client detail gains check-ins, photos on request and the nutrition summary |
| **Reminders** | A BullMQ maintenance job reminds clients whose check-in is due or overdue and tells the trainer about overdue ones; de-duplicated per person and week (`fit_reminder_marks`); the clock is injectable so tests drive it |
| **Sensitive-access plumbing** | New `FileAccessRegistry`: a module tells the Files capability who may read its files (check-in photos → the client, their trainer, anyone holding `fitness.photo.read`); every read writes `file.accessed` (with `own`) to the audit log |

Web: Nutrition plans, plan editor (locked published view, version switcher, copy a day to other weekdays), assign dialog, My nutrition, My check-in, Check-ins queue, Check-in detail (photos, discussion, review, comparison), Clients list/detail additions. Mobile: Nutrition tab (with meal photos), My check-in (with camera/library photo slots), staff Check-ins queue and detail (see limitations). Both: English and Arabic.

## 2. Files and modules

```
packages/domain/src     nutrition.ts (validation, totals, adherence, week maths, due state) · image-metadata.ts (EXIF/GPS stripper)
                        fitness.ts (8 permissions, nav) · modules.ts (sensitive permissions) · authorization.ts (escalation ignore list) · errors.ts
packages/api-client     nutrition, meal logs, check-ins, photos types and methods
packages/i18n/src       en-care.ts · ar-care.ts (+ nav, notification texts, CHECKIN_LOCKED)
apps/api/prisma         migration 20261106221156_nutrition_checkins
apps/api/src/capabilities/files      FileAccessRegistry, storage read/write, strip-on-complete, sensitive format rule
apps/api/src/capabilities/progress   recordBatchInTx / recordByKey (atomic, system-key aware)
apps/api/src/modules/fitness/        reach/ nutrition/ checkins/ reminders/ (+ clients, workouts touched)
apps/web/src/features/fitness        nutrition-plans, editor, assign dialog, my nutrition, check-in, check-ins queue/detail, secure-image
apps/mobile/app/(app)                (tabs)/nutrition · my-checkin · checkins/index · checkins/[checkinId]; src/ui/checkin-parts, secure-image; src/lib/photo.ts (pick, re-encode, upload)
infra/dev-seed.mjs                   6b demo data (plan, assignment, Sara's submitted check-in with a synthetic photo)
```

## 3. Database changes

One migration, 12 tables (all with `organization_id` and composite foreign keys `(organization_id, id)`; all classified in `tenant-models.ts`):

`fit_nutrition_plans` · `fit_nutrition_plan_versions` · `fit_nutrition_days` · `fit_meals` · `fit_meal_items` · `fit_nutrition_assignments` · `fit_meal_logs` · `fit_meal_log_photos` · `fit_checkins` (unique per client and week) · `fit_checkin_comments` · `fit_progress_photos` (one row per file) · `fit_reminder_marks`.

New enums: meal log status, check-in status. `File` sensitivity SENSITIVE already existed from Phase 5.

## 4. API endpoints (`/api/v1/orgs/{orgId}/fitness/…`, all `@RequiresModule('fitness')`)

| Area | Endpoints |
| --- | --- |
| Nutrition plans | `GET/POST /nutrition-plans` · `GET/PATCH/DELETE /nutrition-plans/{id}` · `POST …/versions` · `GET/DELETE …/versions/{versionId}` · `PUT …/content` · `POST …/publish` · `POST …/assignments` |
| Nutrition assignments | `GET /nutrition/assignments` · `GET /nutrition/assignments/{id}` · `POST …/cancel` |
| Meal logs | `GET /nutrition/today` · `PUT /nutrition/logs` · `GET /nutrition/logs` (range, adherence) · `POST/DELETE /nutrition/logs/{id}/photos[/{fileId}]` |
| Check-ins | `GET/PUT /checkins/week/{current\|previous}` · `POST /checkins/{id}/submit` · `POST …/review` · `POST …/comments` · `GET /checkins` · `GET /checkins/{id}` · `GET /checkins/compare` |
| Photos | `POST/DELETE /photos` · `GET /clients/{membershipId}/photos` |

New permissions (module `fitness`): `nutrition_plan.manage`, `nutrition_plan.assign`, `nutrition.read`, `nutrition.log`, `checkin.submit`, `checkin.read`, `checkin.review`, `photo.read` (**sensitive**). New error code `CHECKIN_LOCKED` (409). OpenAPI regenerated: 137 paths, 174 operations (45 Fitness paths).

## 5. Security considerations

- **Sensitive permissions are not inherited by rank.** `fitness.photo.read` is held by the owner (ORG), the trainer (ASSIGNED, their own clients) and the client (OWN). **Admins and managers do not hold it by default** (a unit test pins this). Because system roles that contain it (trainer, client) could otherwise not be assigned by an admin, the escalation check ignores *sensitive* permissions for **system** roles only; custom roles stay strict.
- **Every photo read is audited** (`file.accessed`, actor, file, `own` true/false). Check-in detail returns `photosHidden: true` and no file ids to callers without access; the staff UIs fetch the signed URL only when the trainer asks to see photos (tested on mobile and verified in the browser).
- **Photos are scrubbed on upload.** The server rewrites JPEG/PNG without EXIF, GPS, XMP, text and other ancillary chunks (orientation kept); a photo that cannot be parsed is rejected instead of stored unscrubbed (tests plant a GPS marker and assert it is gone from the stored bytes). Sensitive images must be JPEG or PNG.
- **Tenant isolation:** all 12 tables classified; the isolation matrix covers every new route and fixture (foreign ids → 404); two cross-organization id checks (client photo list, meal log range) were added after writing the fixtures.
- **Submitted check-ins are locked** (`CHECKIN_LOCKED`); submission and the measurement writes happen in one transaction.
- **Reach:** trainers act only on their own clients (queue, detail, review, comments, photos); clients only on their own data.
- **Audited actions:** nutrition plan published, plan assigned, assignment cancelled, check-in submitted (counts only), check-in reviewed, progress photo added (angle, kind, whether it replaced one) and removed, and every read of a sensitive file. Meal logging is **not** audited (it is the client's own diary and is visible in the records). Audit metadata never contains measurement values or file contents.
- Reminder texts carry no health data.

## 6. Tests and results

| Suite | Result |
| --- | --- |
| Domain (nutrition validation/totals/adherence, week maths, due state, metadata stripper, authorization/escalation) | 66 |
| API (real MySQL/Redis): nutrition (11), check-ins (14: week form, drafts, photos, submit + atomic measurements + goal, access + audit, review, comments, compare, clients check-in state, escalation, reminders with a controlled clock, workout adherence), file-privacy tests, isolation matrix, route inventory, existing suites | **356 / 37 files** |
| API client | 20 |
| i18n (Arabic parity, placeholders, plurals) | 5 |
| Web | 36 |
| Mobile (jest-expo): screens, photo helper (permission refusal, cancel, HEIC→JPEG re-encode, resize), photo flows | 51; Metro bundles for iOS and Android succeed |

**Browser verification** (real API, MySQL, Redis; English unless noted):
- Trainer: check-ins queue shows the submitted check-in; detail renders measurements, adherence, notes and the **photo through the audited signed URL** (the audit table gained a `file.accessed` row with `own:false`); posted a comment; marked reviewed with feedback (status and feedback render; the audit table has `fitness.checkin.reviewed`).
- Client (Sara): nutrition page logs meals with one tap and the day's adherence updates (38%); check-in form shows last week's values as hints and the computed adherence; submitting locks it and shows the read-only view; last week shows *Reviewed*; Arabic/RTL check-in page renders mirrored.
- Trainer, plans: Nutrition plans list; the published version renders locked with daily totals; "New version" opens an editable draft; blanking a food name and publishing is blocked with the validation message; "Discard draft" (two-click confirm) leaves version 1 untouched.
- Trainer, clients: the list shows the check-in column ("Submitted"); client detail shows health notes, check-ins, photos on request (with the audit notice), workouts and the nutrition card (38%, 2 of 4 meals).
- Console: no errors for the verified flows (older 401/404/500 entries in the pane came from the Docker outage earlier in the session).
- Hardening pass, trainer: the nutrition assign dialog lists the trainer's clients and groups and assigns ("Plan assigned to 1 client"; audit row written).
- Hardening pass, client: a progress photo uploaded through the real web flow (draft saved → signed upload → verification → attach → audited download) shows in its slot; the audit table gained `fitness.photo.added`. The file chooser cannot be opened by the browser tool, so a generated PNG was handed to the page's file input, which runs the same code path as a chosen file.
- Hardening pass, manager: opening a check-in that has a photo shows numbers, feedback and thread, and the privacy note instead of the photos; no download link was requested.
- **Reminders scheduler on a real Redis:** after several API restarts exactly one repeating job (`fitness-reminders`, every 15 minutes) exists in the `maintenance` queue; a job added to the queue was picked up by the running worker and completed.
- **Still not exercised:** meal-photo upload in the browser (same code as progress photos, API-tested) and Arabic RTL on the new mobile screens (shared strings are parity-tested, layout not seen).

## 7. Known limitations

- **Mobile has never run on a device or simulator** (no Xcode/Android SDK here), so camera, permission prompts, the file upload to a signed URL and RTL layout are untested on hardware; the logic around them is unit-tested with the native modules mocked. Mobile reads and submits check-ins, logs meals, takes/chooses and uploads weekly and meal photos (`expo-image-picker ~58.0.10`, `expo-image-manipulator ~58.0.16`; pictures are re-encoded to JPEG, longest edge 1600 px), and lets staff review. It cannot add *starting* photos, build or assign nutrition plans. In development the signed upload address points at `localhost`, which a phone cannot reach: use the machine's LAN address for `API_PUBLIC_URL`/storage base when testing on a device.
- **No dedicated trend charts for check-ins.** Comparisons (two weeks, with photos) are done; measurement history from check-ins flows into the Phase 5 Progress charts because submission writes real measurements.
- **Reminders:** processing logic is tested with a controlled clock and the schedule was observed registering and executing on the development Redis (§6); a multi-instance deployment and the 15-minute cadence over hours were not observed. Push for reminders depends on the Phase 5 push setup (EAS project id).
- Photos: JPEG and PNG only (HEIC from some phones must be converted — the future mobile capture flow will do it); no photo editing/cropping; deleting a photo removes its record and soft-deletes the file; replacing a photo in a slot does the same for the old one.
- Admins and managers cannot view photos unless the owner grants `fitness.photo.read` through a custom role; this is deliberate but may surprise.
- Plan drafts are single-user (last save wins), as in 6a. No barcode/food database: foods are typed by the trainer.
- Exercise instructions/media are still unseeded (6a limitation, unchanged).

## 8. Remaining tasks

1. Run the mobile app on a simulator/emulator (needs Xcode / Android Studio): first run of the new screens, camera and library flows, RTL, push; confirm the LAN upload address on a real phone.
2. Starting photos on mobile.
3. Staging: reminders with more than one API/worker instance.
4. Staging bucket round trip for private photos (Phase 5 item), `git init`, first commit, CI run (outstanding since Phase 1).

## 9. Next recommended phase

**Phase 7 — Realtime communication** (messaging between trainer and client; see `docs/04-ROADMAP.md`). Before it, a short hardening pass on the items in section 8 (mobile run, photo capture, scheduler) is advisable, because Fitness is now the reference module for the next business categories.

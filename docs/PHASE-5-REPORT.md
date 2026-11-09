# Phase 5 Report — Shared Capabilities

Status: **implemented and verified.** Backend: automated tests against real MySQL/Redis. Web: exercised in a real browser (English and Arabic/RTL; trainer and client roles). Mobile: automated tests and a Metro bundle; **not run on a simulator or device** (no Xcode/Android SDK here).

## 1. What was implemented

Six capabilities that every business module (Fitness next, then Education, Coaching…) reuses instead of rebuilding. Each has an API, a web UI and a mobile UI unless noted.

| Capability | What it does | Web | Mobile |
| --- | --- | --- | --- |
| **Tasks** | Create, assign to people and whole groups (each member gets their own copy to complete), priority, due date, overdue, status derived from the assignees, optimistic-concurrency edits, comments (edit/delete), attachments, history | list with filters and search, create/edit, detail with comments, files, assignees, history | Tasks tab, task detail (own status, comments, attachments, history) |
| **Progress tracking** | Organization-defined measurements, immutable records (a mistake is *voided*, never edited), series and summary, goals with baseline/target/progress and milestones, goals achieve automatically when a record reaches the target, group summary | chart, summary figures, record entry, void, goals and milestones, define measurements | Progress tab: bar chart, summary, record entry, goals |
| **Files** | Two-step upload to private storage (signed URL → verify), size and type limits, content check (magic bytes), sensitivity flag with audited access, 60-second signed downloads | upload/download on tasks | open attachments (upload on mobile is not built) |
| **Notifications** | In-app inbox, push (Expo) and e-mail, per-category/per-channel preferences, rendered in each recipient's language | bell with unread badge, inbox page, settings | inbox, deep links, settings (switches), unread count in the header |
| **Activity history** | User-visible "what happened" per record (separate from the audit log) | task history | task history |
| **Push devices** | Registered in Phase 4; now delivered by the `push` queue | — | — |

Rules worth knowing:
- **Task status** is derived: no assignees → open; all done → done; anyone started → in progress. Cancelled stays cancelled until reopened.
- **A file that is not attached anywhere is private to its uploader**, even from owners and managers. Attached files follow the visibility of the task.
- **Notifications are written only when the recipient has "in the app" enabled**; push and e-mail jobs are queued per enabled channel. A per-organization setting overrides the "all organizations" default.
- **Measurements are defined by each organization** (an admin with `metric.manage`). There are no built-in ones yet; the Fitness module will ship its own set.

## 2. Files and modules

```
packages/domain/src     tasks.ts · progress.ts · files.ts (+specs) · permissions.ts · roles.ts · navigation.ts · errors.ts
packages/api-client     types and methods for tasks, progress, files (upload helper), notifications, activity
packages/i18n/src       en-work.ts · ar-work.ts (tasks, progress, inbox, activity) · notifications texts in en-org/ar-org
apps/api/src/capabilities/
  activity/             ActivityService (record inside the caller's transaction, entity history, feed)
  notifications/        NotificationsService.notify · inbox/preferences controller · push service and processor
  tasks/                tasks · assignees · comments · attachments · history
  progress/             metrics · records · summary · goals · milestones · group summary
  files/                files service · storage drivers (local, S3/R2) · signed-URL controller
apps/api/src/infra/queue  push queue + notification e-mail template (en/ar)
apps/web/src/features/work           tasks-page · task-detail · progress-page · dates · activity text · download
apps/web/src/features/notifications  bell · inbox page and preferences · deep-link helper
apps/web/src/components/ui/line-chart.tsx   dependency-free SVG chart
apps/mobile/app/(app)   (tabs)/tasks · (tabs)/progress · task/[taskId] · notifications
apps/mobile/src         features/work.ts · ui/bars.tsx
infra/dev-seed.mjs      demo tasks, measurements and a goal (created through the API)
```

## 3. Database changes

Migration `shared_capabilities` (plus the Phase 4 `push_devices`). All ids UUIDv7 `CHAR(36)`; every tenant table has `organization_id` and composite foreign keys `(organization_id, id)`.

| Table | Notes |
| --- | --- |
| `tasks`, `task_assignments`, `task_comments`, `task_attachments` | per-assignee status; `version` column for optimistic concurrency; soft-deleted comments |
| `files` | storage key namespaced `org/<orgId>/files/<id>`; status PENDING_UPLOAD / READY / REJECTED; sensitivity |
| `metric_definitions` | MIXED: organization-owned, or global (`organization_id` NULL) for future built-ins; `scope_key` keeps keys unique per scope |
| `metric_records` | immutable; `voided_at` + reason |
| `goals`, `goal_milestones` | baseline, target, direction, status |
| `activity_events` | user-visible history |
| `notifications`, `notification_preferences` | global (per user), not tenant-scoped; `organization_id` only for context |

## 4. API endpoints (`/api/v1`)

| Area | Endpoints |
| --- | --- |
| Tasks `/orgs/{orgId}/tasks` | `GET` list (status, priority, assignee=me, q, overdue) · `POST` · `GET/PATCH/DELETE /{id}` · `POST /{id}/status` · `POST /{id}/assignees` · `DELETE /{id}/assignees/{membershipId}` · `GET /{id}/history` · comments `GET/POST /{id}/comments`, `PATCH/DELETE /{id}/comments/{commentId}` · attachments `POST /{id}/attachments`, `DELETE /{id}/attachments/{fileId}` |
| Progress `/orgs/{orgId}/progress` | `GET/POST /metrics` · `GET/POST /records` · `POST /records/{id}/void` · `GET /summary` · `GET/POST /goals` · `PATCH /goals/{id}` · `POST /goals/{id}/milestones` · `POST /goals/{id}/milestones/{mid}/achieve` · `GET /groups/{groupId}/summary` |
| Files `/orgs/{orgId}/files` | `POST /uploads` · `POST /{id}/complete` · `GET /{id}` · `GET /{id}/download-url` · `DELETE /{id}` |
| Activity | `GET /orgs/{orgId}/activity` |
| Notifications (current user) | `GET /me/notifications` · `GET /me/notifications/unread-count` · `POST /me/notifications/{id}/read` · `POST /me/notifications/read-all` · `GET/PUT /me/notification-preferences` |
| Storage (local driver only) | `PUT /storage/upload/{token}` · `GET /storage/download/{token}`: public by design; the signed token *is* the authorization (one key, one operation, expiry). Excluded from OpenAPI. In production the S3 driver is used and these answer 404. |

New permissions: `task.read/create/manage/update_status/comment`, `progress.read/record`, `goal.manage`, `metric.manage`, `file.upload`, `activity.read` (scopes OWN / ASSIGNED / ORG as defined in `@pt/domain`). OpenAPI regenerated (`apps/api/openapi.json`: 92 paths, 115 operations).

## 5. Security considerations

- **Tenant isolation:** all new tenant models are classified and reachable only through `TenantPrismaService`; composite FKs reject cross-tenant references even from raw SQL (tested). The isolation matrix now covers every new route: a stranger gets 404 on all of them, and another organization's task/comment/file/record/goal ids are 404 under your own organization.
- **Authorization:** every route declares a permission. Out-of-reach resources answer 404 (no existence leak); missing permission answers 403. Recording progress for someone requires reach to that person (a trainer for their own clients, a client for themself); a client cannot void a measurement their trainer entered.
- **Files:** declared type and size checked before anything is stored; the signed upload URL accepts exactly the declared size and content type; on completion the server re-checks size and the file's leading bytes (a disguised file is rejected and its object deleted); SVG/HTML/executables are not allowed; downloads are `attachment`, `nosniff`, `private, no-store` with a 60-second link issued after the access check; sensitive downloads are audited.
- **Optimistic concurrency** on task edits (a stale `version` is a 409, never a silent overwrite).
- **Notification deep links** carry only a slug and ids; both clients validate them before navigating (a crafted payload cannot steer navigation elsewhere; unit-tested on web and mobile).
- **Production configuration guard:** local storage is refused in production; S3 variables are required.
- **Immutable measurements** keep an honest history: voiding keeps the row, the reason and an activity event.

## 6. Tests and results

| Suite | Result |
| --- | --- |
| API (unit + integration against real MySQL, Redis, BullMQ): tasks, notifications, progress, files, storage drivers (signing, expiry, tampering, path traversal, S3 presign shape), tenant isolation incl. Phase 5, route inventory, authorization | **305 tests / 34 files passing** |
| Domain | 37 |
| API client (upload flow, URL building, error mapping) | 17 |
| i18n (Arabic key parity, placeholders, plural forms) | 5 |
| Web (chart, deep-link safety, date inputs, existing suites) | 34 |
| Mobile (jest-expo: helpers, Tasks and Notifications screens, existing suites) | 28; `expo export` bundle succeeds |

Browser verification (real API, real MySQL/Redis): trainer — task list, overdue flag, detail, comment thread, **file upload through the signed URL including CORS preflight, size/type verification and attach**, progress chart/summary/record entry/goal progress update; client — own tasks, quick-complete (status derived to "in progress"), inbox, marking read, preference toggle; Arabic/RTL layout of tasks and the bell. Defects found and fixed in this pass: progress summary field mismatch (`latest`), progress person defaulting to the trainer, `relativeTime` without a reference time.

**Full `pnpm check`: 22/22 tasks green** (typecheck, lint and tests for domain, i18n, api-client, api, web, mobile). The check also caught a lint error in the new file-name sanitiser (control-character regex), fixed before sign-off.

## 7. Known limitations

- **Mobile not exercised on a device or simulator** (layouts, RTL mirroring, push, Linking of downloads). Mobile cannot upload files yet (needs an image/document picker native dependency, deferred) and cannot void records or create goals/measurements (web covers administration).
- **Files:** EXIF stripping and thumbnails are **not** done (belongs with Fitness progress photos, Phase 6b). Verification runs inline in the request rather than in a worker; fine at current limits, move to the `file-processing` queue before large video. No malware scan. Local storage is development-only; the **S3/R2 driver is covered by presign-shape tests but has never talked to a real bucket**.
- **Deviation from `01-ARCHITECTURE.md` ("jobs carry ids, never PII"):** push and e-mail notification jobs carry the rendered parameters (a person's name and a task title) so the worker needs no database access. Failed jobs expire after an hour. If this is unacceptable, switch the processors to load the notification row by id.
- Notification text is rendered in the **recipient's account language**, not the language of the screen they happen to be using.
- Group progress summary exists in the API but has **no UI yet**. Task/record lists have no CSV export. No reminders for due dates (needs the scheduler, Phase 6b/7).
- Web file download relies on a browser download; not clicked in the browser pane during verification (the API behaviour is covered by integration tests).
- The login page logs a React hydration warning (theme script) in dev; not from this phase.

## 8. Remaining tasks

1. Point `STORAGE_DRIVER=s3` at a real R2/S3 bucket in staging and run one upload/download round trip (checklist in HANDOVER).
2. Run the mobile app on an iOS simulator and Android emulator; fix any layout/RTL findings.
3. Decide on the notification-job PII trade-off above before launch.
4. `git init` + first commit + CI run (still outstanding from earlier phases).

## 9. Next recommended phase

**Phase 6a — Fitness: clients and workouts** (Fitness module manifest and navigation, client profiles, trainer–client assignment UI, exercise library, versioned workout plans assigned to many, workout logs) built on these capabilities: its tasks, measurements (weight, body fat…) and files are `typeKey`/`moduleKey` additions, not new tables.

# Engineering rules and the "add a feature" checklist

The design lives in [00-DECISIONS](00-DECISIONS.md) … [04-ROADMAP](04-ROADMAP.md). This page is the short list to follow while coding.

## Rules

1. **Pure rules go in `packages/domain`** (no I/O, no framework). Web, mobile and API share them.
2. **One error path.** Services throw `AppError(code, details?)`. Codes live in `@pt/domain` with an English fallback; the filter returns `{ error: { code, message, details?, requestId } }`; clients localize by code. Never put UI sentences in the API.
3. **Deny by default.** A global guard requires a token on every route; only `@Public()` opts out. New routes need a permission check once Phase 2 lands.
4. **Validate at the edge, strictly.** DTOs use class-validator; unknown properties are rejected; validation details carry rule names.
5. **Never serialize Prisma rows directly.** Map to a DTO (see `user.mapper.ts`).
6. **Explicit DI tokens.** Every injected constructor parameter uses `@Inject(Token)`; tests run through Vite, which does not guarantee decorator metadata for providers.
7. **One place reads `process.env`:** `src/config/env.ts` (validated with Zod at boot). Every variable is listed in `.env.example`.
8. **Tenant data goes through `TenantPrismaService` only.** Models are classified in `core/tenancy/tenant-models.ts` (a unit test fails for unclassified models); `PrismaService` (unscoped) may be imported only by the allow-listed modules in `tenant-prisma.spec.ts`. Every tenant relation uses a composite foreign key `(organization_id, id)`.
8a. **Every organization route declares its access:** `@RequirePermission(...)` or `@AnyMember()`; `/admin` routes `@RequirePlatformPermission(...)`. The route-inventory test enforces it. Resource lookups use the member's grant scope inside the query (`AuthorizationService.memberReadFilter`, `allows`) and answer 404 for resources outside the caller's reach.
8b. **Audit inside the transaction:** `AuditService.record(entry, tx)`; metadata holds ids and facts, never secrets.
9. **Raw SQL is banned** (ESLint) outside `src/infra/health`.
10. **Secrets and tokens**: only hashes are stored (refresh and one-time tokens); never log tokens, passwords or cookies (pino redaction is configured).
11. **Tests hit real MySQL and Redis.** Integration test databases must end in `_test` (enforced). Do not mock the database.
13. **Shared capabilities are reused, not rebuilt.** Tasks, progress, files, notifications and activity live in `src/capabilities/*`. A business module adds a `typeKey`/`moduleKey` (e.g. a Fitness task type, a Fitness measurement), never its own copy of these tables.
13a. **Notifications only through `NotificationsService.notify`.** Never write notification rows or queue push/e-mail jobs directly: the service honours each recipient's channel preferences and renders in their language.
13b. **Files are two-step and private.** Request a signed upload URL → client `PUT`s straight to storage → `complete` verifies size and content. Never expose a storage URL; downloads are 60-second signed links issued after an access check. A file attached nowhere is visible only to its uploader.
13c. **Measurements are immutable.** A wrong value is voided (kept, with reason), not edited or deleted. Goal progress is computed from the live series; `@pt/domain/progress` holds the maths for every client.
13d. **User-visible history is not the audit log.** `ActivityService.record(entry, tx)` writes what users may see ("Tariq commented"); `AuditService` records security-relevant facts. Record both inside the caller's transaction.
13e. **Shared, concurrently edited records carry a `version`.** Updates send the version they read; a mismatch is `CONFLICT` (409), never a silent overwrite.
13f. **Clients never trust deep-link payloads.** Notification payloads hold a slug and ids only; clients validate them before navigating.
14. **A business module is a manifest plus its own folder.** `packages/domain/src/<module>.ts` exports permissions, default role grants, navigation items and system measurements and is registered in `modules.ts`; the API code lives in `src/modules/<key>/`. Core never imports module code. Every route of a module carries `@RequiresModule('<key>')` (a route-inventory test enforces it and that nothing else uses it).
14a. **Published versions are immutable.** Anything a client is given (a workout plan version) is frozen at publish time; change = new version + new assignment. Logs reference the version they were performed against, so history never changes retroactively.
14b. **"Today" is the organization's clock.** Dates in schedules and sessions are plain `YYYY-MM-DD` strings computed with `dateInTimeZone(now, organization.timezone)`, never the server's or the device's time zone.
14c. **Health data is encrypted and its audit names fields only.** Notes that describe a person's health are stored with `SecretBox`; audit entries and logs carry field names, never values.
14d. **Sensitive files are read through a module policy and always audited.** A module registers a `FileReadPolicy` with `FileAccessRegistry`; the Files capability never learns what a check-in is. Sensitive reads write `file.accessed`. Images in sensitive uploads are rewritten without metadata (`stripImageMetadata`) and unparseable ones are rejected, never stored as-is.
14e. **Sensitive permissions are granted by accountability, not rank.** They are listed in the module manifest (`sensitivePermissions`); no role gets them from "being above" another (a test pins admin/manager without photo access), and the escalation check ignores them only for system roles.
14f. **Time-driven work is a job with an injectable clock and a de-dup mark.** Reminders run in the worker, compute "today" and the week from the organization's clock, and write a mark row so a retry or a second worker cannot send twice.
14g. **Realtime is server push over rooms the server chooses.** Clients authenticate in the handshake and only listen; every write is a REST call. A socket joins only the rooms of its own active memberships (`org:{orgId}:member:{membershipId}`), so no client-supplied room name exists; events go only to active participants, and a periodic check (`RealtimeGateway.revalidate`) enforces revoked sessions and ended memberships. Only `capabilities/messaging/realtime/` may use the unscoped Prisma client for that.
14h. **Private conversations are participant-only.** Access to a conversation, its messages and its attached files follows participation, never role rank; notifications about messages carry names, not text. The only way content leaves a conversation is a participant's report, which shares one snapshot with `message.moderate` holders who are not party to it.
12. **Done means** `pnpm check` is green, docs are updated, migrations apply to an empty database, and the flow was exercised against the running API.

## Adding a backend feature

1. Model the tables in `apps/api/prisma/schema.prisma` (tenant tables: `organization_id` + `@@unique([organizationId, id])` + composite relations, from Phase 2). Run `pnpm db:migrate`.
2. Add error codes to `packages/domain/src/errors.ts` and their HTTP status to `apps/api/src/common/errors/app-error.ts` (the compiler forces both).
3. Create the folder under `src/core`, `src/capabilities` or `src/modules/<key>` with module, controller, service, DTOs (Swagger-annotated), mapper.
4. Register the module in `app.module.ts` (and a worker module if it owns queue consumers).
5. Write unit tests next to the code and integration tests in `test/*.int.spec.ts`, including the failure and abuse cases.
6. `pnpm check`, then `pnpm openapi:export` and commit the regenerated `apps/api/openapi.json`.
7. Update the phase report and the checklist in `docs/04-ROADMAP.md`.

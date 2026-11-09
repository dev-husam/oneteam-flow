# 03 — Multi-Tenancy, Authorization and Security

Status: PROPOSED (Phase 0). See decisions D3–D7, D10, D17 in [00-DECISIONS](00-DECISIONS.md).

## 1. Multi-tenant data isolation

**Model:** one database, one schema, `organization_id` on every tenant-owned row (D3). MySQL has no row-level security, so isolation is enforced by five cooperating layers. Any single layer being wrong must not cause a leak.

| Layer | Mechanism | What it stops |
| --- | --- | --- |
| L1 Route | `/orgs/:orgId/*`; `OrgContextGuard` verifies the caller has an `ACTIVE` membership in an `ACTIVE` organization and builds `RequestContext` from the database (never from the token or a header) | caller addressing an org they do not belong to |
| L2 Query | `TenantPrismaService`: a Prisma client extension that, for every model on the tenant-scoped list, injects `organization_id = ctx.orgId` into `where` (find/update/delete/count/aggregate) and `data` (create/upsert), and **throws if there is no tenant context**. Repositories receive only this client | forgotten `where` clauses, ID guessing (IDOR) |
| L3 Schema | `organization_id NOT NULL` + composite foreign keys `(organization_id, parent_id)` (see 02-DATABASE) | cross-tenant references through nested writes, bad IDs, buggy code, raw SQL |
| L4 Storage and cache | object keys `org/{orgId}/…`; presign only after a policy check; Redis keys `t:{orgId}:…`; Socket.IO rooms `org:{id}:…`; queue jobs carry `organizationId` and re-enter a tenant context | file, cache and realtime leaks |
| L5 Tests/CI | see 1.2 | regressions |

**Rules**
1. The unscoped `PrismaService` can be injected only by an allow-listed set of providers (`auth`, `platform-admin`, `rbac` loaders, maintenance jobs, seeds). A lint/dependency rule fails the build for anyone else.
2. Every Prisma model carries either `organization_id` or an entry in an explicit `GLOBAL_MODELS` list. A unit test fails when a new model is in neither list.
3. `$queryRaw`/`$executeRaw` are allowed only in allow-listed report files and must take `organization_id` as a bound parameter.
4. The tenant id is **never** read from the request body or query. Path `orgId` is only a selector that L1 verifies.
5. Cross-tenant access returns **404**, not 403, so existence is not leaked. Inside the tenant, "visible but not allowed" is 403.
6. Background jobs and event handlers re-establish a tenant context from the job's `organizationId` before touching tenant data.

### 1.2 Tenant isolation tests (mandatory, run in CI against real MySQL)

- **Endpoint matrix:** a test fixture creates two organizations with full data sets. For every route in the OpenAPI document that contains `:orgId`, a generated test calls it as a member of org A against org B's ids and expects 404/403 and no data. A new route without coverage fails the build.
- **Repository tests:** each tenant model is queried through the scoped client in a context of org A and must never return org B rows; omitting the context must throw.
- **Schema tests:** attempting to insert a child row whose parent belongs to another organization must fail at the database.
- **Storage/cache/socket tests:** presign of another org's file is refused; a socket cannot join another org's room.
- **Super-admin test:** platform permissions cannot be granted to an org role; org owners cannot call `/admin/*`.

## 2. Authentication and sessions (D6)

```
register ─▶ user (PENDING email verify) ─▶ verify email ─▶ login
login ─▶ { accessToken (15 min, ES256), refreshToken (opaque), session id }
refresh ─▶ rotate: old token marked used, new token issued, same session
reuse of a used refresh token ─▶ revoke the entire session (theft signal) + audit + notify
logout ─▶ revoke session   logout-all ─▶ revoke every session of the user
```

- Access token claims: `sub` (user id), `sid` (session id), `iat/exp`, `kid` header. **No org, no role, no permissions.** `sid` lets the guard reject tokens of revoked sessions (checked in Redis, fallback DB), so suspending a user or revoking a session is effective within seconds.
- Algorithm is pinned on verification (no `alg` confusion). Signing keys come from the secret store; `kid` supports rotation.
- Web: refresh token in `HttpOnly; Secure; SameSite=Lax` cookie scoped to `/api/v1/auth`, plus `Origin` check and a custom header on `/auth/refresh` to block CSRF. Access token lives in memory only (lost on reload → silent refresh).
- Mobile: tokens in `expo-secure-store`; single-flight refresh to avoid parallel rotation races.
- Passwords: argon2id with tuned parameters, minimum length 10, breached-password check (k-anonymity API) optional. Login and reset endpoints respond identically for unknown and known emails; rate limits per IP and per account with progressive delay.
- MFA (TOTP) is **mandatory** for platform roles and optional for others; recovery codes hashed.
- Account suspension (`users.status`), org suspension and membership suspension are all checked per request (cached for seconds, invalidated on change).

## 3. Role and permission model (D5)

### 3.1 Concepts

- **Permission:** a code owned by core, a capability or a module manifest: `task.create`, `fitness.checkin.review`, `platform.organization.suspend`. Permissions have `scope_type` `PLATFORM` or `ORGANIZATION`; the two namespaces never mix.
- **Role:** a named set of permissions. System templates (`organization_id NULL`) are immutable; organizations create custom roles by cloning a template and adjusting grants. Each role has an integer `rank`.
- **Grant scope** per role-permission: `OWN` (records the member created or that are about themselves), `ASSIGNED` (records about participants actively assigned to this member through `member_assignments`, or groups they lead), `ORG` (whole organization). Platform roles use `ALL`.
- **Membership:** exactly one role per organization.
- **Business-category labels:** the role keys are generic; labels (Trainer, Teacher, Coach, Client, Student, Member) come from category configuration and i18n.

### 3.2 System role templates and ranks

| Role key | Rank | Display labels |
| --- | --- | --- |
| `super_admin` (platform) | — | Platform Super Admin |
| `owner` | 100 | Organization Owner |
| `admin` | 80 | Organization Admin |
| `manager` | 60 | Manager |
| `practitioner` | 40 | Trainer / Teacher / Coach |
| `guardian` | 20 | Parent / Guardian (optional, Education) |
| `participant` | 10 | Client / Student / Member |

### 3.3 Default grants (illustrative; final catalog is produced in Phase 2)

`O`=own, `A`=assigned, `G`=whole org, `–`=none.

| Permission | owner | admin | manager | practitioner | participant |
| --- | --- | --- | --- | --- | --- |
| `org.settings.read` / `update` | G / G | G / G | G / – | – | – |
| `member.read` | G | G | G | A | O |
| `member.invite` (roles below own rank) | G | G | G | G (participants only) | – |
| `member.suspend` / `remove` | G | G | – | – | – |
| `role.manage` (below own rank) | G | G | – | – | – |
| `group.manage` | G | G | G | O | – |
| `task.create` / `assign` | G | G | G | A | – |
| `task.read` | G | G | G | A | O |
| `task.update_status` | G | G | G | A | O |
| `task.comment` | G | G | G | A | O |
| `progress.read` | G | G | G | A | O |
| `progress.record` | – | – | – | A | O |
| `goal.manage` | G | G | G | A | – |
| `file.upload` | G | G | G | G | G |
| `message.send` | G | G | G | A (own participants) | A (own practitioners) |
| `report.read` | G | G | G | A | O |
| `audit.read` | G | G | – | – | – |
| `fitness.client.read` | G | G | G | A | O |
| `fitness.workout_plan.manage` | G | G | G | O | – |
| `fitness.workout_plan.assign` | G | G | G | A | – |
| `fitness.nutrition_plan.manage` / `assign` | G | G | G | O / A | – |
| `fitness.checkin.submit` | – | – | – | – | O |
| `fitness.checkin.review` | G | G | G | A | – |
| `fitness.photo.read` (sensitive) | G (audited) | – | – | A (audited) | O |

Notes: owners see sensitive photos only because they are accountable for the organization, and every such access is audit-logged; `admin` does not have it by default, but an owner can grant it to a custom role. Practitioners cannot see photos of clients assigned to a colleague.

### 3.4 Policy evaluation (every request)

```
1. authenticate        → valid token, session not revoked, user ACTIVE
2. resolve tenant      → membership ACTIVE in :orgId, organization ACTIVE   (else 404)
3. module gate         → permission.module_key enabled for org and platform  (else 404)
4. permission check    → role grants the code? yes → note grant scope        (else 403)
5. resource check      → load resource through the tenant-scoped repository  (missing → 404)
     OWN      → resource.owner/subject == my membership
     ASSIGNED → active member_assignments(practitioner=me, participant=subject) exists
     ORG      → tenant filter is sufficient
   cannot see it → 404 ; can see but action not allowed → 403
6. list queries        → PolicyService.scopeFilter(actor, permission) returns a Prisma `where`
                         that is ANDed into the query (never filter after fetching)
7. mutate              → service rules (e.g. immutable published plan version) + audit + events
```

Permission sets per membership are cached in Redis (TTL ≈ 60 s) and invalidated on role, assignment or membership changes. Deny by default: a missing decorator on a controller route fails an automated route-inventory test.

### 3.5 Privilege-escalation rules

- A member cannot grant, create or edit a role with a permission they do not hold, or with `rank` ≥ their own, and cannot assign such a role (including through invitations).
- Only an `owner` can create another `owner`; the last owner cannot be removed or demoted; ownership transfer is an explicit, audited, re-authenticated action.
- Invitation payloads are validated server-side against the inviter's rank and scope (a trainer cannot invite an admin by editing the request).
- Role names/ranks in any request body are ignored; roles are referenced by id and re-validated.

### 3.6 Super admin separation (D7)

- Separate namespace (`/admin/*`), guard (`PlatformGuard`), permission scope (`platform.*`), UI route group and audit actor type `SUPER_ADMIN`.
- Platform permissions can only be attached to roles with `scope_type = PLATFORM`; organization roles cannot contain them (validated in service **and** covered by tests).
- Mandatory TOTP; optional IP allow-list; every write goes to `audit_logs` with before/after summary.
- Reads of private tenant content (messages, photos, health notes) are denied unless a time-boxed support access grant exists (created by an org owner or an audited break-glass flow); aggregates and metadata are always available.

## 4. Security risks and mitigations

| # | Risk | Mitigation | Verified by |
| --- | --- | --- | --- |
| 1 | Cross-tenant data leak (missing `where`) | L1–L5 above | endpoint matrix, repository and schema tests |
| 2 | IDOR on ids inside a tenant (trainer reads a colleague's client) | `ASSIGNED` scope enforced in policy + `scopeFilter` on lists; 404 on invisible resources | policy matrix tests |
| 3 | Privilege escalation via roles/invitations | rank rules, last-owner rule, server-side validation | escalation test suite |
| 4 | Mass assignment | `ValidationPipe` with `whitelist` + `forbidNonWhitelisted`; DTOs separate from Prisma models | unit tests |
| 5 | Refresh token theft/replay | hashed storage, rotation, reuse detection revokes session, short access TTL, device list and remote logout | auth tests |
| 6 | XSS (messages, notes, plan text) | store plain text/limited markdown, escape on render, no `dangerouslySetInnerHTML`, CSP on web, `sanitize-html` if rich text ever added | lint rule, e2e |
| 7 | CSRF on cookie refresh | SameSite, Origin check, custom header, cookie path-scoped | auth e2e |
| 8 | CORS misconfiguration | explicit origin allow-list per environment, no wildcard with credentials | config test |
| 9 | Brute force and credential stuffing | Redis rate limits (IP + account), progressive delay, uniform responses, optional breached-password check, alert on spikes | rate-limit tests |
| 10 | Account/organization enumeration | uniform auth responses; invite acceptance requires the token; slugs are not a data source | tests |
| 11 | Malicious or oversized uploads | declared type/size at presign, content sniffing (magic bytes) in worker, size caps, `REJECTED` state, no direct public bucket, optional ClamAV later | file-processing tests |
| 12 | Sensitive photo exposure | `SENSITIVE` class, presigned URL TTL ≈ 60 s, `Cache-Control: private, no-store`, non-guessable keys, EXIF/GPS stripped, access audited | access tests, audit assertions |
| 13 | WebSocket abuse | token verified at handshake and on expiry, membership + policy checked on room join and each send, per-socket rate limit, payload size cap | gateway tests |
| 14 | SQL injection | Prisma parameterization; raw SQL banned except allow-listed + bound params | lint rule |
| 15 | JWT misuse (`alg` confusion, key leak) | pinned ES256, `kid` rotation, keys only in secret store, short TTL | unit tests |
| 16 | Super admin compromise | mandatory TOTP, separate guard, IP allow-list option, audit of every write, no default private-content access | admin tests |
| 17 | Audit log tampering | append-only table, DB user without UPDATE/DELETE, periodic export to object storage | migration/grant test |
| 18 | Secrets exposure | Zod-validated env, `.env` git-ignored, secret store in prod, log redaction, CI secret scanning (gitleaks) | CI |
| 19 | Dependency supply chain | lockfile, `pnpm audit` and Renovate/Dependabot in CI, pinned versions, minimal postinstall scripts | CI |
| 20 | PII in logs and queues | redaction list, ids only in job payloads | log tests |
| 21 | Data loss | encrypted backups + weekly automated restore test (Phase 1) | restore job |
| 22 | Health-data compliance | consent records, export/erase flows, field encryption for medical notes, retention rules (D17) | privacy checklist in Phase 10 |
| 23 | Insecure mobile storage / OTA | secure-store for tokens, certificate-safe networking, signed OTA updates, no secrets in the bundle | mobile review |
| 24 | Clickjacking / header hardening | `helmet`, CSP, `frame-ancestors none`, HSTS at the proxy | header test |
| 25 | MySQL lacks row-level security | defence in depth (composite FKs, scoped client, tests) instead of relying on a single filter | schema tests |
| 26 | Lost events / duplicate notifications | idempotent jobs with deterministic job ids; transactional outbox if loss is observed | queue tests |

## 5. Security test plan (Phase 2 onward)

1. Authentication: rotation, reuse detection, expiry, revoked session, suspended user.
2. Tenant isolation: the endpoint matrix and repository/schema tests above.
3. Authorization matrix: generated from the permission catalog — for every role × permission × scope the expected allow/deny/404 is asserted.
4. Escalation: invitation and role-edit abuse cases.
5. Files: type spoofing, oversized files, other-tenant presign, expired URLs.
6. Realtime: unauthenticated connect, cross-tenant join, post-revocation disconnect.
7. Dependency and secret scans in CI; an external penetration test before public launch (Phase 10).

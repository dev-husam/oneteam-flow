# Phase 2 Report — Multi-Tenancy and Authorization

Status: **implemented and verified locally.** 260 automated tests pass across the backend packages (API 236, domain 19, i18n 5); typecheck and lint are clean; the compiled production build was smoke-tested.

## 1. What was implemented

- **Organizations and tenancy:** organizations with business categories and per-organization modules; memberships; invitations; groups; practitioner↔participant assignments (the basis of the `ASSIGNED` scope).
- **Authorization:** a code-defined permission catalog synced into the database at boot; system role templates; custom organization roles with escalation protection; a deny-by-default guard chain; scope-aware queries (`OWN`, `ASSIGNED`, `ORG`).
- **Tenant isolation (all layers from `docs/03`):** `OrgContextGuard` (membership proven from the database), `TenantPrismaService` (every query rewritten, no tenant context ⇒ error, non-tenant models unreachable), composite foreign keys on every tenant relation, and the test suites below.
- **Audit trail:** append-only `audit_logs`, written inside the same transaction as the change; organization view for owners/admins; platform view for super admins.
- **TOTP two-factor authentication:** enrollment, confirmation with recovery codes, two-step sign-in, disable (password + code), replay protection, attempt limits; mandatory for platform staff.
- **Platform (super admin) API:** statistics, users, organizations (suspend/activate), categories, modules, platform roles, platform audit log, plus a CLI to bootstrap the first administrator. API only: the UI is Phase 3.
- **Shared domain package:** permission catalog, role templates, scope and escalation rules, category terminology, navigation, slugs (all pure, shared with web/mobile). 27 new API error codes with English and Arabic texts in `@pt/i18n`.

## 2. Files and modules

```
packages/domain/src     permissions · authorization · roles · terminology · navigation · slug (+ errors)
packages/i18n/src       27 new error texts (en, ar)
apps/api/src/core/
  tenancy/      tenant-models (classification) · tenant-prisma.service (scoped client, runInTenant)
  rbac/         org-context.guard · permissions.guard · platform.guard · authorization.service · catalog-sync · decorators
  organizations/ roles/ members/ invitations/ groups/ assignments/ audit/ platform-admin/
  auth/mfa/     totp · mfa.service · mfa.controller   (auth/ also changed: MFA step, audit events)
apps/api/src/cli/grant-super-admin.ts
apps/api/prisma/migrations/20261106114048_tenancy_rbac_audit_mfa
infra/mysql/grant-runtime-user.sh     least-privilege database user (audit_logs append-only)
apps/api/test/        12 new integration suites, helpers (org fixture with a member of every role)
```

## 3. Database changes (one migration, 17 tables, 28 foreign keys)

New: `business_categories`, `platform_modules`, `category_modules`, `permissions`, `roles`, `role_permissions`, `platform_role_assignments`, `organizations`, `organization_modules`, `memberships`, `invitations`, `groups`, `group_members`, `member_assignments`, `audit_logs`, `mfa_factors`, `mfa_recovery_codes`.
Altered: `users.mfa_enabled`, `user_sessions.mfa_verified_at`, `consent_records.organization_id`.

Isolation by construction: `invitations`, `groups`, `group_members` and `member_assignments` reference memberships/groups through **composite keys `(organization_id, id)`**, so a row can never point at another organization's data, even through raw SQL (tested). Uniqueness tricks for MySQL: `roles.scope_key` (organization id, `system` or `platform`) and `member_assignments.active_key` (unique while active, NULL when ended) give "one active PRIMARY per participant" in the database.

## 4. API endpoints (70 operations total, 55 new)

| Area | Endpoints |
| --- | --- |
| Organizations | `POST /orgs` · `GET /me/organizations` · `GET/PATCH /orgs/{orgId}` · `GET /orgs/{orgId}/context` |
| Members | `GET /members` · `GET /members/{id}` · `POST /members/{id}/role` · `POST /members/{id}/suspend` · `POST /members/{id}/reactivate` · `DELETE /members/{id}` · `POST /leave` |
| Roles | `GET /roles` · `GET /permissions` · `POST /roles` · `PATCH/DELETE /roles/{id}` |
| Invitations | `POST/GET /invitations` · `POST /invitations/{id}/resend` · `DELETE /invitations/{id}` · `POST /invitations/preview` (public) · `POST /invitations/accept` |
| Groups | `GET/POST /groups` · `GET/PATCH/DELETE /groups/{id}` · `POST /groups/{id}/members` · `DELETE /groups/{id}/members/{membershipId}` |
| Assignments | `GET/POST /assignments` · `POST /assignments/{id}/end` |
| Audit | `GET /audit-logs` |
| MFA | `POST /me/mfa/enroll` · `/me/mfa/confirm` · `/me/mfa/disable` · `POST /auth/mfa/login` |
| Platform (`/admin`) | `stats` · `users` (list, get, suspend, activate) · `organizations` (list, get, suspend, activate) · `categories` · `modules` · `platform-roles` · `audit-logs` |

(All under `/api/v1`; org routes are `/orgs/{orgId}/…`.) Full contract: `apps/api/openapi.json`.

## 5. Security considerations

- **Fail closed everywhere:** every organization route must declare `@RequirePermission` or `@AnyMember`; every `/admin` route a platform permission. A test discovers all routes and fails the build otherwise; the list of public routes is a reviewed snapshot.
- **Non-members get 404**, never 403, for organizations and for resources outside their reach (members, groups, invitations); 403 only inside the organization for permissions.
- **Tokens carry no organization or role**: a role change, suspension or removal applies on the very next request.
- **Privilege escalation:** you can only hand out roles ranked below yours (owners may hand out owner) **and** containing only permissions you hold at least as broadly; no self role changes; last owner protected; platform permissions can never enter an organization role (`ROLE_INVALID`); system roles immutable.
- **Super admin:** separate guard and permission namespace, 404 for everyone else, TOTP verified in the current session, no automatic access to any organization (404 on org routes), only metadata and counts in responses, every write audited as `SUPER_ADMIN`.
- **MFA:** secret AES-256-GCM encrypted at rest, codes single-use (replay-proof), recovery codes hashed and single-use, 5 failures / 15 min budget, pending-MFA token has its own audience so it cannot act as an access token.
- **Invitation tokens:** hashed at rest, single-use, 7-day expiry, bound to the invited e-mail (verified account required), previewed through POST so tokens never appear in URLs.
- **Audit:** same-transaction writes (a failed action leaves no trace), metadata never contains tokens or passwords (tested). `infra/mysql/grant-runtime-user.sh` generates grants so the runtime user cannot UPDATE or DELETE audit rows (**not yet applied to any environment**).

## 6. Tests and results

| Suite | Tests |
| --- | --- |
| API unit (TOTP RFC 6238 vectors, secret box, scoped-query rewriting, model classification, architecture rules, + Phase 1) | 73 |
| Route inventory and public-route snapshot | 5 |
| **Tenant isolation:** every org route × stranger; foreign ids under own org; lists never leak; two-org membership | 6 |
| **Scoped client and schema:** reads, writes, transactions, raw-SQL composite-FK rejections | 12 |
| **Authorization matrix:** 18 endpoints × 6 roles generated from the catalog; suspended/unverified | 20 |
| Scopes (OWN/ASSIGNED/ORG on members, groups, invitations, assignments) | 9 |
| Escalation (invitations, role changes, ownership, custom roles) | 18 |
| Invitations lifecycle | 11 |
| Organizations | 8 |
| MFA | 8 |
| Platform admin | 14 |
| Assignments, groups, audit | 10 |
| Phase 1 suites (auth, sessions, refresh, reset, platform, rate limits) | 41 |
| **API total** | **236** |
| Domain (new: catalog integrity, scopes, escalation, navigation, slugs) + i18n parity | 19 + 5 |

Also verified by hand on the compiled build: catalog sync at boot, `grant-super-admin` CLI, the `MFA_REQUIRED` gate on `/admin`, organization creation.
Two real bugs were found and fixed by these tests: unique-key operations on the scoped client (500s), and lazy Prisma queries escaping the tenant context in `runInTenant`.

## 7. Known limitations

- **Contract change for clients:** `POST /auth/login` returns `{ mfaRequired: true, mfaToken }` (no tokens) for accounts with MFA; `GET /me` and the user DTO gain `mfaEnabled`. The web app built in the parallel session must handle the second step.
- Permission lookup is one database query per request (always consistent; add a short Redis cache with invalidation when load requires it).
- Memberships reference roles by a plain foreign key (system roles have no organization); the service enforces "system role or same organization" and tests cover it.
- A role referenced by any membership or invitation, even historical, cannot be deleted (archiving comes later).
- `ASSIGNED` resolves only through assignments (not through group leadership). Assignments require the practitioner side to outrank the participant side.
- Ownership transfer is "promote another owner, then let them demote you"; it is audited but does not require re-authentication yet.
- No UI for any of this (Phase 3); no per-organization consent endpoint yet (only the `organization_id` column); no TOTP recovery-code regeneration; no IP allow-list for `/admin`.
- `audit_logs` append-only enforcement is by grants that must be applied by whoever provisions the database.

## 8. Remaining tasks

1. Apply `grant-runtime-user.sh` output in staging/production and run the migrations with a separate privileged user.
2. Decide the support-access policy for private content (open question Q4) before Phase 6.
3. Teach the web app the MFA sign-in step and `mfaEnabled` (Phase 3).

## 9. Next recommended phase

**Phase 3 — Super admin and organization web dashboard:** the Next.js foundation already exists in `apps/web`; build the authenticated shell driven by `/orgs/{orgId}/context`, members/invitations/groups/roles/settings screens, the super-admin area on `/admin/*`, and the MFA enrollment and sign-in screens.

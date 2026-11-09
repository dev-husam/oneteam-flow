# Phase 7a — Roles and access

Requested by the product owner after an audit of who could see and do what (2026-11-07). Decisions are recorded in the project memory (`roles-and-admin-control-decisions`). Phase 7b (admin control center) follows.

## 1. What was implemented

- **Three organization roles.** Owner, trainer (`practitioner`) and client (`participant`). `admin` and `manager` are **retired**: they cannot be invited, assigned or chosen in any picker, and members who held them were moved to trainer by the migration. `guardian` was not part of the decision and is untouched.
- **The owner can be a trainer.** The owner already outranks clients and holds every trainer permission, so assigning a client to the owner (`POST /assignments`) is enough: the client then reaches the owner through messaging and the owner coaches them like any trainer. The demo seed now assigns `client2@demo.test` to the owner.
- **One organization per account.** Creating an organization or accepting an invitation fails with `ALREADY_IN_ORGANIZATION` (409) when the account already has an ACTIVE or SUSPENDED membership anywhere. This is enforced in the database by `memberships.active_user_key` (unique, equals the user id while the membership is live, NULL once removed), so two simultaneous requests cannot both succeed. The old limit of five created organizations is gone.
- **Clients cannot see members and cannot start organizations.** The client template no longer holds `member.read` (the Members page, the member API and the member counter disappear for clients); a client is always inside an organization, so the one-organization rule also stops them creating one. The web account page shows "Create" only to accounts without an organization, and the create page explains the rule to anyone who already belongs to one.
- **Custom roles are switched off.** `CUSTOM_ROLES_ENABLED` (default `false`) makes create/edit/delete answer `FEATURE_DISABLED` (403), removes custom roles from the pickers and refuses to hand them out; the roles page is read-only with an explanation. Phase 7b replaces this setting with the admin feature flags.

## 2. What each role sees and does now

| | Owner | Trainer | Client |
|---|---|---|---|
| Menu | overview, members, invitations, tasks, messages, reported messages, progress, clients, check-ins, plans, nutrition plans, exercises, groups, roles (read-only), activity log, settings | overview, members (own clients), invitations, tasks, messages, progress, clients, check-ins, plans, nutrition plans, exercises, groups | overview, tasks, messages, progress, exercises, workouts, nutrition, weekly check-in |
| Members | everyone | only the clients assigned to them | no access |
| Invite | owners, trainers, clients | clients only (assigned to themselves) | no |
| Create an organization | only while the account has none | same | same (always inside one, so no) |
| Messages | anyone in the organization | their clients | their trainer (or the owner when assigned) |
| Progress photos | all | own clients | own |
| Moderation of reported messages | yes | no | no |

## 3. Files and modules

- `packages/domain/src/roles.ts` (`RETIRED_ROLE_KEYS`, `isRetiredRole`, client template), `roles.spec.ts`, `errors.ts`.
- API: `core/organizations/organizations.service.ts` (one-organization rule, `isSingleOrganizationViolation`, `features` in the context), `core/invitations/invitations.service.ts` (accept), `core/members/members.service.ts` (removal frees the account), `core/roles/roles.service.ts` (retired/custom handling), `config/env.ts` (`CUSTOM_ROLES_ENABLED`), `common/errors/app-error.ts`.
- Web: `features/account/organizations-card.tsx`, `create-org-form.tsx`, `features/org/roles-page.tsx`; `packages/api-client` (`OrgContext.features`); i18n `en/ar` (errors, `orgs.alreadyTitle…`, `roles.customRolesOff`).
- `infra/dev-seed.mjs`: no manager, no custom role; the owner coaches `client2`.

## 4. Database changes

Migration `20261107120000_single_organization_per_user`: adds `memberships.active_user_key` (CHAR(36), unique). Data steps, written so they are no-ops on a fresh database: members and pending invitations holding `admin`/`manager` become `practitioner`; an account in several organizations keeps its **oldest** live membership and the others are marked removed (their open assignments end and their group memberships are deleted); the key is back-filled. On this machine's dev database it turned the demo manager into a trainer; nothing else changed.

## 5. Security considerations

- The rule is enforced in the database, not only in the service; races map to the same `ALREADY_IN_ORGANIZATION` error (covered by a test that inserts a second live membership directly).
- Retiring roles *removes* power (nobody can be given admin/manager) rather than adding any. Rank checks, escalation checks and tenant isolation are unchanged and their tests still pass.
- A non-member still gets 404 for every path of another organization.
- The platform admin is unaffected and still cannot read private messages or photos.

## 6. Tests and results

New or rewritten: `roles-and-ownership.int.spec.ts` (owner coaches a client and the client reaches them; a client assigned elsewhere cannot; custom roles off through a second app instance), `organizations.int.spec.ts` (one organization per account including a database-level violation and release on leaving), `escalation.int.spec.ts` (retired roles refused for everyone, rank rules for owner/trainer), `scopes`, `authorization-matrix` (clients get 403 on the member list), `web-support` (role pickers), `tenant-isolation` (the "member of two organizations" case replaced by "invitation from another organization is refused, its paths stay closed"), `roles.spec.ts` (domain). Final `pnpm check`: 22/22 tasks green (API 385 tests in 40 files, web 37, domain 76, api-client 30, i18n 5, mobile unchanged). In the browser as the demo owner: the account page offers no "Create" button, `/organizations/new` explains the one-organization rule, and the roles page is read-only with the notice. Not browser-checked: the client's menu (covered by the API navigation test instead) and the mobile app.

## 7. Known limitations

- The `admin` and `manager` definitions and database rows still exist (so old data resolves and the authorization suite keeps exercising organization-wide scopes); they are only unassignable. Deleting them outright is possible later and means rewriting those fixtures.
- Someone already in an organization who is invited to another one finds out when they accept (`ALREADY_IN_ORGANIZATION`), not when the invitation is sent; checking at send time would reveal which e-mail addresses have accounts.
- A brand-new account with no organization can create one and becomes its owner. The system cannot tell a future client from a future owner until an invitation is accepted.
- A removed or departed member is free to create their own organization.
- Suspended members still occupy their one slot.
- Mobile was not run on a device (as before). Its Members tab already hides itself without `member.read`, so it follows the new rule through the permissions the API sends, but that was not exercised on a simulator.
- Moving an account to another organization means leaving first; there is no transfer flow.

## 8. Next

Phase 7b: admin control center (feature flags with per-organization overrides, platform settings, e-mail template editor, theme and identity). Phase 8 modules wait until 7a and 7b are verified.

# Phase 3 Report — Super Admin and Organization Web Dashboard

Status: **implemented and verified** (automated checks + real browser against the live API).

## Implemented
- **Account area:** two-step MFA sign-in (authenticator or recovery code), MFA set-up/disable on the Security page (QR code, recovery codes), organization picker, create organization, invitation acceptance (`/invitations/accept?token=`).
- **Organization workspace `/o/[orgSlug]`:** shell whose menu, role label and permissions come from `GET /orgs/{id}/context` (a new module appears without a web change); overview, members (search, filters, detail, role change, suspend, remove, assignments), invitations (create with role/assignee/groups, resend, revoke), groups (+detail), roles (system + custom editor with escalation-aware scope choices), audit log, settings, leave organization.
- **Platform admin `/admin`:** separate shell and gate (platform role + verified MFA session): overview, users (suspend/activate, grant/revoke platform role), organizations (suspend/activate, metadata only), catalog (categories, modules), platform roles, audit log, system health.
- **Backend additions:** `GET /me/platform-access`, `GET /catalog/categories`, `GET /orgs/{id}/assignable-roles`, `GET /admin/health`, actor names in both audit logs, names in assignments.
- **Shared packages:** `@pt/api-client` (all endpoints, typed), `@pt/i18n` (~450 new en/ar strings, compile-time parity), generic `Shell`, `Dialog`, `Table`, cursor-pagination hook.
- **Dev tooling:** `infra/dev-seed.mjs` builds a demo workspace (6 accounts + a platform admin with MFA) through the real API.

## Verification
- `pnpm check`: 19/19 tasks; API 241 tests, web 27, api-client 13, domain 19, i18n 5.
- Browser (Next.js dev server + real API + MySQL/Redis): owner sign-in, dashboard, workspace menu, members list with category terminology (Trainer/Client), role editor, Arabic RTL (sidebar mirrored), admin MFA sign-in with a recovery code, admin overview/organizations/health/audit, trainer view (menu limited to Overview/Members/Invitations/Groups; invite dialog offers only Guardian/Client).
- Bugs found by testing and fixed: dotted message keys (next-intl rejects them), unique-key scoping on the tenant client, platform audit showing no actor names.

## Known limitations
- Phone-width layout checked only down to 513px (the preview pane's minimum): no horizontal overflow in RTL; the drawer menu itself was not exercised on a real phone.
- No Playwright end-to-end suite; rely on unit/component tests plus the manual pass above.
- Admin user detail and member detail pages, group detail and the accept-invitation page were covered by type checks and tests but not clicked through.
- No super-admin UI for per-organization module toggles (only global modules/categories).

## Next
Phase 4: React Native (Expo) foundation.

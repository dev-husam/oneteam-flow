# Phase 7b — Admin control center

Requested by the product owner on 2026-11-07 (see the project memory `roles-and-admin-control-decisions`): the administrator controls the application through feature flags and settings, including e-mail wording, the theme and the identity. Phase 7a (roles and access) came first.

## 1. What was implemented

All of it lives under `/admin` (platform role + verified two-factor session) and is audited as `SUPER_ADMIN`.

- **Feature flags** (`/admin/features`, and a panel on each organization page). A registry in `@pt/domain` (`FEATURE_FLAGS`) is the single list; the API inserts missing rows at boot and never overwrites a value an administrator set. A flag has a platform value and, for organization-scope flags, an optional **per-organization override** (on, off, or follow the platform). Today's flags:

  | Flag | Scope | Default | What it closes |
  |---|---|---|---|
  | `registration` | platform | on | Creating an account. Off: only people with a pending invitation to that address can register |
  | `organization_creation` | platform | on | `POST /orgs` and the "Create" button |
  | `messaging` | organization | on | every messaging route (conversations, contacts, reports), the Messages and Reported-messages menu items (web and mobile) |
  | `custom_roles` | organization | **off** | creating, editing, deleting and handing out custom roles (replaces the Phase 7a environment setting) |
  | `progress_photos` | organization | on | uploading and listing check-in photos, and reading existing ones |
  | `reminders` | organization | on | the automatic check-in reminders for that organization |
  | `push_notifications` | organization | on | push messages (the in-app inbox is never switched off) |
  | `email_notifications` | organization | on | notification e-mails (account e-mails such as password reset are never switched off) |

  Routes answer `FEATURE_DISABLED` (403) after the membership check, so a non-member never learns whether a feature is on. The organization context now carries every flag as that organization sees it (`features`), and the menu hides items of a switched-off feature.
- **Identity and appearance** (`/admin/settings`): app name and tagline in English and Arabic, support e-mail, **logo** (PNG, JPEG or WebP up to 64 KB, checked by file signature; SVG is refused because it can carry scripts), **theme** (accent colour for light and dark mode, sidebar colour, corner style) with a live preview, and **e-mail branding** (sender name, footer line per language). Colours that would be unreadable on the page are rejected (contrast ≥ 3:1), and hover, soft and border shades plus the text colour on the accent are derived, so web and future mobile agree. The web app reads this through the public endpoint `GET /config/public` on the server and writes it as CSS variables over the built-in defaults; the name, tagline and logo replace the hard-coded ones in the page titles, the sign-in screen and the sidebar. Sign-up and organization-creation switches are visible there too (the sign-up link hides, the register page says "by invitation only").
- **E-mail templates** (`/admin/email-templates`): the six account/notification e-mails in English and Arabic are now data. The built-in wording is the default; an administrator can override subject, body and button label with placeholders (`{{name}}`, `{{appName}}`, `{{orgName}}`, `{{inviterName}}`, `{{title}}`, `{{body}}`), see a live preview, send a test to themselves, and reset to the built-in text. Only the placeholders a template supports are accepted, the link may only go on the button, and the wording is treated as text, never markup (HTML in a template is escaped). Sent mail also carries the footer, the accent colour on the button and the configured sender name.

## 2. Files and modules

- `packages/domain`: `features.ts`, `theme.ts`, `brand.ts`, `mail-template-defs.ts` (+ `admin-config.spec.ts`), permissions `platform.flag.manage`, `platform.settings.manage`, `platform.template.manage`, navigation `featureKey`, error codes `SETTINGS_INVALID`, `TEMPLATE_INVALID`, `LOGO_INVALID`.
- API: `core/rbac/features.{service,module}.ts`, `feature-enabled.guard.ts`, `@RequiresFeature`; `infra/platform-config/` (settings, logo and template readers, cached); `core/platform-admin/config-admin.{controller,service}.ts` and `public-config.controller.ts`; `infra/mail/mail-templates.ts` (default wording as placeholder text, branding) and `email.processor.ts`; flag checks in `roles`, `organizations`, `auth`, `messaging`, `fitness/checkins`, `fitness/reminders`, `notifications`.
- Web: `lib/public-config.ts`, `components/brand/*`, `features/admin/admin-{features,settings,email-templates}.tsx`, three admin routes and menu entries, registration/organization-creation hints. Mobile: the Messages tab follows the `messaging` flag.
- i18n: `en/ar-admin-config.ts`.

## 3. Database changes

Migration `20261107150000_admin_control_center`: `feature_flags`, `organization_feature_overrides` (FK to organization and flag, cascade), `platform_settings` (JSON documents `identity`, `theme`, `mail`), `platform_assets` (the logo), `email_templates` (per template and language). The override table is classified MIXED, the others GLOBAL, in the tenancy registry (a test fails if a model is not classified).

## 4. API endpoints

`/admin/flags`, `/admin/flags/:key` (PUT), `/admin/organizations/:id/flags[/:key]`, `/admin/settings`, `/admin/settings/{identity,theme,mail,logo}`, `/admin/email-templates[/:key/:locale[/preview|/test]]` — all admin-only. Public: `GET /config/public` (identity, theme, logo address, sign-up switches; nothing secret, cacheable) and `GET /config/logo` (served with a content hash as ETag, `nosniff` and a sandboxing CSP).

## 5. Security considerations

- Only a platform administrator with MFA reaches the write endpoints; everyone else gets 404. Every change is audited (flag before/after, which settings fields changed, template saved/reset/tested, logo changed/removed).
- The logo is a validated raster image stored in the database and served from the API with `nosniff`; SVG is refused. Theme values reach CSS only through `deriveTokens`, which emits validated hex colours and fixed sizes, and the web app re-validates what the API sends.
- E-mail wording is escaped, so a template cannot inject markup or scripts, and the preview runs in a sandboxed frame. Test mails go only to the administrator's own address and are rate limited.
- The sending address stays a server setting (it must match the DNS-verified domain); only the display name is editable.
- Switching `progress_photos` off also closes reading photos that already exist for that organization; it never deletes them.
- The administrator still cannot read messages or progress photos; nothing in this phase touches tenant data.

## 6. Tests and results

`admin-config.int.spec.ts` (16 tests): access control; registry listing and validation; messaging off platform-wide (routes, menu, context) and restored; per-organization override in both directions and that it is organization-only; progress photos; sign-up and organization creation closed (invited people still register); channels (in-app stays, push and e-mail close, in the right order) and reminders skipping an organization; audit entries; settings defaults, validation, merge and public exposure; logo accepted, refused (SVG, wrong signature, over 64 KB), served with ETag/304 and removed; template list/validation/saved template reaching a real invitation e-mail with branding, escaping and reset; preview and test send; an Arabic template. `roles-and-ownership.int.spec.ts` now drives custom roles through the real flag and an override. Domain: `admin-config.spec.ts` (flags, theme contrast and derivation, identity, template rules, escaping). A bug found by the escaping test (template text was not HTML-escaped) was fixed before release. Final `pnpm check`: 22/22 tasks green (API 400 tests in 41 files, web 37, domain 86, api-client 30, i18n 5; mobile unchanged and typechecked). In a real browser as the demo administrator: the feature flags page, saving a new app name and accent colour from the settings page (the page title, sidebar name and every accent colour followed after the cache expired), the e-mail template editor with its sandboxed live preview, and the per-organization panel. The browser pass also caught two bugs the tests and type checker could not (a server component calling a client hook on the sign-in page, and a reserved React prop name in the template editor); both were fixed. Not browser-checked: Arabic rendering of the new admin pages, the logo upload through the UI (the API path is tested), and the mobile app.

## 7. Known limitations

- **Caching:** each API instance caches flags, identity, theme and templates for `CONFIG_CACHE_SECONDS` (default 5), so a change reaches every instance within that time (the instance that handled it refreshes at once). The web app caches the public configuration for 30 seconds.
- **Mobile** (addendum, same day): see §9. Radius, the app's name on the home screen, its icon and splash screen are not configurable at runtime.
- **Not everything is a flag yet:** the flags above are the ones that exist. Tasks, progress, files and the Fitness module itself are controlled by the existing module switches (admin → Catalog and per-organization modules), not by this table. Adding a flag is one line in the registry plus a guard where it applies.
- **Static pages:** the web app falls back to the built-in identity and theme when the API is unreachable (for example during a build); the configured values appear on the next refresh after the cache expires.
- **E-mail:** the administrator edits wording and branding, not the layout of the e-mail, and there is no per-organization branding or language-specific footer beyond en/ar. The reminder and notification texts (what a notification says) are still defined in code (`notification-text.ts`); only how they are wrapped in an e-mail is editable.
- **Admin control is configuration, not omniscience:** the administrator can suspend users and organizations and toggle features, but there is still no support-access grant to look inside an organization (decision kept from Phase 7), and no delete-user/organization action.

## 8. Next

Phase 8 modules (each needs its own approval), after a first run of the mobile app on a device. Open decisions: whether the mobile app should adopt the configured identity and colours, and the support-access grant.

## 9. Addendum — mobile adopts the identity (2026-11-07)

- **What the app now does:** on start and whenever it returns to the foreground it shows the last configuration it saw (kept in the device keychain store, so it works offline and appears instantly) and then asks `GET /config/public` for the current one. Everything from the cache or the network is re-validated with the shared `parsePublicConfig` (also now used by the web app), so a damaged value falls back to the defaults.
- **Where it shows:** the administrator's accent colour (buttons, links, tab bar, highlights; light and dark mode each have their own, and the text colour on the accent is chosen for readability), and a header with the logo (or the app name's initial on the accent colour when there is no logo), the name and the tagline in the user's language at the top of the sign-in and registration screens. While sign-up is switched off the "Create an account" link is hidden and the registration screen says it is by invitation only.
- **Tests:** 7 new mobile tests (store caching and fallbacks, colour derivation, header in English and Arabic, logo from the API, sign-up link follows the switch); the iOS and Android bundles build. 2 new domain tests for `parsePublicConfig`.
- **Not covered:** the app has still never run on a simulator or device, so none of this has been seen on a screen. Corner style (radius) is a build-time constant in the mobile style sheets and is not applied. The name under the app icon, the icon, and the splash screen are native build settings (`app.json`) and can only change with a new app build. The sidebar colour has no mobile counterpart.

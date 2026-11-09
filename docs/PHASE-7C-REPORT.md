# Phase 7c — Design system and admin-managed designs

Requested by the product owner on 2026-11-09: use the OneTeam Flow colour specification (`oneteam-flow-color-design-system.md`) as the application's design, and let an administrator adjust it and add further designs that can be used.

## 1. What was implemented

- **The OneTeam Flow design is now the default look** on web and mobile: Midnight Navy structure and text, Dusk Blue for selection and progress, Sunset Orange reserved for the main action (with navy text on it, as the specification requires, because white on orange fails contrast), a navy sidebar with an orange active indicator, the specification's light and dark semantic palettes, its status colours (success, warning, error, information, always paired with text or an icon), and the Plus Jakarta Sans typeface for Latin text (Arabic keeps IBM Plex Sans Arabic).
- **A design is data, not code.** A *design* is a complete set of 50 semantic colour tokens for light and dark mode (surfaces, text, borders and focus, buttons, selected items, charts and progress, status colours, sidebar) plus a corner style and a typeface. Components use the tokens only; no screen carries a raw colour of its own. The tokens are the specification's names (`background-app`, `action-primary`, `selection-background`, …); the shared package `packages/domain/src/design.ts` is the single source of truth for web and mobile.
- **Several designs, managed by the administrator.** Two built-in designs ship: *OneTeam Flow* (default) and *Classic blue* (the platform's earlier look). In **Admin → Designs** an administrator can:
  - see every design with a live light and dark preview;
  - **create** a design from any existing one, **edit** every token in both modes, the corner style and the typeface, with a live preview that updates as they type;
  - **duplicate**, **delete** a custom design (never one that is the default or in use), **reset** a built-in design to its original;
  - choose the **platform default** for everyone;
  - give **one organization its own design** (on that organization's admin page); everyone in it sees that design while others keep the default.
- **Accessibility is enforced, not just documented.** Text pairs must reach 4.5:1 (for example navy on orange, link on card, selected text on selection background, sidebar text on sidebar, each status colour on its soft background, in both modes). A design that fails cannot be saved, and the editor names the exact pair and ratio ("Action Primary Text on Action Primary: contrast 3.16:1, needs at least 4.5:1"). Non-text pairs (focus border, chart colour, sidebar indicator) below 3:1 only warn.
- **Where it applies.** Web: every screen (the stylesheet's tokens are replaced by the active design; buttons, badges, alerts, links, selection and the sidebar were moved to the semantic names), the sign-in screens, and the e-mail button colour. Mobile: colours of every screen, the tab bar and the sign-in header follow the platform default and, inside an organization, that organization's design.
- **Settings page.** The old three-colour theme card is replaced by a link to Designs; identity, logo and e-mail branding stay under *Identity and logo*.

## 2. Files and modules

- `packages/domain/src/design.ts` (+ `design.spec.ts`): token groups, built-in designs, `validateDesign`, `mergeDesign`, `designCss`, `parseDesignTheme`; `brand.ts` now carries `design` in the public configuration; the old `theme.ts` was removed.
- API: `infra/platform-config/design.service.ts`, `core/platform-admin/design-admin.{service,controller}.ts`; `organizations.service.ts` (the organization context carries its own design); mail button colours follow the default design.
- Web: `globals.css` (generated from the built-in design), `components/brand/brand-style.tsx`, `features/admin/admin-designs.tsx` and two routes, `lib/org/org-context.tsx` (organization override), codemod of colour classes across 40 files, shell/Button/Badge/Alert updates.
- Mobile: `ui/theme.ts` (token mapping), `stores/brand.ts` (organization design), tabs layout.

## 3. Database changes

Migration `20261109090000_design_themes`: `design_themes` (key, name, description, built-in marker, definition JSON) and `organization_designs` (one row per organization with its own design). The built-in rows are created at API boot and never overwritten once edited; the previous `theme` setting row is removed. The platform default is stored as the `design` setting.

## 4. API endpoints (admin only, audited)

`GET/POST /admin/designs`, `GET/PATCH/DELETE /admin/designs/:key`, `POST /admin/designs/:key/reset`, `PUT /admin/design-default`, `GET/PUT /admin/organizations/:id/design`. Public: `GET /config/public` now returns `design` (the default). `GET /orgs/:id/context` returns `design` only when the organization has its own.

## 5. Security considerations

- Only administrators (platform role + two-factor) manage designs; a design is validated by the shared rules before every write, and re-validated by every client before use. A damaged value falls back to the built-in design.
- Nothing free-form reaches CSS or native styles: the web style element is generated only from validated hex colours, fixed corner sizes and fixed font stacks (covered by a test that rejects `url(`, scripts and odd values).
- Design names and descriptions are plain text (no markup). Audit entries record what changed (which fields, counts) but never the colours themselves.

## 6. Tests and results

`design.spec.ts` (domain: complete built-ins pass their own accessibility rules in both modes, the specification's key colours, token/CSS completeness, validation including readable-text rules and normalization, merging, CSS output, parsing); `design.int.spec.ts` (API, 11 tests: built-ins and default, public tokens, create from an existing design, refusal of unreadable/malformed colours with the exact problems, editing with warnings, built-in edit and reset, default switching reaching public config and e-mail buttons, deletion protection, per-organization design in the context and isolation between organizations, audit without colours); `brand-style.spec.tsx` (web); mobile tests for the token mapping and the organization override; the OpenAPI snapshot. Final `pnpm check`: see §8.

## 7. Known limitations

- **Mobile:** colours follow the design, but the corner style and the typeface are fixed in the mobile style sheets (corner radius is a build-time constant; Plus Jakarta Sans is not bundled in the app). The app icon, name and splash screen are native build settings.
- **Personal choice** (added the same day, see §9): people can pick among the designs the administrator offers.
- **Caching:** the API caches designs for `CONFIG_CACHE_SECONDS` (5 by default) and the web app caches the public configuration for about 30 seconds, so a change appears within that time (after one or two reloads).
- **Charts:** line charts use the design's primary chart colour (`chart-primary`); the secondary and highlight chart colours are defined and previewed, and used where a chart shows more than one series (none of the current charts does yet).
- **The specification's component rules** (for example "orange only for the most important action") are followed by the token mapping, not enforced per screen: existing screens that use the primary button more than once still do.
- **Arabic and RTL** were checked on the previews' structure but the new Designs screens were not reviewed in Arabic in a browser.

## 8. Results of the final run

`pnpm check`: 22/22 tasks green (API 435 tests, web 40, domain 106, api-client 30, i18n 5, mobile 80); the iOS and Android bundles build. In a real browser: the sign-in page and the app shell show OneTeam Flow (orange button with navy text, navy sidebar with an orange active indicator, Plus Jakarta Sans); the Designs list with light and dark previews; duplicating a design, editing colours with the live checker (teal with navy text was refused with the exact ratios, and allowed once the text colour was white), saving, making it the default for everyone (the whole app turned teal after the cache window); giving Demo Gym its own design (its owner then saw Classic blue with IBM Plex Sans while the platform default stayed teal). The development database was then reset to the two built-in designs. Not browser-checked: Arabic rendering of the Designs screens, dark mode of the whole app, and the mobile screens (the app has still never run on a device).

## 9. Addendum — people pick their own design (2026-11-09)

- **What people can do:** *Profile → Appearance* (web) and *More → Appearance* (mobile) list the designs the administrator offered, with a live preview, plus "Follow the default". Choosing applies at once and is remembered for the account on every device. Light and dark remain separate.
- **Order of precedence:** the person's own choice, then their organization's design, then the platform default (`resolveDesign`, shared by web and mobile).
- **Control for the administrator:** each design has an "Offer to users / Stop offering" switch in Admin → Designs (the two built-in designs start offered, custom designs are opt-in) and shows how many people chose it. Withdrawing or deleting a design never breaks anyone: their choice is simply ignored (deleting clears it).
- **Switches:** the feature flag `user_design_choice` turns personal choice off platform-wide, or for one organization (an organization that must show a single brand then keeps its own design for all its members, while their choice still applies outside it).
- **Implementation:** `design_themes.user_selectable`, `users.design_key` (set to null if the design is deleted); `GET /me/designs`, `GET/PUT /me/design`; web: one `ActiveDesign` component writes the single style element from the three layers, the organization shell only reports what it knows; mobile: the brand store holds the personal design and the organization's switch.
- **Tests:** API (4 more tests: what is offered, personal and private choices, administrator withdrawing/deleting, flag off platform-wide and per organization; a mutation check confirmed a design that is not offered cannot be chosen), domain (precedence), mobile (precedence, Appearance screen, switched-off state). Browser: a normal user chose Classic blue (applied instantly, kept after reload and outside the organization); with the organization's switch off, the organization showed the platform design while outside it the personal choice still applied.
- **Limits:** the first paint of a page uses the platform's design and a personal or organization design appears once the page has loaded (a brief colour change for people who chose another design); the Appearance screens were not checked in Arabic, and mobile was not run on a device.

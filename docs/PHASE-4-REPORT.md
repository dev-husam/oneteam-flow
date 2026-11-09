# Phase 4 Report — React Native (Expo) Foundation

Status: **implemented; verified by automated checks and Metro bundles. NOT run on a simulator or device** (this machine has no Xcode/Android SDK).

## Implemented
- **`apps/mobile`:** Expo SDK 58, React Native 0.88, Expo Router, TypeScript strict, TanStack Query, Zustand. Shares `@pt/api-client`, `@pt/domain` and `@pt/i18n` with the web app (same API contract, error codes, texts and password rules).
- **Secure auth:** refresh token only in the platform keychain (`expo-secure-store`); access token in memory; single-flight refresh from the shared client; session restored at launch; a refresh failure signs the user out everywhere; sign-out clears the active organization and the query cache.
- **Sign-in:** email/password, then the two-factor step (code or recovery code), restart from the password when the 5-minute window ends; register (shared password policy) and forgot-password.
- **Organization selection:** list from `/me/organizations`, auto-open when there is exactly one; suspended organizations shown but not enterable; losing access (removed/suspended) returns to the chooser.
- **Role-aware tabs from `/orgs/{id}/context`:** Home always, Members only with `member.read` (a trainer sees assigned clients, a client sees nobody else), More (profile, security, switch organization, language, sign out).
- **Profile management** (name, phone, units) and **security** (two-factor status, signed-in devices with revoke). Two-factor set-up stays on the web (QR scanning).
- **English and Arabic with RTL:** the same ICU messages as the web (six Arabic plural forms), language switch with direction handling (a restart is required for mirrored layout, with an in-app notice).
- **Push:** permission request, Expo push token registered with the API on entry and unregistered on sign-out; no-op until an EAS project id is configured.
- **EAS:** `eas.json` with development/preview/production profiles (API URL per profile).
- **Backend:** `push_devices` table, `POST/DELETE /api/v1/me/devices` (token moves to the last account that registers it; devices revoked on logout-everywhere and password reset), 3 integration tests.

## Verification
- `pnpm check`: 22/22 tasks. Mobile: 21 jest-expo tests (translator and Arabic plurals, every literal translation key exists in en and ar, auth store incl. MFA, preferences, push registration, Login screen flows incl. MFA). API: 244 tests including devices.
- `expo export` produced iOS (Hermes, 1324 modules) and Android (1320 modules) bundles from the pnpm monorepo.

## Known limitations
- Not exercised on a simulator/device: layouts, RTL mirroring after restart, keychain behaviour, push permission prompts.
- Placeholders to set before store builds: `ios.bundleIdentifier` / `android.package` (`com.example.personaltrainer`), `extra.eas.projectId`, API URLs in `eas.json`, app icon and splash assets.
- Invitation links open in the browser; there is no deep-link acceptance in the app yet (scheme `personaltrainer://` is reserved).
- No member detail, invitations, groups or roles screens on mobile (web covers administration; mobile focuses on day-to-day use from Phase 5/6).
- Notifications are registered but nothing sends them yet (Phase 5/7).

## Next
Phase 5: shared capabilities (tasks, progress/metrics, files, notifications, activity feed), then the Fitness module.

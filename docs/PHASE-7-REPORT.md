# Phase 7 Report — Realtime Communication

Status: **implemented, including abuse handling; backend fully tested (including cross-tenant socket tests), web verified in a real browser, mobile covered by automated tests and iOS/Android Metro bundles only** (never run on a simulator or device: this machine has no Xcode or Android SDK). Exit criterion — *cross-tenant socket tests green; messaging on web and mobile* — is met on the backend (automated) and on the web (browser); on mobile only to the extent of the automated tests.

## 1. What was implemented

| Area | What it does |
| --- | --- |
| **Private conversations** | One-to-one conversations inside an organization. The same two people always share one conversation (`direct_key`), whoever starts it and even if both start at once. Text up to 4 000 characters and up to 5 attachments per message |
| **Who may start one** | `message.send` with two scopes: **organization-wide** (owner, admin, manager) may start with anyone who can use messaging; **assigned** (trainer, client) only with the people they are assigned to, in either direction. A guardian role has no messaging. Replying inside an existing conversation needs only being in it, so a conversation survives a reassignment. Suspended or removed members cannot be addressed |
| **Privacy** | A conversation is visible to its two participants and **nobody else**: not the owner, not admins or managers (tested route by route: 404). Another organization's conversation ids are 404 |
| **Messages** | Newest-first paging; delete your own message (row kept as a tombstone, text cleared in the database, attachment links removed, files soft-deleted); unread counts from **one read marker per person** (no row per message), markers only move forward |
| **Attachments** | Your own finished, non-sensitive uploads, one message per file. A file is readable by the two people in the conversation only (a `FileReadPolicy` on the Files capability); sensitive files (progress photos) cannot go through chat |
| **Realtime** | Socket.IO server push: new messages, deletions, read receipts. Clients only listen; every write goes through the REST API (validation, rate limits, tenancy checks, one code path). Redis adapter, so it works with several API instances (tested with two) |
| **Abuse handling** | The recipient of a message can **report** it (reason + optional note) and can **block** the other person of a conversation. A blocked person cannot send (nothing is stored or pushed; they are told only that they cannot send, not who blocked them) and neither side is offered the other as a contact; history stays visible. Reports go to **moderators** (permission `message.moderate`: owner and admin by default): each report shows **one message** (a snapshot that survives deletion by the sender), the reason, the note and the two names, never the rest of the conversation. A moderator never sees or resolves a report they are part of. Resolving (dismissed / handled, with a note) tells the reporter; owners and admins are notified of new reports; every step is audited without message text |
| **Notifications** | One notification per unread streak (not per message), per-conversation mute, in-app + push by the existing preferences (new category *Messages*). The notification carries the sender's name and **never the message text** |
| **Web** | Messages page: list and thread (one at a time on a phone), start a conversation by searching reachable people, attach files, delete, mute, unread badge in the sidebar, live updates, "Live / Reconnecting…" indicator, English and Arabic/RTL |
| **Mobile** | Messages tab with unread badge, new-message picker, conversation screen (inverted list, paging back, read marker, send, photo attach with the Phase 6b picker, long-press delete, mute), realtime while the app is in the foreground, notification deep link. English and Arabic |

## 2. Files and modules

```
packages/domain/src     messaging.ts (limits, directKey, reach rule) · permissions/roles/navigation (message.send) · errors (CONTACT_NOT_ALLOWED)
packages/api-client     messaging types + methods · realtime.ts (connectRealtime: auth in handshake, backoff, token renewal) · messages-cache.ts
packages/i18n/src       en-messaging.ts · ar-messaging.ts (+ nav, notification text, category, error)
apps/api/prisma         migration 20261107080649_messaging
apps/api/src/capabilities/messaging/
  messaging.service.ts · messaging.controller.ts · messaging.dto.ts · message-file-access.ts · messaging.module.ts
  realtime/  realtime.gateway.ts · realtime.service.ts · redis-io.adapter.ts      (the only code that may use the unscoped Prisma client here)
apps/web/src/features/messaging   messages-page · thread · report-dialog · message-reports-page · realtime-provider · messages-cache
apps/mobile                       app/(app)/(tabs)/messages · new-message · conversation/[conversationId] · src/features/messaging.tsx · src/ui/sheet.tsx
infra/dev-seed.mjs                a short trainer–client conversation
```

## 3. Database changes

Two migrations, six tables, all with `organization_id` and composite foreign keys `(organization_id, id)`; all classified in `tenant-models.ts`:

`conversations` (`direct_key` unique per organization) · `conversation_participants` (read marker, muted_until) · `messages` (soft delete) · `message_attachments` · `message_blocks` (one row per blocker and blocked) · `message_reports` (snapshot of the reported message; unique per message and reporter).

Differences from the Phase 0 design: `type` is a string (only `DIRECT`) so group conversations need no migration; no `edited_at` (messages are not editable in this version) and no `left_at` (conversations are two-person); `kind` is always `TEXT` for now.

## 4. API endpoints (`/api/v1/orgs/{orgId}/messaging/…`, all need `message.send`)

| Endpoint | |
| --- | --- |
| `GET /contacts?q=` | people the caller may start a conversation with (paged), with the existing conversation id |
| `GET /conversations` · `POST /conversations {membershipId}` · `GET /conversations/{id}` | list (latest 100), find-or-create, summary |
| `GET /conversations/{id}/messages` · `POST …/messages {body?, fileIds?}` · `DELETE …/messages/{messageId}` | thread (newest first, cursor), send, delete own |
| `POST /conversations/{id}/read {messageId?}` · `PUT /conversations/{id}/mute {muted}` | read marker, mute |
| `GET /unread-count` | total unread in the organization |
| `PUT /conversations/{id}/block {blocked}` · `POST /conversations/{id}/messages/{messageId}/report {reason, note?}` | block or unblock the other person; report a message you received (409 if already reported) |
| `GET /reports?status=` · `POST /reports/{id}/resolve {outcome: DISMISSED\|ACTIONED, note?}` | moderation queue (needs `message.moderate`, not `message.send`) |

Realtime: Socket.IO at `/socket.io`, token in the handshake `auth` (never the URL). Server → client events: `ready`, `message:new`, `message:deleted`, `conversation:read`, `auth:expired`. New permissions `message.send` and `message.moderate`; new error `CONTACT_NOT_ALLOWED` (403).

## 5. Security considerations

- **Authentication at the handshake:** the same access token as the REST API, verified with the pinned algorithm, plus the session (not revoked) and the user (active, e-mail verified). A refresh token, a token in the query string, an empty or garbage token are all refused (`UNAUTHENTICATED`).
- **Rooms are chosen by the server.** A socket joins only `org:{orgId}:member:{membershipId}` rooms of **its own active memberships**. Clients cannot join anything, and every event a client sends is refused (five offences drop the socket). There is therefore no room name a stranger can guess to listen in; tests put bystanders in the same organization and in another one and prove they hear nothing, and a mutation check (broadcasting to everyone) makes that test fail.
- **Delivery only to active members.** Events go to the conversation's participants whose membership is `ACTIVE` at send time, so a suspended or removed member gets nothing even before their socket is cleaned up.
- **Revocation:** a periodic check (every 30 s, across instances) disconnects sockets whose session was revoked or whose user was suspended, takes sockets out of the rooms of memberships that ended, and joins new memberships without a reconnect. A token that expires closes its socket with `auth:expired`. Tested by calling the check directly.
- **Limits:** payloads over 10 KB are refused by the server; 10 sockets per user; send and start routes allow 60 requests a minute per caller (tested against Redis); CORS origins apply to browsers.
- **Tenancy:** the four tables are tenant tables behind the scoped client; the isolation matrix covers every messaging route with another organization's conversation and message ids. Only `capabilities/messaging/realtime/` imports the unscoped client (it needs sessions and memberships across organizations); an architecture test pins that.
- **Content:** bodies are plain text rendered as text (no HTML); deleted text is cleared in the database; push and in-app notifications never contain message text; chat attachments are non-sensitive files only.
- **Abuse handling:** only the recipient can report, one report per message and reporter, and moderators see the single message, not the conversation; moderators cannot review reports about themselves; reports and blocks are audited (reason/outcome only, no text); the report and block routes are rate limited. Acting on a sender (suspending or removing them) uses the existing member tools; "handled" is a status the moderator sets.

## 6. Tests and results

| Suite | Result |
| --- | --- |
| Domain (+ `messaging.ts` rules) | 72 |
| API (real MySQL/Redis): messaging REST (16: reach rules, one conversation per pair, privacy, paging, unread markers, deletion, attachments and file access, notification coalescing and mute, rate limit), realtime (10: handshake refusals, revoked/suspended, per-user cap, token expiry, delivery to the right devices and nobody else, client cannot steer, inactive members, revocation sync, delivery across two API instances through Redis), isolation matrix and route inventory extended, existing suites | **382 / 39 files** |
| API client (URLs, realtime reconnection/renewal, cache helpers) | 30 |
| i18n | 5 |
| Web | 37 |
| Mobile (jest-expo): screens, report/block flows, realtime provider (events → cache, other organization ignored, background/foreground), routes | 68; iOS and Android Metro bundles succeed |

**Full `pnpm check`: 22/22 tasks green, exit code 0.**

**Browser verification** (real API, MySQL, Redis; web): the client sees a Messages item with an unread badge, opens the conversation (badge clears), receives a message sent by the trainer **without reloading** (status "Live"), sends a message with an attached picture by Enter (rendered inline, scrolls to the bottom), deletes it with the two-click confirmation (tombstone in the thread and the list preview), and the Arabic page mirrors correctly. **Abuse handling:** the client reports the trainer's message (dialog states what is shared), blocks the trainer (composer replaced by a notice with Unblock; the trainer's next send is refused with `CONTACT_NOT_ALLOWED`) and unblocks; the owner then sees a *Reported messages* item and a notification, reads the report (one message, names, note) and marks it handled; the queue empties. Two defects found and fixed in this pass: the thread did not stay scrolled to the bottom once a picture loaded, and the composer did not grow with its text.

## 7. Known limitations

- **Mobile has never run on a device or simulator** (no Xcode/Android SDK here): the socket on a phone, background/foreground behaviour, keyboard handling and RTL layout are untested on hardware. On a phone the API address must be reachable from the phone (`EXPO_PUBLIC_API_URL`), and `API_PUBLIC_URL` for signed upload links.
- **Not built:** group conversations, typing indicators and online presence, message editing, search across messages, "seen" indicators in the UI (the read events are delivered and used for the unread counts; no UI shows them yet), and any retention or export of conversations. The abuse-handling defaults chosen here (recipient reports one message; block is per person; owners and admins moderate; a blocked person is told only that they cannot send) were **confirmed by the product owner** after delivery. Acting on a report is manual (member tools); there are no automatic sanctions, appeal flow, report counts per person or e-mail alerts. The moderation queue is on the web only; mobile can report and block but not moderate.
- **Support access:** private content is not readable by platform staff, and there is no time-boxed support-access grant yet (design doc 03). Organization moderators can review reported messages; platform staff cannot.
- **Push for messages** goes through the Phase 5 push queue whether or not the person is looking at the app; there is no "they are online, skip the push" rule. Push still needs the EAS project id (Phase 4/5 item).
- **Scaling:** clients use WebSocket only, so no sticky sessions are needed, but the reverse proxy must allow WebSocket upgrades. The conversation list is the latest 100 (no paging). The revocation check runs per instance every 30 s over all connected sockets: fine for thousands, to be revisited for much larger fleets. Behaviour behind a real load balancer and under load has not been exercised.
- Attachments: one message per file, up to 5, limited to the Files capability's types and sizes; no inline previews for documents, HEIC pictures show as a file.
- A conversation with someone who is later removed stays readable by the other person; it shows no further activity.

## 8. Remaining tasks

1. Run the mobile app on a simulator/emulator and a real phone: sockets, push deep link into a conversation, RTL, camera/library attach.
2. Decide the support-access grant (platform staff reading private content for a time-boxed, audited reason; design doc 03, open question Q4).
3. Staging: WebSocket through the real proxy/load balancer; two API instances; Redis failover.
4. "Seen" UI, message search and retention policy, once decided.
5. `git init`, first commit, CI run (outstanding since Phase 1).

## 9. Next recommended phase

**Phase 8 — additional modules (Education, Coaching, each separately approved)** per the roadmap. Fitness plus messaging is now a complete pilot-shaped product; before widening, the open decisions above (support access, confirming the abuse-handling defaults) and a first run on real devices are the highest-value work.

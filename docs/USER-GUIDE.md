# Using the platform: run it, sign in, try it

This guide is for trying the platform on your own computer. Everything here is **development data and development passwords only**. Never reuse any of it on a real server.

## 1. Run it

You need Node 22 (`.nvmrc`), pnpm 10 and Docker Desktop (started).

**First time**

```bash
pnpm install
cp .env.example .env
pnpm infra:up
pnpm --filter @pt/domain --filter @pt/i18n --filter @pt/api-client build
pnpm db:deploy
pnpm --filter @pt/api build
```

**Every time**

```bash
pnpm dev
```

This starts the database, Redis and the mail catcher, then the API and the web app. Leave that terminal open.

**Load the demo data** (second terminal, while `pnpm dev` is running; safe to run again):

```bash
node infra/dev-seed.mjs
```

**Stop everything:** press Ctrl+C in the terminal, then `pnpm infra:down` if you also want to stop the database containers.

| Address | What it is |
|---|---|
| http://localhost:3000 | The web app (English `/en`, Arabic `/ar`) |
| http://localhost:3001/api/docs | API documentation (Swagger) |
| http://localhost:8025 | Mailpit: every e-mail the platform sends in development (verification, invitations, reminders, test e-mails) |

### The mobile app (optional)

```bash
pnpm --filter @pt/mobile start
```

Then open it in an iOS Simulator or Android emulator, or scan the code with Expo Go. A physical phone must reach your computer: set `EXPO_PUBLIC_API_URL=http://<your-computer's-IP>:3001/api/v1` before starting. The mobile app has not been run on a device yet, so expect rough edges.

## 2. Accounts you can sign in with

**The password for every demo account is: `correct horse battery`**

Sign in at http://localhost:3000/en/login.

### Demo Gym (fitness): `/en/o/demo-gym`

| E-mail | Name | Role | What to try |
|---|---|---|---|
| `owner@demo.test` | Layla Owner | Owner (can also act as a trainer) | Everything: members, invitations, settings, audit log, plans, check-ins, reported messages |
| `trainer@demo.test` | Tariq Trainer | Trainer | His clients only: workout and nutrition plans, check-ins, messages |
| `trainer2@demo.test` | Noor Trainer | Trainer | A second trainer with no clients of their own (to see that trainers cannot see each other's clients) |
| `client@demo.test` | Sara Client | Client of Tariq | Today's workout, meals, weekly check-in with photos, her progress |
| `client2@demo.test` | Yousef Client | Client | Same as Sara. On a fresh database he is assigned to the owner; on an older one to Tariq |

### Demo Coaching: `/en/o/demo-coaching`

These exist only after an administrator has enabled the **Coaching** category (Admin → Catalog) and the seed has been run again.

| E-mail | Name | Role | What to try |
|---|---|---|---|
| `coach@demo.test` | Dana Coach | Owner and coach | Schedule sessions, write shared and private notes, build questionnaires, share resources |
| `coachee@demo.test` | Rami Client | Client | "My coaching": sessions, notes from the coach, complete the questionnaire, resources, trend lines |
| `coachee2@demo.test` | Hala Client | Client | A second client (to see that clients never see each other) |

### Platform administrator: `/en/admin`

| E-mail | Name | Role |
|---|---|---|
| `admin@demo.test` | Platform Admin | Administrator of the whole platform |

The administrator account needs **two-factor authentication**: after the password the app asks for a 6-digit code from an authenticator app (Google Authenticator, 1Password, …).

- The secret is printed **once**, the first time the seed enrolls the account (`Admin TOTP secret …` and eight recovery codes). Add it to your authenticator app by entering it manually. A recovery code also works once.
- **If you lost it, reset it** (development database only), then run the seed again; it enrolls the account again and prints a new secret:

  ```bash
  docker exec personal-trainer-mysql-1 mysql -uroot -proot_dev_password pt_dev -e "
    DELETE rc FROM mfa_recovery_codes rc JOIN users u ON u.id=rc.user_id WHERE u.email='admin@demo.test';
    DELETE f FROM mfa_factors f JOIN users u ON u.id=f.user_id WHERE u.email='admin@demo.test';
    UPDATE users SET mfa_enabled=0 WHERE email='admin@demo.test';"
  node infra/dev-seed.mjs
  ```

**Your own accounts.** Anyone can register at `/en/register` (the verification e-mail appears in Mailpit, http://localhost:8025). The first platform administrator on a fresh installation is created with `pnpm --filter @pt/api build && pnpm --filter @pt/api admin:grant -- you@example.com`.

## 3. What each kind of person can do

| | Owner | Trainer / coach | Client |
|---|---|---|---|
| Sees members | Everyone | Only their own clients | Nobody (no Members page) |
| Invites people | Owners, trainers, clients | Clients only | No |
| Creates an organization | Only if the account has none | Same | Same (a client already belongs to one) |
| Messages | Anyone in the organization | Their clients | Their trainer/coach |
| Private data | Progress photos; private coach notes (reads are audited) | Their clients' photos; their own private notes | Their own data |
| Settings, roles, audit log | Yes | No | No |

Rules worth knowing:
- An account belongs to **one organization** only.
- An organization has only three roles: owner, trainer (coach) and client. The owner can also coach: assign a client to the owner under Members/Assignments.
- Private coach notes are never visible to clients. Messages are private to the two people in them.

## 4. A few things to try

1. **Sign in as `trainer@demo.test`** → Clients → open Sara → see her plan, logs and check-in; leave feedback on a check-in.
2. **Sign in as `client@demo.test`** → Workouts (log a set), Nutrition, My check-in (add measurements) and Messages (write to the trainer; open the trainer in another browser window to see it arrive live).
3. **Sign in as `owner@demo.test`** → Invitations → invite a new client with an e-mail address of yours (the invitation appears in Mailpit) → accept it in a private window.
4. **Coaching:** as `coach@demo.test` open Coaching → Rami → read the notes and the trend lines; as `coachee@demo.test` open My coaching and complete the questionnaire; the coach gets a notification.
5. **As the administrator** (`admin@demo.test` + code):
   - *Feature flags*: turn Messaging off for one organization and watch the Messages menu disappear for its members.
   - *Designs*: the app uses the OneTeam Flow design by default. Open Designs, duplicate it, change colours (the editor shows a live preview and refuses combinations that are hard to read), make it the default for everyone, or give one organization its own design from that organization's admin page. *Classic blue* is the earlier look.
   - *Designs → Offer to users*: switch on the designs people may choose from; then any user opens **Profile → Appearance** (web) or **More → Appearance** (mobile) to pick one. Turn the feature flag *user_design_choice* off (platform or per organization) to stop personal choice.
   - *Identity and logo*: change the app name, tagline, logo and e-mail sender; the web app and the mobile app pick them up (the web after about 30 seconds and a reload).
   - *E-mail templates*: edit the invitation e-mail, send a test to yourself, see it in Mailpit.
   - *Catalog*: enable or disable business categories (Fitness, Coaching, Education, Business).

## 5. Where the data lives

| Thing | Where |
|---|---|
| Database (development) | MySQL on `localhost:3307`, database `pt_dev` (tests use `pt_test`) |
| Redis | `localhost:6380` |
| Uploaded files (photos, attachments) | `data/uploads` in the project folder (development only) |
| Settings | `.env` in the project root (copy of `.env.example`) |

## 6. When something goes wrong

| Symptom | Fix |
|---|---|
| `pnpm dev` fails with "address already in use" | Another copy is still running. Find it: `lsof -nP -iTCP:3000 -iTCP:3001 -sTCP:LISTEN`, then stop that process (`kill <PID>`) |
| Every page says an error / the API answers 500 | Docker is not running or the containers stopped. Start Docker Desktop, run `pnpm infra:up`, then restart `pnpm dev` |
| "Cannot find module" or odd type errors after pulling changes | Rebuild the shared packages: `pnpm --filter @pt/domain --filter @pt/i18n --filter @pt/api-client build` |
| A new table or column is missing | `pnpm db:deploy` |
| The seed says "Coaching demo skipped" | Sign in as the administrator, Admin → Catalog → enable *Coaching*, run `node infra/dev-seed.mjs` again |
| An e-mail never arrives | Open http://localhost:8025 (Mailpit); development e-mail never leaves your computer |
| Name, colours or logo changes do not show | The web app caches them for about 30 seconds: wait, then reload twice |
| You forgot a demo password | It is always `correct horse battery` |

## 7. Checking the whole project

```bash
pnpm check
```

Runs the type checks, lint rules and every automated test (needs Docker running). Details of what was built in each phase are in `docs/PHASE-*-REPORT.md`; the current state and open decisions are in `HANDOVER.md`.

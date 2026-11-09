// Builds a demo workspace through the REAL API (no direct DB writes except the super-admin bootstrap CLI).
//   pnpm infra:up && pnpm --filter @pt/api build && (API running with APP_ROLE=all) && node infra/dev-seed.mjs
// Prints the accounts it created. Safe to re-run: existing accounts are reused.
import { createHmac } from 'node:crypto';
import { execFileSync } from 'node:child_process';

const API = process.env.API_URL ?? 'http://localhost:3001/api/v1';
const MAIL = process.env.MAILPIT_URL ?? 'http://localhost:8025/api/v1';
const PASSWORD = 'correct horse battery';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const headers = { 'content-type': 'application/json', 'x-client-type': 'ios' };

async function call(method, path, body, token, attempt = 0) {
  const res = await fetch(`${API}${path}`, { method, headers: { ...headers, ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: body === undefined ? undefined : JSON.stringify(body) });
  if (res.status === 429 && attempt < 8) { await sleep(10_000); return call(method, path, body, token, attempt + 1); } // rate limits protect the API from this script too
  const json = res.status === 204 ? undefined : await res.json().catch(() => undefined);
  if (!res.ok) { const e = new Error(`${method} ${path} → ${res.status} ${json?.error?.code}`); e.code = json?.error?.code; throw e; }
  return json?.data;
}

async function mailToken(to, subjectPart, after) {
  for (let i = 0; i < 80; i++) {
    const found = await (await fetch(`${MAIL}/search?query=${encodeURIComponent(`to:${to}`)}`)).json();
    for (const m of found.messages ?? []) {
      if (!m.Subject.includes(subjectPart) || (after && new Date(m.Created) <= after)) continue;
      const full = await (await fetch(`${MAIL}/message/${m.ID}`)).json();
      const hit = full.Text.match(/token=([^\s&]+)/);
      if (hit) return decodeURIComponent(hit[1]);
    }
    await sleep(250);
  }
  throw new Error(`no mail for ${to} (${subjectPart})`);
}

async function account(email, fullName) {
  try { return await call('POST', '/auth/login', { email, password: PASSWORD }); } catch (e) { if (e.code !== 'INVALID_CREDENTIALS') throw e; }
  const since = new Date();
  await call('POST', '/auth/register', { fullName, email, password: PASSWORD, acceptTerms: true });
  await call('POST', '/auth/verify-email', { token: await mailToken(email, 'Confirm', since) });
  return call('POST', '/auth/login', { email, password: PASSWORD });
}

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function totp(secret) {
  let bits = 0, value = 0; const bytes = [];
  for (const c of secret) { value = (value << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; } }
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(Date.now() / 30000) + 1));
  const h = createHmac('sha1', Buffer.from(bytes)).update(counter).digest(); const o = h[h.length - 1] & 15;
  return String((((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3]) % 1_000_000).padStart(6, '0');
}

const sessions = {};
const people = [['owner@demo.test', 'Layla Owner'], ['trainer@demo.test', 'Tariq Trainer'], ['trainer2@demo.test', 'Noor Trainer'], ['client@demo.test', 'Sara Client'], ['client2@demo.test', 'Yousef Client'], ['admin@demo.test', 'Platform Admin']];
for (const [email, name] of people) sessions[email] = await account(email, name);
const tok = (e) => sessions[e].accessToken;

let org = (await call('GET', '/me/organizations', undefined, tok('owner@demo.test'))).find((o) => o.organization.slug === 'demo-gym');
if (!org) { const c = await call('POST', '/orgs', { name: 'Demo Gym', slug: 'demo-gym', categoryKey: 'fitness', timezone: 'Asia/Riyadh' }, tok('owner@demo.test')); org = { organization: c.organization, membershipId: c.membershipId }; }
const orgId = org.organization.id;
const orgToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: org.organization.timezone ?? 'Asia/Riyadh' }).format(new Date()); // the organization's calendar date, not UTC's
const o = (path) => `/orgs/${orgId}${path}`;
const roles = await call('GET', o('/roles'), undefined, tok('owner@demo.test'));
const roleId = (key) => roles.find((r) => r.key === key && r.isSystem).id;

async function join(email, roleKey, inviter, extra = {}) {
  const members = (await call('GET', o('/members?limit=100'), undefined, tok('owner@demo.test')));
  const existing = members.find((m) => m.email === email);
  if (existing) return existing.id;
  const since = new Date();
  await call('POST', o('/invitations'), { email, roleId: roleId(roleKey), ...extra }, tok(inviter));
  const r = await call('POST', '/invitations/accept', { token: await mailToken(email, 'invited you', since) }, tok(email));
  return r.membershipId;
}
const trainer = await join('trainer@demo.test', 'practitioner', 'owner@demo.test');
await join('trainer2@demo.test', 'practitioner', 'owner@demo.test');
await join('client@demo.test', 'participant', 'trainer@demo.test'); // auto-assigned to the trainer
// The owner coaches too: client2 is assigned to the owner (an owner can be a trainer).
await join('client2@demo.test', 'participant', 'owner@demo.test', { assignToMembershipId: org.membershipId });
void trainer;
const groups = (await call('GET', o('/groups'), undefined, tok('owner@demo.test')));
if (!groups.length) await call('POST', o('/groups'), { name: 'Morning class', description: '6am strength' }, tok('owner@demo.test'));

// Phase 5 demo data: tasks, a measurement series and a goal, all through the API as the people who would create them.
{
  const people5 = await call('GET', o('/members?limit=100'), undefined, tok('owner@demo.test'));
  const mid = (email) => people5.find((m) => m.email === email).id;
  const existing = await call('GET', o('/tasks?limit=1'), undefined, tok('owner@demo.test'));
  if (existing.length === 0) {
    const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString();
    const group = (await call('GET', o('/groups'), undefined, tok('owner@demo.test')))[0];
    const t1 = await call('POST', o('/tasks'), { title: 'Log your meals for 3 days', description: 'Photos are optional. Note how hungry you felt.', priority: 'HIGH', dueAt: day(3), assigneeMembershipIds: [mid('client@demo.test'), mid('client2@demo.test')] }, tok('trainer@demo.test'));
    await call('POST', o(`/tasks/${t1.id}/comments`), { body: 'Start tomorrow morning, and message me if anything is unclear.' }, tok('trainer@demo.test'));
    await call('POST', o(`/tasks/${t1.id}/comments`), { body: 'Will do, thank you coach!' }, tok('client@demo.test'));
    await call('POST', o('/tasks'), { title: 'Send last week check-in photos', priority: 'MEDIUM', dueAt: day(-2), assigneeMembershipIds: [mid('client@demo.test')] }, tok('trainer@demo.test'));
    await call('POST', o('/tasks'), { title: 'Order new resistance bands', priority: 'LOW', dueAt: day(10) }, tok('owner@demo.test'));
    if (group) await call('POST', o('/tasks'), { title: 'Arrive 10 minutes early for the morning class', priority: 'MEDIUM', groupIds: [group.id] }, tok('owner@demo.test'));
  }
  // Body weight and the other body measurements are built in for Fitness organizations (registered by the module).
  const day = (offset) => new Date(Date.now() + offset * 86_400_000).toISOString();
  const metrics = await call('GET', o('/progress/metrics'), undefined, tok('owner@demo.test'));
  const weight = metrics.find((m) => m.key === 'weight_kg');
  if (!weight) throw new Error('weight_kg is missing: start the API once so the catalog sync registers the Fitness measurements');
  const series = await call('GET', o(`/progress/records?subjectMembershipId=${mid('client@demo.test')}&metricId=${weight.id}`), undefined, tok('trainer@demo.test'));
  if (series.length === 0) {
    for (const [offset, value] of [[-35, 92.4], [-28, 91.6], [-21, 90.9], [-14, 90.2], [-7, 89.1], [-1, 88.4]]) await call('POST', o('/progress/records'), { subjectMembershipId: mid('client@demo.test'), metricId: weight.id, value, recordedAt: day(offset) }, tok('trainer@demo.test'));
    const goal = await call('POST', o('/progress/goals'), { subjectMembershipId: mid('client@demo.test'), metricId: weight.id, title: 'Reach 85 kg', targetValue: 85, dueDate: day(60).slice(0, 10) }, tok('trainer@demo.test'));
    await call('POST', o(`/progress/goals/${goal.id}/milestones`), { title: 'Drop below 90 kg', targetValue: 90 }, tok('trainer@demo.test'));
  }
}

// Phase 6a demo data: a client profile, a published workout plan and an assignment scheduled for today.
{
  const F = (path) => o(`/fitness${path}`);
  const client = (await call('GET', o('/members?limit=100'), undefined, tok('owner@demo.test'))).find((m) => m.email === 'client@demo.test').id;
  const profile = await call('GET', F(`/clients/${client}`), undefined, tok('trainer@demo.test'));
  if (!profile.profile) {
    await call('PUT', F(`/clients/${client}/profile`), { heightCm: 172, goalType: 'FAT_LOSS', activityLevel: 'LIGHT', goalsText: 'Lose 7 kg and feel stronger on the stairs.', injuriesNotes: 'Mild lower-back tightness after long sitting.', dateOfBirth: '1991-05-12' }, tok('client@demo.test'));
  }
  const plans = await call('GET', F('/plans?limit=50'), undefined, tok('trainer@demo.test'));
  if (!plans.some((p) => p.name === 'Beginner full body')) {
    const lib = await call('GET', F('/exercises'), undefined, tok('trainer@demo.test'));
    const id = (key) => lib.find((e) => e.key === key).id;
    const plan = await call('POST', F('/plans'), { name: 'Beginner full body', description: 'Three days a week, simple and repeatable.' }, tok('trainer@demo.test'));
    const version = plan.versions[0].id;
    const ex = (key, sets, repsMin, repsMax, restSeconds, targetWeightKg = null) => ({ exerciseId: id(key), sets, repsMin, repsMax, restSeconds, targetWeightKg });
    await call('PUT', F(`/plans/${plan.id}/versions/${version}/content`), {
      notes: 'Add weight when every set reaches the top of the rep range.',
      days: [
        { name: 'Lower body', exercises: [ex('goblet_squat', 3, 8, 12, 90, 16), ex('romanian_deadlift', 3, 8, 10, 90, 30), ex('glute_bridge', 3, 12, 15, 60), ex('plank', 3, 1, 1, 45)] },
        { name: 'Upper body', exercises: [ex('dumbbell_shoulder_press', 3, 8, 12, 90, 8), ex('dumbbell_row', 3, 10, 12, 90, 12), ex('push_up', 3, 6, 12, 60), ex('face_pull', 2, 12, 15, 45)] },
        { name: 'Conditioning', exercises: [ex('kettlebell_swing', 4, 15, 15, 45, 12), ex('walking_lunge', 3, 10, 12, 60, 8), ex('rowing_machine', 1, 1, 1, 0)] },
      ],
    }, tok('trainer@demo.test'));
    await call('POST', F(`/plans/${plan.id}/versions/${version}/publish`), {}, tok('trainer@demo.test'));
    // Day 1 falls on today's weekday so the client has a workout to start right away.
    const weekday = (offset) => ((new Date().getUTCDay() + 6 + offset) % 7) + 1;
    await call('POST', F(`/plans/${plan.id}/assignments`), { clientMembershipIds: [client], startDate: orgToday(), weeklySchedule: { 1: weekday(0), 2: weekday(2), 3: weekday(4) } }, tok('trainer@demo.test'));
  }
}

// Phase 6b demo data: a nutrition plan, a submitted weekly check-in with measurements and a photo, a trainer review.
{
  const F = (path) => o(`/fitness${path}`);
  const client = (await call('GET', o('/members?limit=100'), undefined, tok('owner@demo.test'))).find((m) => m.email === 'client@demo.test').id;
  const plans = await call('GET', F('/nutrition-plans?limit=50'), undefined, tok('trainer@demo.test'));
  if (!plans.some((p) => p.name === 'Balanced week')) {
    const plan = await call('POST', F('/nutrition-plans'), { name: 'Balanced week', description: 'About 2,000 kcal a day, high in protein.' }, tok('trainer@demo.test'));
    const version = plan.versions[0].id;
    const item = (name, quantity, unit, calories, proteinG, carbsG, fatG) => ({ name, quantity, unit, calories, proteinG, carbsG, fatG });
    const meals = () => [
      { mealType: 'BREAKFAST', timeOfDay: '08:00', items: [item('Oats with milk', 80, 'g', 320, 12, 52, 7), item('Banana', 1, 'piece', 105, 1, 27, 0)] },
      { mealType: 'LUNCH', timeOfDay: '13:00', items: [item('Grilled chicken', 150, 'g', 250, 46, 0, 6), item('Rice', 180, 'g', 230, 4, 50, 1), item('Salad', 1, 'bowl', 90, 2, 8, 5)] },
      { mealType: 'SNACK', timeOfDay: '16:30', items: [item('Greek yoghurt', 170, 'g', 100, 17, 6, 1), item('Almonds', 20, 'g', 120, 4, 4, 10)] },
      { mealType: 'DINNER', timeOfDay: '20:00', items: [item('Salmon', 150, 'g', 310, 34, 0, 18), item('Vegetables', 200, 'g', 90, 4, 16, 1)] },
    ];
    await call('PUT', F(`/nutrition-plans/${plan.id}/versions/${version}/content`), { notes: 'Drink at least 2 litres of water.', days: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({ weekday, meals: meals() })) }, tok('trainer@demo.test'));
    await call('POST', F(`/nutrition-plans/${plan.id}/versions/${version}/publish`), {}, tok('trainer@demo.test'));
  }
  const balanced = (await call('GET', F('/nutrition-plans?limit=50'), undefined, tok('trainer@demo.test'))).find((p) => p.name === 'Balanced week');
  const given = await call('GET', F(`/nutrition/assignments?clientMembershipId=${client}&status=ACTIVE`), undefined, tok('trainer@demo.test'));
  if (balanced && given.length === 0) await call('POST', F(`/nutrition-plans/${balanced.id}/assignments`), { clientMembershipIds: [client], startDate: orgToday() }, tok('trainer@demo.test'));
  const existing = await call('GET', F('/checkins/week/previous'), undefined, tok('client@demo.test'));
  if (!existing.checkin) {
    // a real (synthetic) PNG so the photo slot shows something recognizable
    const { deflateSync, crc32 } = await import('node:zlib');
    const w = 120, h = 160;
    const raw = Buffer.alloc((w * 3 + 1) * h);
    for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; for (let x = 0; x < w; x++) { const i = y * (w * 3 + 1) + 1 + x * 3; raw[i] = 40 + (y * 90) / h; raw[i + 1] = 90 + (x * 100) / w; raw[i + 2] = 200 - (y * 80) / h; } }
    const chunk = (type, data) => { const b = Buffer.alloc(12 + data.length); b.writeUInt32BE(data.length, 0); b.write(type, 4); data.copy(b, 8); b.writeUInt32BE(crc32(b.subarray(4, 8 + data.length)), 8 + data.length); return b; };
    const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
    const draft = await call('PUT', F('/checkins/week/previous'), { clientNotes: 'Good week: slept well, a bit hungry on Thursday.', measurements: { weight_kg: 88.1, waist_cm: 91.5, hips_cm: 102 } }, tok('client@demo.test'));
    const req = await call('POST', o('/files/uploads'), { fileName: 'front.png', mimeType: 'image/png', sizeBytes: png.length, sensitivity: 'SENSITIVE' }, tok('client@demo.test'));
    const put = await fetch(req.upload.url, { method: 'PUT', headers: req.upload.headers, body: png });
    if (!put.ok) throw new Error(`photo upload failed: ${put.status}`);
    await call('POST', o(`/files/${req.file.id}/complete`), {}, tok('client@demo.test'));
    await call('POST', F('/photos'), { fileId: req.file.id, angle: 'FRONT', kind: 'WEEKLY', checkinId: draft.id }, tok('client@demo.test'));
    await call('POST', F(`/checkins/${draft.id}/submit`), {}, tok('client@demo.test'));
  }
}

// Phase 7: a short conversation between the trainer and Sara, so the Messages screen has something to show.
{
  const M = (path) => o(`/messaging${path}`);
  const sara = (await call('GET', o('/members?limit=100'), undefined, tok('owner@demo.test'))).find((m) => m.email === 'client@demo.test').id;
  const conv = await call('POST', M('/conversations'), { membershipId: sara }, tok('trainer@demo.test'));
  const history = await call('GET', M(`/conversations/${conv.id}/messages?limit=1`), undefined, tok('trainer@demo.test'));
  if (history.length === 0) {
    const say = (who, body) => call('POST', M(`/conversations/${conv.id}/messages`), { body }, tok(who));
    await say('trainer@demo.test', 'Hi Sara, welcome! How did your first workout feel?');
    await say('client@demo.test', 'Hi Tariq! Good, a bit sore in the legs.');
    await say('trainer@demo.test', 'That is normal after the lower-body day. Remember to log your meals this week.');
  }
}

// Phase 8a: a coaching practice. Needs the Coaching category to be enabled (Admin → Catalog); skipped with a hint otherwise.
{
  const coachPeople = [['coach@demo.test', 'Dana Coach'], ['coachee@demo.test', 'Rami Client'], ['coachee2@demo.test', 'Hala Client']];
  for (const [email, name] of coachPeople) sessions[email] = await account(email, name);
  people.push(...coachPeople);
  let coachOrg = (await call('GET', '/me/organizations', undefined, tok('coach@demo.test'))).find((o) => o.organization.slug === 'demo-coaching');
  if (!coachOrg) {
    try {
      const c = await call('POST', '/orgs', { name: 'Demo Coaching', slug: 'demo-coaching', categoryKey: 'coaching', timezone: 'Asia/Riyadh' }, tok('coach@demo.test'));
      coachOrg = { organization: c.organization, membershipId: c.membershipId };
    } catch (e) {
      if (e.code !== 'CATEGORY_UNAVAILABLE') throw e;
      console.log('Coaching demo skipped: enable the Coaching category in Admin → Catalog, then run this script again.');
    }
  }
  if (coachOrg) {
    const cid = coachOrg.organization.id;
    const co = (path) => `/orgs/${cid}${path}`;
    const coachTok = tok('coach@demo.test');
    const roleList = await call('GET', co('/roles'), undefined, coachTok);
    const participantRole = roleList.find((r) => r.key === 'participant' && r.isSystem).id;
    const joined = {};
    for (const [email] of coachPeople.slice(1)) {
      const existing = (await call('GET', co('/members?limit=100'), undefined, coachTok)).find((m) => m.email === email);
      if (existing) { joined[email] = existing.id; continue; }
      const since = new Date();
      await call('POST', co('/invitations'), { email, roleId: participantRole, assignToMembershipId: coachOrg.membershipId }, coachTok);
      const r = await call('POST', '/invitations/accept', { token: await mailToken(email, 'invited you', since) }, tok(email));
      joined[email] = r.membershipId;
    }
    const rami = joined['coachee@demo.test'];
    const hala = joined['coachee2@demo.test'];
    const mine = await call('GET', co('/coaching/sessions'), undefined, coachTok);
    if (mine.length === 0) {
      const at = (days, hour = 10) => { const d = new Date(Date.now() + days * 86_400_000); d.setUTCHours(hour, 0, 0, 0); return d.toISOString(); };
      const held = await call('POST', co('/coaching/sessions'), { clientMembershipId: rami, startsAt: new Date(Date.now() + 60_000).toISOString(), durationMinutes: 60, location: 'Office, room 2', agenda: 'First session: where you are and where you want to be' }, coachTok);
      await call('POST', co('/coaching/sessions'), { clientMembershipId: rami, startsAt: at(3), durationMinutes: 45, location: 'https://meet.example.test/rami', agenda: 'Review the wheel of life' }, coachTok);
      await call('POST', co('/coaching/sessions'), { clientMembershipId: hala, startsAt: at(5, 14), durationMinutes: 60, location: 'Office, room 1' }, coachTok);
      await call('POST', co('/coaching/notes'), { clientMembershipId: rami, sessionId: held.id, visibility: 'SHARED', body: 'Agreed focus for the next month: sleep routine and weekly planning.' }, coachTok);
      await call('POST', co('/coaching/notes'), { clientMembershipId: rami, sessionId: held.id, visibility: 'PRIVATE', body: 'Seems hesitant about the new manager. Revisit gently in session three.' }, coachTok);
      const areas = [['health', 'Health and energy', 'الصحة والطاقة'], ['career', 'Career or work', 'العمل والمسار المهني'], ['money', 'Money and finances', 'المال والشؤون المالية'], ['relationships', 'Family and relationships', 'الأسرة والعلاقات'], ['growth', 'Personal growth', 'النمو الشخصي'], ['fun', 'Fun and recreation', 'الترفيه']];
      const template = await call('POST', co('/coaching/assessment-templates'), { name: 'Wheel of life', description: 'A quick check of six areas', questions: areas.map(([id, en, ar]) => ({ id, kind: 'SCALE', label: { en, ar } })) }, coachTok);
      await call('POST', co('/coaching/assessments'), { templateId: template.id, clientMembershipId: rami, cadenceDays: 14 }, coachTok);
      // Rami answers twice so the trend chart has a line to show.
      for (const base of [4, 6]) {
        const open = (await call('GET', co('/coaching/assessments?status=REQUESTED'), undefined, tok('coachee@demo.test')))[0];
        await call('POST', co(`/coaching/assessments/${open.id}/submit`), { answers: Object.fromEntries(areas.map(([id], i) => [id, Math.min(10, base + (i % 3))])) }, tok('coachee@demo.test'));
      }
      await call('POST', co('/coaching/resources'), { title: 'Weekly planner (printable)', description: 'Use it every Sunday evening', url: 'https://example.com/weekly-planner' }, coachTok);
    }
    console.log('Coaching demo: /en/o/demo-coaching (coach@demo.test, coachee@demo.test, coachee2@demo.test)');
  }
}

// Platform admin: bootstrap via the CLI (there is deliberately no API for the first one), then enroll TOTP.
execFileSync('node', ['apps/api/dist/cli/grant-super-admin.js', 'admin@demo.test'], { stdio: 'inherit' });
let secret = process.env.ADMIN_TOTP_SECRET;
if (sessions['admin@demo.test'].mfaRequired) {
  // Re-run: the admin already has two-factor authentication, so sign-in asks for a code. Nothing more to set up.
  console.log('Admin already has MFA; use your authenticator app or a recovery code.');
} else {
  const me = await call('GET', '/me', undefined, tok('admin@demo.test'));
  if (!me.mfaEnabled) {
    const e = await call('POST', '/me/mfa/enroll', undefined, tok('admin@demo.test'));
    const c = await call('POST', '/me/mfa/confirm', { code: totp(e.secret) }, tok('admin@demo.test'));
    secret = e.secret;
    console.log('Admin TOTP secret (add to an authenticator app):', secret, '\nRecovery codes:', c.recoveryCodes.join(' '));
  } else console.log('Admin already has MFA; use your authenticator app or a recovery code.');
}

console.log(`\nPassword for every account: ${PASSWORD}\n` + people.map(([e, n]) => `  ${e}  (${n})`).join('\n') + '\nWorkspaces: /en/o/demo-gym (fitness) and /en/o/demo-coaching (coaching, when the category is enabled)');

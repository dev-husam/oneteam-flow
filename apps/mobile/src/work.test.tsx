import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { createTranslator } from '@/i18n';
import { activityText, formatValue, notificationRoute, shiftDate } from '@/features/work';
import { usePrefs } from '@/stores/prefs';

jest.mock('expo-router', () => {
  const push = jest.fn();
  return { __push: push, useRouter: () => ({ push, back: jest.fn() }), useLocalSearchParams: () => ({ sessionId: 's1', checkinId: 'c1' }), Stack: { Screen: () => null } };
});
jest.mock('@/lib/api', () => ({ api: { org: jest.fn(), me: { notifications: { list: jest.fn(), preferences: jest.fn(), unreadCount: jest.fn(), markRead: jest.fn(), markAllRead: jest.fn(), setPreference: jest.fn() } } }, setAuthLostHandler: jest.fn() }));
jest.mock('@/lib/photo', () => {
  class PhotoPermissionError extends Error {}
  return { PhotoPermissionError, askPhotoSource: jest.fn(), pickPhoto: jest.fn(), uploadPhoto: jest.fn() };
});
jest.mock('@/features/org', () => ({ useOrgContext: () => ({ can: () => true, context: { membership: { id: 'me' } } }) }));
const mockApi = jest.requireMock('@/lib/api').api;
const mockPush = jest.requireMock('expo-router').__push;
const mockPhoto = jest.requireMock('@/lib/photo');

import Tasks from '../app/(app)/(tabs)/tasks';
import Notifications from '../app/(app)/notifications';
import Workouts from '../app/(app)/(tabs)/workouts';
import SessionScreen from '../app/(app)/session/[sessionId]';
import Nutrition from '../app/(app)/(tabs)/nutrition';
import MyCheckin from '../app/(app)/my-checkin';
import CheckinDetail from '../app/(app)/checkins/[checkinId]';

/** FlatList renders in batches on a short timer; let it settle inside act() so no update lands after the test. */
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const clients: QueryClient[] = [];
const wrap = (ui: React.ReactElement) => {
  // gcTime Infinity (queries and mutations): no cache-cleanup timers, so Jest can exit when the tests are done.
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return (
  <QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>{ui}</SafeAreaProvider>
  </QueryClientProvider>
  );
};
const task = (over: object = {}) => ({
  id: 't1', title: 'Log your meals', priority: 'HIGH', status: 'OPEN', dueAt: null, myStatus: 'PENDING',
  assignees: [{ membershipId: 'me', fullName: 'Sara', status: 'PENDING', completedAt: null }], commentCount: 0, attachmentCount: 0, ...over,
});
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  usePrefs.setState({ activeOrgId: 'org-1', locale: 'en' });
});

describe('work helpers', () => {
  it('routes a notification only from a well-formed task id', () => {
    expect(notificationRoute({ data: { taskId: '01a1b1ba-4028-741e-aebd-c2e37495e564' } })).toBe('/(app)/task/01a1b1ba-4028-741e-aebd-c2e37495e564');
    expect(notificationRoute({ data: { taskId: '../../admin' } })).toBeNull(); // a payload can never steer navigation elsewhere
    expect(notificationRoute({ data: { goalId: 'g1' } })).toBe('/(app)/(tabs)/progress');
    expect(notificationRoute({ data: null })).toBeNull();
  });

  it('describes activity in English and Arabic, with a neutral fallback', () => {
    const en = createTranslator('en');
    const ar = createTranslator('ar');
    expect(activityText(en, { verb: 'task.commented', actorName: 'Tariq' })).toBe('Tariq commented');
    expect(activityText(ar, { verb: 'task.commented', actorName: 'Tariq' })).toContain('Tariq');
    expect(activityText(en, { verb: 'something.new', actorName: null })).toBe('Someone made a change');
  });

  it('routes workout notifications by id and by flag only', () => {
    expect(notificationRoute({ data: { clientId: '01a1b1ba-4028-741e-aebd-c2e37495e564' } })).toBe('/(app)/client/01a1b1ba-4028-741e-aebd-c2e37495e564');
    expect(notificationRoute({ data: { clientId: '../x' } })).toBeNull();
    expect(notificationRoute({ data: { workouts: '1' } })).toBe('/(app)/(tabs)/workouts');
  });

  it('routes check-in and nutrition notifications by id and by flag only', () => {
    const id = '01a1b1ba-4028-741e-aebd-c2e37495e564';
    expect(notificationRoute({ data: { checkinId: id } })).toBe(`/(app)/checkins/${id}`);
    expect(notificationRoute({ data: { checkinId: '../../x' } })).toBeNull();
    expect(notificationRoute({ data: { checkin: '1' } })).toBe('/(app)/my-checkin');
    expect(notificationRoute({ data: { nutrition: '1' } })).toBe('/(app)/(tabs)/nutrition');
  });

  it('moves a plain date by whole days across month and year ends', () => {
    expect(shiftDate('2026-11-07', -1)).toBe('2026-11-06');
    expect(shiftDate('2026-12-31', 1)).toBe('2027-01-01');
    expect(shiftDate('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('formats measurements to the metric precision', () => {
    expect(formatValue(88.4, 1, 'en')).toBe('88.4');
    expect(formatValue(88.456, 1, 'en')).toBe('88.5');
  });
});

describe('Tasks screen', () => {
  it('lists tasks and finishes the caller’s own part from the circle', async () => {
    const setStatus = jest.fn().mockResolvedValue(task({ myStatus: 'DONE' }));
    mockApi.org.mockReturnValue({ tasks: { list: jest.fn().mockResolvedValue({ data: [task()], meta: { nextCursor: null } }), setStatus } });
    render(wrap(<Tasks />));
    expect(await screen.findByText('Log your meals')).toBeTruthy();
    fireEvent.press(screen.getByRole('checkbox', { name: 'Done' }));
    await waitFor(() => expect(setStatus).toHaveBeenCalledWith('t1', 'DONE'));
    await settle();
  });

  it('shows an empty state', async () => {
    mockApi.org.mockReturnValue({ tasks: { list: jest.fn().mockResolvedValue({ data: [], meta: { nextCursor: null } }) } });
    render(wrap(<Tasks />));
    expect(await screen.findByText('No tasks yet')).toBeTruthy();
    await settle();
  });
});

describe('Notifications screen', () => {
  it('marks a notification read and opens the task it points to', async () => {
    const n = { id: 'n1', typeKey: 'task.assigned', organizationId: 'org-1', data: { taskId: '01a1b1ba-4028-741e-aebd-c2e37495e564' }, readAt: null, createdAt: '2026-11-06T10:00:00Z', title: 'New task', body: 'Tariq assigned you "Log your meals".' };
    mockApi.me.notifications.list.mockResolvedValue({ data: [n], meta: { nextCursor: null } });
    mockApi.me.notifications.preferences.mockResolvedValue([{ category: 'tasks', channels: { IN_APP: true, PUSH: true, EMAIL: false } }]);
    mockApi.me.notifications.markRead.mockResolvedValue(undefined);
    render(wrap(<Notifications />));
    fireEvent.press(await screen.findByText(/New task/));
    await waitFor(() => expect(mockApi.me.notifications.markRead).toHaveBeenCalledWith('n1'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/task/01a1b1ba-4028-741e-aebd-c2e37495e564');
  });

  it('toggles a channel setting', async () => {
    mockApi.me.notifications.list.mockResolvedValue({ data: [], meta: { nextCursor: null } });
    mockApi.me.notifications.preferences.mockResolvedValue([{ category: 'tasks', channels: { IN_APP: true, PUSH: true, EMAIL: false } }]);
    mockApi.me.notifications.setPreference.mockResolvedValue(undefined);
    render(wrap(<Notifications />));
    fireEvent(await screen.findByLabelText('Tasks: Email'), 'valueChange', true);
    await waitFor(() => expect(mockApi.me.notifications.setPreference).toHaveBeenCalledWith({ category: 'tasks', channel: 'EMAIL', enabled: true }));
  });
});

const exercise = { id: 'e1', key: 'goblet_squat', name: { en: 'Goblet squat', ar: 'سكوات الكأس' }, muscleGroup: 'QUADS', equipment: 'DUMBBELL', instructions: null, videoUrl: null, system: true, archived: false };
const sessionDetail = (over: object = {}) => ({
  id: 's1', assignmentId: 'a1', planId: 'p1', planName: 'Beginner', versionNo: 1, dayId: 'd1', dayName: 'Lower body', dayNotes: null, clientMembershipId: 'me', clientName: 'Sara',
  scheduledDate: '2026-11-06', startedAt: '2026-11-06T08:00:00Z', completedAt: null, rpe: null, notes: null, volume: 0, editable: true,
  exercises: [{ dayExerciseId: 'x1', position: 1, exercise, sets: 2, repsMin: 8, repsMax: 12, targetWeightKg: 16, restSeconds: 90, tempo: null, supersetGroup: null, notes: null, logged: [], previous: null }], ...over,
});

describe('Workouts screen', () => {
  it('starts today’s workout and opens the session', async () => {
    const todayView = { date: '2026-11-06', timezone: 'UTC', today: [{ assignmentId: 'a1', planName: 'Beginner', dayId: 'd1', dayIndex: 1, dayName: 'Lower body', exerciseCount: 4, session: null }], upcoming: [], assignments: [{ assignmentId: 'a1', planId: 'p1', planName: 'Beginner', versionNo: 1, startDate: '2026-11-02', endDate: null, days: [{ dayId: 'd1', dayIndex: 1, name: 'Lower body', exerciseCount: 4 }] }] };
    const start = jest.fn().mockResolvedValue(sessionDetail());
    mockApi.org.mockReturnValue({ fitness: { workouts: { today: jest.fn().mockResolvedValue(todayView) }, sessions: { start, list: jest.fn().mockResolvedValue({ data: [], meta: { nextCursor: null } }) } } });
    render(wrap(<Workouts />));
    const buttons = await screen.findAllByRole('button', { name: 'Start workout' });
    fireEvent.press(buttons[0]!);
    await waitFor(() => expect(start).toHaveBeenCalledWith({ assignmentId: 'a1', dayId: 'd1' }));
    await waitFor(() => expect(mockPush).toHaveBeenCalledWith('/(app)/session/s1'));
    await settle();
  });
});

describe('Session screen', () => {
  it('logs a set with the planned numbers prefilled, and only allows finishing once something is logged', async () => {
    const logSet = jest.fn().mockResolvedValue(sessionDetail({ exercises: [{ ...sessionDetail().exercises[0], logged: [{ setNo: 1, repsDone: 12, weightKg: 16 }] }] }));
    mockApi.org.mockReturnValue({ fitness: { sessions: { get: jest.fn().mockResolvedValue(sessionDetail()), logSet } } });
    render(wrap(<SessionScreen />));
    expect(await screen.findByText('Goblet squat')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Finish workout' }).props.accessibilityState?.disabled).toBe(true);
    fireEvent.press(screen.getAllByRole('button', { name: 'Log set' })[0]!);
    await waitFor(() => expect(logSet).toHaveBeenCalledWith('s1', { dayExerciseId: 'x1', setNo: 1, repsDone: 12, weightKg: 16 }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Finish workout' }).props.accessibilityState?.disabled).toBeFalsy());
  });

  it('is read-only for someone looking at a client’s finished session', async () => {
    const done = sessionDetail({ editable: false, completedAt: '2026-11-06T09:00:00Z', rpe: 8, volume: 384, exercises: [{ ...sessionDetail().exercises[0], logged: [{ setNo: 1, repsDone: 12, weightKg: 16 }, { setNo: 2, repsDone: 10, weightKg: 16 }] }] });
    mockApi.org.mockReturnValue({ fitness: { sessions: { get: jest.fn().mockResolvedValue(done) } } });
    render(wrap(<SessionScreen />));
    expect(await screen.findByText('Set 2: 10 reps × 16 kg')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Log set' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Finish workout' })).toBeNull();
  });
});

const mealItem = { id: 'i1', position: 1, name: 'Oats with milk', quantity: 80, unit: 'g', calories: 320, proteinG: 12, carbsG: 54, fatG: 6, notes: null };
const nutritionToday = (log: object | null = null) => ({
  date: '2026-11-07', today: '2026-11-07', adherencePct: 0,
  items: [{ assignmentId: 'a1', planName: 'Balanced week', versionNo: 1, dayNotes: null, meals: [{ mealId: 'm1', mealType: 'BREAKFAST', timeOfDay: '08:00', notes: null, items: [mealItem], totals: { calories: 425, proteinG: 20, carbsG: 70, fatG: 8 }, log }] }],
});

describe('Nutrition screen', () => {
  it('shows the planned meal and logs it with one tap for the day on screen', async () => {
    const logMeal = jest.fn().mockResolvedValue({ id: 'l1', assignmentId: 'a1', mealId: 'm1', logDate: '2026-11-07', status: 'COMPLETED', notes: null, photoFileIds: [] });
    mockApi.org.mockReturnValue({ fitness: { nutrition: { today: jest.fn().mockResolvedValue(nutritionToday()), logMeal } } });
    render(wrap(<Nutrition />));
    expect(await screen.findByText('Oats with milk · 80 g')).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Ate it' }));
    await waitFor(() => expect(logMeal).toHaveBeenCalledWith({ assignmentId: 'a1', mealId: 'm1', status: 'COMPLETED', notes: null, logDate: '2026-11-07' }));
    await settle();
  });

  it('says so when nothing is assigned', async () => {
    mockApi.org.mockReturnValue({ fitness: { nutrition: { today: jest.fn().mockResolvedValue({ date: '2026-11-07', today: '2026-11-07', items: [], adherencePct: null }) } } });
    render(wrap(<Nutrition />));
    expect(await screen.findByText('Nothing planned')).toBeTruthy();
    await settle();
  });
});

const checkin = (over: object = {}) => ({
  id: 'c1', clientMembershipId: 'me', clientName: 'Sara Client', week: { start: '2026-11-02', end: '2026-11-08' }, status: 'SUBMITTED', clientNotes: 'Felt strong',
  submittedAt: '2026-11-07T10:00:00Z', adherence: { workoutPct: 100, nutritionPct: 38 }, measurements: [{ key: 'weight_kg', value: 87.4, unit: 'kg' }],
  photosHidden: false, photos: [{ id: 'p1', fileId: 'f1', angle: 'FRONT', kind: 'CHECKIN', takenOn: '2026-11-07' }], reviewedByName: null, reviewedAt: null, feedback: null, comments: [], ...over,
});
const weekView = (over: object = {}) => ({
  week: { key: 'current', start: '2026-11-02', end: '2026-11-08' }, today: '2026-11-07', state: 'DUE', checkin: null,
  preview: { workout: { scheduled: 1, completed: 1, pct: 100 }, nutrition: { planned: 4, logged: 2, pct: 38 } }, lastMeasurements: { weight_kg: { value: 88.1, at: '2026-10-31T00:00:00Z' } }, ...over,
});

describe('My check-in screen', () => {
  it('saves the week and submits it in one tap', async () => {
    const saveWeek = jest.fn().mockResolvedValue(checkin({ status: 'DRAFT' }));
    const submit = jest.fn().mockResolvedValue(checkin());
    mockApi.org.mockReturnValue({ fitness: { checkins: { week: jest.fn().mockResolvedValue(weekView()), saveWeek, submit } } });
    render(wrap(<MyCheckin />));
    fireEvent.changeText(await screen.findByLabelText('Body weight'), '87,4');
    fireEvent.press(screen.getByRole('button', { name: 'Submit check-in' }));
    await waitFor(() => expect(saveWeek).toHaveBeenCalledWith('current', { clientNotes: null, measurements: expect.objectContaining({ weight_kg: 87.4, waist_cm: null }) }));
    await waitFor(() => expect(submit).toHaveBeenCalledWith('c1'));
    await settle();
  });

  it('does not submit without a weight or with an impossible value', async () => {
    const saveWeek = jest.fn();
    mockApi.org.mockReturnValue({ fitness: { checkins: { week: jest.fn().mockResolvedValue(weekView()), saveWeek } } });
    render(wrap(<MyCheckin />));
    const weight = await screen.findByLabelText('Body weight');
    fireEvent.press(screen.getByRole('button', { name: 'Submit check-in' }));
    expect(await screen.findByText('Enter a realistic value with at most one decimal.')).toBeTruthy();
    fireEvent.changeText(weight, '5');
    fireEvent.press(screen.getByRole('button', { name: 'Submit check-in' }));
    expect(saveWeek).not.toHaveBeenCalled();
    await settle();
  });

  it('is read-only once submitted and shows the trainer’s feedback', async () => {
    const done = checkin({ status: 'REVIEWED', reviewedByName: 'Tariq Trainer', feedback: 'Keep going', photosHidden: true, photos: [] });
    mockApi.org.mockReturnValue({ fitness: { checkins: { week: jest.fn().mockResolvedValue(weekView({ checkin: done, state: 'REVIEWED' })) } } });
    render(wrap(<MyCheckin />));
    expect(await screen.findByText('Keep going')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Submit check-in' })).toBeNull();
    expect(screen.queryByLabelText('Body weight')).toBeNull();
    await settle();
  });
});

describe('Check-in review screen', () => {
  it('requests a private photo only when asked, then reviews with feedback', async () => {
    const downloadUrl = jest.fn().mockResolvedValue({ url: 'http://localhost/photo.png', expiresInSeconds: 60 });
    const review = jest.fn().mockResolvedValue(checkin({ status: 'REVIEWED' }));
    mockApi.org.mockReturnValue({ files: { downloadUrl }, fitness: { checkins: { get: jest.fn().mockResolvedValue(checkin()), review } } });
    render(wrap(<CheckinDetail />));
    expect(await screen.findByText('Sara Client')).toBeTruthy();
    expect(downloadUrl).not.toHaveBeenCalled(); // nothing is fetched, so nothing is audited, until the trainer asks
    fireEvent.press(screen.getByRole('button', { name: 'Show photos' }));
    await waitFor(() => expect(downloadUrl).toHaveBeenCalledWith('f1'));
    fireEvent.changeText(screen.getByLabelText('Trainer feedback'), 'Nice week');
    fireEvent.press(screen.getByRole('button', { name: 'Mark as reviewed' }));
    await waitFor(() => expect(review).toHaveBeenCalledWith('c1', 'Nice week'));
    await settle();
  });

  it('never lists photos the caller may not see', async () => {
    mockApi.org.mockReturnValue({ files: { downloadUrl: jest.fn() }, fitness: { checkins: { get: jest.fn().mockResolvedValue(checkin({ photosHidden: true, photos: [] })) } } });
    render(wrap(<CheckinDetail />));
    expect(await screen.findByText('Photos are only visible to the client and their trainer.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Show photos' })).toBeNull();
    await settle();
  });
});

describe('Photos on the phone', () => {
  const picked = { uri: 'file:///cache/photo.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' };

  it('adds a weekly photo: creates the draft first, uploads it as a private file, attaches it to the check-in', async () => {
    mockPhoto.askPhotoSource.mockResolvedValue('library');
    mockPhoto.pickPhoto.mockResolvedValue(picked);
    mockPhoto.uploadPhoto.mockResolvedValue({ id: 'f9' });
    const saveWeek = jest.fn().mockResolvedValue(checkin({ status: 'DRAFT' }));
    const add = jest.fn().mockResolvedValue([]);
    mockApi.org.mockReturnValue({ fitness: { checkins: { week: jest.fn().mockResolvedValue(weekView()), saveWeek }, photos: { add } } });
    render(wrap(<MyCheckin />));
    const buttons = await screen.findAllByRole('button', { name: 'Add' });
    fireEvent.press(buttons[0]!); // Front
    await waitFor(() => expect(add).toHaveBeenCalledWith({ fileId: 'f9', angle: 'FRONT', kind: 'WEEKLY', checkinId: 'c1' }));
    expect(saveWeek).toHaveBeenCalledWith('current', {});
    expect(mockPhoto.uploadPhoto).toHaveBeenCalledWith('org-1', picked, { sensitive: true });
    await settle();
  });

  it('does nothing when the sheet is closed, and explains a refused camera permission', async () => {
    const saveWeek = jest.fn();
    mockApi.org.mockReturnValue({ fitness: { checkins: { week: jest.fn().mockResolvedValue(weekView()), saveWeek }, photos: { add: jest.fn() } } });
    render(wrap(<MyCheckin />));
    mockPhoto.askPhotoSource.mockResolvedValueOnce(null);
    fireEvent.press((await screen.findAllByRole('button', { name: 'Add' }))[1]!);
    await waitFor(() => expect(mockPhoto.askPhotoSource).toHaveBeenCalled());
    expect(saveWeek).not.toHaveBeenCalled(); // no draft is created for a cancelled pick

    mockPhoto.askPhotoSource.mockResolvedValueOnce('camera');
    mockPhoto.pickPhoto.mockRejectedValueOnce(new mockPhoto.PhotoPermissionError());
    fireEvent.press(screen.getAllByRole('button', { name: 'Add' })[1]!);
    expect(await screen.findByText(/Allow camera access/)).toBeTruthy();
    await settle();
  });

  it('shows a taken photo in its slot with replace and remove, and removes it', async () => {
    const withPhoto = checkin({ status: 'DRAFT' });
    const remove = jest.fn().mockResolvedValue(undefined);
    mockApi.org.mockReturnValue({ files: { downloadUrl: jest.fn().mockResolvedValue({ url: 'http://localhost/p.png', expiresInSeconds: 60 }) }, fitness: { checkins: { week: jest.fn().mockResolvedValue(weekView({ checkin: withPhoto })) }, photos: { remove } } });
    render(wrap(<MyCheckin />));
    expect(await screen.findByRole('button', { name: 'Replace' })).toBeTruthy();
    fireEvent.press(screen.getByRole('button', { name: 'Remove photo' }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith('p1'));
    await settle();
  });

  it('adds a meal photo: logs the meal as eaten if it was not logged yet, uploads it as a normal file, attaches it', async () => {
    mockPhoto.askPhotoSource.mockResolvedValue('camera');
    mockPhoto.pickPhoto.mockResolvedValue(picked);
    mockPhoto.uploadPhoto.mockResolvedValue({ id: 'f7' });
    const logMeal = jest.fn().mockResolvedValue({ id: 'l1', status: 'COMPLETED', notes: null, photoFileIds: [] });
    const attach = jest.fn().mockResolvedValue({});
    mockApi.org.mockReturnValue({ fitness: { nutrition: { today: jest.fn().mockResolvedValue(nutritionToday()), logMeal, attachMealPhoto: attach } } });
    render(wrap(<Nutrition />));
    fireEvent.press(await screen.findByRole('button', { name: 'Add a photo' }));
    await waitFor(() => expect(attach).toHaveBeenCalledWith('l1', 'f7'));
    expect(logMeal).toHaveBeenCalledWith({ assignmentId: 'a1', mealId: 'm1', logDate: '2026-11-07', status: 'COMPLETED' });
    expect(mockPhoto.uploadPhoto).toHaveBeenCalledWith('org-1', picked, { sensitive: false });
    await settle();
  });
});

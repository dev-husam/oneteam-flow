import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { WHEEL_OF_LIFE_QUESTIONS } from '@pt/domain';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }), useLocalSearchParams: () => ({ membershipId: 'client-1' }) }));
jest.mock('@/lib/api', () => ({ API_URL: 'http://localhost:3001/api/v1', api: { org: jest.fn() }, setAuthLostHandler: jest.fn() }));
jest.mock('@/features/org', () => ({ useOrgContext: () => ({ orgId: 'org-1', can: () => true, context: { membership: { id: 'me' } } }) }));
const mockApi = jest.requireMock('@/lib/api').api;

import Coaching from '../app/(app)/coaching';
import MyCoaching from '../app/(app)/my-coaching';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const clients: QueryClient[] = [];
const wrap = (ui: React.ReactElement) => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return (
    <QueryClientProvider client={client}>
      <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>{ui}</SafeAreaProvider>
    </QueryClientProvider>
  );
};
afterEach(() => clients.splice(0).forEach((c) => c.clear()));

const inDays = (d: number) => new Date(Date.now() + d * 86_400_000).toISOString();
const session = (over = {}) => ({ id: 's1', coachMembershipId: 'coach', coachName: 'Tariq Trainer', clientMembershipId: 'me', clientName: 'Sara Client', startsAt: inDays(2), durationMinutes: 60, location: 'https://meet.example.test/x', agenda: 'Quarterly goals', status: 'PLANNED', cancelReason: null, createdAt: inDays(-1), ...over });
const assessment = { id: 'a1', templateId: 't1', clientMembershipId: 'me', clientName: 'Sara Client', requestedByMembershipId: 'coach', requestedByName: 'Tariq Trainer', title: 'Wheel of life', questions: WHEEL_OF_LIFE_QUESTIONS.slice(0, 2), answers: null, status: 'REQUESTED', cadenceDays: 14, dueAt: null, requestedAt: inDays(-1), completedAt: null };

function useApi(over: Record<string, unknown> = {}) {
  const coaching = {
    sessions: { list: jest.fn().mockResolvedValue([session()]), complete: jest.fn(), cancel: jest.fn() },
    assessments: { list: jest.fn().mockResolvedValue([assessment]), submit: jest.fn().mockResolvedValue({ ...assessment, status: 'COMPLETED' }) },
    notes: { list: jest.fn().mockResolvedValue([{ id: 'n1', clientMembershipId: 'me', sessionId: null, visibility: 'SHARED', body: 'Agreed: two focus areas.', authorMembershipId: 'coach', authorName: 'Tariq Trainer', mine: false, createdAt: inDays(-1), updatedAt: inDays(-1) }]), create: jest.fn() },
    resources: { list: jest.fn().mockResolvedValue([{ id: 'r1', title: 'Weekly planner', description: null, url: 'https://example.test/p.pdf', clientMembershipId: null, sharedWithAll: true, createdByMembershipId: 'coach', createdByName: 'Tariq Trainer', createdAt: inDays(-1), file: null }]) },
    ...over,
  };
  mockApi.org.mockReturnValue({ coaching, members: { list: jest.fn().mockResolvedValue({ data: [{ id: 'c1', fullName: 'Sara Client', role: { key: 'participant' } }, { id: 'x', fullName: 'Tariq Trainer', role: { key: 'practitioner' } }] }), get: jest.fn() } });
  return coaching;
}

describe('My coaching (client)', () => {
  it('shows the next session, the questionnaire to complete, the coach’s shared notes and resources', async () => {
    useApi();
    render(wrap(<MyCoaching />));
    await settle();
    expect(screen.getByText('My coaching')).toBeTruthy();
    expect(screen.getByText(/With Tariq Trainer/)).toBeTruthy();
    expect(screen.getByText('Quarterly goals')).toBeTruthy();
    expect(screen.getByText('Wheel of life')).toBeTruthy();
    expect(screen.getByText('Agreed: two focus areas.')).toBeTruthy();
    expect(screen.getByText('Weekly planner')).toBeTruthy();
    expect(screen.queryByText('Mark as held')).toBeNull(); // clients cannot manage sessions
  });

  it('answers an assessment: the button stays off until every required question has an answer, then sends them', async () => {
    const coaching = useApi();
    render(wrap(<MyCoaching />));
    await settle();
    fireEvent.press(screen.getByText('Complete'));
    const send = () => screen.getByRole('button', { name: 'Send my answers' });
    expect(send().props.accessibilityState?.disabled ?? send().props.disabled).toBeTruthy();
    // every question has its own 1 to 10 row: answer 7 for the first question and 9 for the second
    fireEvent.press(screen.getAllByRole('radio', { name: '7' })[0]!);
    expect(send().props.accessibilityState?.disabled ?? send().props.disabled).toBeTruthy();
    fireEvent.press(screen.getAllByRole('radio', { name: '9' })[1]!);
    fireEvent.press(send());
    await waitFor(() => expect(coaching.assessments.submit).toHaveBeenCalledWith('a1', { health: 7, career: 9 }));
  });

  it('says so when there is no coach yet', async () => {
    useApi({ sessions: { list: jest.fn().mockResolvedValue([]) }, assessments: { list: jest.fn().mockResolvedValue([]) }, notes: { list: jest.fn().mockResolvedValue([]) }, resources: { list: jest.fn().mockResolvedValue([]) } });
    render(wrap(<MyCoaching />));
    await settle();
    expect(screen.getByText(/do not have a coach yet/)).toBeTruthy();
    expect(screen.getByText('Nothing waiting for you.')).toBeTruthy();
  });
});

describe('Coaching (coach)', () => {
  it('lists upcoming sessions with actions and only the clients (not colleagues)', async () => {
    useApi({ sessions: { list: jest.fn().mockResolvedValue([session({ clientMembershipId: 'c1', startsAt: inDays(-1) })]), complete: jest.fn().mockResolvedValue({}), cancel: jest.fn() } });
    render(wrap(<Coaching />));
    await settle();
    expect(screen.getAllByText(/Sara Client/).length).toBeGreaterThan(0);
    expect(screen.queryByText('Tariq Trainer')).toBeNull(); // a colleague is not a client
    expect(screen.getByText('Mark as held')).toBeTruthy(); // the session has started
    expect(screen.getByText('Cancel session')).toBeTruthy();
  });
});

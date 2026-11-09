import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Alert, AppState } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { usePrefs } from '@/stores/prefs';

jest.mock('expo-router', () => {
  const push = jest.fn();
  const replace = jest.fn();
  return { __push: push, __replace: replace, useRouter: () => ({ push, replace, back: jest.fn() }), useLocalSearchParams: () => ({ conversationId: 'c1' }), Stack: { Screen: ({ options }: { options?: { headerRight?: () => unknown } }) => options?.headerRight?.() ?? null } };
});
jest.mock('@/lib/api', () => ({ API_URL: 'http://localhost:3001/api/v1', api: { org: jest.fn(), accessTokenForRealtime: jest.fn() }, setAuthLostHandler: jest.fn() }));
jest.mock('@/features/org', () => ({ useOrgContext: () => ({ orgId: 'org-1', can: () => true, context: { membership: { id: 'me' } } }) }));
jest.mock('@/lib/photo', () => {
  class PhotoPermissionError extends Error {}
  return { PhotoPermissionError, askPhotoSource: jest.fn(), pickPhoto: jest.fn(), uploadPhoto: jest.fn() };
});
jest.mock('@pt/api-client', () => ({ ...jest.requireActual('@pt/api-client'), connectRealtime: jest.fn() }));
const mockApi = jest.requireMock('@/lib/api').api;
const mockPush = jest.requireMock('expo-router').__push;
const mockReplace = jest.requireMock('expo-router').__replace;
const mockPhoto = jest.requireMock('@/lib/photo');
const mockConnect = jest.requireMock('@pt/api-client').connectRealtime as jest.Mock;

import Messages from '../app/(app)/(tabs)/messages';
import NewMessage from '../app/(app)/new-message';
import Conversation from '../app/(app)/conversation/[conversationId]';
import { RealtimeProvider } from './features/messaging';
import { notificationRoute } from './features/work';

const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 120)); });
const clients: QueryClient[] = [];
const newClient = () => {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity }, mutations: { gcTime: Infinity } } });
  clients.push(client);
  return client;
};
const wrap = (ui: React.ReactElement, client = newClient()) => (
  <QueryClientProvider client={client}>
    <SafeAreaProvider initialMetrics={{ frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } }}>{ui}</SafeAreaProvider>
  </QueryClientProvider>
);
afterEach(() => clients.splice(0).forEach((c) => c.clear()));
beforeEach(() => {
  jest.clearAllMocks();
  usePrefs.setState({ activeOrgId: 'org-1', locale: 'en' });
});

const message = (id: string, over: object = {}) => ({ id, conversationId: 'c1', senderMembershipId: 'tariq', senderName: 'Tariq', kind: 'TEXT', body: id, deleted: false, createdAt: '2026-11-07T10:00:00Z', attachments: [], ...over });
const conversation = (over: object = {}) => ({
  id: 'c1', type: 'DIRECT', other: { membershipId: 'tariq', fullName: 'Tariq Trainer', roleKey: 'practitioner', active: true },
  lastMessage: { id: 'm2', senderMembershipId: 'tariq', preview: 'See you tomorrow', deleted: false, hasAttachments: false, createdAt: '2026-11-07T10:00:00Z' },
  unreadCount: 2, muted: false, blockedByMe: false, canSend: true, lastMessageAt: '2026-11-07T10:00:00Z', createdAt: '2026-11-06T10:00:00Z', ...over,
});

describe('notification routes', () => {
  it('opens a conversation by a well-formed id only', () => {
    const id = '01a1b1ba-4028-741e-aebd-c2e37495e564';
    expect(notificationRoute({ data: { conversationId: id } })).toBe(`/(app)/conversation/${id}`);
    expect(notificationRoute({ data: { conversationId: '../../x' } })).toBeNull();
  });
});

describe('Messages tab', () => {
  it('lists conversations with preview and unread count, and opens one', async () => {
    mockApi.org.mockReturnValue({ messaging: { conversations: { list: jest.fn().mockResolvedValue([conversation()]) } } });
    render(wrap(<Messages />));
    expect(await screen.findByText('Tariq Trainer')).toBeTruthy();
    expect(screen.getByLabelText('2 unread messages')).toBeTruthy();
    fireEvent.press(screen.getByText('Tariq Trainer'));
    expect(mockPush).toHaveBeenCalledWith('/(app)/conversation/c1');
    fireEvent.press(screen.getByRole('button', { name: 'New message' }));
    expect(mockPush).toHaveBeenCalledWith('/(app)/new-message');
    await settle();
  });

  it('shows deleted messages as such and an empty state', async () => {
    mockApi.org.mockReturnValue({ messaging: { conversations: { list: jest.fn().mockResolvedValue([conversation({ unreadCount: 0, lastMessage: { id: 'm', senderMembershipId: 'me', preview: '', deleted: true, hasAttachments: false, createdAt: '2026-11-07T10:00:00Z' } })]) } } });
    const { unmount } = render(wrap(<Messages />));
    expect(await screen.findByText(/This message was deleted/)).toBeTruthy();
    unmount();
    mockApi.org.mockReturnValue({ messaging: { conversations: { list: jest.fn().mockResolvedValue([]) } } });
    render(wrap(<Messages />));
    expect(await screen.findByText('No conversations yet')).toBeTruthy();
    await settle();
  });
});

describe('New message', () => {
  it('starts the conversation with the chosen person and opens it', async () => {
    const start = jest.fn().mockResolvedValue(conversation());
    mockApi.org.mockReturnValue({ messaging: { contacts: jest.fn().mockResolvedValue({ data: [{ membershipId: 'tariq', fullName: 'Tariq Trainer', roleKey: 'practitioner', conversationId: null }], meta: { nextCursor: null } }), conversations: { start } } });
    render(wrap(<NewMessage />));
    fireEvent.press(await screen.findByText('Tariq Trainer'));
    await waitFor(() => expect(start).toHaveBeenCalledWith('tariq'));
    await waitFor(() => expect(mockReplace).toHaveBeenCalledWith('/(app)/conversation/c1'));
    await settle();
  });

  it('says so when there is nobody to message', async () => {
    mockApi.org.mockReturnValue({ messaging: { contacts: jest.fn().mockResolvedValue({ data: [], meta: { nextCursor: null } }) } });
    render(wrap(<NewMessage />));
    expect(await screen.findByText('There is nobody to message yet.')).toBeTruthy();
    await settle();
  });
});

describe('Conversation', () => {
  function setup(over: { messages?: object[]; summary?: object } = {}) {
    const read = jest.fn().mockResolvedValue(conversation({ unreadCount: 0 }));
    const send = jest.fn().mockImplementation(async (_id: string, input: { body?: string }) => message('new', { senderMembershipId: 'me', body: input.body ?? '' }));
    const deleteMessage = jest.fn().mockResolvedValue(undefined);
    const mute = jest.fn().mockResolvedValue(conversation({ muted: true }));
    const block = jest.fn().mockResolvedValue(conversation({ blockedByMe: true, canSend: false }));
    const report = jest.fn().mockResolvedValue({ id: 'r1', status: 'OPEN' });
    const messages = jest.fn().mockResolvedValue({ data: over.messages ?? [message('m2', { body: 'See you tomorrow' }), message('m1', { senderMembershipId: 'me', body: 'Hello coach' })], meta: { nextCursor: null } });
    mockApi.org.mockReturnValue({
      files: { downloadUrl: jest.fn().mockResolvedValue({ url: 'http://localhost/f', expiresInSeconds: 60 }) },
      messaging: { conversations: { get: jest.fn().mockResolvedValue(over.summary ?? conversation()), messages, read, send, deleteMessage, mute, block, report } },
    });
    return { read, send, deleteMessage, mute, block, report };
  }

  it('shows the thread, and marks it read because the newest message is from the other person', async () => {
    const { read } = setup();
    render(wrap(<Conversation />));
    expect(await screen.findByText('See you tomorrow')).toBeTruthy();
    expect(screen.getByText('Hello coach')).toBeTruthy();
    await waitFor(() => expect(read).toHaveBeenCalledWith('c1'));
    await settle();
  });

  it('does not mark anything read when nothing is unread or the newest message is yours', async () => {
    const { read } = setup({ summary: conversation({ unreadCount: 0 }) });
    render(wrap(<Conversation />));
    await screen.findByText('See you tomorrow');
    await settle();
    expect(read).not.toHaveBeenCalled();
  });

  it('sends a trimmed message, only when there is something to send, and clears the box', async () => {
    const { send } = setup({ summary: conversation({ unreadCount: 0 }) });
    render(wrap(<Conversation />));
    await screen.findByText('See you tomorrow');
    expect(screen.getByRole('button', { name: 'Send' }).props.accessibilityState?.disabled).toBe(true);
    fireEvent.changeText(screen.getByLabelText('Write a message…'), '  Thanks!  ');
    fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('c1', { body: 'Thanks!', fileIds: undefined }));
    expect(await screen.findByText('Thanks!')).toBeTruthy(); // from the response: no need to wait for the socket
    await waitFor(() => expect(screen.getByLabelText('Write a message…').props.value).toBe(''));
    await settle();
  });

  it('attaches a photo (uploaded as a normal file) and sends it with the message', async () => {
    const { send } = setup({ summary: conversation({ unreadCount: 0 }) });
    mockPhoto.askPhotoSource.mockResolvedValue('library');
    mockPhoto.pickPhoto.mockResolvedValue({ uri: 'file:///p.jpg', fileName: 'photo.jpg', mimeType: 'image/jpeg' });
    mockPhoto.uploadPhoto.mockResolvedValue({ id: 'f1' });
    render(wrap(<Conversation />));
    await screen.findByText('See you tomorrow');
    fireEvent.press(screen.getByRole('button', { name: 'Photo' }));
    expect(await screen.findByText('photo.jpg ✕')).toBeTruthy();
    expect(mockPhoto.uploadPhoto).toHaveBeenCalledWith('org-1', expect.objectContaining({ fileName: 'photo.jpg' }), { sensitive: false });
    fireEvent.press(screen.getByRole('button', { name: 'Send' }));
    await waitFor(() => expect(send).toHaveBeenCalledWith('c1', { body: undefined, fileIds: ['f1'] }));
    await settle();
  });

  it('deletes only your own message, after a confirmation', async () => {
    const { deleteMessage } = setup({ summary: conversation({ unreadCount: 0 }) });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(wrap(<Conversation />));
    fireEvent(await screen.findByText('See you tomorrow'), 'longPress');
    expect(alert).not.toHaveBeenCalled(); // theirs
    fireEvent(screen.getByText('Hello coach'), 'longPress');
    expect(alert).toHaveBeenCalledTimes(1);
    const buttons = alert.mock.calls[0]![2]!;
    await act(async () => { buttons.find((b) => b.style === 'destructive')!.onPress!(); });
    await waitFor(() => expect(deleteMessage).toHaveBeenCalledWith('c1', 'm1'));
    alert.mockRestore();
    await settle();
  });

  it('reports the other person’s message with a chosen reason, and never offers it for your own', async () => {
    const { report } = setup({ summary: conversation({ unreadCount: 0 }) });
    render(wrap(<Conversation />));
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    fireEvent(await screen.findByText('Hello coach'), 'longPress'); // your own message: the delete confirmation, not the report sheet
    expect(alert).toHaveBeenCalledTimes(1);
    alert.mockRestore();
    expect(screen.queryByText('Report this message')).toBeNull();
    fireEvent(screen.getByText('See you tomorrow'), 'longPress');
    expect(await screen.findByText('Report this message')).toBeTruthy();
    fireEvent.press(screen.getByText('Spam'));
    await waitFor(() => expect(report).toHaveBeenCalledWith('c1', 'm2', { reason: 'SPAM' }));
    expect(await screen.findByText('Thank you. Your report was sent for review.')).toBeTruthy();
    await settle();
  });

  it('blocks the other person from the options sheet after a confirmation', async () => {
    const { block } = setup({ summary: conversation({ unreadCount: 0 }) });
    const alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
    render(wrap(<Conversation />));
    await screen.findByText('See you tomorrow');
    fireEvent.press(await screen.findByRole('button', { name: 'Options' }));
    fireEvent.press(await screen.findByText('Block this person'));
    const buttons = alert.mock.calls.at(-1)![2]!;
    await act(async () => { buttons.find((b) => b.style === 'destructive')!.onPress!(); });
    await waitFor(() => expect(block).toHaveBeenCalledWith('c1', true));
    alert.mockRestore();
    await settle();
  });

  it('replaces the composer with a notice when sending is not possible, and lets the blocker unblock', async () => {
    const { block } = setup({ summary: conversation({ unreadCount: 0, blockedByMe: true, canSend: false }) });
    render(wrap(<Conversation />));
    expect(await screen.findByText('You blocked this person. They cannot send you messages.')).toBeTruthy();
    expect(screen.queryByLabelText('Write a message…')).toBeNull();
    fireEvent.press(screen.getByRole('button', { name: 'Unblock' }));
    await waitFor(() => expect(block).toHaveBeenCalledWith('c1', false));
    await settle();
  });

  it('tells the blocked person only that they cannot send', async () => {
    setup({ summary: conversation({ unreadCount: 0, blockedByMe: false, canSend: false }) });
    render(wrap(<Conversation />));
    expect(await screen.findByText('You cannot send messages in this conversation.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Unblock' })).toBeNull();
    await settle();
  });

  it('shows deleted messages as tombstones', async () => {
    setup({ messages: [message('m1', { deleted: true, body: '' })], summary: conversation({ unreadCount: 0 }) });
    render(wrap(<Conversation />));
    expect(await screen.findByText('This message was deleted')).toBeTruthy();
    await settle();
  });
});

describe('RealtimeProvider', () => {
  const onStatusAndEvent = () => {
    const opts = mockConnect.mock.calls.at(-1)![0] as { onEvent: (e: unknown) => void; onStatus: (s: string) => void; getToken: (renew: boolean) => Promise<string | null> };
    return opts;
  };

  it('turns pushed events into cache updates for the active organization only, and refreshes on every (re)connection', async () => {
    const close = jest.fn();
    mockConnect.mockReturnValue({ close });
    const client = newClient();
    const key = ['org', 'org-1', 'messaging', 'messages', 'c1'];
    client.setQueryData(key, { pageParams: [undefined], pages: [{ data: [message('m1')], meta: { nextCursor: null } }] });
    const invalidate = jest.spyOn(client, 'invalidateQueries');
    render(wrap(<RealtimeProvider><></></RealtimeProvider>, client));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledTimes(1));
    const { onEvent, onStatus, getToken } = onStatusAndEvent();

    act(() => onEvent({ type: 'message:new', organizationId: 'org-1', conversationId: 'c1', message: message('m2', { body: 'pushed' }) }));
    expect((client.getQueryData(key) as { pages: { data: { id: string }[] }[] }).pages[0]!.data.map((m) => m.id)).toEqual(['m2', 'm1']);
    act(() => onEvent({ type: 'message:new', organizationId: 'other-org', conversationId: 'c1', message: message('m3') }));
    expect((client.getQueryData(key) as { pages: { data: unknown[] }[] }).pages[0]!.data).toHaveLength(2); // another organization's event is ignored
    act(() => onEvent({ type: 'message:deleted', organizationId: 'org-1', conversationId: 'c1', messageId: 'm1' }));
    expect((client.getQueryData(key) as { pages: { data: { id: string; deleted: boolean }[] }[] }).pages[0]!.data.find((m) => m.id === 'm1')!.deleted).toBe(true);

    invalidate.mockClear();
    act(() => onStatus('live'));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org', 'org-1', 'messaging', 'unread'] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['org', 'org-1', 'messaging', 'messages'] });

    mockApi.accessTokenForRealtime.mockResolvedValue('tok');
    await expect(getToken(true)).resolves.toBe('tok');
    expect(mockApi.accessTokenForRealtime).toHaveBeenCalledWith(true);
  });

  it('closes the connection when the app goes to the background and reconnects when it returns', async () => {
    const close = jest.fn();
    mockConnect.mockReturnValue({ close });
    let listener: (s: string) => void = () => undefined;
    const spy = jest.spyOn(AppState, 'addEventListener').mockImplementation(((_: string, fn: (s: string) => void) => { listener = fn; return { remove: jest.fn() }; }) as never);
    render(wrap(<RealtimeProvider><></></RealtimeProvider>));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledTimes(1));
    act(() => listener('background'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    act(() => listener('active'));
    await waitFor(() => expect(mockConnect).toHaveBeenCalledTimes(2));
    spy.mockRestore();
  });
});

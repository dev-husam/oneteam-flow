import { BUILT_IN_DESIGNS, DEFAULT_PUBLIC_CONFIG } from '@pt/domain';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react-native';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('expo-router', () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock('@/lib/api', () => ({ API_URL: 'http://localhost:3001/api/v1', api: { me: { design: { options: jest.fn(), choose: jest.fn() } } }, setAuthLostHandler: jest.fn() }));
const mockDesign = jest.requireMock('@/lib/api').api.me.design;

import Appearance from '../app/(app)/appearance';
import { selectActiveDesign, useBrand } from '@/stores/brand';

const [oneteam, classic] = BUILT_IN_DESIGNS as [(typeof BUILT_IN_DESIGNS)[number], (typeof BUILT_IN_DESIGNS)[number]];
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
beforeEach(() => {
  useBrand.setState({ config: DEFAULT_PUBLIC_CONFIG, orgDesign: null, personalDesign: null, personalAllowed: true });
  jest.clearAllMocks();
});

const options = (selectedKey: string | null) => ({ enabled: true, selectedKey, design: selectedKey ? classic : null, designs: [{ ...oneteam, builtIn: true }, { ...classic, builtIn: true }], platformDefaultKey: 'oneteam-flow' });

describe('which design is on screen', () => {
  it('a personal choice beats the organization’s design, which beats the platform default; an organization can switch personal choice off', () => {
    const base = { config: DEFAULT_PUBLIC_CONFIG, orgDesign: null, personalDesign: null, personalAllowed: true };
    expect(selectActiveDesign(base).key).toBe('oneteam-flow');
    expect(selectActiveDesign({ ...base, orgDesign: { ...classic, key: 'org-look' } }).key).toBe('org-look');
    expect(selectActiveDesign({ ...base, orgDesign: { ...classic, key: 'org-look' }, personalDesign: classic }).key).toBe('classic');
    expect(selectActiveDesign({ ...base, orgDesign: { ...classic, key: 'org-look' }, personalDesign: classic, personalAllowed: false }).key).toBe('org-look');
  });
  it('a damaged personal design is ignored', () => {
    useBrand.getState().setPersonalDesign({ ...classic, light: { ...classic.light, actionPrimary: 'url(x)' } });
    expect(useBrand.getState().personalDesign).toBeNull();
  });
});

describe('Appearance screen', () => {
  it('lists the offered designs and the default; choosing one applies it at once', async () => {
    mockDesign.options.mockResolvedValue(options(null));
    mockDesign.choose.mockResolvedValue({ enabled: true, selectedKey: 'classic', design: classic });
    render(wrap(<Appearance />));
    await settle();
    expect(screen.getByRole('radio', { name: 'Follow the default' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'Classic blue' }));
    await waitFor(() => expect(mockDesign.choose).toHaveBeenCalledWith('classic'));
    await waitFor(() => expect(useBrand.getState().personalDesign?.key).toBe('classic'));
  });

  it('going back to the default clears the choice', async () => {
    useBrand.setState({ personalDesign: classic });
    mockDesign.options.mockResolvedValue(options('classic'));
    mockDesign.choose.mockResolvedValue({ enabled: true, selectedKey: null, design: null });
    render(wrap(<Appearance />));
    await settle();
    expect(screen.getByRole('radio', { name: 'Classic blue' }).props.accessibilityState.selected).toBe(true);
    fireEvent.press(screen.getByRole('radio', { name: 'Follow the default' }));
    await waitFor(() => expect(mockDesign.choose).toHaveBeenCalledWith(null));
    await waitFor(() => expect(useBrand.getState().personalDesign).toBeNull());
  });

  it('says so when personal choice is switched off', async () => {
    mockDesign.options.mockResolvedValue({ ...options(null), enabled: false, designs: [] });
    render(wrap(<Appearance />));
    await settle();
    expect(screen.getByText('No other designs are available right now.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Classic blue' })).toBeNull();
  });
});

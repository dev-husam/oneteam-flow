import { BUILT_IN_DESIGNS, DEFAULT_PUBLIC_CONFIG } from '@pt/domain';
import { act, render, screen } from '@testing-library/react-native';
import * as SecureStore from 'expo-secure-store';
import { Image } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

jest.mock('expo-router', () => ({ useRouter: () => ({ replace: jest.fn() }), Link: ({ children }: { children: React.ReactNode }) => children }));
jest.mock('@/lib/api', () => ({ API_URL: 'http://api.test/api/v1', api: { auth: { login: jest.fn(), loginMfa: jest.fn() } }, setAuthLostHandler: jest.fn() }));
jest.mock('@/lib/push', () => ({ unregisterPush: jest.fn() }));

import Login from '../app/(auth)/login';
import { useBrand } from '@/stores/brand';
import { usePrefs } from '@/stores/prefs';
import { BrandHeader } from '@/ui/brand-header';
import { colorsFor } from '@/ui/theme';

const config = (over: Record<string, unknown> = {}) => ({
  ...DEFAULT_PUBLIC_CONFIG,
  identity: { ...DEFAULT_PUBLIC_CONFIG.identity, appName: { en: 'Atlas Coaching', ar: 'أطلس للتدريب' } },
  ...over,
});

beforeEach(() => {
  useBrand.setState({ config: DEFAULT_PUBLIC_CONFIG, orgDesign: null });
  usePrefs.setState({ locale: 'en' });
  jest.clearAllMocks();
});

describe('brand store', () => {
  it('shows the cached identity first, then the server’s, and remembers it', async () => {
    await SecureStore.setItemAsync('pt.brand', JSON.stringify(config()));
    let seenBeforeFetch = '';
    await useBrand.getState().load(async () => {
      seenBeforeFetch = useBrand.getState().config.identity.appName.en;
      return config({ design: BUILT_IN_DESIGNS[1] });
    });
    expect(seenBeforeFetch).toBe('Atlas Coaching'); // instant, before the network answered
    expect(useBrand.getState().config.design.key).toBe('classic');
    expect(JSON.parse((await SecureStore.getItemAsync('pt.brand'))!).design.key).toBe('classic');
  });

  it('keeps what it has when the server is unreachable, and falls back to defaults for damaged data', async () => {
    useBrand.setState({ config: config() });
    await useBrand.getState().load(async () => { throw new Error('offline'); });
    expect(useBrand.getState().config.identity.appName.en).toBe('Atlas Coaching');

    await SecureStore.setItemAsync('pt.brand', '{not json');
    useBrand.setState({ config: DEFAULT_PUBLIC_CONFIG });
    await useBrand.getState().load(async () => ({ design: { ...BUILT_IN_DESIGNS[0], light: { ...BUILT_IN_DESIGNS[0]!.light, actionPrimary: 'url(x)' } }, identity: { appName: { en: '<b>' } }, logoUrl: 'https://evil.test/a.png' }));
    expect(useBrand.getState().config).toEqual(DEFAULT_PUBLIC_CONFIG);
  });
});

describe('design colours', () => {
  it('maps the design’s semantic tokens onto the colours screens use, in both modes', () => {
    const d = BUILT_IN_DESIGNS[0]!;
    expect(colorsFor(d.light)).toMatchObject({ bg: '#F8FAFC', surface: '#FFFFFF', ink: '#0D1A33', accent: '#FF6A2B', accentInk: '#0D1A33', link: '#25436B', selection: '#E8F0FA' });
    expect(colorsFor(d.dark)).toMatchObject({ bg: '#081326', surface: '#12213D', ink: '#F8FAFC', accent: '#FF6A2B', link: '#8FB4E3' });
  });
  it('an organization’s own design wins while it is open and goes away afterwards; a damaged one is ignored', () => {
    const classic = BUILT_IN_DESIGNS[1]!;
    useBrand.getState().setOrgDesign(classic);
    expect(useBrand.getState().orgDesign?.key).toBe('classic');
    useBrand.getState().setOrgDesign(null);
    expect(useBrand.getState().orgDesign).toBeNull();
    useBrand.getState().setOrgDesign({ ...classic, light: { ...classic.light, actionPrimary: 'url(x)' } });
    expect(useBrand.getState().orgDesign).toBeNull();
  });
  it('the platform default design reaches the screens through the store', () => {
    const teal = { ...BUILT_IN_DESIGNS[0]!, key: 'teal', light: { ...BUILT_IN_DESIGNS[0]!.light, actionPrimary: '#0F766E', actionPrimaryHover: '#115E59', actionPrimaryText: '#FFFFFF' } };
    useBrand.setState({ config: { ...DEFAULT_PUBLIC_CONFIG, design: teal } });
    expect(colorsFor(useBrand.getState().config.design.light).accent).toBe('#0F766E');
  });
});

describe('brand header and sign-in screens', () => {
  const frame = { initialMetrics: { frame: { x: 0, y: 0, width: 390, height: 844 }, insets: { top: 47, left: 0, right: 0, bottom: 34 } } };

  it('shows the configured name and tagline in the current language, with an initial when there is no logo', () => {
    useBrand.setState({ config: config({ identity: { ...config().identity, tagline: { en: 'Train smart', ar: 'تدرّب بذكاء' } } }) });
    const { rerender } = render(<BrandHeader />);
    expect(screen.getByText('Atlas Coaching')).toBeTruthy();
    expect(screen.getByText('Train smart')).toBeTruthy();
    expect(screen.getByText('A')).toBeTruthy();
    act(() => usePrefs.setState({ locale: 'ar' }));
    rerender(<BrandHeader />);
    expect(screen.getByText('أطلس للتدريب')).toBeTruthy();
    expect(screen.getByText('تدرّب بذكاء')).toBeTruthy();
  });

  it('loads the uploaded logo from the API', () => {
    useBrand.setState({ config: config({ logoUrl: '/config/logo?v=abc123def456' }) });
    render(<BrandHeader />);
    expect(screen.UNSAFE_getByType(Image).props.source).toEqual({ uri: 'http://api.test/api/v1/config/logo?v=abc123def456' });
  });

  it('offers “create account” only while sign-up is open', () => {
    const { rerender } = render(<SafeAreaProvider {...frame}><Login /></SafeAreaProvider>);
    expect(screen.getByText('Create an account')).toBeTruthy();
    act(() => useBrand.setState({ config: config({ features: { registration: false, organization_creation: true } }) }));
    rerender(<SafeAreaProvider {...frame}><Login /></SafeAreaProvider>);
    expect(screen.queryByText('Create an account')).toBeNull();
  });
});

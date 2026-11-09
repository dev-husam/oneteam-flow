import * as SecureStore from 'expo-secure-store';
import { usePrefs } from './prefs';

describe('preferences', () => {
  it('starts from the device language and persists changes', async () => {
    await usePrefs.getState().hydrate();
    expect(usePrefs.getState()).toMatchObject({ hydrated: true, locale: 'en', activeOrgId: null });
    usePrefs.getState().setActiveOrg('org-1');
    usePrefs.getState().setLocale('en');
    await new Promise((r) => setTimeout(r, 0));
    expect(JSON.parse((await SecureStore.getItemAsync('pt.prefs'))!)).toEqual({ locale: 'en', activeOrgId: 'org-1' });
  });

  it('restores saved preferences and survives corrupt storage', async () => {
    await SecureStore.setItemAsync('pt.prefs', JSON.stringify({ locale: 'en', activeOrgId: 'org-9' }));
    await usePrefs.getState().hydrate();
    expect(usePrefs.getState().activeOrgId).toBe('org-9');
    await SecureStore.setItemAsync('pt.prefs', '{not json');
    await usePrefs.getState().hydrate();
    expect(usePrefs.getState()).toMatchObject({ hydrated: true, locale: 'en', activeOrgId: null });
  });
});

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { I18nManager } from 'react-native';
import { ar, en } from '@pt/i18n';
import { applyDirection, createTranslator, isRtl } from './index';

type Tree = { [k: string]: string | Tree };
const get = (tree: unknown, path: string) => path.split('.').reduce<unknown>((n, k) => (n as Tree | undefined)?.[k], tree);

describe('translator', () => {
  it('interpolates and uses ICU plurals (English)', () => {
    const t = createTranslator('en');
    expect(t('dashboard.greeting', { name: 'Layla' })).toBe('Welcome, Layla');
    expect(t('groups.memberCount', { count: 1 })).toBe('1 member');
    expect(t('groups.memberCount', { count: 5 })).toBe('5 members');
  });

  it('uses all six Arabic plural forms', () => {
    const t = createTranslator('ar');
    const forms = [0, 1, 2, 3, 11, 100].map((count) => t('groups.memberCount', { count }));
    expect(forms[0]).toBe('لا أعضاء');
    expect(forms[1]).toBe('عضو واحد');
    expect(forms[2]).toBe('عضوان');
    expect(forms[3]).toContain('أعضاء');
    expect(new Set(forms).size).toBe(6);
  });

  it('falls back to the key itself when a text is missing, never crashing', () => {
    const t = createTranslator('en');
    expect(t('does.not.exist')).toBe('does.not.exist');
    expect(t.has('does.not.exist')).toBe(false);
    expect(t.has('auth.login.title')).toBe(true);
  });

  it('knows each language direction and flips the layout only when needed', () => {
    expect(isRtl('ar')).toBe(true);
    expect(isRtl('en')).toBe(false);
    const force = jest.spyOn(I18nManager, 'forceRTL').mockImplementation(() => undefined);
    Object.defineProperty(I18nManager, 'isRTL', { value: false, configurable: true });
    expect(applyDirection('ar')).toBe(true); // restart needed
    expect(force).toHaveBeenCalledWith(true);
    expect(applyDirection('en')).toBe(false); // already LTR
    force.mockRestore();
  });
});

describe('translation keys used by the app', () => {
  const root = join(__dirname, '../..');
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => {
      const p = join(dir, f);
      return statSync(p).isDirectory() ? files(p) : /\.tsx?$/.test(p) && !/\.test\./.test(p) ? [p] : [];
    });

  it('every literal t("…") key exists in English and Arabic', () => {
    const missing: string[] = [];
    for (const file of [...files(join(root, 'app')), ...files(join(root, 'src'))]) {
      for (const m of readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_.]+)'/g)) {
        const key = m[1]!;
        for (const [name, tree] of [['en', en], ['ar', ar]] as const) {
          if (typeof get(tree, key) !== 'string') missing.push(`${name}: ${key} (${file.replace(root, '')})`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('every dynamic key family resolves for all values the app can produce', () => {
    for (const s of ['ACTIVE', 'SUSPENDED', 'REMOVED']) expect(typeof get(en, `status.${s}`)).toBe('string');
    for (const c of ['WEB', 'IOS', 'ANDROID']) expect(typeof get(ar, `security.client${c}`)).toBe('string');
  });
});

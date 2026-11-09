import { describe, expect, it } from 'vitest';
import { ERROR_CODES } from '@pt/domain';
import { ar } from './ar.js';
import { en } from './en.js';

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Record<string, string> {
  return Object.entries(tree).reduce<Record<string, string>>((acc, [key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === 'string' ? { ...acc, [path]: value } : { ...acc, ...flatten(value, path) };
  }, {});
}

/** Names of {placeholders} used by a message, ignoring plural branch contents. */
const placeholders = (message: string): string[] =>
  [...new Set([...message.matchAll(/\{\s*(\w+)\s*(?:,|\})/g)].map((m) => m[1]!))].sort();

const flatEn = flatten(en as unknown as Tree);
const flatAr = flatten(ar as unknown as Tree);

describe('dictionaries', () => {
  it('Arabic has exactly the English keys', () => {
    expect(Object.keys(flatAr).sort()).toEqual(Object.keys(flatEn).sort());
  });

  it('keeps the same {placeholders} in every language', () => {
    for (const key of Object.keys(flatEn)) {
      expect(placeholders(flatAr[key]!), key).toEqual(placeholders(flatEn[key]!));
    }
  });

  it('has no empty messages', () => {
    for (const [key, value] of [...Object.entries(flatEn), ...Object.entries(flatAr)]) {
      expect(value.trim().length, key).toBeGreaterThan(0);
    }
  });

  it('has a translation for every API error code', () => {
    for (const code of ERROR_CODES) {
      expect(flatEn[`errors.${code}`], code).toBeDefined();
      expect(flatAr[`errors.${code}`], code).toBeDefined();
    }
  });

  it('Arabic plurals cover all six CLDR forms', () => {
    const message = flatAr['dashboard.activeSessions']!;
    for (const form of ['zero', 'one', 'two', 'few', 'many', 'other']) {
      expect(message).toContain(`${form} {`);
    }
  });
});

import { navigationFor } from '@pt/domain';
import { describe, expect, it } from 'vitest';
import { en } from '@pt/i18n';
import { ADMIN_NAV } from './admin-navigation';
import { orgNavIcon } from './org-navigation';

describe('navigation', () => {
  it('has an icon and an English label for every item the server can send', () => {
    for (const item of navigationFor(['fitness'])) {
      expect(orgNavIcon(item.key), item.key).toBeTruthy();
      const key = item.labelKey.replace(/^nav\./, '') as keyof typeof en.nav;
      expect(en.nav[key], item.labelKey).toBeTypeOf('string');
    }
  });

  it('unknown module items get a generic icon instead of crashing', () => {
    expect(orgNavIcon('some-future-module-item')).toBeTruthy();
  });

  it('every admin item has a label', () => {
    for (const item of ADMIN_NAV) expect(en.admin.nav[item.key]).toBeTypeOf('string');
  });
});

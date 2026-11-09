import { Image, View } from 'react-native';
import { API_URL } from '@/lib/api';
import { useBrand } from '@/stores/brand';
import { usePrefs } from '@/stores/prefs';
import { AppText } from './kit';
import { radius, useColors } from './theme';

/** The administrator-configured logo, name and tagline, at the top of the sign-in screens. */
export function BrandHeader() {
  const c = useColors();
  const locale = usePrefs((s) => s.locale);
  const { identity, logoUrl } = useBrand((s) => s.config);
  const name = identity.appName[locale];
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }} accessibilityRole="header" accessibilityLabel={name}>
      {logoUrl ? (
        <Image source={{ uri: `${API_URL ?? ''}${logoUrl}` }} style={{ width: 44, height: 44, borderRadius: radius.sm }} resizeMode="contain" accessibilityIgnoresInvertColors />
      ) : (
        <View style={{ width: 44, height: 44, borderRadius: radius.md, backgroundColor: c.accent, alignItems: 'center', justifyContent: 'center' }}>
          <AppText style={{ color: c.accentInk, fontSize: 22, fontWeight: '700' }}>{Array.from(name)[0] ?? ''}</AppText>
        </View>
      )}
      <View style={{ flex: 1 }}>
        <AppText variant="label">{name}</AppText>
        <AppText variant="muted" numberOfLines={2}>{identity.tagline[locale]}</AppText>
      </View>
    </View>
  );
}

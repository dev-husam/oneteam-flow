import { useMutation, useQuery } from '@tanstack/react-query';
import { Pressable, View } from 'react-native';
import { useErrorMessage, useT } from '@/i18n/hooks';
import { api } from '@/lib/api';
import { useBrand } from '@/stores/brand';
import { AppText, Banner, Card, Screen } from '@/ui/kit';
import { radius, useColors } from '@/ui/theme';

/** Profile → Appearance: pick one of the designs the administrator offers, or follow the default. Applies at once. */
export default function Appearance() {
  const t = useT();
  const c = useColors();
  const errorMessage = useErrorMessage();
  const options = useQuery({ queryKey: ['me', 'designs'], queryFn: () => api.me.design.options() });
  const choose = useMutation({
    mutationFn: (key: string | null) => api.me.design.choose(key),
    onSuccess: async (mine) => {
      useBrand.getState().setPersonalDesign(mine.enabled ? mine.design : null);
      await options.refetch();
    },
  });
  const platform = useBrand((s) => s.config.design);
  const selected = options.data?.selectedKey ?? null;
  const listed = options.data ? [null, ...options.data.designs] : [];
  const fallback = options.data?.designs.find((d) => d.key === options.data?.platformDefaultKey) ?? platform;

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <AppText variant="title">{t('appearance.title')}</AppText>
        <AppText variant="muted">{t('appearance.subtitle')}</AppText>
      </View>
      {options.error || choose.error ? <Banner>{errorMessage(options.error ?? choose.error)}</Banner> : null}
      {options.data && (!options.data.enabled || options.data.designs.length === 0) ? <AppText variant="muted">{t('appearance.none')}</AppText> : null}
      {options.data?.enabled
        ? listed.map((d) => {
            const key = d?.key ?? null;
            const on = selected === key;
            const shown = (d ?? fallback).light;
            return (
              <Pressable key={key ?? 'default'} accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={d ? d.name : t('appearance.followDefault')} onPress={() => !on && choose.mutate(key)}>
                <Card style={{ borderColor: on ? c.link : c.line, backgroundColor: on ? c.selection : c.surface }}>
                  <View style={{ flexDirection: 'row', gap: 6 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
                    {[shown.sidebarBackground, shown.actionPrimary, shown.actionSecondary, shown.selectionBackground, shown.backgroundApp].map((color, i) => (
                      <View key={i} style={{ width: 28, height: 28, borderRadius: radius.sm, backgroundColor: color, borderWidth: 1, borderColor: c.line }} />
                    ))}
                  </View>
                  <AppText variant="heading">{d ? d.name : t('appearance.followDefault')}{on ? ` · ${t('appearance.inUse')}` : ''}</AppText>
                  <AppText variant="muted">{d ? d.description : t('appearance.followDefaultHint')}</AppText>
                </Card>
              </Pressable>
            );
          })
        : null}
      <AppText variant="muted">{t('appearance.note')}</AppText>
    </Screen>
  );
}

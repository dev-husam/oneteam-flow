import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View, type PressableProps, type TextInputProps, type TextProps, type ViewProps } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useColors, radius, space } from './theme';

export function Screen({ children, scroll = true, padded = true }: { children: React.ReactNode; scroll?: boolean; padded?: boolean }) {
  const c = useColors();
  const insets = useSafeAreaInsets();
  const body = { paddingHorizontal: padded ? space.lg : 0, paddingBottom: insets.bottom + space.xl, paddingTop: space.lg, gap: space.lg };
  if (!scroll) return <View style={[{ flex: 1, backgroundColor: c.bg }, body]}>{children}</View>;
  return (
    <ScrollView style={{ flex: 1, backgroundColor: c.bg }} contentContainerStyle={body} keyboardShouldPersistTaps="handled" contentInsetAdjustmentBehavior="automatic">
      {children}
    </ScrollView>
  );
}

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'label' | 'error';
export function AppText({ variant = 'body', style, ...props }: TextProps & { variant?: Variant }) {
  const c = useColors();
  const styles = { title: { fontSize: 26, fontWeight: '700', color: c.ink }, heading: { fontSize: 17, fontWeight: '600', color: c.ink }, body: { fontSize: 15, color: c.ink }, muted: { fontSize: 13, color: c.muted }, label: { fontSize: 13, fontWeight: '600', color: c.ink2 }, error: { fontSize: 13, fontWeight: '600', color: c.danger } } as const;
  // textAlign "left" is mirrored to the start edge by React Native when the layout is RTL.
  return <Text {...props} style={[styles[variant], { textAlign: 'left' }, style]} />;
}

export function Button({ title, onPress, variant = 'primary', loading, disabled, ...rest }: Omit<PressableProps, 'children'> & { title: string; variant?: 'primary' | 'secondary' | 'danger'; loading?: boolean }) {
  const c = useColors();
  const bg = variant === 'primary' ? c.accent : variant === 'danger' ? c.dangerSoft : c.surface;
  const fg = variant === 'primary' ? c.accentInk : variant === 'danger' ? c.danger : c.ink;
  const off = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!off, busy: !!loading }}
      onPress={off ? undefined : onPress}
      style={({ pressed }) => [styles.button, { backgroundColor: bg, borderColor: variant === 'secondary' ? c.line : 'transparent', opacity: off ? 0.55 : pressed ? 0.85 : 1 }]}
      {...rest}
    >
      {loading ? <ActivityIndicator color={fg} /> : <Text style={{ color: fg, fontSize: 16, fontWeight: '600' }}>{title}</Text>}
    </Pressable>
  );
}

export function TextField({ label, error, style, ...props }: TextInputProps & { label: string; error?: string }) {
  const c = useColors();
  return (
    <View style={{ gap: space.xs }}>
      <AppText variant="label">{label}</AppText>
      <TextInput
        placeholderTextColor={c.muted}
        accessibilityLabel={label}
        style={[styles.input, { backgroundColor: c.surface, borderColor: error ? c.danger : c.line, color: c.ink, textAlign: 'left' }, style]}
        {...props}
      />
      {error ? <AppText variant="error">{error}</AppText> : null}
    </View>
  );
}

export function Card({ style, ...props }: ViewProps) {
  const c = useColors();
  return <View {...props} style={[styles.card, { backgroundColor: c.surface, borderColor: c.line }, style]} />;
}

export function Banner({ tone = 'danger', children }: { tone?: 'danger' | 'warn' | 'ok'; children: React.ReactNode }) {
  const c = useColors();
  const map = { danger: [c.dangerSoft, c.danger], warn: [c.warnSoft, c.warn], ok: [c.okSoft, c.ok] } as const;
  return (
    <View accessibilityRole="alert" style={[styles.banner, { backgroundColor: map[tone][0] }]}>
      <Text style={{ color: map[tone][1], fontSize: 14, fontWeight: '600', textAlign: 'left' }}>{children}</Text>
    </View>
  );
}

export function Row({ title, subtitle, right, onPress }: { title: string; subtitle?: string; right?: React.ReactNode; onPress?: () => void }) {
  const c = useColors();
  return (
    <Pressable accessibilityRole={onPress ? 'button' : undefined} onPress={onPress} style={({ pressed }) => [styles.row, { borderColor: c.line, backgroundColor: pressed ? c.surface2 : 'transparent' }]}>
      <View style={{ flex: 1, gap: 2 }}>
        <AppText variant="heading">{title}</AppText>
        {subtitle ? <AppText variant="muted">{subtitle}</AppText> : null}
      </View>
      {right}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg },
  input: { minHeight: 48, borderRadius: radius.md, borderWidth: 1, paddingHorizontal: space.md, fontSize: 16 },
  card: { borderRadius: radius.lg, borderWidth: 1, padding: space.lg, gap: space.sm },
  banner: { borderRadius: radius.md, padding: space.md },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.md, paddingHorizontal: space.sm, borderBottomWidth: StyleSheet.hairlineWidth },
});

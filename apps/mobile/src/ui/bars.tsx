import { View } from 'react-native';
import { AppText } from './kit';
import { useColors } from './theme';

/**
 * A compact bar chart for the latest entries (no chart or SVG dependency). Bars share one baseline, scaled
 * between the smallest and largest value so small changes stay visible. The exact values are always printed.
 */
export function Bars({ values, labels, label }: { values: number[]; labels: string[]; label: string }) {
  const c = useColors();
  if (values.length === 0) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 6, height: 120 }}>
      {values.map((v, i) => (
        <View key={`${labels[i]}-${i}`} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-end', gap: 4 }}>
          <View style={{ width: '100%', height: 12 + ((v - min) / span) * 76, borderRadius: 4, backgroundColor: c.accent, opacity: i === values.length - 1 ? 1 : 0.55 }} />
          <AppText variant="muted" style={{ fontSize: 10 }} numberOfLines={1}>{labels[i]}</AppText>
        </View>
      ))}
    </View>
  );
}

export function ProgressBar({ ratio, tone = 'accent', label }: { ratio: number; tone?: 'accent' | 'ok'; label: string }) {
  const c = useColors();
  const pct = Math.round(Math.min(1, Math.max(0, ratio)) * 100);
  return (
    <View accessible accessibilityRole="progressbar" accessibilityLabel={label} accessibilityValue={{ min: 0, max: 100, now: pct }} style={{ height: 8, borderRadius: 4, backgroundColor: c.surface2, overflow: 'hidden' }}>
      <View style={{ width: `${pct}%`, height: '100%', backgroundColor: tone === 'ok' ? c.ok : c.accent }} />
    </View>
  );
}

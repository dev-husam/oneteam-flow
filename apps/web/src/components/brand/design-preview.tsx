'use client';

import { designCss, type DesignDefinition } from '@pt/domain';
import { useTranslations } from 'next-intl';

type Draft = Pick<DesignDefinition, 'light' | 'dark' | 'radius' | 'font'>;

/** A small sample screen drawn with a design's own tokens (set locally, so nothing outside the box changes). */
export function DesignPreview({ design, mode, compact }: { design: Draft; mode: 'light' | 'dark'; compact?: boolean }) {
  const t = useTranslations('adminConfig.designs');
  const css = designCss(design);
  const vars = { ...css[mode], ...css.common } as React.CSSProperties;
  return (
    <div style={{ ...vars, background: 'var(--bg)', color: 'var(--ink)', fontFamily: 'var(--font-sans)', borderRadius: 'var(--r-lg)' }} className="flex overflow-hidden border border-line text-xs" aria-label={t('preview')}>
      <div style={{ background: 'var(--sidebar-bg)', color: 'var(--sidebar-ink)' }} className="w-[28%] shrink-0 space-y-1.5 p-2.5">
        <div className="h-2 w-2/3 rounded-full" style={{ background: 'var(--sidebar-active-ink)', opacity: 0.9 }} />
        <div style={{ background: 'var(--sidebar-active)', color: 'var(--sidebar-active-ink)', borderRadius: 'var(--r-sm)' }} className="relative px-2 py-1">
          <span className="absolute inset-y-1 start-0 w-0.5 rounded-full" style={{ background: 'var(--sidebar-indicator)' }} />
          Overview
        </div>
        <div className="px-2 py-1" style={{ opacity: 0.85 }}>Clients</div>
        {!compact && <div className="px-2 py-1" style={{ color: 'var(--sidebar-muted)' }}>Messages</div>}
      </div>
      <div className="min-w-0 flex-1 space-y-2.5 p-3">
        <div style={{ background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 'var(--r)' }} className="space-y-2 p-2.5">
          <p className="font-semibold">{t('previewCard')}</p>
          <p style={{ color: 'var(--ink-2)' }}>{t('previewBody')}</p>
          <div className="flex flex-wrap items-center gap-2">
            <span style={{ background: 'var(--accent)', color: 'var(--accent-ink)', borderRadius: 'var(--r)' }} className="px-2.5 py-1 font-medium">{t('previewPrimary')}</span>
            <span style={{ background: 'var(--action-2)', color: 'var(--action-2-ink)', borderRadius: 'var(--r)' }} className="px-2.5 py-1 font-medium">{t('previewSecondary')}</span>
            <span style={{ color: 'var(--link)' }} className="font-medium underline">{t('previewLink')}</span>
          </div>
          <div style={{ background: 'var(--track)', borderRadius: 999 }} className="h-1.5"><div style={{ background: 'var(--fill)', width: '62%', borderRadius: 999 }} className="h-1.5" /></div>
          {!compact && (
            <div className="flex h-8 items-end gap-1">
              {[40, 55, 48, 70, 62, 90].map((h, i) => <span key={i} className="w-3" style={{ height: `${h}%`, background: i === 5 ? 'var(--chart-3)' : i % 2 ? 'var(--chart-2)' : 'var(--chart-1)', borderRadius: 2 }} />)}
            </div>
          )}
        </div>
        <div style={{ background: 'var(--selection)', color: 'var(--selection-fg)', border: '1px solid var(--selection-line)', borderRadius: 'var(--r-sm)' }} className="px-2.5 py-1.5">{t('previewSelected')}</div>
        <div className="flex flex-wrap gap-1.5">
          {(['ok', 'warn', 'danger', 'info'] as const).map((tone) => (
            <span key={tone} style={{ background: `var(--${tone}-soft)`, color: `var(--${tone})`, border: `1px solid var(--${tone}-line)`, borderRadius: 999 }} className="px-2 py-0.5 font-medium">
              {t(({ ok: 'previewSuccess', warn: 'previewWarning', danger: 'previewDanger', info: 'previewInfo' } as const)[tone])}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


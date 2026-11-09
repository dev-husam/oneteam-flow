import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '@/lib/cn';

type Tone = 'info' | 'ok' | 'warn' | 'danger';

const TONES: Record<Tone, { box: string; icon: typeof Info }> = {
  info: { box: 'border-info-line bg-info-soft text-ink', icon: Info },
  ok: { box: 'border-ok-line bg-ok-soft text-ink', icon: CheckCircle2 },
  warn: { box: 'border-warn-line bg-warn-soft text-ink', icon: AlertTriangle },
  danger: { box: 'border-danger-line bg-danger-soft text-ink', icon: XCircle },
};

const ICON_COLOR: Record<Tone, string> = { info: 'text-info', ok: 'text-ok', warn: 'text-warn', danger: 'text-danger' };

export function Alert({
  tone = 'info',
  title,
  children,
  className,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  className?: string;
}) {
  const { box, icon: Icon } = TONES[tone];
  return (
    <div
      role={tone === 'danger' || tone === 'warn' ? 'alert' : 'status'}
      className={cn('anim-pop flex gap-3 rounded-md border px-3.5 py-3 text-sm', box, className)}
    >
      <Icon className={cn('mt-0.5 size-4 shrink-0', ICON_COLOR[tone])} aria-hidden />
      <div className="space-y-0.5">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className="text-ink-2">{children}</div>}
      </div>
    </div>
  );
}

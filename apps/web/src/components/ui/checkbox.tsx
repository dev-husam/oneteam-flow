import type { ComponentProps, ReactNode } from 'react';
import { cn } from '@/lib/cn';

export function Checkbox({
  label,
  invalid,
  className,
  ...props
}: Omit<ComponentProps<'input'>, 'type'> & { label: ReactNode; invalid?: boolean }) {
  return (
    <label className={cn('flex cursor-pointer items-start gap-2.5 text-sm text-ink-2', className)}>
      <input
        type="checkbox"
        className={cn(
          'mt-0.5 size-4 shrink-0 cursor-pointer rounded-sm border accent-[var(--accent)]',
          invalid ? 'border-danger' : 'border-line',
        )}
        aria-invalid={invalid || undefined}
        {...props}
      />
      <span>{label}</span>
    </label>
  );
}

import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

const control =
  'w-full rounded-md border bg-surface px-3 text-ink placeholder:text-muted transition-colors duration-[var(--dur-fast)] disabled:cursor-not-allowed disabled:bg-surface-2 disabled:opacity-70';

export interface ControlProps {
  invalid?: boolean;
}

export function Input({ className, invalid, ...props }: ComponentProps<'input'> & ControlProps) {
  return (
    <input
      className={cn(control, 'h-10', invalid ? 'border-danger' : 'border-line hover:border-selection-line', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

export function Select({ className, invalid, children, ...props }: ComponentProps<'select'> & ControlProps) {
  return (
    <select
      className={cn(control, 'h-10 pe-8', invalid ? 'border-danger' : 'border-line hover:border-selection-line', className)}
      aria-invalid={invalid || undefined}
      {...props}
    >
      {children}
    </select>
  );
}

export function Textarea({ className, invalid, ...props }: ComponentProps<'textarea'> & ControlProps) {
  return (
    <textarea
      className={cn(control, 'min-h-20 py-2', invalid ? 'border-danger' : 'border-line hover:border-selection-line', className)}
      aria-invalid={invalid || undefined}
      {...props}
    />
  );
}

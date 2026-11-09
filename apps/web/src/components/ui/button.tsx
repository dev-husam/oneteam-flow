import { cva, type VariantProps } from 'class-variance-authority';
import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';
import { Spinner } from './spinner';

export const buttonVariants = cva(
  'inline-flex select-none items-center justify-center gap-2 rounded-md font-medium whitespace-nowrap transition-colors duration-[var(--dur-fast)] disabled:pointer-events-none disabled:opacity-55',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-accent-ink shadow-sm hover:bg-accent-hover',
        secondary: 'border border-line-strong bg-surface text-ink shadow-sm hover:bg-surface-2',
        navy: 'bg-action-2 text-action-2-ink shadow-sm hover:bg-action-2-hover',
        ghost: 'text-link hover:bg-surface-2',
        danger: 'bg-danger text-danger-soft shadow-sm hover:opacity-90',
        'danger-soft': 'bg-danger-soft text-danger hover:opacity-80',
      },
      size: {
        sm: 'h-8 px-3 text-sm',
        md: 'h-10 px-4',
        lg: 'h-11 px-5 text-base',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ComponentProps<'button'>, VariantProps<typeof buttonVariants> {
  loading?: boolean;
}

export function Button({ className, variant, size, loading, disabled, children, type = 'button', ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {loading && <Spinner />}
      {children}
    </button>
  );
}

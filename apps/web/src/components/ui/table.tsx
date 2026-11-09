import type { ComponentProps } from 'react';
import { cn } from '@/lib/cn';

/** Scrolls horizontally on narrow screens instead of breaking the layout. */
export function Table({ className, ...props }: ComponentProps<'table'>) {
  return (
    <div className="overflow-x-auto">
      <table className={cn('w-full min-w-[34rem] border-collapse text-sm', className)} {...props} />
    </div>
  );
}
export const THead = (p: ComponentProps<'thead'>) => <thead className="border-b border-line text-start text-xs font-medium text-muted" {...p} />;
export const TBody = (p: ComponentProps<'tbody'>) => <tbody className="divide-y divide-line" {...p} />;
export const TR = ({ className, ...p }: ComponentProps<'tr'>) => <tr className={cn('hover:bg-surface-2/60', className)} {...p} />;
export const TH = ({ className, ...p }: ComponentProps<'th'>) => <th scope="col" className={cn('px-4 py-2.5 text-start font-medium', className)} {...p} />;
export const TD = ({ className, ...p }: ComponentProps<'td'>) => <td className={cn('px-4 py-3 align-middle', className)} {...p} />;

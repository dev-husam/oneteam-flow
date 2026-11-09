'use client';

import { useEffect, useState, type ComponentProps } from 'react';
import { Button } from './button';

interface ConfirmButtonProps extends Omit<ComponentProps<typeof Button>, 'onClick'> {
  confirmLabel: string;
  /** Any return value is fine (mutation promises included); it is not awaited by the button. */
  onConfirm: () => unknown;
}

/** Dangerous actions arm first: the first click changes the label, the second one performs the action. */
export function ConfirmButton({ children, confirmLabel, onConfirm, variant = 'danger-soft', ...props }: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (!armed) return;
    const timer = setTimeout(() => setArmed(false), 4000);
    return () => clearTimeout(timer);
  }, [armed]);

  return (
    <Button
      {...props}
      variant={armed ? 'danger' : variant}
      onClick={() => {
        if (!armed) return setArmed(true);
        setArmed(false);
        void onConfirm();
      }}
    >
      {armed ? confirmLabel : children}
    </Button>
  );
}

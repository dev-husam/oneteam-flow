'use client';

import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, type ComponentProps } from 'react';
import { checkPassword, PASSWORD_MIN_LENGTH } from '@pt/domain';
import { cn } from '@/lib/cn';
import { Input } from './input';

type Strength = 'weak' | 'fair' | 'strong';

export function passwordStrength(password: string, email?: string): Strength {
  if (checkPassword(password, email).length > 0) return 'weak';
  return password.length >= PASSWORD_MIN_LENGTH + 4 ? 'strong' : 'fair';
}

const BARS: Record<Strength, { filled: number; color: string }> = {
  weak: { filled: 1, color: 'bg-danger' },
  fair: { filled: 2, color: 'bg-warn' },
  strong: { filled: 3, color: 'bg-ok' },
};

interface PasswordInputProps extends Omit<ComponentProps<typeof Input>, 'type'> {
  /** When set, shows a live strength meter and the unmet rules for this value. */
  strengthOf?: string;
  email?: string;
}

export function PasswordInput({ strengthOf, email, className, ...props }: PasswordInputProps) {
  const t = useTranslations();
  const [visible, setVisible] = useState(false);
  const showMeter = strengthOf !== undefined && strengthOf.length > 0;
  const strength = showMeter ? passwordStrength(strengthOf, email) : null;
  const violations = showMeter ? checkPassword(strengthOf, email) : [];

  return (
    <div className="space-y-2">
      <div className="relative">
        {/* Passwords are always typed left-to-right, even on Arabic pages. */}
        <Input {...props} type={visible ? 'text' : 'password'} dir="ltr" className={cn('pe-11 text-start', className)} />
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          aria-pressed={visible}
          aria-label={visible ? t('common.hide') : t('common.show')}
          className="absolute inset-y-0 end-0 grid w-10 place-items-center text-muted hover:text-ink"
        >
          {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
        </button>
      </div>
      {strength && (
        <div className="space-y-1.5" aria-live="polite">
          <div className="flex items-center gap-2">
            <div className="flex flex-1 gap-1" aria-hidden>
              {[1, 2, 3].map((i) => (
                <span
                  key={i}
                  className={cn('h-1.5 flex-1 rounded-full transition-colors', i <= BARS[strength].filled ? BARS[strength].color : 'bg-surface-3')}
                />
              ))}
            </div>
            <span className="text-xs font-medium text-ink-2">
              {t('auth.strength.label')}: {t(`auth.strength.${strength}`)}
            </span>
          </div>
          {violations.length > 0 && (
            <ul className="space-y-0.5 text-xs text-muted">
              {violations.map((v) => (
                <li key={v}>• {t(`auth.passwordRules.${v}`)}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

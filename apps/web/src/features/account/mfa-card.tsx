'use client';

import { useMutation } from '@tanstack/react-query';
import { Check, Copy, Download, ShieldCheck, ShieldOff } from 'lucide-react';
import QRCode from 'qrcode';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { ErrorAlert } from '@/components/shell/error-alert';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardBody, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog } from '@/components/ui/dialog';
import { Field } from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { useToast } from '@/components/ui/toast';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth/auth-context';

function Qr({ value }: { value: string }) {
  const t = useTranslations('mfa');
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void QRCode.toDataURL(value, { margin: 1, width: 192, color: { dark: '#000000', light: '#ffffff' } }).then((url) => active && setSrc(url));
    return () => {
      active = false;
    };
  }, [value]);
  return src ? <img src={src} alt={t('qrAlt')} width={192} height={192} className="rounded-md border border-line bg-white" /> : <div className="size-48 animate-pulse rounded-md bg-surface-3" />;
}

function RecoveryCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const t = useTranslations('mfa');
  const [copied, setCopied] = useState(false);
  const text = codes.join('\n');
  const copy = async () => {
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([text + '\n'], { type: 'text/plain' }));
    const a = Object.assign(document.createElement('a'), { href: url, download: 'recovery-codes.txt' });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="space-y-4">
      <Alert tone="warn">{t('recoveryWarning')}</Alert>
      <ul className="ltr-isolate grid grid-cols-2 gap-2 rounded-md bg-surface-2 p-4 font-mono text-sm" dir="ltr">
        {codes.map((c) => (
          <li key={c}>{c}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" onClick={copy}>
          {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />} {copied ? t('copied') : t('copy')}
        </Button>
        <Button variant="secondary" size="sm" onClick={download}>
          <Download className="size-4" aria-hidden /> {t('download')}
        </Button>
        <Button size="sm" className="ms-auto" onClick={onDone}>
          {t('savedThem')}
        </Button>
      </div>
    </div>
  );
}

function EnrollDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('mfa');
  const { reloadUser } = useAuth();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);

  const enroll = useMutation({ mutationFn: () => api.me.mfa.enroll() });
  const confirm = useMutation({
    mutationFn: () => api.me.mfa.confirm(code.trim()),
    onSuccess: (r) => setCodes(r.recoveryCodes),
  });
  const { mutate: startEnroll } = enroll;
  useEffect(() => {
    if (open) startEnroll();
  }, [open, startEnroll]);

  const finish = async () => {
    await reloadUser();
    onClose();
  };

  return (
    <Dialog open={open} onClose={codes ? () => void finish() : onClose} title={codes ? t('recoveryTitle') : t('enrollTitle')} description={codes ? undefined : t('enrollBody')}>
      {codes ? (
        <RecoveryCodes codes={codes} onDone={() => void finish()} />
      ) : (
        <div className="space-y-4">
          {enroll.isError && <ErrorAlert error={enroll.error} />}
          {enroll.data && (
            <>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <Qr value={enroll.data.otpauthUri} />
                <div className="min-w-0 space-y-1 text-sm">
                  <p className="text-muted">{t('manualEntry')}</p>
                  <p className="ltr-isolate break-all rounded-md bg-surface-2 px-3 py-2 font-mono text-xs tracking-wider" dir="ltr">
                    {enroll.data.secret.match(/.{1,4}/g)?.join(' ')}
                  </p>
                </div>
              </div>
              {confirm.isError && <ErrorAlert error={confirm.error} />}
              <form
                className="space-y-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  confirm.mutate();
                }}
              >
                <Field label={t('code')} hint={t('confirmHint')}>
                  {(c) => <Input {...c} value={code} onChange={(e) => setCode(e.target.value)} inputMode="numeric" maxLength={6} autoComplete="one-time-code" dir="ltr" className="text-center font-mono text-lg tracking-widest" placeholder="000000" />}
                </Field>
                <Button type="submit" loading={confirm.isPending} disabled={code.trim().length !== 6} className="w-full">
                  {t('confirm')}
                </Button>
              </form>
            </>
          )}
        </div>
      )}
    </Dialog>
  );
}

function DisableDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('mfa');
  const toast = useToast();
  const { reloadUser } = useAuth();
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const disable = useMutation({
    mutationFn: () => api.me.mfa.disable(password, code.trim()),
    onSuccess: async () => {
      await reloadUser();
      toast(t('disabled'));
      onClose();
    },
  });
  return (
    <Dialog open={open} onClose={onClose} title={t('disableTitle')} description={t('disableBody')}>
      <form
        className="space-y-4"
        onSubmit={(e) => {
          e.preventDefault();
          disable.mutate();
        }}
      >
        {disable.isError && <ErrorAlert error={disable.error} />}
        <Field label={t('password')}>{(c) => <PasswordInput {...c} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />}</Field>
        <Field label={t('codeOrRecovery')}>{(c) => <Input {...c} value={code} onChange={(e) => setCode(e.target.value)} autoComplete="one-time-code" dir="ltr" className="font-mono" />}</Field>
        <Button type="submit" variant="danger" loading={disable.isPending} disabled={!password || code.trim().length < 6} className="w-full">
          {t('disable')}
        </Button>
      </form>
    </Dialog>
  );
}

/** Two-factor authentication status and set-up on the Security page. */
export function MfaCard() {
  const t = useTranslations('mfa');
  const { user } = useAuth();
  const [enrolling, setEnrolling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  if (!user) return null;

  return (
    <Card className="anim-rise max-w-3xl" style={{ ['--i' as string]: 0 }}>
      <CardHeader className="flex-row items-center justify-between gap-3">
        <div>
          <CardTitle className="flex items-center gap-2">
            {user.mfaEnabled ? <ShieldCheck className="size-4 text-ok" aria-hidden /> : <ShieldOff className="size-4 text-muted" aria-hidden />}
            {t('title')}
          </CardTitle>
          <p className="text-xs text-muted">{t('subtitle')}</p>
        </div>
        <Badge tone={user.mfaEnabled ? 'ok' : 'neutral'}>{user.mfaEnabled ? t('on') : t('off')}</Badge>
      </CardHeader>
      <CardBody className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-xl text-sm text-muted">{user.mfaEnabled ? t('onBody') : t('offBody')}</p>
        {user.mfaEnabled ? (
          <Button variant="danger-soft" size="sm" onClick={() => setDisabling(true)}>
            {t('disable')}
          </Button>
        ) : (
          <Button size="sm" onClick={() => setEnrolling(true)}>
            {t('enable')}
          </Button>
        )}
      </CardBody>
      <EnrollDialog open={enrolling} onClose={() => setEnrolling(false)} />
      <DisableDialog open={disabling} onClose={() => setDisabling(false)} />
    </Card>
  );
}

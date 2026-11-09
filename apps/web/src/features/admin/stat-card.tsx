import type { ReactNode } from 'react';
import { Card, CardBody } from '@/components/ui/card';

export function StatCard({ label, value, hint, index = 0 }: { label: string; value: ReactNode; hint?: ReactNode; index?: number }) {
  return (
    <Card className="anim-rise" style={{ ['--i' as string]: index }}>
      <CardBody>
        <p className="text-sm text-muted">{label}</p>
        <p className="mt-1 text-3xl font-semibold tabular-nums">{value}</p>
        {hint && <p className="mt-0.5 text-xs text-muted">{hint}</p>}
      </CardBody>
    </Card>
  );
}

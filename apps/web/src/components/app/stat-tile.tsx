import { Card } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** A dashboard number: small uppercase label, the big value, one line of context. */
export function StatTile({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'primary' | 'danger' }) {
  return (
    <Card className="flex flex-col gap-1 px-3.5 py-3">
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={cn('font-mono text-[22px] font-medium tabular-nums', tone === 'primary' && 'text-primary', tone === 'danger' && 'text-destructive')}>{value}</div>
      {sub && <div className="text-xs text-muted-foreground">{sub}</div>}
    </Card>
  );
}

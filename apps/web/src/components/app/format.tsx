import { formatDecimal, formatPHP, formatRate, TERM_BUCKET_LABELS, type TermBucket } from '@ocs/shared';
import { Badge } from '@/components/ui/primitives';
import { cn } from '@/lib/utils';

/** ₱1,234.56 — money strings from the API go straight to the formatter (never through JS numbers). */
export function Peso({ value, className, dp = 2 }: { value: string | null | undefined; className?: string; dp?: number }) {
  if (value === null || value === undefined || value === '') return <span className="text-muted-foreground">—</span>;
  const neg = value.trim().startsWith('-');
  return <span className={cn('num', neg && 'text-destructive', className)}>{formatPHP(value, dp)}</span>;
}

export function Qty({ value, dp = 2, suffix }: { value: string | null | undefined; dp?: number; suffix?: string }) {
  if (value === null || value === undefined) return <span className="text-muted-foreground">—</span>;
  return (
    <span className="num">
      {formatDecimal(value, dp)}
      {suffix ? ` ${suffix}` : ''}
    </span>
  );
}

export function Rate({ value }: { value: string }) {
  return <span className="num">{formatRate(value)}</span>;
}

export const bucketLabel = (b: string | null | undefined) => (b ? (TERM_BUCKET_LABELS[b as TermBucket] ?? b) : '—');

const STATUS_TONES: Record<string, 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'outline'> = {
  COMPUTED: 'success',
  PENDING_COLLECTION: 'outline',
  EXCEPTION: 'danger',
  QUEUED: 'outline',
  COMPUTING: 'primary',
  FAILED: 'danger',
  DRAFT: 'default',
  SUBMITTED: 'warning',
  APPROVED: 'primary',
  LOCKED: 'success',
  UPLOADED: 'outline',
  VALIDATING: 'primary',
  VALIDATED: 'warning',
  COMMITTED: 'success',
  DISCARDED: 'outline',
  OPEN: 'danger',
  RESOLVED: 'success',
  WAIVED: 'outline',
  ACTIVE: 'success',
  INACTIVE: 'outline',
  RESIGNED: 'outline',
};

export function StatusBadge({ status }: { status: string }) {
  return <Badge tone={STATUS_TONES[status] ?? 'default'}>{status.replace(/_/g, ' ')}</Badge>;
}

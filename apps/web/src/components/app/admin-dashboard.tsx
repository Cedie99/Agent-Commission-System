/** The Admin dashboard: commission, runs, exceptions, accounts and activity across the whole system. */
import { Link } from '@tanstack/react-router';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { commissionTeam, formatPHP, isPayeeScoped, type AdminActivityView, type AdminOverviewView, type RunStatus } from '@ocs/shared';
import { Peso, StatusBadge } from '@/components/app/format';
import { StatTile } from '@/components/app/stat-tile';
import { Alert, Badge, Card, CardHeader, CardTitle, PageHeader, Select } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDateTime, fmtRange, monthLabel, plural, recentMonths, runTypeLabel } from '@/lib/utils';

/** Who acts next on a run that isn't locked yet (docs/user-workflow.md). */
const NEXT_STEP: Partial<Record<RunStatus, string>> = {
  QUEUED: 'Calculating…',
  COMPUTING: 'Calculating…',
  FAILED: 'Finance: fix the problem and recompute',
  DRAFT: 'Finance: review and submit',
  SUBMITTED: 'SSD or VP: approve or return',
  APPROVED: 'Finance: lock',
};

/** Exception codes in plain words (docs/commission-rules.md, section 6). */
const EXCEPTION_LABELS: Record<string, string> = {
  UNDEFINED_RATE: 'No rate is set for the channel, pricing type and term',
  MISSING_PRICELIST_PRICE: 'No list price (SRP) for the product on the invoice date',
  UNKNOWN_CHANNEL: "The sales channel isn't EU, DL, DR, TB or RM",
  UNMAPPED_STATED_TERM: "The stated term isn't mapped to a term bucket",
  MISSING_PAYEE: 'No Account Specialist on the line',
  NEGATIVE_QTY: 'Return or credit memo (negative quantity)',
  OVERLAPPING_EFFECTIVE_RATES: 'Two rate versions cover the same date',
  INVALID_INVOICE_TOTAL: 'The invoice total is zero, or its lines disagree',
  ALREADY_PAID: 'Already paid in another run',
  NOT_IMPLEMENTED: 'The rule is not built yet',
};

const TRANSITION_LABELS: Record<string, string> = { SUBMITTED: 'Submitted a run', APPROVED: 'Approved a run', LOCKED: 'Locked a run', DRAFT: 'Returned a run to draft' };
const ACTION_LABELS: Record<string, string> = {
  'run.create': 'Created a run',
  'run.recompute': 'Recalculated a run',
  'import.commit': 'Committed an import',
  'import.discard': 'Discarded an import',
  'exception.resolve': 'Resolved an exception',
  'customer.create': 'Added a customer',
  'customer.update': 'Updated a customer',
  'person.create': 'Added a person',
  'person.update': 'Updated a person',
  'product.create': 'Added a product',
  'product.update': 'Updated a product',
  'rateTable.create': 'Added a rate table',
  'rateTable.newVersion': 'Added a rate table version',
  'rateTable.update': 'Updated a rate table',
  'pricelist.create': 'Added a pricelist',
  'pricelist.newVersion': 'Added a pricelist version',
  'pricelist.update': 'Updated a pricelist',
  'setting.set': 'Changed an engine setting',
};
const activityLabel = (a: AdminActivityView) => (a.action === 'run.transition' ? (TRANSITION_LABELS[a.toStatus ?? ''] ?? 'Changed a run') : (ACTION_LABELS[a.action] ?? a.action));

export function AdminDashboard() {
  const [month, setMonth] = useState<string>();
  const view = useQuery({
    queryKey: ['admin-overview', month ?? 'latest'],
    queryFn: () => api<AdminOverviewView>(`/admin/overview${month ? `?month=${month}` : ''}`),
    placeholderData: keepPreviousData,
  });

  if (view.isLoading) return <div className="text-muted-foreground">Loading…</div>;
  if (view.error) return <Alert>{view.error.message}</Alert>;
  const v = view.data;
  if (!v) return null;

  const c = v.commission;
  const n = v.runs.counts;
  const actionCount = (['QUEUED', 'COMPUTING', 'FAILED', 'DRAFT', 'SUBMITTED', 'APPROVED'] as const).reduce((sum, s) => sum + (n[s] ?? 0), 0);
  const calculating = (n.QUEUED ?? 0) + (n.COMPUTING ?? 0);
  const actionSub =
    [n.DRAFT && `${n.DRAFT} to submit`, n.SUBMITTED && `${n.SUBMITTED} to approve`, n.APPROVED && `${n.APPROVED} to lock`, n.FAILED && `${n.FAILED} failed`, calculating && `${calculating} calculating`]
      .filter(Boolean)
      .join(' · ') || 'every run is locked';
  const active = v.accounts.filter((a) => a.active);
  const teamLogins = active.filter((a) => commissionTeam(a.roles) !== null && isPayeeScoped(a.roles)).length;
  const disabled = v.accounts.length - active.length;
  const months = [...new Set([v.month, ...recentMonths(12)])].sort().reverse();

  return (
    <>
      <PageHeader
        title="Admin dashboard"
        description="Commission, runs, exceptions and accounts across the whole system."
        actions={
          <>
            <label htmlFor="admin-month" className="text-xs text-muted-foreground">
              Month
            </label>
            <Select id="admin-month" value={v.month} onChange={(e) => setMonth(e.target.value)} className="w-40">
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthLabel(m)}
                </option>
              ))}
            </Select>
          </>
        }
      />

      <div className="mb-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile
          label={`Commission approved · ${monthLabel(v.month, false)}`}
          value={formatPHP(c.approved)}
          tone="primary"
          sub={`${plural(c.approvedRuns, 'run')} approved or locked${c.inProgressRuns > 0 ? ` · ${formatPHP(c.inProgress)} still in draft or approval` : ''}`}
        />
        <StatTile label="Runs needing action" value={String(actionCount)} sub={actionSub} />
        <StatTile label="Open exceptions" value={String(v.exceptions.open)} tone={v.exceptions.open > 0 ? 'danger' : undefined} sub={v.exceptions.open > 0 ? 'lines held at ₱0 until fixed' : 'nothing is held'} />
        <StatTile label="Sign-in accounts" value={String(active.length)} sub={`${teamLogins} Sales and RSR team · ${active.length - teamLogins} staff${disabled > 0 ? ` · ${disabled} disabled` : ''}`} />
      </div>

      <div className="grid gap-3 lg:grid-cols-[3fr_2fr]">
        <Card>
          <CardHeader>
            <CardTitle>Runs that need action</CardTitle>
            <Link to="/runs" className="text-xs text-primary hover:underline">
              All runs
            </Link>
          </CardHeader>
          <table className="w-full text-[12.5px]">
            <thead className="bg-muted text-[11px] text-muted-foreground">
              <tr>
                <th className="px-3 py-1.5 text-left font-medium">Run</th>
                <th className="px-3 py-1.5 text-left font-medium">Status</th>
                <th className="px-3 py-1.5 text-left font-medium">Next step</th>
                <th className="px-3 py-1.5 text-right font-medium">Total</th>
              </tr>
            </thead>
            <tbody>
              {v.runs.needingAction.map((r) => (
                <tr key={r.id} className="border-t border-border">
                  <td className="px-3 py-1.5">
                    <Link to="/runs/$runId" params={{ runId: r.id }} className="text-primary hover:underline">
                      {runTypeLabel(r.runType)} · {fmtRange(r.periodStart, r.periodEnd, true)}
                    </Link>
                  </td>
                  <td className="px-3 py-1.5">
                    <StatusBadge status={r.status} />
                  </td>
                  <td className="px-3 py-1.5 text-muted-foreground">{NEXT_STEP[r.status] ?? ''}</td>
                  <td className="px-3 py-1.5 text-right">
                    <Peso value={r.grandTotal} />
                  </td>
                </tr>
              ))}
              {v.runs.needingAction.length === 0 && (
                <tr>
                  <td colSpan={4} className="px-3 py-4 text-center text-muted-foreground">
                    Every run is locked. Nothing to do.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Open exceptions</CardTitle>
            <Link to="/exceptions" className="text-xs text-primary hover:underline">
              Exceptions
            </Link>
          </CardHeader>
          {v.exceptions.byCode.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">No open exceptions.</p>}
          {v.exceptions.byCode.map((e) => (
            <div key={e.code} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
              <div className="min-w-0">
                <div className="font-mono text-[12px] text-destructive">{e.code}</div>
                <div className="text-xs text-muted-foreground">{EXCEPTION_LABELS[e.code] ?? ''}</div>
              </div>
              <span className="font-mono text-[13px] font-medium tabular-nums">{e.count}</span>
            </div>
          ))}
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Sign-in accounts</CardTitle>
            <span className="text-xs text-muted-foreground">{plural(v.accounts.length, 'account')}</span>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-[12.5px]">
              <thead className="bg-muted text-[11px] text-muted-foreground">
                <tr>
                  <th className="px-3 py-1.5 text-left font-medium">Email</th>
                  <th className="px-3 py-1.5 text-left font-medium">Role</th>
                  <th className="px-3 py-1.5 text-left font-medium">Person</th>
                  <th className="px-3 py-1.5 text-left font-medium">Last sign-in</th>
                </tr>
              </thead>
              <tbody>
                {v.accounts.map((a) => {
                  const team = commissionTeam(a.roles);
                  return (
                    <tr key={a.id} className="border-t border-border">
                      <td className="px-3 py-1.5">
                        {a.email}
                        {!a.active && (
                          <Badge tone="outline" className="ml-2">
                            disabled
                          </Badge>
                        )}
                      </td>
                      <td className="px-3 py-1.5">
                        {a.roles.join(', ')}
                        {team && isPayeeScoped(a.roles) && <span className="text-muted-foreground"> · {team}</span>}
                      </td>
                      <td className="px-3 py-1.5 text-muted-foreground">{a.personCode ? `${a.personCode} · ${a.personName}` : '—'}</td>
                      <td className="px-3 py-1.5 text-muted-foreground">{a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : 'never'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
          </CardHeader>
          {v.activity.length === 0 && <p className="px-3 py-4 text-center text-[13px] text-muted-foreground">No activity yet.</p>}
          {v.activity.map((a, i) => (
            <div key={`${a.at}-${i}`} className="flex items-start justify-between gap-3 border-b border-border px-3 py-2 last:border-0">
              <div className="min-w-0">
                <div className="text-[13px] font-medium">
                  {a.entity === 'ComputeRun' && a.entityId ? (
                    <Link to="/runs/$runId" params={{ runId: a.entityId }} className="text-primary hover:underline">
                      {activityLabel(a)}
                    </Link>
                  ) : (
                    activityLabel(a)
                  )}
                </div>
                <div className="text-xs text-muted-foreground">by {a.userEmail ?? 'the system'}</div>
              </div>
              <span className="shrink-0 text-xs text-muted-foreground">{fmtDateTime(a.at)}</span>
            </div>
          ))}
        </Card>
      </div>
    </>
  );
}

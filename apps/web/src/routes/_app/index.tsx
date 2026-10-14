import { createFileRoute, Link } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import type { ComputeRunView } from '@ocs/shared';
import { Peso, StatusBadge } from '@/components/app/format';
import { Card, CardContent, CardHeader, CardTitle, PageHeader, Placeholder } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { can, getSession } from '@/lib/auth';
import { fmtDate } from '@/lib/utils';

export const Route = createFileRoute('/_app/')({ component: Dashboard });

function Dashboard() {
  const runs = useQuery({ queryKey: ['runs'], queryFn: () => api<ComputeRunView[]>('/compute-runs'), enabled: can('runs:read') });
  const latest = runs.data?.slice(0, 5) ?? [];
  return (
    <>
      <PageHeader title="Dashboard" description={`Welcome, ${getSession()?.user.displayName ?? ''}.`} />
      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
        <Placeholder title="Commission this month">KPI card — placeholder</Placeholder>
        <Placeholder title="Pending collection">Aging of uncollected invoices — placeholder</Placeholder>
        <Placeholder title="Open exceptions">Count by code — placeholder</Placeholder>
        <Placeholder title="Runs awaiting approval">Placeholder</Placeholder>
      </div>
      {can('runs:read') && (
        <Card className="mt-3">
          <CardHeader>
            <CardTitle>Latest runs</CardTitle>
            <Link to="/runs" className="text-xs text-primary hover:underline">
              All runs
            </Link>
          </CardHeader>
          <CardContent className="p-0">
            <table className="w-full text-[12.5px]">
              <tbody>
                {latest.map((r) => (
                  <tr key={r.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-1.5">
                      <Link to="/runs/$runId" params={{ runId: r.id }} className="text-primary hover:underline">
                        {r.runType} · {fmtDate(r.periodStart)} – {fmtDate(r.periodEnd)}
                      </Link>
                    </td>
                    <td className="px-3 py-1.5">
                      <StatusBadge status={r.status} />
                    </td>
                    <td className="px-3 py-1.5 text-right">
                      <Peso value={r.totals?.grandTotal ?? null} />
                    </td>
                  </tr>
                ))}
                {latest.length === 0 && (
                  <tr>
                    <td className="px-3 py-3 text-muted-foreground">No runs yet.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      )}
    </>
  );
}

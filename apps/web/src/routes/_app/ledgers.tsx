import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardContent, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';

export const Route = createFileRoute('/_app/ledgers')({ component: LedgersPage });

const TITLES: Record<string, string> = { bond: 'Sales Bond', penalties: 'Penalties', tp: 'TP Arrangements', vouch: 'Vouch Fund' };

function LedgersPage() {
  const list = useQuery({ queryKey: ['ledgers'], queryFn: () => api<{ key: string; model: string; todo: string; implemented: boolean }[]>('/ledgers') });
  return (
    <>
      <PageHeader title="Ledgers" description="Deduction and holding ledgers. Schema placeholders exist; no logic yet." />
      <div className="grid gap-3 md:grid-cols-2">
        {list.data?.map((l) => (
          <Card key={l.key} className="border-dashed">
            <CardContent>
              <div className="mb-1 flex items-center gap-2">
                <span className="text-[13px] font-semibold">{TITLES[l.key] ?? l.key}</span>
                <Badge tone="outline">placeholder</Badge>
              </div>
              <p className="text-muted-foreground">{l.todo}</p>
              <p className="mt-1 font-mono text-[11px] text-muted-foreground">table: {l.model}</p>
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}

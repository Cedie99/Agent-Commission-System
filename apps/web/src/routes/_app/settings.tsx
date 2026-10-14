import { createFileRoute } from '@tanstack/react-router';
import { useQuery } from '@tanstack/react-query';
import { Badge, Card, CardContent, CardHeader, CardTitle, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { fmtDate } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings')({ component: SettingsPage });

interface Setting {
  id: string;
  key: string;
  value: unknown;
  effectiveFrom: string;
  isConfidential: boolean;
  description: string | null;
}
interface Mapping {
  id: string;
  importType: string;
  name: string;
  isDefault: boolean;
  config: { headerRow: number; columns: Record<string, string[]> };
}

function SettingsPage() {
  // Confidential settings (graceDays) are filtered server-side for non-Finance roles.
  const settings = useQuery({ queryKey: ['engine-settings'], queryFn: () => api<Setting[]>('/settings/engine') });
  const mappings = useQuery({ queryKey: ['mappings', 'all'], queryFn: () => api<Mapping[]>('/settings/import-mappings') });

  return (
    <>
      <PageHeader title="Settings" description="Engine settings are effective-dated (each change is a new version). Editing UI: TODO — API: PUT /settings/engine/:key." />
      <div className="grid gap-3 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Engine settings</CardTitle>
          </CardHeader>
          <table className="w-full text-[12.5px]">
            <thead className="text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-1 text-left">Key</th>
                <th className="px-3 py-1 text-left">Value</th>
                <th className="px-3 py-1 text-left">From</th>
              </tr>
            </thead>
            <tbody>
              {settings.data?.map((s) => (
                <tr key={s.id} className="border-t border-border align-top">
                  <td className="px-3 py-1.5">
                    <div className="font-mono">{s.key}</div>
                    {s.isConfidential && <Badge tone="danger">confidential · Finance only</Badge>}
                    <div className="text-[11px] text-muted-foreground">{s.description}</div>
                  </td>
                  <td className="max-w-[320px] break-words px-3 py-1.5 font-mono text-[11.5px]">{JSON.stringify(s.value)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{fmtDate(s.effectiveFrom)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Import column mappings</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {mappings.data?.map((m) => (
              <div key={m.id}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium">{m.importType}</span> · {m.name} {m.isDefault && <Badge tone="primary">default</Badge>}
                  <span className="text-[11px] text-muted-foreground">header row {m.config.headerRow}</span>
                </div>
                <table className="w-full text-[12px]">
                  <tbody>
                    {Object.entries(m.config.columns).map(([field, aliases]) => (
                      <tr key={field} className="border-t border-border">
                        <td className="w-40 px-2 py-0.5 font-mono">{field}</td>
                        <td className="px-2 py-0.5 text-muted-foreground">{aliases.join(' | ')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>
    </>
  );
}

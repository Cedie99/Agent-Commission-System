import { createFileRoute } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { FIELDS_BY_TYPE, type ImportType } from '@ocs/shared';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Alert, Badge, Card, CardContent, CardHeader, CardTitle, Field, Input, PageHeader } from '@/components/ui/primitives';
import { api } from '@/lib/api';
import { can } from '@/lib/auth';
import { fmtDate, todayIso } from '@/lib/utils';

export const Route = createFileRoute('/_app/settings')({ component: SettingsPage });

interface Setting {
  id: string;
  key: string;
  value: unknown;
  effectiveFrom: string;
  isConfidential: boolean;
  description: string | null;
}
interface MappingConfig {
  sheet?: string | number;
  headerRow: number;
  columns: Record<string, string[]>;
  trueValues?: string[];
}
interface Mapping {
  id: string;
  importType: ImportType;
  name: string;
  isDefault: boolean;
  config: MappingConfig;
}

interface SettingForm {
  key: string;
  description: string | null;
  isConfidential: boolean;
  text: string;
  effectiveFrom: string;
}
interface MappingForm {
  id: string | null;
  importType: ImportType;
  name: string;
  isDefault: boolean;
  headerRow: string;
  sheet: string;
  /** field → header names separated by "|" */
  aliases: Record<string, string>;
  base: MappingConfig | null;
}

const textareaClass = 'w-full rounded-md border border-input bg-card px-2.5 py-1.5 font-mono text-[12px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring';

function SettingsPage() {
  const qc = useQueryClient();
  // Confidential settings (graceDays) are filtered server-side for non-Finance roles.
  const settings = useQuery({ queryKey: ['engine-settings'], queryFn: () => api<Setting[]>('/settings/engine') });
  const mappings = useQuery({ queryKey: ['mappings', 'all'], queryFn: () => api<Mapping[]>('/settings/import-mappings') });
  const [setting, setSetting] = useState<SettingForm | null>(null);
  const [settingError, setSettingError] = useState<string | null>(null);
  const [mapping, setMapping] = useState<MappingForm | null>(null);

  // Rows come newest first within each key, so the first row of a key is its current version.
  const latestIds = new Set<string>();
  const seen = new Set<string>();
  for (const s of settings.data ?? []) {
    if (seen.has(s.key)) continue;
    seen.add(s.key);
    latestIds.add(s.id);
  }

  const saveSetting = useMutation({
    mutationFn: (s: SettingForm) => api(`/settings/engine/${s.key}`, { method: 'PUT', json: { value: JSON.parse(s.text) as unknown, effectiveFrom: s.effectiveFrom } }),
    onSuccess: () => {
      setSetting(null);
      void qc.invalidateQueries({ queryKey: ['engine-settings'] });
    },
  });
  const saveMapping = useMutation({
    mutationFn: (m: MappingForm) => {
      const columns = Object.fromEntries(
        Object.entries(m.aliases)
          .map(([field, text]) => [field, text.split('|').map((a) => a.trim()).filter(Boolean)] as const)
          .filter(([, list]) => list.length > 0),
      );
      const { sheet: _sheet, ...base } = m.base ?? { headerRow: 1, columns: {} };
      const sheet = m.sheet.trim();
      const config = { ...base, headerRow: Number.parseInt(m.headerRow, 10) || 1, columns, ...(sheet ? { sheet: /^\d+$/.test(sheet) ? Number.parseInt(sheet, 10) : sheet } : {}) };
      const json = { importType: m.importType, name: m.name, isDefault: m.isDefault, config };
      return m.id ? api(`/settings/import-mappings/${m.id}`, { method: 'PUT', json }) : api('/settings/import-mappings', { method: 'POST', json });
    },
    onSuccess: () => {
      setMapping(null);
      void qc.invalidateQueries({ queryKey: ['mappings'] });
    },
  });

  const openSetting = (s: Setting) => {
    saveSetting.reset();
    setSettingError(null);
    setSetting({ key: s.key, description: s.description, isConfidential: s.isConfidential, text: JSON.stringify(s.value, null, 2), effectiveFrom: todayIso() });
  };
  const submitSetting = () => {
    if (!setting) return;
    try {
      JSON.parse(setting.text);
    } catch {
      setSettingError('The value isn’t valid JSON. Text needs double quotes, e.g. "INVOICE_DATE"; lists look like ["EU", "TB"].');
      return;
    }
    setSettingError(null);
    saveSetting.mutate(setting);
  };
  const openMapping = (m: Mapping | null, importType: ImportType) => {
    saveMapping.reset();
    const fields = FIELDS_BY_TYPE[importType];
    setMapping({
      id: m?.id ?? null,
      importType,
      name: m?.name ?? '',
      isDefault: m?.isDefault ?? false,
      headerRow: String(m?.config.headerRow ?? 1),
      sheet: m?.config.sheet === undefined ? '' : String(m.config.sheet),
      aliases: Object.fromEntries(fields.map((fd) => [fd.field, m ? (m.config.columns[fd.field] ?? []).join(' | ') : fd.required ? fd.label : ''])),
      base: m?.config ?? null,
    });
  };

  return (
    <>
      <PageHeader title="Settings" description="Engine settings are effective-dated: each change is a new version from its effective date." />
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
                <th className="px-3 py-1" />
              </tr>
            </thead>
            <tbody>
              {settings.data?.map((s) => (
                <tr key={s.id} className={`border-t border-border align-top ${latestIds.has(s.id) ? '' : 'text-muted-foreground'}`}>
                  <td className="px-3 py-1.5">
                    <div className="font-mono">{s.key}</div>
                    {s.isConfidential && <Badge tone="danger">confidential · Finance only</Badge>}
                    <div className="text-[11px] text-muted-foreground">{latestIds.has(s.id) ? s.description : 'older version'}</div>
                  </td>
                  <td className="max-w-[320px] break-words px-3 py-1.5 font-mono text-[11.5px]">{JSON.stringify(s.value)}</td>
                  <td className="whitespace-nowrap px-3 py-1.5">{fmtDate(s.effectiveFrom)}</td>
                  <td className="px-3 py-1.5 text-right">
                    {latestIds.has(s.id) && can('settings:confidential') && (
                      <Button variant="outline" size="sm" onClick={() => openSetting(s)}>
                        Change
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Import column mappings</CardTitle>
            {can('settings:read') && (
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => openMapping(null, 'SALES')}>
                  <Plus /> Sales mapping
                </Button>
                <Button variant="outline" size="sm" onClick={() => openMapping(null, 'COLLECTIONS')}>
                  <Plus /> Collections mapping
                </Button>
              </div>
            )}
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {mappings.data?.map((m) => (
              <div key={m.id}>
                <div className="mb-1 flex items-center gap-2">
                  <span className="font-medium">{m.importType}</span> · {m.name} {m.isDefault && <Badge tone="primary">default</Badge>}
                  <span className="text-[11px] text-muted-foreground">header row {m.config.headerRow}</span>
                  {can('settings:read') && (
                    <Button variant="outline" size="sm" className="ml-auto" onClick={() => openMapping(m, m.importType)}>
                      Edit
                    </Button>
                  )}
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

      <Dialog open={!!setting} onOpenChange={(o) => !o && setSetting(null)}>
        <DialogContent title={setting ? `Change ${setting.key}` : ''} description={setting?.description ?? undefined}>
          {setting && (
            <div className="flex flex-col gap-3">
              {setting.isConfidential && <Alert tone="warning">Confidential: never shown to the Sales and RSR teams.</Alert>}
              <Field label="New value (JSON)">
                <textarea rows={Math.min(14, Math.max(3, setting.text.split('\n').length + 1))} className={textareaClass} value={setting.text} onChange={(e) => setSetting({ ...setting, text: e.target.value })} />
              </Field>
              <Field label="Effective from" hint="Runs already calculated keep the settings they were calculated with.">
                <Input type="date" value={setting.effectiveFrom} onChange={(e) => setSetting({ ...setting, effectiveFrom: e.target.value })} />
              </Field>
              {(settingError || saveSetting.error) && <Alert>{settingError ?? saveSetting.error?.message}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setSetting(null)}>
                  Cancel
                </Button>
                <Button onClick={submitSetting} disabled={saveSetting.isPending}>
                  Save new version
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!mapping} onOpenChange={(o) => !o && setMapping(null)}>
        <DialogContent title={mapping ? (mapping.id ? `Edit ${mapping.name}` : `New ${mapping.importType.toLowerCase()} mapping`) : ''} description="Separate alternative ERIC6 header names with |." className="max-w-2xl">
          {mapping && (
            <div className="flex max-h-[70vh] flex-col gap-3 overflow-y-auto pr-1">
              <div className="grid gap-3 sm:grid-cols-3">
                <Field label="Name" className="sm:col-span-3">
                  <Input value={mapping.name} onChange={(e) => setMapping({ ...mapping, name: e.target.value })} />
                </Field>
                <Field label="Header row">
                  <Input type="number" min={1} value={mapping.headerRow} onChange={(e) => setMapping({ ...mapping, headerRow: e.target.value })} />
                </Field>
                <Field label="Sheet" hint="Name or number; blank = first">
                  <Input value={mapping.sheet} onChange={(e) => setMapping({ ...mapping, sheet: e.target.value })} />
                </Field>
                <label className="flex items-end gap-2 pb-2 text-[13px]">
                  <input type="checkbox" checked={mapping.isDefault} onChange={(e) => setMapping({ ...mapping, isDefault: e.target.checked })} /> Default for {mapping.importType.toLowerCase()}
                </label>
              </div>
              <table className="w-full text-[12.5px]">
                <tbody>
                  {FIELDS_BY_TYPE[mapping.importType].map((fd) => (
                    <tr key={fd.field} className="border-t border-border align-top">
                      <td className="w-48 py-1.5 pr-2">
                        <div className="font-medium">
                          {fd.label}
                          {fd.required && <span className="text-destructive"> *</span>}
                        </div>
                        {fd.help && <div className="text-[11px] text-muted-foreground">{fd.help}</div>}
                      </td>
                      <td className="py-1.5">
                        <Input value={mapping.aliases[fd.field] ?? ''} onChange={(e) => setMapping({ ...mapping, aliases: { ...mapping.aliases, [fd.field]: e.target.value } })} placeholder={fd.required ? 'required' : 'optional'} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {saveMapping.error && <Alert>{saveMapping.error.message}</Alert>}
              <div className="flex justify-end gap-2">
                <Button variant="outline" onClick={() => setMapping(null)}>
                  Cancel
                </Button>
                <Button onClick={() => saveMapping.mutate(mapping)} disabled={saveMapping.isPending}>
                  Save
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

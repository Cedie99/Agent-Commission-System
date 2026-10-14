/* eslint-disable @typescript-eslint/no-explicit-any -- loose JSON in a dev script */
/**
 * End-to-end smoke test against a running API (fresh seeded DB recommended: pnpm db:reset).
 *   pnpm --filter @ocs/api smoke
 *
 * 1. log in as finance → upload + commit the sample sales and collections files
 * 2. create an AS_WEEKLY run for 2026-10-05..2026-10-11 and wait for it
 * 3. check computed totals / statuses / explanations
 * 4. submit (finance) → approve (vp) → lock (finance); recompute must then fail
 * 5. log in as as1 → confirm no grace / actualDays / internalNotes leak
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const API = process.env.API_URL ?? 'http://localhost:3000';
const PASSWORD = process.env.SEED_DEFAULT_PASSWORD ?? 'ChangeMe123!';
const SAMPLES = resolve(__dirname, '../../../samples');

let failures = 0;
function check(cond: unknown, msg: string) {
  console.log(`${cond ? '  ✓' : '  ✗'} ${msg}`);
  if (!cond) failures++;
}

async function call<T = any>(token: string | null, method: string, path: string, body?: unknown): Promise<{ status: number; data: T }> {
  const headers: Record<string, string> = {};
  if (token) headers.authorization = `Bearer ${token}`;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${API}${path}`, { method, headers, body: payload });
  const text = await res.text();
  let data: any = text;
  try {
    data = JSON.parse(text);
  } catch {
    /* not json */
  }
  return { status: res.status, data };
}

async function login(email: string) {
  const r = await call(null, 'POST', '/auth/login', { email, password: PASSWORD });
  if (r.status !== 201) throw new Error(`login ${email} failed: ${r.status} ${JSON.stringify(r.data)}`);
  return r.data.accessToken as string;
}

async function waitFor<T>(fn: () => Promise<T>, done: (v: T) => boolean, label: string, timeoutMs = 60_000): Promise<T> {
  const t0 = Date.now();
  for (;;) {
    const v = await fn();
    if (done(v)) return v;
    if (Date.now() - t0 > timeoutMs) throw new Error(`timeout waiting for ${label}`);
    await new Promise((r) => setTimeout(r, 500));
  }
}

async function importFile(token: string, type: 'SALES' | 'COLLECTIONS', file: string) {
  const fd = new FormData();
  fd.append('type', type);
  fd.append('file', new Blob([readFileSync(resolve(SAMPLES, file))]), file);
  const up = await call(token, 'POST', '/imports', fd);
  check(up.status === 201, `upload ${file} → ${up.status}`);
  const batch = await waitFor(() => call(token, 'GET', `/imports/${up.data.id}`), (r) => !['UPLOADED', 'VALIDATING'].includes(r.data.status), `${file} validation`);
  check(batch.data.status === 'VALIDATED', `${file} validated: ${batch.data.validCount} valid, ${batch.data.errorCount} errors, ${batch.data.duplicateCount} dup`);
  const c = await call(token, 'POST', `/imports/${up.data.id}/commit`);
  check(c.status === 201, `${file} committed (${c.data.inserted} rows)`);
}

async function main() {
  console.log(`Smoke test against ${API}`);
  const fin = await login('finance@ocs.local');
  const vp = await login('vp@ocs.local');
  const as1 = await login('as1@ocs.local');

  const tables = await call(fin, 'GET', '/rates/tables');
  check(tables.data.length >= 2 && tables.data.reduce((n: number, t: any) => n + t.entries.length, 0) >= 56, `seeded rate tables loaded (${tables.data.length} tables)`);

  console.log('Imports');
  await importFile(fin, 'SALES', 'sales-template.xlsx');
  await importFile(fin, 'COLLECTIONS', 'collections-template.xlsx');

  console.log('Compute run');
  const created = await call(fin, 'POST', '/compute-runs', { runType: 'AS_WEEKLY', periodStart: '2026-10-05', periodEnd: '2026-10-11' });
  check(created.status === 201, `run created (${created.data.id})`);
  const run = await waitFor(() => call(fin, 'GET', `/compute-runs/${created.data.id}`), (r) => ['DRAFT', 'FAILED'].includes(r.data.status), 'run compute');
  check(run.data.status === 'DRAFT', `run computed → ${run.data.status} ${run.data.error ?? ''}`);
  const t = run.data.totals;
  console.log('   totals:', JSON.stringify({ computed: t.computed, pending: t.pending, exceptions: t.exceptions, grandTotal: t.grandTotal, byType: t.byType }));
  check(t.grandTotal === '14600.00', `grand total ₱14,600.00 (got ${t.grandTotal})`);
  check(t.byType.VOLUME === '12600.00' && t.byType.PRICE === '2000.00', 'volume ₱12,600.00 + price ₱2,000.00');
  check(t.computed === 8 && t.pending === 3 && t.exceptions === 2, '8 computed, 3 pending, 2 exceptions');

  const res = await call(fin, 'GET', `/compute-runs/${created.data.id}/results?pageSize=100`);
  const line = (inv: string, n = 1) => res.data.items.find((r: any) => r.invoiceNo === inv && r.lineNo === n);
  check(line('SI-1001')?.components.find((c: any) => c.type === 'VOLUME')?.explanation === '900.00 L × ₱3.50/L = ₱3,150.00 (EU, Standard, 30 days)', 'SI-1001#1 volume explanation');
  check(line('SI-1001')?.components.find((c: any) => c.type === 'PRICE')?.explanation === 'Overprice ₱50.00 × 50.00 qty × 80% = ₱2,000.00 (EU, 30 days)', 'SI-1001#1 price explanation');
  check(line('SI-1008')?.termBucket === 'D30' && line('SI-1009')?.termBucket === 'D60', 'grace edge: day 42 → D30, day 43 → D60');
  check(line('SI-1005')?.exceptions[0]?.code === 'UNDEFINED_RATE', 'SI-1005 Standard 120+ → UNDEFINED_RATE');
  check(line('SI-1010')?.exceptions[0]?.code === 'MISSING_PRICELIST_PRICE', 'SI-1010 → MISSING_PRICELIST_PRICE');
  check(line('SI-1007')?.recognitionDate === '2026-10-10', 'SI-1007 recognized on last check (2026-10-10)');
  check(['SI-1006', 'SI-1011', 'SI-1012'].every((i) => line(i)?.status === 'PENDING_COLLECTION'), 'partial / PDC / bounced → pending');
  check(line('SI-1001')?.actualDays === 35, 'finance sees actualDays');

  console.log('Approval flow');
  check((await call(as1, 'GET', `/compute-runs/${created.data.id}`)).status === 403, 'AS cannot see a DRAFT run');
  check((await call(fin, 'POST', `/compute-runs/${created.data.id}/transition`, { to: 'SUBMITTED' })).status === 201, 'finance submits');
  check((await call(fin, 'POST', `/compute-runs/${created.data.id}/transition`, { to: 'APPROVED' })).status === 403, 'finance cannot approve');
  check((await call(vp, 'POST', `/compute-runs/${created.data.id}/transition`, { to: 'APPROVED' })).status === 201, 'vp approves');
  check((await call(fin, 'POST', `/compute-runs/${created.data.id}/transition`, { to: 'LOCKED' })).status === 201, 'finance locks');
  check((await call(fin, 'POST', `/compute-runs/${created.data.id}/recompute`)).status === 409, 'recompute of a LOCKED run → 409');
  check((await call(fin, 'POST', `/compute-runs/${created.data.id}/transition`, { to: 'DRAFT' })).status === 409, 'LOCKED → DRAFT → 409');

  console.log('Confidentiality (as1@ocs.local)');
  const asRun = await call(as1, 'GET', `/compute-runs/${created.data.id}`);
  const asRes = await call(as1, 'GET', `/compute-runs/${created.data.id}/results?pageSize=100`);
  const asSettings = await call(as1, 'GET', '/settings/engine');
  const blob = JSON.stringify([asRun.data, asRes.data]);
  check(asRun.status === 200 && asRes.status === 200, 'AS can read the approved run');
  check(!/grace/i.test(blob), 'no "grace" anywhere in AS responses');
  check(!/actualDays|internalNotes|rulesetSnapshot/.test(blob), 'no actualDays / internalNotes / rulesetSnapshot');
  check(asRes.data.items.every((r: any) => r.components.every((c: any) => c.payeeName.includes('One'))), 'AS sees only their own lines');
  check(asRun.data.totals.grandTotal === '11400.00', `AS sees own total ₱11,400.00 (got ${asRun.data.totals.grandTotal})`);
  check(asSettings.status === 403, 'AS cannot read engine settings');
  check((await call(as1, 'GET', '/rates/resolve?asOf=2026-10-11')).status === 403, 'AS cannot resolve the RuleSet');

  console.log(failures ? `\n${failures} check(s) FAILED` : '\nAll smoke checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

# Sample ERIC6-style files

**These are not real ERIC6 exports.** We don't have the real exports yet. The column headers here match the
**default import mapping** (Settings → Import column mappings). When the real ERIC6 reports arrive, change the
mapping, not the code.

Regenerate with `pnpm samples`. The codes match the dev seed (`pnpm db:seed`).

## Expected result: AS_WEEKLY run for 2026-10-05 → 2026-10-11 (developer-computed)

| Invoice | What it shows | Status | Volume | Price |
|---|---|---|---|---|
| SI-1001 #1 | EU, 30d, two checks, last cleared 10-06 (35 d), sold above SRP | COMPUTED · 30 days · Std | 900 L × 3.50 = 3,150.00 | 50 × 50 × 80% = 2,000.00 |
| SI-1001 #2 | Same invoice, sold below SRP | COMPUTED · 30 days · Non-Std | 400 L × 1.50 = 600.00 | — |
| SI-1002 | DL, 60d, collected day 67 | COMPUTED · 60 days · Std | 1,000 L × 3.00 = 3,000.00 | — |
| SI-1003 | DR, stated 30d, collected day 99 (AS-002) | COMPUTED · 90 days · Std | 2,000 L × 1.25 = 2,500.00 | — |
| SI-1004 | RM, COD (always Non-Std) | COMPUTED · COD · Non-Std | 2,000 L × 1.00 = 2,000.00 | — |
| SI-1005 | EU Std 120d, collected day 161 | **EXCEPTION** `UNDEFINED_RATE` | — | — |
| SI-1006 | Half collected | PENDING_COLLECTION | — | — |
| SI-1007 | TB, last check 10-10 (39 d) (AS-002) | COMPUTED · 30 days · Std | 400 L × 1.75 = 700.00 | — (EU only) |
| SI-1008 | Stated 30d, collected day **42** | COMPUTED · 30 days | 100 L × 3.50 = 350.00 | — |
| SI-1009 | Stated 30d, collected day **43** | COMPUTED · 60 days | 100 L × 3.00 = 300.00 | — |
| SI-1010 | Product has no SRP | **EXCEPTION** `MISSING_PRICELIST_PRICE` | — | — |
| SI-1011 | PDC not cleared | PENDING_COLLECTION | — | — |
| SI-1012 | Bounced check | PENDING_COLLECTION | — | — |

**Totals:** AS-001 ₱11,400.00 · AS-002 ₱3,200.00 · **₱14,600.00** (Volume ₱12,600.00 + Price ₱2,000.00).
`pnpm --filter @ocs/api smoke` checks these against a running API.

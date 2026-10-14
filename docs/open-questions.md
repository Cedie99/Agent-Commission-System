# Open questions

Nothing here has been answered. Each item says what the system does **today**, and where to change that once
Finance/Sales answer, without changing code wherever possible.

| # | Question | Current behaviour | Where it's configured |
|---|---|---|---|
| 1 | **Price Commission: EU only, or EU and TB?** | EU only | Engine setting `priceCommissionChannels` (add `"TB"`) |
| 2 | **Price Commission cutoff:** "120 days = 20%" vs "beyond 120 = forfeited". Is day 121–132 (inside grace) 20% or forfeited? | The 120-day bucket (which includes grace) pays 20%. Beyond 120 is FORFEIT (₱0 with explanation) | Price rate table, D120 / D120_PLUS entries (`kind`: RATE or FORFEIT) |
| 3 | **Standard Volume rate beyond 120 days** | Undefined, so those lines are `UNDEFINED_RATE` exceptions | Volume rate table: add Standard D120_PLUS entries (rate or FORFEIT) |
| 4 | **AMSI shares:** 10% of the commission or 10% of the AMSI? Are SM, NSM and VP shares on top of the SS 50%? | Not implemented | — (SP_MONTHLY run type is a stub) |
| 5 | **Sales Bond:** what does "half (5%)" mean, and what is the 105% rule? | Not implemented. `SalesBond` table placeholder only | — |
| 6 | **Penalty recovery tier ranges** | Not implemented. `Penalty` table placeholder only | — |
| 7 | **Day count from the invoice date or the delivery date?** | Invoice date | Engine (`compute-line.ts`). Would need a delivery-date column in the sales import |
| 8 | **How are "standard discounting conditions" recorded?** | A per-line Y/N flag `Approved Std Discount` in the sales export | Import mapping field `approvedStandardDiscount` |
| 9 | **AS weekly cutoff:** Mon–Sun? | Run periods are free-form. The UI defaults to the last Mon–Sun | Run creation dialog |
| 10 | **Returns and credit memos** | Negative qty/liters raise a `NEGATIVE_QTY` exception (line held) | Engine. Needs a rule (net against the original invoice? claw back?) |
| 11 | **Definition of C&I, and the RSR minimum volume** | Not implemented | — |

## Raised during design (also unanswered)

| # | Question | Current behaviour | Where |
|---|---|---|---|
| 12 | **"Fully collected" basis:** are ERIC6 invoice totals and collections VAT-inclusive? Is there a peso tolerance for short payments (withholding tax, bank charges)? | Uses the exported `Invoice Total` if mapped, otherwise Σ qty × unit price. Tolerance ₱0.00 | Setting `collectionTolerance`, import field `invoiceTotal` |
| 13 | **Which date selects the rate version** when rates change: invoice date or collection (recognition) date? | Invoice date | Setting `rateDateBasis` (`INVOICE_DATE` / `RECOGNITION_DATE`) |
| 14 | **Non-standard stated terms** (e.g. 7, 15, 45 days): which bucket? | `UNMAPPED_STATED_TERM` exception | Setting `statedTermMap` (e.g. `{"45": "D60"}`) |
| 15 | **Which account types earn AS commission?** (e.g. do IN_HOUSE or SS_GENERATED accounts pay the AS?) | All three | Setting `asEligibleAccountTypes` |
| 16 | **Can agents see actual days-to-collect?** Showing "42 days" next to "30-day bucket" reveals the grace period | Hidden from everyone except Finance/Admin | `CONFIDENTIAL_KEYS` in `apps/api/src/common/redaction.ts` |
| 17 | **Missed recognitions:** if a line was recognized in a week that was never run, is it paid in a later run? | No. Only lines recognized inside the run's period are paid. Run the missed period | Engine `computeRun` |
| 18 | **Who approves which run?** (SSD, VP, both?) | SSD, VP or Admin can approve; Finance submits and locks; the submitter can't approve | `PERMISSIONS` in `packages/shared/src/roles.ts` |
| 19 | **Payee visibility for SM/NSM:** see the whole team's lines? | Payee roles see only their own lines | `isPayeeScoped` in `apps/api/src/compute-runs/transitions.ts` |

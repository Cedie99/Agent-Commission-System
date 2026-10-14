# Commission rules (first pass)

This document states the rules the engine (`packages/engine`) implements today, in plain language.
Anything not settled is listed in [open-questions.md](open-questions.md) and kept configurable.
**Nothing on this page is a guess.** If a rule is undefined, the line becomes an **EXCEPTION** and pays ₱0 until Finance resolves it.

> **CONFIDENTIAL.** This page states the grace period. Do not share it with agents. The app never shows the
> grace period, or the actual day counts that would reveal it, to any role except Finance and Admin.

## Who is paid

| Component | Paid to | Run |
|---|---|---|
| Volume Commission | Account Specialist (AS) assigned to the line | AS weekly |
| Price Commission | Account Specialist (AS) assigned to the line | AS weekly |
| SASI, AMSI, NOVI, Chemical, RSR incentives | Sales Personnel (SS, RSR, SM, RSRM, NSM, VP-S&M) | SP monthly. **Not built yet** |

The AS is taken from the customer master when the invoice is imported. An `AS Code` column in the export overrides it.
That value is then **frozen on the invoice line**, so later changes to the customer master don't change past results.

## 1. When commission is earned

- Commission is earned only when the **whole invoice** is collected, not line by line.
- Only **cleared** payments count. Post-dated checks that haven't cleared and bounced checks don't.
- The **recognition date** is the cleared date of the payment that completes full collection, i.e. the last check or cash payment. Payments after that don't move the date.
- An invoice that isn't fully collected is `PENDING_COLLECTION` and pays nothing yet.
- The invoice total is the exported `Invoice Total` if present. Otherwise it is the sum of qty × unit price over the invoice's lines.
  See open question 12 (VAT and tolerance).

## 2. Term bucket

Buckets are COD (0), 30, 60, 90, 120 and "beyond 120".

1. **Actual days** = recognition date − invoice date, in calendar days.
2. If actual days ≤ stated term + **grace (12 days)**, use the **stated** term's bucket.
3. Otherwise, use the smallest bucket where actual days ≤ bucket days + grace. If none fits, use **beyond 120**.

| Stated term | Collected on day | Bucket |
|---|---|---|
| 30 | 42 | 30 days |
| 30 | 43 | 60 days |
| COD | 12 / 13 | COD / 30 days |
| 120 | 132 / 133 | 120 days / beyond 120 |

The grace days, the bucket limits and the mapping from stated ERIC6 terms to buckets are settings. A stated term
that isn't in the mapping (e.g. 45 days) raises the exception `UNMAPPED_STATED_TERM` (open question 14).

## 3. Pricing type

- **Standard**: sold at or above the pricelist price (SRP), or below it with an **approved standard discount**.
- **Non-Standard**: sold below SRP without an approved discount.
- **RM (Raw Material) is always Non-Standard.** It doesn't need an SRP.
- A missing SRP on any other channel raises the exception `MISSING_PRICELIST_PRICE`.
- The SRP comes from the export if it is there. Otherwise it is looked up in the pricelist effective on the invoice date.

## 4. Volume Commission (₱ per liter)

Amount = liters × rate, rounded to centavos (half-up). Example: `900.00 L × ₱3.50/L = ₱3,150.00 (EU, Standard, 30 days)`.

| Term | Standard EU/DL | Standard DR/TB | Non-Std EU/DL | Non-Std DR/TB/RM |
|---|---|---|---|---|
| COD | 4.00 | 2.00 | 2.00 | 1.00 |
| 30 | 3.50 | 1.75 | 1.50 | 0.75 |
| 60 | 3.00 | 1.50 | 1.00 | 0.50 |
| 90 | 2.50 | 1.25 | 0.50 | 0.25 |
| 120 | 2.00 | 1.00 | 0.25 | 0.125 |
| beyond 120 | **undefined → EXCEPTION** | **undefined → EXCEPTION** | 0.25 | 0.125 |

The rates are stored per channel, not per channel group, so regrouping is a data change.

## 5. Price Commission

- **Applies to EU only** (`priceCommissionChannels` setting; adding `TB` is the flag in open question 1).
- Only when the line sold **above** SRP: overprice = unit price − SRP.
- Amount = overprice × qty × rate. Example: `Overprice ₱50.00 × 50.00 qty × 80% = ₱2,000.00 (EU, 30 days)`.

| Term | COD | 30 | 60 | 90 | 120 | beyond 120 |
|---|---|---|---|---|---|---|
| Rate | 80% | 80% | 60% | 40% | 20% | **forfeited** (₱0, shown with explanation) |

## 6. Exceptions: held, never guessed

| Code | Meaning |
|---|---|
| `UNDEFINED_RATE` | No rate is defined for that channel, pricing type, bucket and date (e.g. Standard beyond 120) |
| `MISSING_PRICELIST_PRICE` | No SRP for the product on the invoice date |
| `UNKNOWN_CHANNEL` | The channel isn't EU/DL/DR/TB/RM |
| `UNMAPPED_STATED_TERM` | The stated term isn't mapped to a bucket |
| `MISSING_PAYEE` | No AS on the line |
| `NEGATIVE_QTY` | Return or credit memo (open question 10) |
| `OVERLAPPING_EFFECTIVE_RATES` | Two rate versions cover the same date |
| `INVALID_INVOICE_TOTAL` | The invoice total is ≤ 0, or the lines disagree on it |

A line with any exception pays **nothing**, even if one of its components could have been computed.
Fix the data, then recompute the draft run.

## 7. Rates are effective-dated

- Each rate table, pricelist and engine setting has an effective-from date (and optionally an effective-to date).
- Rates are chosen by **invoice date** by default (`rateDateBasis`, open question 13).
- Each run stores the full RuleSet it used (`rulesetSnapshot`) and its hash, so a past period always recomputes the same way.
- A rate version used by an approved or locked run can't be edited. Create a new version instead.

## 8. Runs and approval

- A run includes:
  - every line **recognized** within [period start, period end], computed or held as an exception
  - every line invoiced on or before the period end that is still pending collection
- Payments cleared after the period end are ignored.
- Lines already paid in an approved or locked run of the same type are skipped.
- Workflow is **Draft → Submitted → Approved → Locked**.
  - Submitted can be returned to Draft.
  - The person who submits can't approve.
  - Locked is immutable, enforced both in the API and by a database trigger.

## 9. Money

All money, liters and rates are decimals (`NUMERIC(18,4)` in the database, `decimal.js` in code), never floating point.
Each component is rounded to centavos half-up, and totals are sums of the rounded components, so statements foot.

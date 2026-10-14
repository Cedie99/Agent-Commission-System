# Golden cases

Put Finance's hand-computed cases here, in `cases/`. Every `*.json` and `*.csv` file is picked up by
`golden.test.ts` and runs as part of `pnpm test`. The cases use the default seeded RuleSet
(`test/fixtures.ts`). A JSON case can override config, for example `graceDays` or `priceCommissionChannels`.

When a case fails, either the engine is wrong or the hand computation is. Fix whichever one it is.
Don't loosen the case to make it pass.

## CSV (easiest for Finance)

Each row is one invoice line. Each line is its own invoice, paid in a single payment.

| column | meaning |
|---|---|
| invoiceNo, lineNo, invoiceDate | `YYYY-MM-DD` |
| channel | EU / DL / DR / TB / RM |
| accountType | optional, defaults to AS_GENERATED |
| statedTermDays | 0, 30, 60, 90, 120 |
| liters, qty, unitPrice, pricelistPrice | plain numbers, no ₱ or commas. `pricelistPrice` blank = missing SRP |
| approvedStandardDiscount | Y/N |
| collectedAmount | blank = the full line amount (qty × unitPrice) |
| clearedDate | blank = not collected |
| expectedStatus | COMPUTED / PENDING_COLLECTION / EXCEPTION |
| expectedBucket, expectedPricingType | optional |
| expectedVolume, expectedPrice | `3500.00`. `0.00` means no component |
| expectedExceptions | optional, `;`-separated codes |

Lines that start with `#` are comments.

## JSON (multi-line invoices, several payments, config overrides)

See `cases/001-basic-week.json`. Top-level keys:

- `name`, `description`
- `configOverrides` (optional)
- `run` (`runType`, `periodStart`, `periodEnd`; optional)
- `lines[]`, `collections[]`
- `expected[]`
- `expectedTotal` (optional)

Money values are strings.

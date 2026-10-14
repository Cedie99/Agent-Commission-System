# CLAUDE.md: Agent Commission Computation System (Oracle Petroleum)

Internal web app. It imports ERIC6 (Jupiter Systems) sales and collections exports (Excel/CSV, no API),
computes commissions for Account Specialists and Sales Personnel, routes runs through approval, and
(later) produces statements and a payout register. Currency is PHP (₱), volumes are liters.

Business rules: `docs/commission-rules.md`. Unanswered questions: `docs/open-questions.md`. **Never invent
answers to open questions.** Keep them configurable and raise an EXCEPTION when a rule is undefined.

## Layout (pnpm monorepo)

```
packages/shared   enums, money helpers (D, formatPHP), Zod DTOs, roles/permissions. Used by api, web and engine
packages/engine   PURE commission engine + Vitest (test/golden/ = Finance hand-computed cases)
apps/api          NestJS + Prisma + PostgreSQL + pg-boss. prisma/ (schema, migrations, seed), scripts/ (samples, smoke)
apps/web          React + Vite + TanStack Router/Query/Table + Tailwind v4 + hand-rolled shadcn-style ui/
docs/             rules and open questions
samples/          sample ERIC6-style import files matching the default column mapping
```

## Non-negotiable rules

1. **Money, liters and rates are `Decimal`, never JS numbers.**
   - Construct with `D('3.50')` from `@ocs/shared` (numbers are a type error *and* a runtime error).
   - Spreadsheet cells go through `D.fromExcel()` only.
   - DB columns are `Decimal @db.Decimal(18,4)`. Wire format (JSON) is a string. Prisma ↔ engine conversion is in `apps/api/src/common/convert.ts`.
   - Round with `roundMoney()` (2 dp, half-up) at the component level. Totals are sums of rounded components.
   - ESLint bans `parseFloat`, `.toNumber()`, `Math.round`, `D(1.5)`, `new Decimal(1.5)` and `isPositive()` (it is TRUE for zero in decimal.js; use `gt(0)`).
2. **The engine is pure.**
   - `packages/engine/src` must not import Prisma, Nest, pg, zod, node:* or anything with IO (ESLint enforces this).
   - The API resolves a `RuleSet` (`apps/api/src/rates/ruleset.resolver.ts`) and passes it in with the data. Results come out.
   - Every component carries a human-readable `explanation` that traces the peso.
   - Undefined rate, missing SRP or unknown channel → `EXCEPTION`, never a guessed number.
3. **The grace period is confidential.**
   - It must never reach an agent-facing response or screen. That includes `actualDays`, which reveals it.
   - `explanation` text must not mention grace or actual days. Put that reasoning in `internalNotes`.
   - `RedactionInterceptor` (`apps/api/src/common/redaction.ts`) strips `graceDays`, `actualDays`, `internalNotes`, `rulesetSnapshot` and `isConfidential` settings for every role outside `CONFIDENTIAL_VIEWER_ROLES` (ADMIN, FINANCE). It is a whitelist.
   - Tests cover this: `apps/api/test/redaction.test.ts`, the engine confidentiality tests, and the smoke test.
4. **Rates are effective-dated, and runs snapshot their RuleSet.**
   - Never edit a rate version used by an APPROVED/LOCKED run. Create a new version.
   - LOCKED runs are immutable, enforced in the API and by DB triggers (migration `locked_run_immutability`). `AuditLog` is append-only.
5. **Every write is audited.**
   - `AuditInterceptor` logs all POST/PUT/PATCH/DELETE.
   - Services also call `AuditService.log()` with before/after for domain events.

## Commands

```bash
pnpm install
pnpm db:migrate          # prisma migrate dev (apps/api/.env → DATABASE_URL)
pnpm db:seed             # roles, users, sample master data, rate tables, engine settings, import mappings
pnpm db:reset            # drop + migrate + seed (dev only)
pnpm dev                 # builds packages, then runs tsup --watch, Nest (:3000) and Vite (:5173) in parallel
pnpm test                # shared + engine + api unit tests (Vitest)
pnpm lint                # ESLint incl. money and engine-purity rules
pnpm samples             # regenerate /samples
pnpm --filter @ocs/api smoke   # end-to-end check against a running API on a freshly reset DB
```

- Engine only: `pnpm --filter @ocs/engine test` (or `test:watch`).
- Golden cases: drop JSON/CSV into `packages/engine/test/golden/cases/` (format in its README).

Dev logins (password `SEED_DEFAULT_PASSWORD`, default `ChangeMe123!`): `admin@ocs.local`, `finance@ocs.local`,
`ssd@ocs.local`, `vp@ocs.local`, `as1@ocs.local` (AS-001).

## Conventions

- Shared enums live in `packages/shared/src/enums.ts` **and** `apps/api/prisma/schema.prisma`. `apps/api/test/enum-sync.test.ts` fails if they drift.
- Roles and permissions: `PERMISSIONS` in `packages/shared/src/roles.ts`, used by `@RequirePermission()` in the API and by `can()` in the web nav.
- Calendar dates are `'YYYY-MM-DD'` strings in the engine and on the wire, and `@db.Date` in the DB. Don't do timezone math.
- After changing `packages/shared` or `packages/engine`, rebuild (`pnpm build:packages`), or keep `pnpm dev` running (tsup watch). The API consumes `dist/`.
- Long work (import validation, run computation) runs in pg-boss jobs (`apps/api/src/jobs`). The UI polls status.
- When adding an engine rule: add tests first (including grace/edge cases), keep explanations agent-safe, and bump `ENGINE_VERSION`.

## Not built yet (stubs/placeholders)

- SP_MONTHLY components (SASI, AMSI, NOVI, Chemical, RSR)
- Statements and payout register
- Ledgers (SalesBond, Penalty, TPArrangement, VouchFund: tables only)
- Microsoft Entra SSO (TODOs in `common/auth.ts` and `auth.module.ts`)
- Edit UIs for People, engine settings and import mappings (the APIs exist)
- SM/NSM team visibility

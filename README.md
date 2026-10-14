# Agent Commission Computation System

Oracle Petroleum's internal app for computing Account Specialist and Sales Personnel commissions from ERIC6 exports.

- **Stack:** pnpm monorepo
  - `apps/web`: React, Vite, TanStack Router/Query/Table, Tailwind
  - `apps/api`: NestJS, Prisma, PostgreSQL, pg-boss
  - `packages/engine`: pure TypeScript engine, Vitest
  - `packages/shared`: types, Zod and money helpers
- **Rules:** [docs/commission-rules.md](docs/commission-rules.md)
- **Open questions:** [docs/open-questions.md](docs/open-questions.md)
- **Notes for developers and AI assistants:** [CLAUDE.md](CLAUDE.md)
- **Git workflow for the team (push, pull, branches, PRs):** [CONTRIBUTING.md](CONTRIBUTING.md)
- **Step-by-step user guide:** [docs/user-workflow.md](docs/user-workflow.md)

## Prerequisites

- Node.js ≥ 20 and pnpm 9 (`npm i -g pnpm@9` or `corepack enable`)
- PostgreSQL 15+ running locally. No Docker is used.
  On Windows: `winget install PostgreSQL.PostgreSQL.17`.

## Setup

```bash
# 1. Database (once). Run as the postgres superuser:
psql -U postgres -h localhost -c "CREATE ROLE commission LOGIN PASSWORD 'commission' CREATEDB;"
psql -U postgres -h localhost -c "CREATE DATABASE commission_dev OWNER commission;"

# 2. Config
cp .env.example apps/api/.env        # adjust DATABASE_URL / JWT_SECRET if needed

# 3. Install, migrate, seed
pnpm install
pnpm db:migrate
pnpm db:seed

# 4. Run (API http://localhost:3000, web http://localhost:5173)
pnpm dev
```

Sign in at http://localhost:5173 as `finance@ocs.local` with password `ChangeMe123!` (from `SEED_DEFAULT_PASSWORD`).
The other dev users are `admin@`, `ssd@`, `vp@` and `as1@ocs.local`.

## Try it

1. **Imports**: upload `samples/sales-template.xlsx`, check the preview, then **Commit**. Do the same with `samples/collections-template.xlsx`.
2. **Compute Runs**: click **New run**, choose AS weekly, 2026-10-05 → 2026-10-11, then **Create & compute**.
3. The results grid shows Volume and Price commission per line. Click a line to see each component's explanation.
   Expected: ₱14,600.00 total (see [samples/README.md](samples/README.md)).
4. **Submit** (finance) → **Approve** (sign in as vp) → **Lock** (finance). A locked run can't be changed.
5. Sign in as `as1@ocs.local`: you see only your own lines, and no confidential details.

## Commands

| Command | What it does |
|---|---|
| `pnpm dev` | Build packages, then watch everything (tsup, Nest, Vite) |
| `pnpm test` | Unit tests: shared, engine (incl. golden cases), api |
| `pnpm lint` | ESLint (incl. money-safety and engine-purity rules) |
| `pnpm build` | Production build of all packages and apps |
| `pnpm db:migrate` / `db:seed` / `db:reset` | Prisma migrate dev / seed / drop+migrate+seed |
| `pnpm samples` | Regenerate the sample import files |
| `pnpm --filter @ocs/api smoke` | End-to-end API check (needs a running API on a freshly reset DB) |

## Production notes

- `pnpm build`, then `pnpm db:deploy`, then `node apps/api/dist/main.js`. Serve `apps/web/dist` as static files with `VITE_API_URL` set at build time.
- Set a real `JWT_SECRET`. Local login is temporary until Microsoft Entra SSO is added.
- Uploaded files are kept in `UPLOAD_DIR` (default `apps/api/uploads`). Back it up together with the database.

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
- **Git workflow for the team (push, pull, branches, PRs):** [Git workflow](#git-workflow-2-developers) (below)
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

## Git workflow (2 developers)

We are two developers sharing one GitHub repo. The goal is simple: **`main` always works**, nobody loses work,
and each of us reviews what the other merges.

### The rules

1. **Never commit or push directly to `main`.** Every change goes through a branch and a Pull Request (PR).
2. **The other developer reviews and approves every PR.** Don't merge your own PR without their approval.
3. **One branch per task.** Keep it small, and merge it within a few days.
4. **Pull `main` before you start and rebase before you push.**
5. **`pnpm test` and `pnpm lint` must pass before you push.**
6. **Never commit secrets or real data.** Keep `.env` files, real ERIC6 exports, real agent data and real passwords off GitHub. Use `samples/`.
7. **Never force-push to `main`.** Only use `git push --force-with-lease` on your own branch.

### Step 0: one-time setup (each developer)

```bash
git clone https://github.com/Cedie99/Agent-Commission-System.git
cd Agent-Commission-System

git config user.name "Your Name"
git config user.email "you@oraclepetroleum.net"
git config pull.ff only            # `git pull` will never silently create merge commits
git config fetch.prune true        # removes deleted remote branches on fetch
git config --global core.autocrlf true   # Windows: avoid line-ending noise in diffs
```

Then follow [Setup](#setup) above.

**Repo admin (once):** on GitHub, open **Settings → Branches → Add branch protection rule** for `main` and turn on:

- Require a pull request before merging, with 1 approval
- Dismiss stale approvals when new commits are pushed
- Block force pushes and deletions

Under **Settings → General → Pull Requests**, allow only **Squash merging** and turn on
**Automatically delete head branches**.

### Step 1: agree on who does what

Before you start, tell each other in chat what you're working on. Avoid editing the same files at the same time.
Pay special attention to files you both tend to touch:

- `apps/api/prisma/schema.prisma` and migrations: **only one of us changes the schema at a time.** Say so before you start.
- `packages/shared/src/enums.ts` and `roles.ts`
- `package.json` and `pnpm-lock.yaml` (adding dependencies)

### Step 2: start from the latest `main`

```bash
git checkout main
git pull
```

Then bring your local setup up to date:

```bash
pnpm install          # if package.json or pnpm-lock.yaml changed
pnpm db:migrate       # if there are new migrations in apps/api/prisma/migrations
pnpm build:packages   # if packages/shared or packages/engine changed
```

### Step 3: create a branch

```bash
git checkout -b feature/statements-page
```

| Prefix | Use for | Example |
|---|---|---|
| `feature/` | New functionality | `feature/sp-monthly-sasi` |
| `fix/` | Bug fixes | `fix/import-date-parsing` |
| `docs/` | Documentation only | `docs/user-workflow` |
| `chore/` | Tooling, dependencies, cleanup | `chore/upgrade-prisma` |

### Step 4: work and commit often

```bash
git status                 # see what changed
git diff                   # review the actual changes
git add <files>            # add only the files you meant to change (avoid `git add .` blindly)
git commit -m "web: add statements page"
```

Commit messages start with the area, then say what changed. The areas are `engine`, `api`, `web`, `shared`, `docs` and `chore`.

- Good: `engine: add SASI component for SP_MONTHLY`
- Bad: `update`, `fix stuff`, `wip`

Push your branch at least once a day, even if it isn't finished. That way your work is backed up on GitHub (see Step 7).

### Step 5: check before pushing

```bash
pnpm test
pnpm lint
```

Fix anything that fails. If you changed the schema, also run `pnpm db:reset` to make sure migrations apply cleanly from scratch.

### Step 6: update your branch with the latest `main`

```bash
git fetch origin
git rebase origin/main
```

If there are conflicts, see [Resolving conflicts](#resolving-conflicts). Run Step 5 again after rebasing.

### Step 7: push your branch

```bash
git push -u origin feature/statements-page    # first push
git push                                      # later pushes
git push --force-with-lease                   # only after a rebase, only on YOUR branch
```

### Step 8: open a Pull Request

1. On GitHub, click **Compare & pull request** (base: `main`).
2. Describe **what** changed, **why**, and **how you tested it**. Mention any new migration or new env variable.
3. Assign the other developer as the reviewer and message them.
4. If you're not finished yet, open it as a **Draft PR** so they can see what you're doing.

### Step 9: review (the other developer)

```bash
git fetch origin
git checkout feature/statements-page
pnpm install && pnpm db:migrate && pnpm test
```

- Read the diff on GitHub. Check the [CLAUDE.md](CLAUDE.md) rules: money is `Decimal`, the engine stays pure, the grace period stays confidential, and every write is audited.
- Comment, or **Approve**. If you request changes, the author pushes new commits to the same branch.

### Step 10: merge and clean up

The **author** merges after approval:

1. Click **Squash and merge** on GitHub. Make sure the final commit message follows the `area: message` format.
2. Delete the branch (automatic if the repo setting is on).

Then both developers update locally:

```bash
git checkout main
git pull
git branch -d feature/statements-page    # author only
```

If the other developer still has a branch open, they rebase it now (Step 6) so it stays current.

### Resolving conflicts

1. Git lists the conflicting files. Open each one and look for `<<<<<<<`, `=======` and `>>>>>>>`.
2. Keep the correct code (often a mix of both) and delete the markers. If you're unsure, ask the other developer, since it's their code too.
3. Mark the file as resolved and continue:

   ```bash
   git add <file>
   git rebase --continue
   ```

4. To cancel and go back to how things were: `git rebase --abort`.

- **`pnpm-lock.yaml` conflict:** never fix it by hand. Take `main`'s version, then let pnpm regenerate it:

  ```bash
  git checkout --ours pnpm-lock.yaml    # during a rebase, "ours" = main
  pnpm install
  git add pnpm-lock.yaml
  git rebase --continue
  ```
- **Migration conflict** (both branches added a migration): the second branch to merge deletes **its own** unmerged migration folder,
  rebases onto `main`, runs `pnpm db:migrate` to generate a fresh migration, then checks that `pnpm db:reset` passes.

### Project-specific cautions

- **Migrations:** never edit or delete a migration that is already on `main`. Create a new one.
- **Enums:** change both `packages/shared/src/enums.ts` and `apps/api/prisma/schema.prisma`. If they drift, `pnpm test` fails.
- **Engine rules:** write the tests first and bump `ENGINE_VERSION` (see [CLAUDE.md](CLAUDE.md)).
- **Open questions:** don't invent answers in code. Raise an EXCEPTION and add the question to [docs/open-questions.md](docs/open-questions.md).

### Emergency undo

| Situation | What to do |
|---|---|
| Undo uncommitted changes to a file | `git restore <file>` |
| Undo my last commit but keep the changes | `git reset --soft HEAD~1` |
| Put changes aside temporarily | `git stash` then `git stash pop` |
| A merged PR broke `main` | On GitHub, open the PR and click **Revert**, then merge the revert PR. Don't rewrite `main`'s history. |
| I lost a commit after a bad rebase/reset | `git reflog`, find the commit hash, then `git branch rescue <hash>` |
| I committed a secret | Tell the other dev, **rotate the secret immediately**, then remove it. Deleting the commit isn't enough. |

### Quick reference

| I want to… | Command |
|---|---|
| Get latest code | `git checkout main && git pull` |
| Start a task | `git checkout -b feature/name` |
| Save work | `git add <files> && git commit -m "area: message"` |
| Update branch with main | `git fetch origin && git rebase origin/main` |
| Push my branch | `git push -u origin feature/name` |
| Review a teammate's branch | `git fetch origin && git checkout feature/name` |

## Production notes

- `pnpm build`, then `pnpm db:deploy`, then `node apps/api/dist/main.js`. Serve `apps/web/dist` as static files with `VITE_API_URL` set at build time.
- Set a real `JWT_SECRET`. Local login is temporary until Microsoft Entra SSO is added.
- Uploaded files are kept in `UPLOAD_DIR` (default `apps/api/uploads`). Back it up together with the database.

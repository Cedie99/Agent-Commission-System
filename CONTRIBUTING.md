# Git workflow for the dev team

How we pull, branch, commit and push. Keep `main` working at all times.

## The rules

1. **Never push directly to `main`.** Work on a branch, then open a Pull Request (PR).
2. **Pull before you start, and before you push.**
3. **One branch per task.** Keep branches small and short-lived.
4. **Run tests and lint before you push.**
5. **Never commit secrets.** `.env` files stay on your machine (they are in `.gitignore`).

## First-time setup

```bash
git clone https://github.com/Cedie99/Agent-Commission-System.git
cd Agent-Commission-System
git config user.name "Your Name"
git config user.email "you@oraclepetroleum.net"
```

Then follow **Setup** in [README.md](README.md).

## Daily workflow

### 1. Get the latest `main`

```bash
git checkout main
git pull
```

After every pull, update your local setup:

```bash
pnpm install          # if package.json or pnpm-lock.yaml changed
pnpm db:migrate       # if there are new migrations in apps/api/prisma/migrations
pnpm build:packages   # if packages/shared or packages/engine changed
```

### 2. Create a branch for your task

```bash
git checkout -b feature/statements-page
```

Branch names:

| Prefix | Use for | Example |
|---|---|---|
| `feature/` | New functionality | `feature/sp-monthly-sasi` |
| `fix/` | Bug fixes | `fix/import-date-parsing` |
| `docs/` | Documentation only | `docs/user-workflow` |
| `chore/` | Tooling, dependencies, cleanup | `chore/upgrade-prisma` |

### 3. Commit your work

```bash
git status                 # check what changed
git add <files>            # add only the files you meant to change
git commit -m "web: add statements page"
```

Commit messages: start with the area, then say what changed.
Areas: `engine`, `api`, `web`, `shared`, `docs`, `chore`.

- Good: `engine: add SASI component for SP_MONTHLY`
- Bad: `update`, `fix stuff`, `wip`

### 4. Check before pushing

```bash
pnpm test
pnpm lint
```

Fix anything that fails. Don't push broken code.

### 5. Update your branch with the latest `main`

```bash
git fetch origin
git rebase origin/main
```

If there are conflicts, see **Resolving conflicts** below.

### 6. Push your branch

```bash
git push -u origin feature/statements-page    # first push of the branch
git push                                      # later pushes
```

If you rebased after already pushing, use `git push --force-with-lease`.
Only do this on **your own** branch, never on `main`.

### 7. Open a Pull Request

1. On GitHub, click **Compare & pull request**.
2. Describe what changed, why, and how you tested it.
3. Ask at least one teammate to review.
4. After approval, click **Squash and merge**, then delete the branch.

### 8. Clean up

```bash
git checkout main
git pull
git branch -d feature/statements-page
```

## Resolving conflicts

1. Git lists the conflicting files. Open each one and look for `<<<<<<<`, `=======` and `>>>>>>>`.
2. Keep the correct code and remove the markers.
3. Mark it fixed and continue:

   ```bash
   git add <file>
   git rebase --continue
   ```

4. To give up and go back to how things were: `git rebase --abort`.

`pnpm-lock.yaml` conflict: take `main`'s version, then run `pnpm install` and commit the result.

## Project-specific cautions

- **Migrations:** never edit or delete a migration that is already on `main`. Create a new one with `pnpm db:migrate`.
  If two branches both add migrations, the second one to merge must rebase and re-check that `pnpm db:reset` works.
- **Enums:** if you change an enum, update both `packages/shared/src/enums.ts` and `apps/api/prisma/schema.prisma`.
  `pnpm test` will fail if they drift.
- **Engine rules:** add tests first and bump `ENGINE_VERSION`. See [CLAUDE.md](CLAUDE.md).
- **Confidential data:** never commit real ERIC6 exports, real agent data or real passwords. Use `samples/`.

## Quick reference

| I want to… | Command |
|---|---|
| Get latest code | `git checkout main && git pull` |
| Start a task | `git checkout -b feature/name` |
| See what changed | `git status` / `git diff` |
| Save work | `git add <files> && git commit -m "area: message"` |
| Update branch with main | `git fetch origin && git rebase origin/main` |
| Push my branch | `git push -u origin feature/name` |
| Undo uncommitted changes to a file | `git restore <file>` |
| Undo my last commit (keep changes) | `git reset --soft HEAD~1` |
| Put changes aside temporarily | `git stash` / `git stash pop` |

## Recommended GitHub settings (repo admin)

Under **Settings → Branches → Add branch protection rule** for `main`:

- Require a pull request before merging (at least 1 approval)
- Block force pushes
- Do not allow deletions

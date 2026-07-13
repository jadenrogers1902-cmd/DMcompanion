# Deployment (Vercel)

This app is a Next.js 16 (App Router) project with server actions, middleware
(`proxy.ts`), a Node-runtime route handler (`app/api/notion/webhook`), and a
server-only Supabase service-role client. **Vercel** is the target host — it
runs all of this natively with no adapter or code changes.

> **Deployment status:** this document is a procedure, not evidence that the
> current working tree or any migration is deployed. Verify the target project
> and migration ledger before promotion.

> Cloudflare Pages/Workers is intentionally **not** used: it pushes routes to the
> edge/workerd runtime, which conflicts with `node:crypto` + `runtime = 'nodejs'`
> in the webhook and the service-role server client.

---

## One-time setup

### 1. Push the repo to GitHub
The working tree has been committed locally (branch `main`). Create an **empty**
GitHub repo (no README/license), then from `C:\Companion`:

```sh
git remote add origin https://github.com/<you>/<repo>.git
git push -u origin main
```

`.env.local` is gitignored, so **no secrets are pushed**.

### 2. Import into Vercel
1. vercel.com → **Add New… → Project** → import the GitHub repo.
2. Framework preset auto-detects **Next.js**. Leave Build Command (`next build`),
   Output, and Root Directory at defaults.
3. Add the environment variables below **before** the first deploy.
4. For a code-only release, deploy normally. For any schema-changing release,
   stage the build but do not promote it until the coordinated migration step
   below is ready.

### 3. Environment variables (Vercel → Project → Settings → Environment Variables)
Set these for **Production** (and Preview if you want preview deploys to work):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key | **mandatory server-only secret — never prefix NEXT_PUBLIC**; required for protected map images, transport, validated player roll/result writes, and Notion operations |
| `NOTION_WEBHOOK_SECRET` | Notion webhook verification token | **optional** — only if you enable webhook auto-sync |
| `SUPABASE_PROJECT_REF` | target Supabase project ref | recommended for migration runs; otherwise derived from `NEXT_PUBLIC_SUPABASE_URL` |
| `SUPABASE_ACCESS_TOKEN` | Supabase CLI access token | required for CI/unattended migration runs unless the CLI session is already authenticated |
| `SUPABASE_DB_PASSWORD` | target database password | recommended for unattended migration runs |

Source values from your local `.env.local` (and Supabase dashboard → Settings →
API for the service-role key).

### 4. Supabase Auth redirect URLs
Supabase dashboard → **Authentication → URL Configuration**:
- Set **Site URL** to your Vercel production URL (`https://<project>.vercel.app`
  or your custom domain).
- Add `https://<domain>/auth/callback` to **Redirect URLs**.

Otherwise login/redirects will fail in production.

### 5. Database migrations

Apply **all** repository migrations only through the checked-in runner from the
exact release commit:

```powershell
npm.cmd run db:migrate
```

Before running it, confirm `SUPABASE_PROJECT_REF` (or the project URL), CLI
authentication/`SUPABASE_ACCESS_TOKEN`, and `SUPABASE_DB_PASSWORD` resolve to
the intended environment. Never reuse production credentials for an isolated
fixture project.

Do not paste selected migrations into the SQL editor or deploy code against an
unknown migration state. The runner applies pending files from
`supabase/migrations/` in order and records the result for the configured
Supabase project.

#### Atomic code + migration requirement (2026-07-13)

Migration `20260713041904_player_safe_live_projections.sql` and its matching
application code must be staged and released as one atomic unit. The new code
expects player-safe event tables and snapshot RPCs; the migration also removes
player reads from the old mixed-privacy source tables. Shipping either side by
itself can break player Live Map or Story behavior.

For this release:

1. Stage the exact Vercel build and confirm its commit includes the migration.
2. Enter a controlled maintenance/release window so old player clients cannot
   continue using the source-row contract.
3. Run `npm.cmd run db:migrate` against the intended Supabase project.
4. Immediately promote the already-staged matching Vercel build.
5. Confirm the staged runtime can create a server-only service-role client;
   never expose or log the key itself.
6. Verify DM, player, and Center Screen reads/realtime, protected active-map
   image delivery, and revealed-handout Storage access before reopening normal traffic.

If the migration and matching build cannot be coordinated this way, keep the
release blocked. This document does **not** claim that migration `20260713041904`
has been applied or that its code is live.

### 6. (Optional) Notion webhook
If using auto-sync, create the Notion webhook subscription pointing at
`https://<domain>/api/notion/webhook` and set `NOTION_WEBHOOK_SECRET` to match.

---

## Ongoing

- **Code-only redeploys may be automatic**: schema-changing releases must use
  the staged atomic procedure above rather than an uncoordinated push-to-production.
- Other branches/PRs may use preview deployments, but a preview is not proof
  that the production Supabase migration is applied.
- **Logs**: Vercel → Project → Deployments → Runtime Logs.
- **Local dev** still works via `npm run dev` (reads `.env.local`).

## Sanity checklist after first deploy
- [ ] `/login` loads on the Vercel URL.
- [ ] Can sign in (Supabase redirect URLs set).
- [ ] A campaign page loads for the DM.
- [ ] Adventure Maker / Codex pages load (migrations applied).
- [ ] `npm.cmd run db:migrate` reports the intended migration state for the
      target project; `20260713041904` is present before audit-remediation code
      is opened to users.
- [ ] DM, player, and Center Screen receive sanitized snapshot/realtime data;
      players cannot select mixed-privacy source tables.
- [ ] Players cannot select map Storage objects directly; the protected route
      serves only an authorized active map. Revealed handout files remain scoped.
- [ ] Service-role smoke checks pass for a protected map image, a player roll
      submission, and transport authorization without exposing the secret.
- [ ] `SUPABASE_SERVICE_ROLE_KEY` is present only in the server environment;
      protected map images, validated player action/roll writes, transport, and
      enabled Notion operations pass without exposing the secret.

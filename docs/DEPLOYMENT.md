# Deployment (Vercel)

This app is a Next.js 16 (App Router) project with server actions, middleware
(`proxy.ts`), a Node-runtime route handler (`app/api/notion/webhook`), and a
server-only Supabase service-role client. **Vercel** is the target host — it
runs all of this natively with no adapter or code changes.

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
4. Deploy.

### 3. Environment variables (Vercel → Project → Settings → Environment Variables)
Set these for **Production** (and Preview if you want preview deploys to work):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | your Supabase project URL | public |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable/anon key | public |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase **service_role** key | **server-only — never prefix NEXT_PUBLIC**; required for Notion connection/sync/discovery |
| `NOTION_WEBHOOK_SECRET` | Notion webhook verification token | **optional** — only if you enable webhook auto-sync |

Source values from your local `.env.local` (and Supabase dashboard → Settings →
API for the service-role key).

### 4. Supabase Auth redirect URLs
Supabase dashboard → **Authentication → URL Configuration**:
- Set **Site URL** to your Vercel production URL (`https://<project>.vercel.app`
  or your custom domain).
- Add `https://<domain>/auth/callback` to **Redirect URLs**.

Otherwise login/redirects will fail in production.

### 5. Database migrations
Make sure migrations in `supabase/migrations/` are applied to the Supabase
project (run them in order in the SQL editor). The Adventure Codex / Notion /
Table Sync / Token Builder features query tables from **024–031**; without those
applied, those pages error.

### 6. (Optional) Notion webhook
If using auto-sync, create the Notion webhook subscription pointing at
`https://<domain>/api/notion/webhook` and set `NOTION_WEBHOOK_SECRET` to match.

---

## Ongoing

- **Redeploys are automatic**: every push to `main` triggers a production deploy;
  other branches/PRs get preview deploys. No more local start/stop.
- **Logs**: Vercel → Project → Deployments → Runtime Logs.
- **Local dev** still works via `npm run dev` (reads `.env.local`).

## Sanity checklist after first deploy
- [ ] `/login` loads on the Vercel URL.
- [ ] Can sign in (Supabase redirect URLs set).
- [ ] A campaign page loads for the DM.
- [ ] Adventure Maker / Codex pages load (migrations applied).
- [ ] `SUPABASE_SERVICE_ROLE_KEY` present → Table Sync / Notion settings work;
      absent → they show the clean "not configured" notice (not a crash).

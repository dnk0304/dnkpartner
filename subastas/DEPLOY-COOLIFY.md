# dnksubastas — Coolify deployment layout

**Author:** Forge (Wave 1, 2026-05-29)
**Status:** schema-only — Ken triggers the actual Coolify deploy after Niki verifies. This doc captures the intended service topology so the deploy is mechanical.

---

## 1. Services (3 containers, all on Coolify's `coolify` network)

| Service           | Image / source                          | Container name (Coolify-style)        | Status            |
|-------------------|-----------------------------------------|---------------------------------------|-------------------|
| dnksubastas-postgres | `postgres:16-alpine`                  | `jidtaj7dlaho5km6zru1dbi5`            | **Already provisioned** (this wave). pg_trgm + pgcrypto installed. Compose at `/data/coolify/databases/jidtaj7dlaho5km6zru1dbi5/docker-compose.yml`. |
| dnksubastas-app   | `nixpacks` build from `dnk0304/dnkpartner` branch `dnksubastas` (subdir `subastas/`) | TBD on first Coolify deploy | Ken provisions     |
| dnksubastas-scraper-scheduler | same source as app, different start command | TBD | Ghost owns scheduler choice; Ken provisions container |

Optional / future:
- **Redis** — only if Ghost picks Celery+Redis for the scheduler. Not required for the simpler `scheduler.py` path.

---

## 2. Required environment variables

| KEY                            | Source                                            | Notes |
|--------------------------------|---------------------------------------------------|-------|
| `DATABASE_URL`                 | **`DATABASE_URL_SUBASTAS`** managed Coolify secret | Connection string for `dnksubastas` Postgres. See `niki/PROJECTS/dnkpartner/CREDS.md` for the actual value. The app reads `DATABASE_URL`; map the secret accordingly. |
| `NEXTAUTH_SECRET`              | Coolify managed secret                            | Rotated 2026-05-29 (Wave 0). The new value lives in the source folder's `.env` — re-provision as a managed secret before deploy. |
| `NEXTAUTH_URL`                 | Coolify env                                       | `https://subastas.<domain>` (subdomain TBD). |
| `RESEND_API_KEY`               | Coolify managed secret                            | Email sending. Currently the value lives only in source `.env`. |
| `RESEND_FROM_EMAIL`            | Coolify env                                       | e.g. `SubastaPro <notifications@…>` once a domain is verified in Resend. |
| `STRIPE_SECRET_KEY`            | Coolify managed secret                            | If billing flows are kept in this app. |
| `STRIPE_WEBHOOK_SECRET`        | Coolify managed secret                            | Webhook signature verification. |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` | Coolify managed secrets                 | Web Push (currently never sent — Wave 2 dispatcher work). |
| `NODE_ENV`                     | Coolify env                                       | `production`. |
| `NEXT_PUBLIC_APP_URL`          | Coolify env                                       | Public URL for email links. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | Coolify managed secrets (optional)   | Only if Google OAuth is enabled for subastas. |

---

## 3. Build + start (app container)

Nixpacks-compatible. `package.json` scripts:

- `build`  →  `prisma generate && next build`
- `start`  →  `next start -p 3005`   (POSIX-friendly, replaces the Windows-only `master-start.js` orchestrator. The Windows orchestrator is still available as `npm run start:legacy-windows` for local dev only.)

Coolify pre-deployment hook (mirrors dnkpartner's setup):

```
npx prisma migrate deploy
```

This applies any pending migrations BEFORE the app container starts serving traffic. The migrations under `subastas/prisma/migrations/` are the source of truth.

---

## 4. Scraper-scheduler container

Owned by **Ghost** (scheduler choice + scraper internals). Forge's stake: it must be a long-running Linux container, NOT spawned via the Windows-shaped `taskkill / tasklist / master-start.js / .bat` machinery. The Wave 1 admin-route refactor (`src/app/api/admin/scraper/route.ts`) now branches `process.platform === 'win32'` and uses `pkill` / `pgrep -fl python` on Linux, so the in-app "stop all scrapers" button is portable.

Recommended layout (Ghost finalizes):

- One container that runs `python scraper/scheduler.py` (or `celery -A scraper.tasks worker --beat …` if Celery is chosen).
- Cron via **Coolify scheduled tasks** instead of an admin UI click. Daily auto-scrape runs at e.g. `0 3 * * *` (3am Madrid).
- Writes the same Postgres DB via `DATABASE_URL`. The Python adapter (`scraper/adapters/`) already speaks Postgres — Ghost confirms the DSN switch.

---

## 5. What still lives in the dev workflow only (NOT for deploy)

The repo retains a pile of `.bat` files, `master-start.js`, and PowerShell scripts at the project root from the original Windows-dev era. These are **not part of the Coolify deploy surface** and should be ignored by the build. They remain in the repo for local dev convenience.

Specifically:
- `start*.bat`, `run_*.bat`, `run_*.sh`, `start-dev.bat`
- `scripts/master-start.js` (legacy multi-process orchestrator — Linux uses Coolify service definitions instead)
- `tasklist` / `taskkill` calls — replaced with `pgrep` / `pkill` in-app for non-Windows hosts.

---

## 6. Backup discipline (flagged, not implemented this wave)

Once SQLite is retired from the hot path (Wave 1 ETL completes), set up:
- Nightly `pg_dump` to offsite (Hetzner Storage Box or S3-compatible).
- Retention: 14 daily + 8 weekly + 6 monthly.
- Monitoring: alert if a dump fails or hasn't run in >36h.

Ken: this can be a Coolify scheduled task or a separate small container running `cron + restic`.

---

## 7. Local-dev SSH tunnel for migrations

The PG container is on the private `coolify` Docker network. To run migrations / ETL from a local machine:

```powershell
ssh -i C:\hetzner_dnk -fN -L 15432:10.0.1.4:5432 root@167.235.53.57
# Then:
$env:DATABASE_URL = "postgres://dnksubastas:<pw>@localhost:15432/dnksubastas"
npx prisma migrate deploy
```

`10.0.1.4` is the container's internal IP; check with `docker inspect jidtaj7dlaho5km6zru1dbi5` if it changes (rare).

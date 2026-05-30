# Forge P1 — Auction-Images Pipeline — Deploy Notes for Ken

**Branch:** `dnksubastas` · **Date:** 2026-05-30 · **Owner during build:** Forge (solo on the repo)

## What this commit adds (READ first)
A Catastro-primary + Street View-fallback image pipeline for ACTIVE auctions
(CELEBRANDOSE / PROXIMA_APERTURA). Real photos on cards + detail, served from
a Hetzner-mounted host volume. The 1,188 legacy `/streetview/*.jpg` files are
removed from the repo (`git rm` + `.gitignore`) and will be migrated to the
same volume by `scripts/migrate-streetview-to-volume.sh` at deploy time.

No DB migration (reuses existing `Auction.imageUrl`). No new external secrets
in code; Google key flows via env.

## Required Coolify / docker-compose changes (at deploy)

### 1. Add a named host bind for the auction-images volume

Add to the `dnksubastas` service in `/data/dnksubastas-deploy/docker-compose.yml`:

```yaml
    volumes:
      - /data/auction-images:/data/auction-images
    environment:
      # ...existing envs...
      AUCTION_IMAGES_DIR: "/data/auction-images"
      STREETVIEW_API_KEY: "AIzaSyDtvdSHxa_ncHaf_Zj84fawI6WebQQf2gM"
      # (lehubdelcreative key — same one already in niki-accounts.md)
```

On the host first:
```
mkdir -p /data/auction-images && chmod 755 /data/auction-images
```

**Volume proposal:** path `/data/auction-images` (host) → `/data/auction-images`
(container), AUCTION_IMAGES_DIR env points at the in-container path. NOT a
Docker named volume — a host bind so contents are visible to ops + survive
`docker rm` of the container.

### 2. Enable the Street View Static API on the lehubdelcreative GCP project

**FLAG FOR DENNIS** — verified 2026-05-30 the key works for Maps geocoding
etc. but `Street View Static API` is NOT enabled on that project (request
returns `REQUEST_DENIED: This API is not activated on your API project`).
Dennis must toggle it in https://console.cloud.google.com/apis/library →
"Street View Static API" → Enable. Until then, the fallback path returns
`api-disabled` and the resolver falls through to the existing category
placeholder. The Catastro primary path works independently.

### 3. After the new image is up + volume is mounted, run the migration

ON THE HETZNER HOST (`ssh root@167.235.53.57`):
```
bash /data/dnksubastas-deploy/repo/subastas/scripts/migrate-streetview-to-volume.sh
```
This copies any `/app/public/streetview/*.jpg` from the running container
into `/data/auction-images/`, then rewrites every DB row whose `imageUrl` or
`streetViewUrl` starts with `/streetview/` to point at `/api/auction-image/<id>`.
Idempotent — safe to re-run.

### 4. Optional: schedule the backfill drain via the existing scheduler

`POST /api/admin/images/backfill?limit=50` accepts the same `Authorization:
Bearer $CRON_SECRET` as `/api/dispatch/run`. The existing
`dnksubastas-scheduler` container already pings dispatch every 1 min — add a
sibling ping (e.g. every 5 min) and the backfill will quietly catch up new
active rows over time.

## Verify on the live box
```
# auction-image route serves a cached file
curl -fsSI https://dnkpartner.com/subastas/api/auction-image/<some-boe-id>

# resolver picks up a new active row
curl -X POST -H "Authorization: Bearer $CRON_SECRET" \
  https://dnkpartner.com/subastas/api/admin/images/backfill?limit=10
```

## Known gap (NOT a blocker for this build)

The scraper does NOT currently populate `cadastralRef` from BOE lote pages
(verified 2026-05-30: 0 of 2,028 active rows have one; the BOE search/summary
HTML that we scrape doesn't contain the RC — it lives in the deeper Bienes
detail tab + the PDF edict). The Catastro pipeline is design-correct and
turns on automatically as soon as RC values arrive. A dedicated BOE-detail
enrichment pass is a separate dispatch — flagged for Ken / Niki.

Practical effect today: most active rows will resolve via Street View (1,188
already have an `address` from the legacy SV screenshotter run + 31 have
lat/lng; lat/lng is what the new pipeline uses). Once Street View Static API
is enabled per #2 above, those resolve. The remainder fall through to the
existing category placeholder — same UX as before, no regression.

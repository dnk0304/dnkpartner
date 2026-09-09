# Clip Library — preview storage & metadata import (CP1)

480p previews of the comedy clip corpus are cut on the local extraction
workstation (the 20 GB of source footage never leaves it) and shipped to the
server as flat `<clip_id>.mp4` files. The studio app reads them from a
persistent bind mount, so a redeploy never touches the bytes.

## Storage

| | |
|---|---|
| Host path (persistent) | `/data/dnkstudio/clip-previews` |
| Container path | `/app/data/clip-previews` |
| Layout | flat `<clip_id>.mp4` + `manifest.json` + `library_clips.json` |
| Encode | 480p (`scale=-2:480`) H.264 CRF 26 / AAC 96 k / `+faststart` |

### Posters (CP2c)

| | |
|---|---|
| Host path (persistent) | `/data/dnkstudio/clip-posters` |
| Container path | `/app/data/clip-posters` |
| Layout | flat `<clip_id>.jpg` |
| Encode | JPEG, `scale=480:-2`, `-q:v 4` — ~16 KB each, 58.5 MiB for 3867 files |

The clip grid paints one of these per tile instead of mounting a `<video>`, so
no video bytes are fetched until the user actually presses play.

`/data` is on the box's single 301 GB `/dev/sda1`. The path follows the
convention already used by the app's two existing mounts
(`/data/dnkstudio/trends`, `/data/dnkstudio/sitebuilder`).

### Coolify volume config — ATTACHED (verified 2026-09-09)

The mount is live: `docker exec <studio-container> ls /app/data/clip-previews`
returns the corpus, and `CLIP_PREVIEWS_DIR=/app/data/clip-previews` is set in
the container environment. Recorded here for rebuild-from-scratch purposes.

Coolify UI → application `fhn5fjw36gie1q3ymnmevtw2` → **Storages** → *Add* →
Volume Mount:

```
Name:            fhn5fjw36-clip-previews
Source (host):   /data/dnkstudio/clip-previews
Destination:     /app/data/clip-previews
```

This writes one row to Coolify's `local_persistent_volumes`
(`resource_type = App\Models\Application`, `resource_id = 3`), matching the two
rows already there. It is additive; nothing else changes.

The posters volume is the same shape, and Ken adds it the same way:

```
Name:            fhn5fjw36-clip-posters
Source (host):   /data/dnkstudio/clip-posters
Destination:     /app/data/clip-posters
```

Server code resolves **each** directory from its **own** environment variable:

```
CLIP_PREVIEWS_DIR=/app/data/clip-previews     # set in the container
CLIP_POSTERS_DIR=/app/data/clip-posters       # CP2c — must be added
```

with local-dev fallbacks of `path.resolve(cwd, 'data', 'clip-previews')` and
`path.resolve(cwd, 'data', 'clip-posters')`. See `clipPreviewsDir()` and
`clipPostersDir()` in `server/clipLibrary.ts`.

> **Do not** derive it from `STUDIO_DATA_DIR` (an earlier revision of this file
> said to). `STUDIO_DATA_DIR` is `/app/data/sitebuilder` — a *per-feature*
> directory, not the volume root — so
> `path.join(process.env.STUDIO_DATA_DIR, 'clip-previews')` resolves to
> `/app/data/sitebuilder/clip-previews` and misses the mount entirely. The same
> applies to `CLIP_POSTERS_DIR`.

## Poster generation (CP2c)

Posters are pre-generated out of band — never on the request path at scale.

```bash
# On the Hetzner box. Neither the host nor the studio container ships ffmpeg,
# so the generator runs in a throwaway python+ffmpeg image (same throwaway-
# container pattern as tools/sync_previews.sh).
docker build -t clipposter:1 - <<'EOF'
FROM python:3.11-slim
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends ffmpeg \
 && rm -rf /var/lib/apt/lists/*
EOF

docker run --rm \
  -v /data/dnkstudio:/data \
  -v /root/generate_clip_posters.py:/app/gen.py:ro \
  clipposter:1 python3 /app/gen.py \
    --previews-dir /data/clip-previews \
    --posters-dir  /data/clip-posters \
    --workers 6
```

Source: `tools/generate_clip_posters.py`. Idempotent and resumable (a jpg that
exists, is non-empty, and is not older than its mp4 is skipped), PID-locked,
and isolated per clip so one bad mp4 cannot abort the run. `--force`,
`--limit N`, `--dry-run` available.

Frame choice: seek to `min(1.0s, duration * 0.1)`; if the resulting still is
near-uniform (luma stddev < 8, i.e. a black/fade lead-in) retry at
`duration * 0.35`. 21 of 3867 needed that retry on the first full run.

Full-corpus run 2026-09-09: 3867 generated, 1 failed, 188 s wall, 58.5 MiB.
The single failure is `b_KwraihYsU_r001` — a 1983-byte, **audio-only** preview
with no video stream. That is a broken CP1 extraction, not a poster bug; it
needs re-cutting upstream. Until then its tile 404s.

`studio_library_clip.preview_path`
stores the volume-relative `clip-previews/<id>.mp4`, so moving the corpus to a
dedicated host or S3 later is an rsync plus a base-URL change — no data
migration.

## Transfer

From the extraction workstation (resumable, safe to interrupt and re-run):

```bash
bash tools/sync_previews.sh              # resume / incremental
bash tools/sync_previews.sh --checksum   # full checksum re-verify
bash tools/sync_previews.sh --dry-run
```

It runs `rsync -a --partial --append-verify` over SSH (Git Bash has no rsync, so
rsync runs in a throwaway `instrumentisto/rsync-ssh` container with the previews
directory and SSH key bind-mounted). Only `*.mp4` and the two JSON files are
sent; in-progress `.part` files are excluded.

Independent verification runs on the box, against the shipped manifest — so it
reports what actually landed rather than what the sender believes it sent:

```bash
bash tools/verify_previews_remote.sh 20   # sample size, default 20
```

It checks file count, per-entry byte size, a random sha256 sample, and each
sampled preview's real duration against `t_out - t_in` (0.5 s tolerance), and
exits non-zero on any discrepancy.

## Metadata

`studio_library_clip` is created by the idempotent DDL in
`server/db/studioMigrations.ts`, which the server runs at startup — no separate
migration step. Import is a standalone, re-runnable upsert:

```bash
docker exec -it <studio-container> sh -c \
  'npx tsx server/db/importLibraryClips.ts /app/data/clip-previews/library_clips.json'
```

`--dry-run` parses and validates only. `--prune` deletes rows absent from the
export — use it only when the export is known complete, since the source
corpus is still being indexed and grows between runs.

Verify:

```sql
SELECT count(*) FROM studio_library_clip;
SELECT id, comedian, laugh_score, duration, preview_path
FROM studio_library_clip ORDER BY random() LIMIT 5;
```

## API (CP2)

`server/clipLibrary.ts`, mounted from `server/index.ts` at `/api/library` and
`/studio/api/library`:

| Route | Purpose |
|---|---|
| `GET /clips` | filter (`comedian[]`, `tag[]`, `quality[]`, `laugh_min`, `dur_min`, `dur_max`, `q`), `sort`, `page`/`limit` (default 60, max 200) → `{items,total,page,limit,sort}` |
| `GET /facets` | drill-down counts: comedian, quality, laugh_score, tag (top 100), duration buckets 0-10/10-20/20-40/40+ |
| `GET /clips/:id/preview` | Range-capable `video/mp4` stream (206 + `Content-Range`), `private, max-age=86400` |
| `GET /clips/:id/poster.jpg` | pre-generated still frame, `image/jpeg`, `private, max-age=604800` (immutable per clip) |
| `GET /health` | `{count, files, posters, dir, postersDir, ok}` — DB rows vs `*.mp4` and `*.jpg` on the mounts |

`poster.jpg` self-heals a *single* missing file by shelling out to ffmpeg, but
that is a fallback only: the studio container has **no ffmpeg**, so in
production every failure mode of that path — missing binary, read-only mount,
decode failure — deliberately surfaces as a **404, never a 500**. The grid must
tolerate a missing poster.

`posters` intentionally does not affect `ok`: the generator runs out of band and
may legitimately lag the previews. Assert `posters` explicitly in the
post-deploy check instead.

Read-only; all SQL is parameterised and the sort key is whitelisted. Clip ids
are validated against `/^[A-Za-z0-9_-]+$/` before touching the filesystem.

The UI that consumes this is CP2 Part B.

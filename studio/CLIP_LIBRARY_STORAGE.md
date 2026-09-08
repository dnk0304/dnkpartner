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

`/data` is on the box's single 301 GB `/dev/sda1`. The path follows the
convention already used by the app's two existing mounts
(`/data/dnkstudio/trends`, `/data/dnkstudio/sitebuilder`).

### Coolify volume config — NOT YET ATTACHED

The host directory exists and is populated, but the container mount must be
added in Coolify and only takes effect on the next deploy. Deploys are owned by
the release manager — this is deliberately left unattached.

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

Server code should resolve the directory as
`path.join(process.env.STUDIO_DATA_DIR ?? 'data', 'clip-previews')`, the same
way `siteBuilder.ts` resolves `site-assets`. `studio_library_clip.preview_path`
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

No API routes or UI consume this yet — that is CP2/CP3.

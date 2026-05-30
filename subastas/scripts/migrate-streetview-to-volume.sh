#!/usr/bin/env bash
# Migrate the legacy /streetview/*.jpg files from the deployed image into the
# Hetzner-mounted auction-images volume, and rewrite DB rows that point at the
# old /streetview/<id>.jpg path to use the new /api/auction-image/<id> path.
#
# Run ON THE HETZNER HOST, after Ken provisions the volume and bind-mounts it
# into the dnksubastas-app container at /data/auction-images.
#
# Idempotent: skips files that already exist on the volume; UPDATE only touches
# rows whose imageUrl still starts with /streetview/.
#
# Usage (from /data/dnksubastas-deploy on the host):
#   bash repo/subastas/scripts/migrate-streetview-to-volume.sh
set -euo pipefail

APP_CONTAINER="${APP_CONTAINER:-dnksubastas-app}"
PG_CONTAINER="${PG_CONTAINER:-jidtaj7dlaho5km6zru1dbi5}"
VOLUME_HOST_PATH="${VOLUME_HOST_PATH:-/data/auction-images}"

echo "[migrate] ensuring volume host dir $VOLUME_HOST_PATH exists"
mkdir -p "$VOLUME_HOST_PATH"

echo "[migrate] copying any /app/public/streetview/*.jpg from container -> volume"
# Stream the directory out of the running container.
# Use docker cp in a tmp dir then rsync -u so we don't overwrite newer cached entries.
TMP=$(mktemp -d)
trap "rm -rf $TMP" EXIT
docker cp "$APP_CONTAINER:/app/public/streetview/." "$TMP/" || {
  echo "[migrate] no /app/public/streetview in container (already removed?) — skipping copy step"
}
if [ -d "$TMP" ] && [ "$(ls -A "$TMP" 2>/dev/null | wc -l)" -gt 0 ]; then
  echo "[migrate] $(ls -1 "$TMP" | wc -l) source files staged"
  rsync -a --ignore-existing "$TMP/" "$VOLUME_HOST_PATH/"
  echo "[migrate] files now on volume: $(ls -1 "$VOLUME_HOST_PATH" | wc -l)"
fi

echo "[migrate] rewriting DB imageUrl / streetViewUrl rows"
docker exec -i "$PG_CONTAINER" psql -U dnksubastas -d dnksubastas <<'SQL'
-- Show what we're about to change
SELECT 'before imageUrl /streetview/:' AS label, COUNT(*) AS n
  FROM "Auction" WHERE "imageUrl" LIKE '/streetview/%';
SELECT 'before streetViewUrl /streetview/:' AS label, COUNT(*) AS n
  FROM "Auction" WHERE "streetViewUrl" LIKE '/streetview/%';

UPDATE "Auction"
   SET "imageUrl" = '/api/auction-image/' || regexp_replace(
                       regexp_replace("imageUrl", '^/streetview/', ''),
                       '\.jpg$', '')
 WHERE "imageUrl" LIKE '/streetview/%';

UPDATE "Auction"
   SET "streetViewUrl" = '/api/auction-image/' || regexp_replace(
                            regexp_replace("streetViewUrl", '^/streetview/', ''),
                            '\.jpg$', '')
 WHERE "streetViewUrl" LIKE '/streetview/%';

SELECT 'after imageUrl /api/auction-image/:' AS label, COUNT(*) AS n
  FROM "Auction" WHERE "imageUrl" LIKE '/api/auction-image/%';
SELECT 'after streetViewUrl /api/auction-image/:' AS label, COUNT(*) AS n
  FROM "Auction" WHERE "streetViewUrl" LIKE '/api/auction-image/%';
SQL

echo "[migrate] done. Next: redeploy the app image with .gitignore'd /streetview removed."

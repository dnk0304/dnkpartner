"""
Document-archive + field-completeness backfill (G5). Ken runs this ONCE, AFTER
the 20260603_add_auction_documents migration is applied, the /data/auction-docs
volume is bind-mounted into the scraper container, and the scheduler image is
rebuilt.

What it does, per ACTIVE auction (properties-first):
  Re-fetches the BOE detail page through the live scraper path
  (_navigate_and_extract), which now ALSO:
    G1 — parses the discrete "Datos del bien subastado" fields (postalCode,
         idufir, registryInscription, legalTitle, bienLocalidad, bienProvincia,
         viviendaHabitual) + corrects propertyType/category from the bien
         heading;
    G2 — enumerates + downloads the attached PDFs (nota simple on ver=3, edicto/
         condiciones on ver=1) to /data/auction-docs/<safeKey>/<file>.pdf and
         upserts an AuctionDocument row per file;
    G3 — renders the per-auction snapshot.pdf and upserts its row.
  Then this script upserts the Auction row so the G1 columns + convenience
  pdfUrl/edictUrl land. (Document rows are already persisted inside the navigate
  call — the upsert_document calls happen there.)

Bounded + resumable:
  - Candidate set = active rows (CELEBRANDOSE / ACTIVE / PROXIMA / SUSPENDIDA),
    legacy junk excluded, PROPERTIES-FIRST: real-estate categories ordered
    before vehicles/other (brief: "properties-first"), then by endsAt.
  - File checkpoint (BACKFILL_DOCS_CHECKPOINT, default
    /tmp/backfill_documents.checkpoint.json) records every boeId examined.
    Re-runs exclude checkpointed ids in the candidate query, so batched runs
    drain the pool without re-doing work even across process restarts.
  - --limit N bounds a single run; re-run to continue.

Idempotency: doc downloads skip when the file already exists non-empty;
AuctionDocument upserts on @@unique([auctionId, idDoc]); snapshot overwrites the
single snapshot.pdf. Safe to re-run.

Politeness (govt portal): --delay between auctions (default 2.0s) ON TOP of the
scraper's own per-fetch + per-doc jitter. Circuit breaker: --max-errors
consecutive failures aborts (re-run resumes from the checkpoint).

Usage (in the scheduler container, with the docs volume mounted):
  AUCTION_DOCS_DIR=/data/auction-docs DATABASE_URL=postgres://... \
      python -u -m app.backfill_documents [--limit N] [--delay 2.0] \
      [--all] [--dry-run] [--max-errors 10] [--checkpoint PATH]
"""
import argparse
import json
import logging
import os
import sys
import time

try:
    from .scrapers.boe_scraper import BOEScraper, parse_lote_boe_id
    from .database.adapter import get_database_adapter
    from .database.legacy_rows import LEGACY_EXCLUSION_SQL
except ImportError:  # top-level module inside the container
    sys.path.insert(0, '/')
    from app.scrapers.boe_scraper import BOEScraper, parse_lote_boe_id  # type: ignore
    from app.database.adapter import get_database_adapter  # type: ignore
    from app.database.legacy_rows import LEGACY_EXCLUSION_SQL  # type: ignore

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
logger = logging.getLogger("backfill_documents")

ACTIVE_STATUSES = ('CELEBRANDOSE', 'ACTIVE', 'PROXIMA_APERTURA', 'SUSPENDIDA')

# Properties-first ordering: real-estate categories sort before everything else.
PROPERTY_CATEGORIES = (
    'Viviendas', 'Locales', 'Garajes', 'Trasteros', 'Naves industriales',
    'Terrenos', 'Fincas rústicas', 'Otros inmuebles',
)

DEFAULT_CHECKPOINT = os.environ.get(
    'BACKFILL_DOCS_CHECKPOINT', '/tmp/backfill_documents.checkpoint.json'
)


def load_checkpoint(path):
    try:
        with open(path, 'r', encoding='utf-8') as fh:
            data = json.load(fh)
        return set(data.get('done', []))
    except Exception:
        return set()


def save_checkpoint(path, done):
    tmp = f"{path}.tmp"
    try:
        with open(tmp, 'w', encoding='utf-8') as fh:
            json.dump({'done': sorted(done)}, fh)
        os.replace(tmp, path)  # atomic
    except Exception as e:
        logger.warning('checkpoint save failed (%s): %s', path, e)


def candidate_rows(adapter, limit, done_ids):
    conn = adapter.connect()
    cur = conn.cursor()
    placeholders = ', '.join(['%s'] * len(ACTIVE_STATUSES))
    where = f'status IN ({placeholders}) AND {LEGACY_EXCLUSION_SQL}'
    params = list(ACTIVE_STATUSES)
    if done_ids:
        # Exclude already-processed ids (resume across process restarts).
        where += ' AND "boeId" <> ALL(%s)'
        params.append(list(done_ids))
    # Properties-first: CASE rank on category, then earliest-closing first.
    case_terms = ' '.join(
        f"WHEN category = '{c}' THEN {i}" for i, c in enumerate(PROPERTY_CATEGORIES)
    )
    order = f'CASE {case_terms} ELSE 99 END ASC, "endsAt" ASC NULLS LAST'
    sql = (
        f'SELECT "boeId", "auctionType", province, category, status, '
        f'municipality, "publishedAt", "endsAt", id '
        f'FROM "Auction" WHERE {where} ORDER BY {order}'
    )
    if limit:
        sql += f' LIMIT {int(limit)}'
    cur.execute(sql, params)
    cols = [c[0] for c in cur.description]
    rows = [dict(zip(cols, r)) for r in cur.fetchall()]
    cur.close()
    return rows


def url_for(scraper, boe_id):
    parsed = parse_lote_boe_id(boe_id)
    if parsed:
        idsub, lote = parsed
        return f"{scraper.DETAIL_URL}?idSub={idsub}&idLote={lote}&ver=3"
    return scraper._detail_url(boe_id)


def build_record(row, info):
    """Upsert record: preserve existing classification, layer the freshly-parsed
    G1 fields + convenience URLs. _merge_bien_fields applies the bien fields +
    category override on top (the scraper sets property_type/bien fields in
    `info`)."""
    boe_id = row['boeId']
    rec = {
        'boe_id': boe_id,
        'title': info.get('identificador') or row.get('category') or boe_id,
        'category': row.get('category') or 'Otros',
        'province': row.get('province') or 'Unknown',
        'municipality': row.get('municipality'),
        'status': info.get('detail_status') or row.get('status') or 'CELEBRANDOSE',
        'auction_type': row.get('auctionType'),
        'source': 'BOE',
        'published_at': row.get('publishedAt'),
        'ends_at': info.get('ends_at') or row.get('endsAt'),
        # G1 discrete bien fields (also re-applied via _merge_bien_fields below
        # for the authoritative category override).
        'postal_code': info.get('postal_code'),
        'idufir': info.get('idufir'),
        'registry_inscription': info.get('registry_inscription'),
        'legal_title': info.get('legal_title'),
        'bien_localidad': info.get('bien_localidad'),
        'bien_provincia': info.get('bien_provincia'),
        'vivienda_habitual': info.get('vivienda_habitual'),
        'property_type': info.get('property_type'),
        # convenience URLs
        'pdf_url': info.get('nota_simple_url'),
        'edict_url': info.get('edict_url'),
    }
    return rec


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='Max rows this run (0 = all remaining)')
    ap.add_argument('--delay', type=float, default=2.0, help='Seconds between auctions')
    ap.add_argument('--all', action='store_true', help='Ignore checkpoint (reprocess everything)')
    ap.add_argument('--dry-run', action='store_true', help='Fetch+capture but do not upsert the Auction row')
    ap.add_argument('--max-errors', type=int, default=10, help='Consecutive-failure circuit breaker')
    ap.add_argument('--checkpoint', default=DEFAULT_CHECKPOINT, help='Checkpoint file path')
    args = ap.parse_args()

    if not os.environ.get('DATABASE_URL'):
        logger.error('DATABASE_URL is required (point at live Postgres).')
        sys.exit(2)

    done = set() if args.all else load_checkpoint(args.checkpoint)
    logger.info('Checkpoint %s carries %d done ids (--all=%s)',
                args.checkpoint, len(done), args.all)

    adapter = get_database_adapter()
    rows = candidate_rows(adapter, args.limit, done)
    logger.info('Candidate active rows to backfill (properties-first): %d', len(rows))

    scraper = BOEScraper()
    stats = {'fetched': 0, 'docs': 0, 'snapshots': 0, 'fields': 0,
             'cat_fixed': 0, 'written': 0, 'errors': 0}
    consecutive_errors = 0

    for i, row in enumerate(rows, 1):
        boe_id = row['boeId']
        try:
            url = url_for(scraper, boe_id)
            info = scraper._navigate_and_extract(boe_id, url)
            stats['fetched'] += 1
            consecutive_errors = 0

            docs = info.get('documents') or []
            n_snap = sum(1 for d in docs if d.get('docType') == 'SNAPSHOT')
            n_dl = len(docs) - n_snap
            stats['docs'] += n_dl
            stats['snapshots'] += n_snap
            if any(info.get(k) is not None for k in (
                    'postal_code', 'idufir', 'registry_inscription', 'legal_title',
                    'bien_localidad', 'bien_provincia', 'vivienda_habitual')):
                stats['fields'] += 1

            logger.info('[%d/%d] %s cat=%s ptype=%s docs=%d snap=%d',
                        i, len(rows), boe_id, row.get('category'),
                        info.get('property_type'), n_dl, n_snap)

            if not args.dry_run:
                rec = build_record(row, info)
                before_cat = rec.get('category')
                scraper._merge_bien_fields(rec, info)
                if rec.get('category') != before_cat:
                    stats['cat_fixed'] += 1
                adapter.upsert_auction(rec)
                stats['written'] += 1

            done.add(boe_id)
            if i % 10 == 0:
                save_checkpoint(args.checkpoint, done)
        except Exception as e:
            stats['errors'] += 1
            consecutive_errors += 1
            logger.warning('[%d/%d] %s FAILED: %s', i, len(rows), boe_id, e)
            # checkpoint failures too? No — leave un-checkpointed so a re-run retries.
            if consecutive_errors >= args.max_errors:
                logger.error('Circuit breaker: %d consecutive failures — aborting at row %d. '
                             'Re-run to resume from the checkpoint.', consecutive_errors, i)
                break
        time.sleep(max(0.0, args.delay))

    save_checkpoint(args.checkpoint, done)
    logger.info('Backfill done. Stats: %s', stats)
    logger.info('Checkpoint now carries %d done ids.', len(done))


if __name__ == '__main__':
    main()

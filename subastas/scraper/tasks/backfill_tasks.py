"""
Backfill Tasks
Tasks for backfilling missing data (coordinates, enrichment, etc.)
"""

import logging
from datetime import datetime
from typing import List
from ..services.geocoding_service import GeocodingService
from ..services.streetview_service import StreetViewService
from ..database.adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


def _stamp(db, boe_id, updates):
    """
    Merge the geocode-attempt marker into an update payload (poison-pill unjam).

    Always sets geocodeAttemptedAt = now() so the row leaves the selection
    window for the 7-day cooldown, and best-effort increments geocodeAttempts
    via a SQL expression UPDATE (in-place, no read). The increment is guarded:
    on a pre-migration schema (column absent) it logs once and degrades — the
    coords/timestamp still land via update_auction, so the unjam never depends
    on geocodeAttempts existing.

    Returns the updates dict (with geocodeAttemptedAt added) so the caller can
    pass it straight to db.update_auction(). The attempts bump is applied here
    as a side effect because update_auction takes literal values only, not
    SQL expressions like "geocodeAttempts + 1".
    """
    payload = dict(updates)
    payload['geocodeAttemptedAt'] = datetime.now()

    # Best-effort running count via SQL expression (separate small UPDATE).
    try:
        conn = db.connect()
        cur = conn.cursor()
        if db.db_type == 'postgresql':
            cur.execute(
                'UPDATE "Auction" '
                'SET "geocodeAttempts" = COALESCE("geocodeAttempts", 0) + 1 '
                'WHERE "boeId" = %s',
                (boe_id,),
            )
        else:
            cur.execute(
                "UPDATE Auction "
                "SET geocodeAttempts = COALESCE(geocodeAttempts, 0) + 1 "
                "WHERE boeId = ?",
                (boe_id,),
            )
        conn.commit()
    except Exception as e:
        try:
            db.connect().rollback()
        except Exception:
            pass
        logger.debug(f"geocodeAttempts bump skipped for {boe_id}: {e}")

    return payload


def geocode_missing_coordinates(batch_size: int = 100, active_only: bool = True):
    """
    Backfill missing coordinates for auctions using Nominatim (OpenStreetMap),
    free + keyless. The geocoding layer (GeocodingService) is single-threaded at
    RATE_LIMIT_DELAY ~1.1s/req — load-bearing, do not parallelise.

    Tracks precision via GeocodingService's location_type
    (ROOFTOP / RANGE_INTERPOLATED / GEOMETRIC_CENTER / APPROXIMATE). Per Dennis:
    keep APPROXIMATE (town-centroid) results — a coarse pin beats the stock
    placeholder icon.

    POISON-PILL UNJAM (2026-06-16): the old query had no ORDER BY and no failure
    memory, so a head-of-line cluster of un-findable addresses (Nominatim
    ZERO_RESULTS) was re-selected every cycle forever (processed=25 geocoded=0
    failed=25), starving the 470+ findable rows behind them. We now:
      * exclude rows attempted within the last 7 days (cooldown), and
      * ORDER BY geocodeAttemptedAt NULLS FIRST (never-tried rows first),
      * stamp geocodeAttemptedAt = now() on EVERY attempt (hit OR miss) and bump
        geocodeAttempts, via _stamp_geocode_attempt() below.
    Net effect: the LIMIT window always advances past the poison cluster. An
    un-findable address stays NULL-coord (honest, no pin) — never fabricated.

    Args:
        batch_size: rows per run
        active_only: when True (default) only ACTIVE / CELEBRANDOSE / PRE_AUCTION /
                     PROXIMA_APERTURA rows are touched. False = whole table.
    """
    logger.info("Starting geocoding backfill task")
    db = DatabaseAdapter()
    geocoder = GeocodingService()

    is_pg = db.db_type == 'postgresql'
    status_clause = (
        "AND status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA','SUSPENDIDA','SUSPENDED')"
        if active_only else ""
    )

    try:
        if is_pg:
            # Cooldown: skip rows attempted < 7d ago; never-tried (NULL) first.
            query = f"""
                SELECT "boeId", address, province, municipality
                FROM "Auction"
                WHERE latitude IS NULL
                  AND longitude IS NULL
                  AND address IS NOT NULL
                  AND ("geocodeAttemptedAt" IS NULL
                       OR "geocodeAttemptedAt" < now() - interval '7 days')
                  {status_clause}
                ORDER BY "geocodeAttemptedAt" ASC NULLS FIRST
                LIMIT %s
            """
        else:
            # SQLite (dev): no now()/interval/NULLS FIRST — emulate. SQLite sorts
            # NULLs first on ASC by default, and julianday('now','-7 days') gives
            # the cooldown boundary as a comparable ISO/julian value.
            query = f"""
                SELECT boeId, address, province, municipality
                FROM Auction
                WHERE latitude IS NULL
                  AND longitude IS NULL
                  AND address IS NOT NULL
                  AND (geocodeAttemptedAt IS NULL
                       OR geocodeAttemptedAt < datetime('now', '-7 days'))
                  {status_clause}
                ORDER BY geocodeAttemptedAt ASC
                LIMIT ?
            """

        auctions = db.query_auctions(query, (batch_size,))

        if not auctions:
            logger.info("No auctions need geocoding")
            return {'processed': 0, 'geocoded': 0, 'failed': 0, 'precision': {}}

        logger.info(f"Found {len(auctions)} auctions to geocode")

        geocoded_count = 0
        failed_count = 0
        precision_counts: dict = {}

        for auction in auctions:
            boe_id = auction.get('boeId') or auction.get('boeid')
            try:
                result = geocoder.geocode_address_detailed(
                    auction['address'],
                    auction['province'],
                    auction.get('municipality'),
                )

                if result:
                    # Stamp the attempt in the SAME write as the coords so a hit
                    # and its marker are atomic.
                    db.update_auction(boe_id, _stamp(db, boe_id, {
                        'latitude': result.latitude,
                        'longitude': result.longitude,
                    }))
                    geocoded_count += 1
                    precision_counts[result.location_type] = (
                        precision_counts.get(result.location_type, 0) + 1
                    )
                    logger.info(
                        f"Geocoded {boe_id} [{result.location_type}]: "
                        f"({result.latitude}, {result.longitude})"
                    )
                else:
                    # Miss: stamp the attempt so this row cools down 7 days and
                    # the LIMIT window advances past it next cycle (poison unjam).
                    db.update_auction(boe_id, _stamp(db, boe_id, {}))
                    failed_count += 1
                    logger.warning(f"Could not geocode {boe_id}")

            except Exception as e:
                # Still stamp on error so a row that throws every time can't jam
                # the head of the queue forever (same poison-pill class).
                try:
                    db.update_auction(boe_id, _stamp(db, boe_id, {}))
                except Exception as stamp_err:
                    logger.error(f"Failed to stamp attempt for {boe_id}: {stamp_err}")
                logger.error(f"Error geocoding {boe_id}: {e}")
                failed_count += 1

        logger.info(
            f"Geocoding backfill completed: {geocoded_count} success, "
            f"{failed_count} failed, precision={precision_counts}"
        )

        # ----------------------------------------------------------------
        # Town-level fallback — street-less rows still get a coarse pin.
        # ----------------------------------------------------------------
        # The genuine tail has no street ANYWHERE (extract_address returned
        # None at all three layers) but carries a town: municipality/province
        # or the bien-block bienLocalidad/bienProvincia. We geocode the
        # municipality centroid so the row surfaces as an APPROXIMATE pin on
        # /api/auctions/map (which keys on coords, not address). We write
        # COORDS ONLY — never a fabricated street into `address` (hard rule).
        town_stats = _geocode_town_fallback(db, geocoder, batch_size, status_clause, is_pg)

        return {
            'processed': len(auctions),
            'geocoded': geocoded_count,
            'failed': failed_count,
            'precision': precision_counts,
            'town_fallback': town_stats,
        }

    except Exception as e:
        logger.error(f"Geocoding backfill task failed: {e}")
        return None


def _geocode_town_fallback(db, geocoder, batch_size, status_clause, is_pg):
    """
    Town-centroid pins for address-less active rows.

    Candidate = active row with NULL coords AND NULL/empty `address`, but a
    usable town: COALESCE(municipality, bienLocalidad) + COALESCE(province,
    bienProvincia). We build "<town>, <province>, España" and feed it to the
    geocoder as the raw_address (the geocoder keeps APPROXIMATE results per
    Dennis). Writes latitude/longitude only — never an `address`.

    bienLocalidad/bienProvincia are Forge-added columns; they may not exist on
    an un-migrated schema, so we probe information_schema (PG) and degrade to
    municipality/province alone if absent. Never crashes the primary geocode.
    """
    try:
        has_bien_cols = False
        if is_pg:
            try:
                probe = db.query_auctions(
                    """
                    SELECT column_name FROM information_schema.columns
                    WHERE table_name = 'Auction'
                      AND column_name IN ('bienLocalidad','bienProvincia')
                    """,
                    (),
                )
                has_bien_cols = len({r.get('column_name') for r in probe}) == 2
            except Exception:
                has_bien_cols = False

        if is_pg:
            town_expr = (
                'COALESCE(NULLIF(municipality, \'\'), "bienLocalidad")'
                if has_bien_cols else "NULLIF(municipality, '')"
            )
            prov_expr = (
                'COALESCE(NULLIF(province, \'\'), "bienProvincia")'
                if has_bien_cols else "NULLIF(province, '')"
            )
            query = f"""
                SELECT "boeId",
                       {town_expr} AS town,
                       {prov_expr} AS prov
                FROM "Auction"
                WHERE latitude IS NULL
                  AND longitude IS NULL
                  AND (address IS NULL OR address = '')
                  AND {town_expr} IS NOT NULL
                  AND ("geocodeAttemptedAt" IS NULL
                       OR "geocodeAttemptedAt" < now() - interval '7 days')
                  {status_clause}
                ORDER BY "geocodeAttemptedAt" ASC NULLS FIRST
                LIMIT %s
            """
        else:
            # SQLite (dev) — no bien columns guaranteed; municipality/province only.
            query = f"""
                SELECT boeId,
                       NULLIF(municipality, '') AS town,
                       NULLIF(province, '') AS prov
                FROM Auction
                WHERE latitude IS NULL
                  AND longitude IS NULL
                  AND (address IS NULL OR address = '')
                  AND NULLIF(municipality, '') IS NOT NULL
                  AND (geocodeAttemptedAt IS NULL
                       OR geocodeAttemptedAt < datetime('now', '-7 days'))
                  {status_clause}
                ORDER BY geocodeAttemptedAt ASC
                LIMIT ?
            """

        rows = db.query_auctions(query, (batch_size,))
        if not rows:
            logger.info("No address-less rows need town-level fallback geocoding")
            return {'processed': 0, 'geocoded': 0, 'failed': 0}

        logger.info(f"Town-fallback: {len(rows)} address-less rows with a town")
        ok = bad = 0
        for row in rows:
            boe_id = row.get('boeId') or row.get('boeid')
            town = row.get('town')
            prov = row.get('prov') or ''
            if not town:
                continue
            try:
                # raw_address = the town itself; province gives Google context.
                # No municipality arg (town already IS the municipality), so the
                # geocode string is "<town>, <province>, España".
                result = geocoder.geocode_address_detailed(town, prov, None)
                if result:
                    db.update_auction(boe_id, _stamp(db, boe_id, {
                        'latitude': result.latitude,
                        'longitude': result.longitude,
                    }))
                    ok += 1
                    logger.info(
                        f"Town-pin {boe_id} [{result.location_type}]: "
                        f"({result.latitude}, {result.longitude}) <- {town}, {prov}"
                    )
                else:
                    db.update_auction(boe_id, _stamp(db, boe_id, {}))
                    bad += 1
                    logger.warning(f"Town-fallback could not geocode {boe_id} ({town}, {prov})")
            except Exception as e:
                try:
                    db.update_auction(boe_id, _stamp(db, boe_id, {}))
                except Exception:
                    pass
                bad += 1
                logger.error(f"Town-fallback error for {boe_id}: {e}")

        logger.info(f"Town-fallback completed: {ok} geocoded, {bad} failed")
        return {'processed': len(rows), 'geocoded': ok, 'failed': bad}

    except Exception as e:
        logger.error(f"Town-fallback task failed: {e}")
        return {'processed': 0, 'geocoded': 0, 'failed': 0, 'error': str(e)}


def enrich_from_catastro(batch_size: int = 50):
    """
    Enrich auction data using Catastro API
    Fetches additional property details (square meters, year built, etc.)
    
    Args:
        batch_size: Number of auctions to process per run
    """
    logger.info("Starting Catastro enrichment task")
    db = DatabaseAdapter()
    geocoder = GeocodingService()
    
    try:
        # Query auctions with cadastral reference but no coordinates
        if db.db_type == 'postgresql':
            query = """
                SELECT "boeId", "cadastralRef", province
                FROM "Auction"
                WHERE "cadastralRef" IS NOT NULL
                  AND (latitude IS NULL OR longitude IS NULL)
                LIMIT %s
            """
        else:
            query = """
                SELECT boeId, cadastralRef, province
                FROM Auction
                WHERE cadastralRef IS NOT NULL
                  AND (latitude IS NULL OR longitude IS NULL)
                LIMIT ?
            """

        auctions = db.query_auctions(query, (batch_size,))
        
        if not auctions:
            logger.info("No auctions need Catastro enrichment")
            return
        
        logger.info(f"Found {len(auctions)} auctions to enrich")
        
        enriched_count = 0
        
        for auction in auctions:
            boe_id = auction.get('boeId') or auction.get('boeid')
            cad_ref = auction.get('cadastralRef') or auction.get('cadastralref')
            try:
                coords = geocoder.geocode_from_cadastral(cad_ref)

                if coords:
                    lat, lng = coords
                    db.update_auction(boe_id, {
                        'latitude': lat,
                        'longitude': lng
                    })
                    enriched_count += 1
                    logger.info(f"Enriched {boe_id} from Catastro")
            
            except Exception as e:
                logger.error(f"Error enriching {boe_id}: {e}")
        
        logger.info(f"Catastro enrichment completed: {enriched_count} enriched")
        
        return {
            'processed': len(auctions),
            'enriched': enriched_count
        }
    
    except Exception as e:
        logger.error(f"Catastro enrichment task failed: {e}")
        return None


def link_preauctions_to_active():
    """
    Find and link pre-auction listings to their active BOE counterparts
    """
    logger.info("Starting pre-auction linking task")
    
    from services.preauction_linker import PreAuctionLinker
    linker = PreAuctionLinker()
    
    try:
        # This would query recent BOE auctions and attempt to link them
        # Implementation depends on database structure
        
        # Mark stale pre-auctions
        marked = linker.mark_zombie_preauctions(days_threshold=90)
        logger.info(f"Marked {marked} zombie pre-auctions")
        
        return {'zombie_marked': marked}
    
    except Exception as e:
        logger.error(f"Pre-auction linking task failed: {e}")
        return None


def backfill_streetview_images(batch_size: int = 25):
    """
    Backfill Street View screenshots for active and pre-auction items.
    Uses Google Maps web Street View (no API key).
    """
    logger.info("Starting Street View backfill task")
    db = DatabaseAdapter()
    streetview = StreetViewService()

    try:
        query = """
            SELECT boeId, latitude, longitude, imageUrl, streetViewUrl
            FROM Auction
            WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
              AND latitude IS NOT NULL
              AND longitude IS NOT NULL
              AND (streetViewUrl IS NULL OR streetViewUrl = '')
            LIMIT ?
        """
        auctions = db.query_auctions(query, (batch_size,))
        if not auctions:
            logger.info("No auctions need Street View enrichment")
            return None

        enriched = 0
        for auction in auctions:
            boe_id = auction['boeId']
            lat = auction['latitude']
            lng = auction['longitude']
            try:
                public_url = streetview.capture_streetview(boe_id, lat, lng)
                if not public_url:
                    continue
                update = {
                    'image_url': public_url,
                    'street_view_url': streetview.build_streetview_url(lat, lng),
                    'map_url': streetview.build_map_url(lat, lng),
                    'directions_url': streetview.build_directions_url(lat, lng),
                    'place_url': streetview.build_map_url(lat, lng),
                }
                db.update_auction(boe_id, update)
                enriched += 1
                logger.info(f"Street View captured for {boe_id}")
            except Exception as e:
                logger.error(f"Street View failed for {boe_id}: {e}")

        logger.info(f"Street View backfill completed: {enriched} enriched")
        return {'processed': len(auctions), 'enriched': enriched}

    except Exception as e:
        logger.error(f"Street View backfill task failed: {e}")
        return None

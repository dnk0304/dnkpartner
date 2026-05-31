"""
Backfill Tasks
Tasks for backfilling missing data (coordinates, enrichment, etc.)
"""

import logging
from typing import List
from ..services.geocoding_service import GeocodingService
from ..services.streetview_service import StreetViewService
from ..database.adapter import DatabaseAdapter

logger = logging.getLogger(__name__)


def geocode_missing_coordinates(batch_size: int = 100, active_only: bool = True):
    """
    Backfill missing coordinates for auctions using Google Geocoding API.

    Tracks precision via Google's geometry.location_type:
      ROOFTOP / RANGE_INTERPOLATED / GEOMETRIC_CENTER / APPROXIMATE
    Per Dennis: keep APPROXIMATE (town-centroid) results — a nearby Street View
    beats the stock placeholder icon.

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
        "AND status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')"
        if active_only else ""
    )

    try:
        if is_pg:
            query = f"""
                SELECT "boeId", address, province, municipality
                FROM "Auction"
                WHERE latitude IS NULL
                  AND longitude IS NULL
                  AND address IS NOT NULL
                  {status_clause}
                LIMIT %s
            """
        else:
            query = f"""
                SELECT boeId, address, province, municipality
                FROM Auction
                WHERE latitude IS NULL
                  AND longitude IS NULL
                  AND address IS NOT NULL
                  {status_clause}
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
                    db.update_auction(boe_id, {
                        'latitude': result.latitude,
                        'longitude': result.longitude,
                    })
                    geocoded_count += 1
                    precision_counts[result.location_type] = (
                        precision_counts.get(result.location_type, 0) + 1
                    )
                    logger.info(
                        f"Geocoded {boe_id} [{result.location_type}]: "
                        f"({result.latitude}, {result.longitude})"
                    )
                else:
                    failed_count += 1
                    logger.warning(f"Could not geocode {boe_id}")

            except Exception as e:
                logger.error(f"Error geocoding {boe_id}: {e}")
                failed_count += 1

        logger.info(
            f"Geocoding backfill completed: {geocoded_count} success, "
            f"{failed_count} failed, precision={precision_counts}"
        )

        return {
            'processed': len(auctions),
            'geocoded': geocoded_count,
            'failed': failed_count,
            'precision': precision_counts,
        }

    except Exception as e:
        logger.error(f"Geocoding backfill task failed: {e}")
        return None


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

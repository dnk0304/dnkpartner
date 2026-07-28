"""
Database Adapter Module
Unified adapter supporting both SQLite and PostgreSQL
"""

import sqlite3
import os
from typing import Optional, List, Dict, Any, Union
from datetime import datetime
from pathlib import Path
import logging

try:
    import psycopg2
    import psycopg2.extras
    POSTGRES_AVAILABLE = True
except ImportError:
    POSTGRES_AVAILABLE = False

from ..config.settings import DATABASE_URL, DATABASE_TYPE, PROJECT_ROOT
from .models import AuctionModel, AuctionStatus
from .legacy_rows import is_legacy_row
from ..config.scope import decide_scope
from ..config.municipality_province import resolve_province_less, court_province_from_name

# Province values the catalog treats as "no province" (mirror of the app's
# isValidProvince inverse). A new row landing with one of these gets a last-resort
# derivation from address/municipality before insert (see _ensure_province).
_PROVINCE_JUNK = {
    '', 'unknown', 'desconocida', 'mapa de la zona',
    'mapa del municipio', 'null', 'undefined',
}


def _is_junk_province(value) -> bool:
    if value is None:
        return True
    s = str(value).strip()
    return len(s) <= 1 or s.lower() in _PROVINCE_JUNK

logger = logging.getLogger(__name__)

# --- Bid/price write-boundary sanity guard (Ghost, 2026-07-18) --------------
# Path-independent backstop: no absurd cents value is EVER written to soldPrice
# or currentBidAmount, whatever any parser upstream does. This is defence in
# depth behind the grouping-validated eur_to_cents — it catches a numeric
# ceiling breach that grouping validation alone would not (a well-formed but
# implausibly large figure).
#
# CEILING calibration (verified against live prod 2026-07-18): the genuine max
# soldPrice in the priced set is 6,011,194,900 cents = €60,111,949.00 (a real
# BOE "Puja máxima" — SUB-JV-2017-70412, faithfully parsed). Real large-property
# auctions legitimately reach tens of millions of euros, so the ceiling is set
# well ABOVE that (default €500M) to NEVER null a real value, while still
# catching the billion-euro concatenation class. Env-overridable.
_SOLDPRICE_MAX_CENTS = int(os.environ.get("SOLDPRICE_MAX_CENTS", "50000000000"))  # €500,000,000


def _bid_within_cap(cents: Optional[int], *, boe_id: str = "", field: str = "soldPrice") -> bool:
    """True if `cents` is safe to persist. None is always allowed (honest-NULL).
    A value over the ceiling is REJECTED (returns False) and logged LOUD so the
    row is left NULL rather than storing an absurd figure."""
    if cents is None:
        return True
    if cents > _SOLDPRICE_MAX_CENTS:
        logger.warning(
            "SANITY-CAP: rejected %s=%s cents (> ceiling %s) for %s — leaving NULL",
            field, cents, _SOLDPRICE_MAX_CENTS, boe_id or "?",
        )
        return False
    return True

# G1 — discrete "Datos del bien subastado" columns (Forge migration
# 20260603_add_auction_documents). (scraper data_key, DB column). Written via
# the information_schema guard so a pre-migration DB is a safe no-op.
_BIEN_FIELD_COLS = [
    ('postal_code',          'postalCode'),
    ('idufir',               'idufir'),
    ('registry_inscription', 'registryInscription'),
    ('legal_title',          'legalTitle'),
    ('bien_localidad',       'bienLocalidad'),
    ('bien_provincia',       'bienProvincia'),
    ('vivienda_habitual',    'viviendaHabitual'),
    ('surface_m2',           'surfaceM2'),
]

# Vehicle make/model/year columns (Forge wave E2, 20260607). (data_key, db_col).
# Written only on VEHICLE-category rows and only when the parser found a value.
_VEHICLE_FIELD_COLS = [
    ('vehicle_make',  'vehicleMake'),
    ('vehicle_model', 'vehicleModel'),
    ('vehicle_year',  'vehicleYear'),
]

# Property-portal attribute columns (Phase 1, 20260711). (data_key, db_col).
# Parsed from the bien/registry prose (property_attribute_parser). Guarded by the
# information_schema probe so a pre-migration DB is a safe no-op, and written
# only when the parser found a value so a transient miss never blanks a good
# column (honest-NULL). Mixed types: bedrooms/bathrooms INT, hasX BOOL,
# floorLevel TEXT.
_PROPERTY_ATTR_COLS = [
    ('bedrooms',         'bedrooms'),
    ('bathrooms',        'bathrooms'),
    ('has_terrace',      'hasTerrace'),
    ('has_garden',       'hasGarden'),
    ('has_garage',       'hasGarage'),
    ('has_storage_room', 'hasStorageRoom'),
    ('floor_level',      'floorLevel'),
]


class DatabaseAdapter:
    """
    Unified database adapter supporting both SQLite and PostgreSQL
    Automatically detects database type from DATABASE_URL
    """
    
    def __init__(self, database_url: Optional[str] = None):
        """
        Initialize database adapter
        
        Args:
            database_url: Override default DATABASE_URL from settings
        """
        self.database_url = database_url or DATABASE_URL
        self.db_type = self._detect_db_type(self.database_url)
        self.connection = None
        
        logger.info(f"DatabaseAdapter initialized with {self.db_type}")
        
        if self.db_type == 'postgresql' and not POSTGRES_AVAILABLE:
            raise ImportError("psycopg2 not installed. Install with: pip install psycopg2-binary")
    
    def _detect_db_type(self, url: str) -> str:
        """Detect database type from URL"""
        if 'postgresql://' in url or 'postgres://' in url:
            return 'postgresql'
        elif 'file:' in url or url.endswith('.db'):
            return 'sqlite'
        else:
            # Default to DATABASE_TYPE from settings
            return DATABASE_TYPE
    
    def _get_sqlite_path(self) -> str:
        """Get SQLite database file path"""
        if 'file:' in self.database_url:
            path = self.database_url.replace('file:', '')
        else:
            path = self.database_url
        
        # Make path absolute
        if not Path(path).is_absolute():
            path = str(PROJECT_ROOT / path.lstrip('./'))
        
        return path
    
    def connect(self):
        """Establish database connection"""
        if self.connection:
            return self.connection
        
        try:
            if self.db_type == 'sqlite':
                db_path = self._get_sqlite_path()
                logger.info(f"Connecting to SQLite: {db_path}")
                self.connection = sqlite3.connect(db_path)
                self.connection.row_factory = sqlite3.Row
            else:
                logger.info("Connecting to PostgreSQL")
                self.connection = psycopg2.connect(self.database_url)
            
            logger.info("Database connection established")
            return self.connection
        
        except Exception as e:
            logger.error(f"Failed to connect to database: {e}")
            raise
    
    def close(self):
        """Close database connection"""
        if self.connection:
            self.connection.close()
            self.connection = None
            logger.info("Database connection closed")
    
    def execute_query(self, query: str, params: tuple = None) -> Any:
        """Execute a query and return results"""
        conn = self.connect()
        try:
            cursor = conn.cursor()

            if params:
                cursor.execute(query, params)
            else:
                cursor.execute(query)

            return cursor
        except Exception as e:
            logger.error(f"Query execution failed: {e}")
            raise

    def query_auctions(self, query: str, params: tuple = None) -> List[Dict[str, Any]]:
        """
        Run a SELECT query and return rows as dicts.

        PG path uses RealDictCursor so dict access works (scheduler.py G6 note
        called this out — default psycopg2 cursors yield tuples and dict(row)
        raises). SQLite path uses Row factory set in connect().
        """
        conn = self.connect()
        try:
            if self.db_type == 'postgresql':
                cursor = conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor)
                if params:
                    cursor.execute(query, params)
                else:
                    cursor.execute(query)
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
            else:
                cursor = self.execute_query(query, params)
                rows = cursor.fetchall()
                return [dict(row) for row in rows]
        except Exception as e:
            logger.error(f"query_auctions failed: {e}")
            raise
    
    def upsert_auction(self, auction_data: Union[Dict[str, Any], AuctionModel]) -> str:
        """
        Insert or update auction record
        
        Args:
            auction_data: Dictionary or AuctionModel instance
        
        Returns:
            Auction ID (boeId)
        """
        if isinstance(auction_data, AuctionModel):
            data = auction_data.to_dict()
        else:
            data = auction_data

        # INGESTION PROVINCE GUARD (2026-07-28) — universal net for EVERY source
        # path (BOE / registro / teju / split-lote). If a new row would land with
        # an empty/junk province, derive the REAL one from the SAME signals the
        # backfill uses (address -> municipality -> court tiebreaker -> bien*),
        # via the shared resolve_province_less. This stops new province-less rows
        # accumulating (~1,915 in the last 60d). Never guesses: no confident
        # signal (or a court that conflicts with an ambiguous town's candidates)
        # -> the junk value is left as-is (row still stored, just province-less).
        if _is_junk_province(data.get('province')):
            derived, _src = resolve_province_less(
                address=data.get('address'),
                municipality=data.get('municipality'),
                bien_provincia=data.get('bien_provincia'),
                postal_code=data.get('postal_code'),
                bien_localidad=data.get('bien_localidad'),
                court_province=data.get('province'),
                court_name=data.get('court_name'),
            )
            # `derived` is None for both UNKNOWABLE and 'court-conflict' — either
            # way we leave the province as-is (never a wrong override).
            if derived:
                data['province'] = derived
            elif data.get('court_name'):
                # STRUCTURED FALLBACK (2026-07-28): a Juzgado's partido judicial
                # sits in ONE province. Deterministically fill PROVINCE-LEVEL from
                # the "JUZGADO … - <TOWN>" suffix. AEAT / ambiguous / unmappable
                # court-town -> None -> province left as-is (never a guess).
                court_prov, _town, _flag = court_province_from_name(data.get('court_name'))
                if court_prov:
                    data['province'] = court_prov

        conn = self.connect()
        
        try:
            if self.db_type == 'sqlite':
                return self._upsert_auction_sqlite(conn, data)
            else:
                return self._upsert_auction_postgres(conn, data)
        except Exception as e:
            conn.rollback()
            logger.error(f"Upsert failed for {data.get('boe_id')}: {e}")
            raise

    # Sale-result columns (Forge owns the migration; Ghost only writes them).
    _SALE_RESULT_COLS = ('saleResult', 'soldPrice', 'soldDate',
                         'resultCheckedAt', 'resultCheckAttempts')
    _sale_cols_cache = None  # None=unknown, set()/frozenset once probed

    def _sale_result_cols(self, cursor):
        """Return the subset of the 5 sale-result columns that actually exist
        (info_schema-guarded so a pre-migration DB is a safe no-op). Cached."""
        if self._sale_cols_cache is not None:
            return self._sale_cols_cache
        try:
            cursor.execute(
                """
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'Auction' AND column_name = ANY(%s)
                """,
                (list(self._SALE_RESULT_COLS),),
            )
            self._sale_cols_cache = {r[0] for r in cursor.fetchall()}
        except Exception:
            self._sale_cols_cache = set()
        return self._sale_cols_cache

    def update_sale_result(self, boe_id: str, *, sale_result: Optional[str] = None,
                           sold_price_cents: Optional[int] = None,
                           sold_date: Any = None, mode: str = 'rescrape',
                           attempt_cap: int = 5) -> str:
        """
        Persist the concluded-auction result (Mechanisms 1/2/3). Writes ONLY the
        5 additive-nullable sale-result columns, by boeId. PG-only, idempotent,
        info_schema-guarded (safe before Forge's migration lands: returns
        'no-cols').

        sale_result: 'ADJUDICADA' | 'DESIERTA' | None (undetermined this pass).
        mode:
          'freeze'   — a confirmed live capture at close. Requires sale_result
                       not None. Sets result+soldPrice+soldDate, resultCheckedAt=
                       now, resultCheckAttempts=0.
          'rescrape' — daily/backfill pass. A capture (sale_result in
                       ADJUDICADA/DESIERTA) writes the result + resets attempts=0.
                       An undetermined pass (sale_result None) increments
                       resultCheckAttempts + stamps resultCheckedAt; once the
                       incremented count reaches `attempt_cap`, saleResult is set
                       to 'SIN_RESULTADO' so the row stops being retried.

        The stored number is the highest bid ("puja máxima"), NOT a confirmed
        legal sale. Never emit a "sale price" label from it.
        Returns a short status: 'captured'|'attempt'|'exhausted'|'freeze'|
        'noop'|'not-found'|'no-cols'|'skip'.
        """
        if self.db_type != 'postgresql':
            return 'skip'
        if mode == 'freeze' and sale_result is None:
            return 'noop'
        conn = self.connect()
        try:
            cursor = conn.cursor()
            cols = self._sale_result_cols(cursor)
            if not {'saleResult', 'resultCheckedAt', 'resultCheckAttempts'} <= cols:
                conn.rollback()
                return 'no-cols'

            cursor.execute(
                'SELECT id, "resultCheckAttempts" FROM "Auction" WHERE "boeId" = %s',
                (boe_id,),
            )
            row = cursor.fetchone()
            if not row:
                conn.rollback()
                return 'not-found'
            cur_attempts = row[1] or 0

            now = datetime.now()
            sets, params = [], []

            def _set(col, val):
                sets.append(f'"{col}" = %s')
                params.append(val)

            captured = sale_result in ('ADJUDICADA', 'DESIERTA')
            status = 'noop'
            if captured:
                _set('saleResult', sale_result)
                if 'soldPrice' in cols:
                    # Write-boundary sanity guard: an absurd/over-ceiling amount is
                    # dropped to NULL (saleResult still recorded — "had a bid,
                    # amount rejected"), never persisted as a giant int.
                    safe_price = sold_price_cents if _bid_within_cap(
                        sold_price_cents, boe_id=boe_id, field='soldPrice') else None
                    _set('soldPrice', safe_price)  # BigInt cents (None for DESIERTA)
                if 'soldDate' in cols:
                    _set('soldDate', sold_date)          # = endsAt (no true sale date exists)
                _set('resultCheckedAt', now)
                _set('resultCheckAttempts', 0)
                status = 'freeze' if mode == 'freeze' else 'captured'
            else:
                # Undetermined pass (wiped/empty/miss): attempt-memory drain.
                new_attempts = cur_attempts + 1
                _set('resultCheckedAt', now)
                _set('resultCheckAttempts', new_attempts)
                if new_attempts >= attempt_cap:
                    _set('saleResult', 'SIN_RESULTADO')
                    status = 'exhausted'
                else:
                    status = 'attempt'

            cursor.execute(
                f'UPDATE "Auction" SET {", ".join(sets)} WHERE "boeId" = %s',
                params + [boe_id],
            )
            conn.commit()
            return status
        except Exception as e:
            conn.rollback()
            logger.warning("update_sale_result failed for %s: %s", boe_id, e)
            return 'error'

    def upsert_document(self, auction_boe_id: str, doc: Dict[str, Any]) -> Optional[str]:
        """
        G2/G3 — upsert one AuctionDocument row (the document-archive contract
        Forge defined in migration 20260603_add_auction_documents).

        Resolves the auction by boeId -> Auction.id, then UPSERTs on the
        @@unique([auctionId, idDoc]) constraint so a re-scrape overwrites the
        same row (the snapshot uses the sentinel idDoc='SNAPSHOT'; downloads use
        the real BOE idDoc). `doc` keys (camelCase, matching the Prisma model):
        docType, title, officialUrl, idDoc, storedPath, kind, mimeType,
        sizeBytes.

        PG-only (the live store). Guarded by an information_schema existence
        check on the AuctionDocument table so a pre-migration DB is a safe
        no-op (returns None, logs once) rather than crashing the scrape — the
        Auction field writes still land via their own guard. Never raises:
        a document persistence miss must not abort the auction upsert.
        """
        if self.db_type != 'postgresql':
            logger.debug("upsert_document skipped (non-PG adapter)")
            return None

        conn = self.connect()
        try:
            cursor = conn.cursor()
            # table-exists guard (pre-migration safety)
            cursor.execute("""
                SELECT 1 FROM information_schema.tables
                WHERE table_name = 'AuctionDocument'
            """)
            if cursor.fetchone() is None:
                logger.warning(
                    "AuctionDocument table absent — migration "
                    "20260603_add_auction_documents not applied yet; "
                    "skipping document persistence for %s", auction_boe_id
                )
                conn.rollback()
                return None

            cursor.execute('SELECT id FROM "Auction" WHERE "boeId" = %s', (auction_boe_id,))
            row = cursor.fetchone()
            if not row:
                logger.warning("upsert_document: no Auction for boeId=%s", auction_boe_id)
                conn.rollback()
                return None
            auction_id = row[0]

            id_doc = doc.get('idDoc')
            if not id_doc:
                # The unique index treats NULL idDoc as distinct -> would
                # duplicate on every scrape. Refuse a NULL idDoc.
                logger.warning("upsert_document: missing idDoc for %s — skipped", auction_boe_id)
                conn.rollback()
                return None

            now = datetime.now()
            cursor.execute(
                """
                INSERT INTO "AuctionDocument"
                    ("id", "auctionId", "docType", "title", "officialUrl",
                     "idDoc", "storedPath", "kind", "mimeType", "sizeBytes",
                     "createdAt", "updatedAt")
                VALUES
                    (gen_random_uuid(), %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                ON CONFLICT ("auctionId", "idDoc") DO UPDATE SET
                    "docType"     = EXCLUDED."docType",
                    "title"       = EXCLUDED."title",
                    "officialUrl" = EXCLUDED."officialUrl",
                    "storedPath"  = EXCLUDED."storedPath",
                    "kind"        = EXCLUDED."kind",
                    "mimeType"    = EXCLUDED."mimeType",
                    "sizeBytes"   = EXCLUDED."sizeBytes",
                    "updatedAt"   = EXCLUDED."updatedAt"
                RETURNING "id"
                """,
                (
                    auction_id,
                    doc.get('docType', 'OTRO'),
                    doc.get('title', ''),
                    doc.get('officialUrl'),
                    id_doc,
                    doc.get('storedPath'),
                    doc.get('kind', 'download'),
                    doc.get('mimeType'),
                    doc.get('sizeBytes'),
                    now, now,
                ),
            )
            doc_id = cursor.fetchone()[0]
            conn.commit()
            logger.info("Upserted AuctionDocument %s (%s) for %s",
                        doc_id, doc.get('docType'), auction_boe_id)
            return doc_id
        except Exception as e:
            conn.rollback()
            logger.error("upsert_document failed for %s idDoc=%s: %s",
                         auction_boe_id, doc.get('idDoc'), e)
            return None

    def _upsert_auction_sqlite(self, conn: sqlite3.Connection, data: dict) -> str:
        """SQLite-specific upsert"""
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM Auction WHERE boeId = ?', (data['boe_id'],))
        existing = cursor.fetchone()
        
        if existing:
            # Update
            update_fields = []
            params = []
            now = datetime.now().isoformat()

            if 'current_bid' in data:
                update_fields.append('currentBid = ?')
                params.append(data.get('current_bid'))
            if 'status' in data:
                update_fields.append('status = ?')
                params.append(data.get('status'))
            if data.get('boe_announcement'):
                update_fields.append('boeAnnouncement = ?')
                params.append(data.get('boe_announcement'))
            if data.get('lot_description'):
                update_fields.append('lotDescription = ?')
                params.append(data.get('lot_description'))
            if data.get('property_description'):
                update_fields.append('propertyDescription = ?')
                params.append(data.get('property_description'))
            if data.get('charges_detail'):
                update_fields.append('chargesDetail = ?')
                params.append(data.get('charges_detail'))
            if data.get('source'):
                update_fields.append('source = ?')
                params.append(data.get('source'))
            if data.get('auction_type'):
                update_fields.append('auctionType = ?')
                params.append(data.get('auction_type'))
            if data.get('court_reference'):
                update_fields.append('courtReference = ?')
                params.append(data.get('court_reference'))
            if data.get('edict_url'):
                update_fields.append('edictUrl = ?')
                params.append(data.get('edict_url'))
            if data.get('pdf_url'):
                update_fields.append('pdfUrl = ?')
                params.append(data.get('pdf_url'))

            update_fields.append('updatedAt = ?')
            params.append(now)
            params.append(data['boe_id'])

            cursor.execute(
                f'''
                UPDATE Auction
                SET {", ".join(update_fields)}
                WHERE boeId = ?
                ''',
                tuple(params)
            )
            logger.info(f"Updated auction: {data['boe_id']}")
        else:
            # Insert
            cursor.execute('''
                INSERT INTO Auction (
                    id, boeId, title, category, province, municipality,
                    status, appraisalValue, currentBid, minimumBid,
                    courtName, procedureNumber, boeLink,
                    publishedAt, endsAt,
                    latitude, longitude, address, pdfUrl, imageUrl,
                    source, auctionType, courtReference, edictUrl,
                    boeAnnouncement, lotDescription, propertyDescription, chargesDetail,
                    createdAt, updatedAt
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ''', (
                self._generate_id(),
                data['boe_id'],
                data['title'],
                data['category'],
                data['province'],
                data.get('municipality'),
                data['status'],
                data['appraisal_value'],
                data.get('current_bid'),
                data.get('minimum_bid'),
                data.get('court_name'),
                data.get('procedure_number'),
                data.get('boe_link'),
                data['published_at'].isoformat() if isinstance(data['published_at'], datetime) else data['published_at'],
                data['ends_at'].isoformat() if data.get('ends_at') and isinstance(data['ends_at'], datetime) else data.get('ends_at'),
                data.get('latitude'),
                data.get('longitude'),
                data.get('address'),
                data.get('pdf_url'),
                data.get('image_url'),
                data.get('source'),
                data.get('auction_type'),
                data.get('court_reference'),
                data.get('edict_url'),
                data.get('boe_announcement'),
                data.get('lot_description'),
                data.get('property_description'),
                data.get('charges_detail'),
                datetime.now().isoformat(),
                datetime.now().isoformat(),
            ))
            logger.info(f"Inserted auction: {data['boe_id']}")
        
        conn.commit()
        return data['boe_id']
    
    def _upsert_auction_postgres(self, conn, data: dict) -> str:
        """
        PostgreSQL-specific upsert.
        G3 FIX: expanded from ~15 columns to full 57-column schema including:
        - bid family: depositAmount, claimedAmount, finalBid, bidIncrement
        - cadastral/registry: cadastralRef, cadastralData, registryId, registryInfo
        - contact/property: contactInfo, propertyType, possessionStatus, visitable
        - charges: charges, chargesDetail
        - identifiers: auctionId, lotNumber
        - lifecycle: transitionedAt, endDateTime
        - urls: mapUrl, streetViewUrl, placeUrl, directionsUrl
        - Forge 1.3 structured fields: suspensionReason, resumeAt, lastVerifiedAt
          (written when present via schema guard — safe even if cols don't exist yet)
        """
        cursor = conn.cursor()

        # Discover which Forge 1.3 structured fields are present in the live schema
        # (safe guard: don't crash if Forge hasn't run 1.3 yet)
        try:
            cursor.execute("""
                SELECT column_name FROM information_schema.columns
                WHERE table_name = 'Auction'
                  AND column_name IN ('suspensionReason', 'resumeAt', 'lastVerifiedAt', 'opensAt',
                                      'suspensionMotive',
                                      'sourceIdSub', 'loteNumber',
                                      'pujaStatus', 'currentBidAmount', 'occupancy',
                                      'valorSubasta',
                                      'vehicleMake', 'vehicleModel', 'vehicleYear',
                                      'postalCode', 'idufir', 'registryInscription',
                                      'legalTitle', 'bienLocalidad', 'bienProvincia',
                                      'viviendaHabitual', 'surfaceM2',
                                      'bedrooms', 'bathrooms', 'hasTerrace', 'hasGarden',
                                      'hasGarage', 'hasStorageRoom', 'floorLevel',
                                      'catastroYearBuilt', 'catastroUse', 'catastroCheckedAt',
                                      'inScope', 'scopeReason')
            """)
            forge_cols = {r[0] for r in cursor.fetchall()}
        except Exception:
            forge_cols = set()

        now = datetime.now()

        # Check if exists
        cursor.execute('SELECT id FROM "Auction" WHERE "boeId" = %s', (data['boe_id'],))
        existing = cursor.fetchone()

        # Layer 2 defensive guard (2026-06-02): if the matched row is a legacy
        # first-gen junk row (boeId ~ '^0x' OR id ~ cuid), DROP `status` from
        # the UPDATE field set. Belt-and-braces vs. Layer 1 (candidate-query
        # exclusion): even if a future query forgets the exclusion, no legacy
        # row ever flips back to active. Non-status enrichment writes (puja,
        # occupancy, endsAt, ...) are still allowed — only `status` is frozen.
        # See database/legacy_rows.py.
        legacy_locked = bool(
            existing and is_legacy_row(data.get('boe_id'), existing[0])
        )

        if existing:
            update_fields = []
            params = []

            # Core scraper fields — update if present in data
            scalar_map = [
                ('title',               '"title"'),
                ('category',            '"category"'),
                ('province',            '"province"'),
                ('municipality',        '"municipality"'),
                ('status',              '"status"'),
                ('appraisal_value',     '"appraisalValue"'),
                ('current_bid',         '"currentBid"'),
                ('minimum_bid',         '"minimumBid"'),
                ('deposit_amount',      '"depositAmount"'),
                ('claimed_amount',      '"claimedAmount"'),
                ('final_bid',           '"finalBid"'),
                ('bid_increment',       '"bidIncrement"'),
                ('court_name',          '"courtName"'),
                ('procedure_number',    '"procedureNumber"'),
                ('boe_link',            '"boeLink"'),
                ('auction_id',          '"auctionId"'),
                ('lot_number',          '"lotNumber"'),
                ('boe_announcement',    '"boeAnnouncement"'),
                ('ends_at',             '"endsAt"'),
                ('end_date_time',       '"endDateTime"'),
                ('latitude',            '"latitude"'),
                ('longitude',           '"longitude"'),
                ('address',             '"address"'),
                ('property_type',       '"propertyType"'),
                ('lot_description',     '"lotDescription"'),
                ('property_description','"propertyDescription"'),
                ('charges',             '"charges"'),
                ('charges_detail',      '"chargesDetail"'),
                ('possession_status',   '"possessionStatus"'),
                ('visitable',           '"visitable"'),
                ('cadastral_ref',       '"cadastralRef"'),
                ('cadastral_data',      '"cadastralData"'),
                ('registry_id',         '"registryId"'),
                ('registry_info',       '"registryInfo"'),
                ('contact_info',        '"contactInfo"'),
                ('pdf_url',             '"pdfUrl"'),
                ('image_url',           '"imageUrl"'),
                ('source',              '"source"'),
                ('court_reference',     '"courtReference"'),
                ('edict_url',           '"edictUrl"'),
                ('original_source',     '"originalSource"'),
                ('transitioned_at',     '"transitionedAt"'),
                ('map_url',             '"mapUrl"'),
                ('street_view_url',     '"streetViewUrl"'),
                ('place_url',           '"placeUrl"'),
                ('directions_url',      '"directionsUrl"'),
            ]

            for data_key, col in scalar_map:
                if data_key in data and data[data_key] is not None:
                    # Layer 2 guard: legacy rows are status-frozen. Skip the
                    # status assignment entirely so no scraper or backfill can
                    # ever re-activate a first-gen junk row (boeId ~ '^0x' /
                    # id ~ cuid). All other fields write normally.
                    if legacy_locked and data_key == 'status':
                        logger.info(
                            f"Legacy row {data['boe_id']} — status write "
                            f"suppressed (keep={data[data_key]!r})"
                        )
                        continue
                    update_fields.append(f'{col} = %s')
                    params.append(data[data_key])

            # Forge 1.3 structured fields — only if columns exist
            if 'suspensionReason' in forge_cols and data.get('suspension_reason') is not None:
                update_fields.append('"suspensionReason" = %s')
                params.append(data['suspension_reason'])
            if 'resumeAt' in forge_cols and data.get('resume_at') is not None:
                update_fields.append('"resumeAt" = %s')
                params.append(data['resume_at'])
            if 'suspensionMotive' in forge_cols and data.get('suspension_motive') is not None:
                update_fields.append('"suspensionMotive" = %s')
                params.append(data['suspension_motive'])
            if 'lastVerifiedAt' in forge_cols:
                update_fields.append('"lastVerifiedAt" = %s')
                params.append(now)
            if 'opensAt' in forge_cols and data.get('opens_at') is not None:
                update_fields.append('"opensAt" = %s')
                params.append(data['opens_at'])
            # #14 split provenance (additive, guarded).
            if 'sourceIdSub' in forge_cols and data.get('source_id_sub') is not None:
                update_fields.append('"sourceIdSub" = %s')
                params.append(data['source_id_sub'])
            if 'loteNumber' in forge_cols and data.get('lote_number') is not None:
                update_fields.append('"loteNumber" = %s')
                params.append(data['lote_number'])
            # #16 / #17 pujas + occupancy (additive, guarded). Only persisted
            # when present so a transient parse miss never blanks a good value.
            if 'pujaStatus' in forge_cols and data.get('puja_status') is not None:
                update_fields.append('"pujaStatus" = %s')
                params.append(data['puja_status'])
            if ('currentBidAmount' in forge_cols and data.get('current_bid_amount') is not None
                    and _bid_within_cap(data['current_bid_amount'],
                                        boe_id=data.get('boe_id', ''), field='currentBidAmount')):
                update_fields.append('"currentBidAmount" = %s')
                params.append(data['current_bid_amount'])
            if 'occupancy' in forge_cols and data.get('occupancy') is not None:
                update_fields.append('"occupancy" = %s')
                params.append(data['occupancy'])
            # Valor subasta (additive, guarded). Stored SEPARATELY from
            # appraisalValue/Tasación. Only persisted when present so a transient
            # parse miss never blanks a good value (honest-NULL preserved).
            if 'valorSubasta' in forge_cols and data.get('valor_subasta') is not None:
                update_fields.append('"valorSubasta" = %s')
                params.append(data['valor_subasta'])
            # Vehicle make/model/year (Forge 20260607, guarded). Written ONLY on
            # vehicle rows and ONLY when parsed (honest-NULL; never blanks a good
            # value on a transient parse miss). vehicleYear is a 4-digit int.
            for _vk, _vc in _VEHICLE_FIELD_COLS:
                if _vc in forge_cols and data.get(_vk) is not None:
                    update_fields.append(f'"{_vc}" = %s')
                    params.append(data[_vk])
            # G1 discrete "Datos del bien" columns (Forge 20260603). Guarded by
            # info_schema so this is safe before the migration is applied; only
            # written when the scraper actually parsed a value (never blanks).
            for _data_key, _col in _BIEN_FIELD_COLS:
                if _col in forge_cols and data.get(_data_key) is not None:
                    update_fields.append(f'"{_col}" = %s')
                    params.append(data[_data_key])
            # Property-portal attributes (Phase 1, guarded). Honest-NULL: only
            # written when the prose parser found a value (never blanks a good
            # column on a transient miss). booleans persist False when negated.
            for _data_key, _col in _PROPERTY_ATTR_COLS:
                if _col in forge_cols and data.get(_data_key) is not None:
                    update_fields.append(f'"{_col}" = %s')
                    params.append(data[_data_key])

            if not update_fields:
                # Nothing to update — still stamp updatedAt
                update_fields.append('"updatedAt" = %s')
                params.append(now)
                params.append(data['boe_id'])
            else:
                update_fields.append('"updatedAt" = %s')
                params.append(now)
                params.append(data['boe_id'])

            cursor.execute(
                f'UPDATE "Auction" SET {", ".join(update_fields)} WHERE "boeId" = %s',
                tuple(params)
            )
            logger.info(f"Updated auction: {data['boe_id']}")
        else:
            # Build dynamic insert so we only name columns we have values for
            col_names = [
                'id', '"boeId"', 'title', 'category', 'province', '"publishedAt"',
                'status', '"appraisalValue"', 'source', '"createdAt"', '"updatedAt"',
                '"viewCount"', '"favoriteCount"',
            ]
            placeholders = ['gen_random_uuid()', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '%s', '0', '0']
            vals = [
                data['boe_id'],
                data['title'],
                data['category'],
                data['province'],
                data['published_at'],
                data['status'],
                data.get('appraisal_value', 0.0),
                data.get('source', 'BOE'),
                now,
                now,
            ]

            optional_cols = [
                ('municipality',        '"municipality"',        'municipality'),
                ('current_bid',         '"currentBid"',          'current_bid'),
                ('minimum_bid',         '"minimumBid"',          'minimum_bid'),
                ('deposit_amount',      '"depositAmount"',       'deposit_amount'),
                ('claimed_amount',      '"claimedAmount"',       'claimed_amount'),
                ('final_bid',           '"finalBid"',            'final_bid'),
                ('bid_increment',       '"bidIncrement"',        'bid_increment'),
                ('court_name',          '"courtName"',           'court_name'),
                ('procedure_number',    '"procedureNumber"',     'procedure_number'),
                ('boe_link',            '"boeLink"',             'boe_link'),
                ('auction_id',          '"auctionId"',           'auction_id'),
                ('lot_number',          '"lotNumber"',           'lot_number'),
                ('boe_announcement',    '"boeAnnouncement"',     'boe_announcement'),
                ('ends_at',             '"endsAt"',              'ends_at'),
                ('end_date_time',       '"endDateTime"',         'end_date_time'),
                ('latitude',            '"latitude"',            'latitude'),
                ('longitude',           '"longitude"',           'longitude'),
                ('address',             '"address"',             'address'),
                ('property_type',       '"propertyType"',        'property_type'),
                ('lot_description',     '"lotDescription"',      'lot_description'),
                ('property_description','"propertyDescription"', 'property_description'),
                ('charges',             '"charges"',             'charges'),
                ('charges_detail',      '"chargesDetail"',       'charges_detail'),
                ('possession_status',   '"possessionStatus"',    'possession_status'),
                ('visitable',           '"visitable"',           'visitable'),
                ('cadastral_ref',       '"cadastralRef"',        'cadastral_ref'),
                ('cadastral_data',      '"cadastralData"',       'cadastral_data'),
                ('registry_id',         '"registryId"',          'registry_id'),
                ('registry_info',       '"registryInfo"',        'registry_info'),
                ('contact_info',        '"contactInfo"',         'contact_info'),
                ('pdf_url',             '"pdfUrl"',              'pdf_url'),
                ('image_url',           '"imageUrl"',            'image_url'),
                ('court_reference',     '"courtReference"',      'court_reference'),
                ('edict_url',           '"edictUrl"',            'edict_url'),
                ('original_source',     '"originalSource"',      'original_source'),
                ('auction_type',        '"auctionType"',         'auction_type'),
            ]

            for _key, col, data_key in optional_cols:
                v = data.get(data_key)
                if v is not None:
                    col_names.append(col)
                    placeholders.append('%s')
                    vals.append(v)

            # Forge 1.3 structured fields
            if 'suspensionReason' in forge_cols and data.get('suspension_reason') is not None:
                col_names.append('"suspensionReason"')
                placeholders.append('%s')
                vals.append(data['suspension_reason'])
            if 'resumeAt' in forge_cols and data.get('resume_at') is not None:
                col_names.append('"resumeAt"')
                placeholders.append('%s')
                vals.append(data['resume_at'])
            if 'suspensionMotive' in forge_cols and data.get('suspension_motive') is not None:
                col_names.append('"suspensionMotive"')
                placeholders.append('%s')
                vals.append(data['suspension_motive'])
            if 'lastVerifiedAt' in forge_cols:
                col_names.append('"lastVerifiedAt"')
                placeholders.append('%s')
                vals.append(now)
            if 'opensAt' in forge_cols and data.get('opens_at') is not None:
                col_names.append('"opensAt"')
                placeholders.append('%s')
                vals.append(data['opens_at'])
            # #14 split provenance (additive, guarded).
            if 'sourceIdSub' in forge_cols and data.get('source_id_sub') is not None:
                col_names.append('"sourceIdSub"')
                placeholders.append('%s')
                vals.append(data['source_id_sub'])
            if 'loteNumber' in forge_cols and data.get('lote_number') is not None:
                col_names.append('"loteNumber"')
                placeholders.append('%s')
                vals.append(data['lote_number'])
            # #16 / #17 pujas + occupancy (additive, guarded).
            if 'pujaStatus' in forge_cols and data.get('puja_status') is not None:
                col_names.append('"pujaStatus"')
                placeholders.append('%s')
                vals.append(data['puja_status'])
            if ('currentBidAmount' in forge_cols and data.get('current_bid_amount') is not None
                    and _bid_within_cap(data['current_bid_amount'],
                                        boe_id=data.get('boe_id', ''), field='currentBidAmount')):
                col_names.append('"currentBidAmount"')
                placeholders.append('%s')
                vals.append(data['current_bid_amount'])
            if 'occupancy' in forge_cols and data.get('occupancy') is not None:
                col_names.append('"occupancy"')
                placeholders.append('%s')
                vals.append(data['occupancy'])
            # Valor subasta (additive, guarded) — stored SEPARATELY from
            # appraisalValue/Tasación. Honest-NULL: only written when present.
            if 'valorSubasta' in forge_cols and data.get('valor_subasta') is not None:
                col_names.append('"valorSubasta"')
                placeholders.append('%s')
                vals.append(data['valor_subasta'])
            # Vehicle make/model/year (Forge 20260607, guarded). Honest-NULL.
            for _vk, _vc in _VEHICLE_FIELD_COLS:
                if _vc in forge_cols and data.get(_vk) is not None:
                    col_names.append(f'"{_vc}"')
                    placeholders.append('%s')
                    vals.append(data[_vk])
            # G1 discrete "Datos del bien" columns (Forge 20260603, guarded).
            for _data_key, _col in _BIEN_FIELD_COLS:
                if _col in forge_cols and data.get(_data_key) is not None:
                    col_names.append(f'"{_col}"')
                    placeholders.append('%s')
                    vals.append(data[_data_key])
            # Property-portal attributes (Phase 1, guarded). Honest-NULL.
            for _data_key, _col in _PROPERTY_ATTR_COLS:
                if _col in forge_cols and data.get(_data_key) is not None:
                    col_names.append(f'"{_col}"')
                    placeholders.append('%s')
                    vals.append(data[_data_key])

            # Scope soft-hide gate (wave155, guarded). Enforce ingestion scope
            # at THE choke-point for ALL sources: only property/land + vehicle
            # rows that carry REAL data are shown; movable/rights/unclassified
            # and empty-shell rows are inserted with inScope=false + a reason so
            # they never surface in the catalog (reversible — never dropped).
            # Dennis (2026-07-28): we should never SHOW an auction we have no
            # real info about. A dead source link ALONE is NOT a reason to hide
            # (decide_scope never inspects link liveness). Kept a soft-hide
            # (not a hard INSERT skip) so the row stays inspectable/reversible
            # and any by-boeId enrichment (documents, results) still resolves.
            if 'inScope' in forge_cols:
                in_scope, scope_reason = decide_scope(
                    category=data.get('category'),
                    appraisal_value=data.get('appraisal_value'),
                    valor_subasta=data.get('valor_subasta'),
                    address=data.get('address'),
                    lot_description=data.get('lot_description'),
                    property_description=data.get('property_description'),
                    cadastral_ref=data.get('cadastral_ref'),
                    title=data.get('title'),
                )
                col_names.append('"inScope"')
                placeholders.append('%s')
                vals.append(in_scope)
                if 'scopeReason' in forge_cols:
                    col_names.append('"scopeReason"')
                    placeholders.append('%s')
                    vals.append(scope_reason)
                if not in_scope:
                    logger.info(
                        f"Scope gate — {data['boe_id']} hidden "
                        f"(reason={scope_reason}, category={data.get('category')!r})"
                    )

            sql = f'INSERT INTO "Auction" ({", ".join(col_names)}) VALUES ({", ".join(placeholders)})'
            cursor.execute(sql, tuple(vals))
            logger.info(f"Inserted auction: {data['boe_id']}")

        conn.commit()
        return data['boe_id']
    
    def _generate_id(self) -> str:
        """Generate unique ID for SQLite"""
        import uuid
        return str(uuid.uuid4())
    
    def get_active_auctions(self) -> List[Dict[str, Any]]:
        """Get all ACTIVE auctions"""
        conn = self.connect()
        
        if self.db_type == 'sqlite':
            query = '''
                SELECT * FROM Auction
                WHERE status = 'ACTIVE'
                ORDER BY endsAt ASC
            '''
        else:
            query = '''
                SELECT * FROM "Auction"
                WHERE status = 'ACTIVE'
                ORDER BY "endsAt" ASC
            '''
        
        cursor = self.execute_query(query)
        rows = cursor.fetchall()
        
        return [dict(row) for row in rows]
    
    def transition_status(self, boe_id: str, from_status: str, to_status: str, metadata: Optional[Dict] = None) -> bool:
        """
        Handle status transitions (PRE_AUCTION -> ACTIVE -> FINISHED)
        
        Args:
            boe_id: Auction identifier
            from_status: Expected current status
            to_status: New status
            metadata: Optional metadata about transition
        
        Returns:
            True if transition successful
        """
        conn = self.connect()
        
        try:
            now = datetime.now()
            if self.db_type == 'sqlite':
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE Auction
                    SET status = ?, transitionedAt = ?, updatedAt = ?
                    WHERE boeId = ? AND status = ?
                ''', (to_status, now.isoformat(), now.isoformat(), boe_id, from_status))
            else:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE "Auction"
                    SET status = %s, "transitionedAt" = %s, "updatedAt" = %s
                    WHERE "boeId" = %s AND status = %s
                ''', (to_status, now, now, boe_id, from_status))
            
            affected = cursor.rowcount
            conn.commit()
            
            if affected > 0:
                logger.info(f"Transitioned {boe_id}: {from_status} -> {to_status}")
                return True
            else:
                logger.warning(f"No transition for {boe_id} (not in {from_status} status)")
                return False
        
        except Exception as e:
            conn.rollback()
            logger.error(f"Status transition failed: {e}")
            raise
    
    def get_auctions_by_status(self, status: str) -> List[Dict[str, Any]]:
        """Get all auctions with a specific status"""
        conn = self.connect()
        
        if self.db_type == 'sqlite':
            query = 'SELECT * FROM Auction WHERE status = ? ORDER BY updatedAt DESC'
            params = (status,)
        else:
            query = 'SELECT * FROM "Auction" WHERE status = %s ORDER BY "updatedAt" DESC'
            params = (status,)
        
        cursor = self.execute_query(query, params)
        rows = cursor.fetchall()
        
        return [dict(row) for row in rows]
    
    def get_urgent_auctions(self, cutoff_time: datetime) -> List[Dict[str, Any]]:
        """Get live auctions (CELEBRANDOSE + legacy ACTIVE) ending before cutoff_time"""
        conn = self.connect()

        # G1 FIX: include CELEBRANDOSE — the real BOE "live now" status
        if self.db_type == 'sqlite':
            query = """
                SELECT * FROM Auction
                WHERE status IN ('CELEBRANDOSE', 'ACTIVE') AND endsAt <= ?
                ORDER BY endsAt ASC
            """
            params = (cutoff_time.isoformat(),)
        else:
            query = """
                SELECT * FROM "Auction"
                WHERE status IN ('CELEBRANDOSE', 'ACTIVE') AND "endsAt" <= %s
                ORDER BY "endsAt" ASC
            """
            params = (cutoff_time,)
        
        cursor = self.execute_query(query, params)
        rows = cursor.fetchall()
        
        return [dict(row) for row in rows]
    
    def update_auction_bid(self, boe_id: str, current_bid: float) -> bool:
        """Update the current bid for an auction"""
        conn = self.connect()
        
        try:
            if self.db_type == 'sqlite':
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE Auction
                    SET currentBid = ?, updatedAt = ?
                    WHERE boeId = ?
                ''', (current_bid, datetime.now().isoformat(), boe_id))
            else:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE "Auction"
                    SET "currentBid" = %s, "updatedAt" = %s
                    WHERE "boeId" = %s
                ''', (current_bid, datetime.now(), boe_id))
            
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to update bid for {boe_id}: {e}")
            raise
    
    def archive_old_auctions(self, cutoff_date: datetime) -> int:
        """Archive (or mark) auctions finished before cutoff_date"""
        conn = self.connect()
        
        try:
            # For now, we'll just count them. In production, you might move to archive table
            if self.db_type == 'sqlite':
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT COUNT(*) FROM Auction
                    WHERE status = 'FINISHED' AND endsAt < ?
                ''', (cutoff_date.isoformat(),))
            else:
                cursor = conn.cursor()
                cursor.execute('''
                    SELECT COUNT(*) FROM "Auction"
                    WHERE status = 'FINISHED' AND "endsAt" < %s
                ''', (cutoff_date,))
            
            count = cursor.fetchone()[0]
            logger.info(f"Found {count} old auctions to archive")
            return count
        except Exception as e:
            logger.error(f"Archive operation failed: {e}")
            raise
    
    def cleanup_duplicates(self) -> int:
        """Remove duplicate auctions (keep most recent)"""
        conn = self.connect()
        
        try:
            if self.db_type == 'sqlite':
                cursor = conn.cursor()
                cursor.execute('''
                    DELETE FROM Auction
                    WHERE id NOT IN (
                        SELECT MIN(id)
                        FROM Auction
                        GROUP BY boeId
                    )
                ''')
            else:
                cursor = conn.cursor()
                cursor.execute('''
                    DELETE FROM "Auction"
                    WHERE id NOT IN (
                        SELECT MIN(id)
                        FROM "Auction"
                        GROUP BY "boeId"
                    )
                ''')
            
            deleted = cursor.rowcount
            conn.commit()
            logger.info(f"Cleaned up {deleted} duplicate auctions")
            return deleted
        except Exception as e:
            conn.rollback()
            logger.error(f"Cleanup failed: {e}")
            raise
    
    def get_auctions_without_coordinates(self) -> List[Dict[str, Any]]:
        """Get auctions that don't have latitude/longitude"""
        conn = self.connect()
        
        if self.db_type == 'sqlite':
            query = '''
                SELECT * FROM Auction
                WHERE (latitude IS NULL OR longitude IS NULL)
                AND address IS NOT NULL
                LIMIT 100
            '''
        else:
            query = '''
                SELECT * FROM "Auction"
                WHERE (latitude IS NULL OR longitude IS NULL)
                AND address IS NOT NULL
                LIMIT 100
            '''
        
        cursor = self.execute_query(query)
        rows = cursor.fetchall()
        
        return [dict(row) for row in rows]

    def update_auction(self, boe_id: str, updates: Dict[str, Any]) -> bool:
        """Update auction fields by boeId"""
        if not updates:
            return False

        column_map = {
            'boe_id': 'boeId',
            'current_bid': 'currentBid',
            'minimum_bid': 'minimumBid',
            'auction_type': 'auctionType',
            'court_reference': 'courtReference',
            'court_name': 'courtName',
            'procedure_number': 'procedureNumber',
            'boe_link': 'boeLink',
            'edict_url': 'edictUrl',
            'boe_announcement': 'boeAnnouncement',
            'lot_description': 'lotDescription',
            'property_description': 'propertyDescription',
            'charges_detail': 'chargesDetail',
            'image_url': 'imageUrl',
            'pdf_url': 'pdfUrl',
            'map_url': 'mapUrl',
            'street_view_url': 'streetViewUrl',
            'place_url': 'placeUrl',
            'directions_url': 'directionsUrl',
            'original_source': 'originalSource',
        }

        fields = []
        params = []

        for key, value in updates.items():
            column = column_map.get(key, key)
            if column == 'boeId':
                continue
            fields.append(column)
            params.append(value)

        if not fields:
            return False

        conn = self.connect()
        try:
            if self.db_type == 'sqlite':
                set_clause = ", ".join([f"{col} = ?" for col in fields] + ["updatedAt = ?"])
                params.append(datetime.now().isoformat())
                params.append(boe_id)
                cursor = conn.cursor()
                cursor.execute(
                    f"UPDATE Auction SET {set_clause} WHERE boeId = ?",
                    tuple(params)
                )
            else:
                set_clause = ", ".join([f"\"{col}\" = %s" for col in fields] + ["\"updatedAt\" = %s"])
                params.append(datetime.now())
                params.append(boe_id)
                cursor = conn.cursor()
                cursor.execute(
                    f"UPDATE \"Auction\" SET {set_clause} WHERE \"boeId\" = %s",
                    tuple(params)
                )

            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to update auction {boe_id}: {e}")
            raise
    
    def update_auction_coordinates(self, boe_id: str, latitude: float, longitude: float) -> bool:
        """Update coordinates for an auction"""
        conn = self.connect()
        
        try:
            if self.db_type == 'sqlite':
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE Auction
                    SET latitude = ?, longitude = ?, updatedAt = ?
                    WHERE boeId = ?
                ''', (latitude, longitude, datetime.now().isoformat(), boe_id))
            else:
                cursor = conn.cursor()
                cursor.execute('''
                    UPDATE "Auction"
                    SET latitude = %s, longitude = %s, "updatedAt" = %s
                    WHERE "boeId" = %s
                ''', (latitude, longitude, datetime.now(), boe_id))
            
            conn.commit()
            return cursor.rowcount > 0
        except Exception as e:
            conn.rollback()
            logger.error(f"Failed to update coordinates for {boe_id}: {e}")
            raise


# Global instance
_database_adapter = None


def get_database_adapter() -> DatabaseAdapter:
    """Get the global database adapter instance"""
    global _database_adapter
    if _database_adapter is None:
        _database_adapter = DatabaseAdapter()
    return _database_adapter

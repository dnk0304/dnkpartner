"""
Database Adapter Module
Unified adapter supporting both SQLite and PostgreSQL
"""

import sqlite3
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

logger = logging.getLogger(__name__)


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
        """Run a SELECT query and return rows as dicts"""
        cursor = self.execute_query(query, params)
        rows = cursor.fetchall()
        return [dict(row) for row in rows]
    
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
        """PostgreSQL-specific upsert"""
        cursor = conn.cursor()
        
        # Check if exists
        cursor.execute('SELECT id FROM "Auction" WHERE "boeId" = %s', (data['boe_id'],))
        existing = cursor.fetchone()
        
        if existing:
            # Update
            update_fields = []
            params = []
            now = datetime.now()

            if 'current_bid' in data:
                update_fields.append('"currentBid" = %s')
                params.append(data.get('current_bid'))
            if 'status' in data:
                update_fields.append('"status" = %s')
                params.append(data.get('status'))
            if data.get('boe_announcement'):
                update_fields.append('"boeAnnouncement" = %s')
                params.append(data.get('boe_announcement'))
            if data.get('lot_description'):
                update_fields.append('"lotDescription" = %s')
                params.append(data.get('lot_description'))
            if data.get('property_description'):
                update_fields.append('"propertyDescription" = %s')
                params.append(data.get('property_description'))
            if data.get('charges_detail'):
                update_fields.append('"chargesDetail" = %s')
                params.append(data.get('charges_detail'))
            if data.get('source'):
                update_fields.append('"source" = %s')
                params.append(data.get('source'))
            if data.get('auction_type'):
                update_fields.append('"auctionType" = %s')
                params.append(data.get('auction_type'))
            if data.get('court_reference'):
                update_fields.append('"courtReference" = %s')
                params.append(data.get('court_reference'))
            if data.get('edict_url'):
                update_fields.append('"edictUrl" = %s')
                params.append(data.get('edict_url'))
            if data.get('pdf_url'):
                update_fields.append('"pdfUrl" = %s')
                params.append(data.get('pdf_url'))

            update_fields.append('"updatedAt" = %s')
            params.append(now)
            params.append(data['boe_id'])

            cursor.execute(
                f'''
                UPDATE "Auction"
                SET {", ".join(update_fields)}
                WHERE "boeId" = %s
                ''',
                tuple(params)
            )
            logger.info(f"Updated auction: {data['boe_id']}")
        else:
            # Insert
            cursor.execute('''
                INSERT INTO "Auction" (
                    id, "boeId", title, category, province, municipality,
                    status, "appraisalValue", "currentBid", "minimumBid",
                    "courtName", "procedureNumber", "boeLink",
                    "publishedAt", "endsAt",
                    latitude, longitude, address, "pdfUrl", "imageUrl",
                    "source", "auctionType", "courtReference", "edictUrl",
                    "boeAnnouncement", "lotDescription", "propertyDescription", "chargesDetail",
                    "createdAt", "updatedAt"
                ) VALUES (
                    gen_random_uuid(), %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s, %s,
                    %s, %s,
                    %s, %s, %s, %s, %s,
                    %s, %s, %s, %s,
                    %s, %s
                )
            ''', (
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
                data['published_at'],
                data.get('ends_at'),
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
                datetime.now(),
                datetime.now(),
            ))
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
        """Get ACTIVE auctions ending before cutoff_time"""
        conn = self.connect()
        
        if self.db_type == 'sqlite':
            query = '''
                SELECT * FROM Auction
                WHERE status = 'ACTIVE' AND endsAt <= ?
                ORDER BY endsAt ASC
            '''
            params = (cutoff_time.isoformat(),)
        else:
            query = '''
                SELECT * FROM "Auction"
                WHERE status = 'ACTIVE' AND "endsAt" <= %s
                ORDER BY "endsAt" ASC
            '''
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

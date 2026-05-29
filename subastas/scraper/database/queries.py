"""
Queries Module
SQL query templates and helpers
"""

from typing import List, Dict, Any, Optional


class AuctionQueries:
    """SQL query templates for auction operations"""
    
    @staticmethod
    def get_by_boe_id(db_type: str, boe_id: str) -> tuple:
        """Get auction by boeId"""
        if db_type == 'sqlite':
            query = 'SELECT * FROM Auction WHERE boeId = ?'
        else:
            query = 'SELECT * FROM "Auction" WHERE "boeId" = %s'
        
        return (query, (boe_id,))
    
    @staticmethod
    def get_by_province(db_type: str, province: str) -> tuple:
        """Get auctions by province"""
        if db_type == 'sqlite':
            query = 'SELECT * FROM Auction WHERE province = ? ORDER BY publishedAt DESC'
        else:
            query = 'SELECT * FROM "Auction" WHERE province = %s ORDER BY "publishedAt" DESC'
        
        return (query, (province,))
    
    @staticmethod
    def get_by_status(db_type: str, status: str) -> tuple:
        """Get auctions by status"""
        if db_type == 'sqlite':
            query = 'SELECT * FROM Auction WHERE status = ? ORDER BY endsAt ASC'
        else:
            query = 'SELECT * FROM "Auction" WHERE status = %s ORDER BY "endsAt" ASC'
        
        return (query, (status,))
    
    @staticmethod
    def get_urgent_auctions(db_type: str, hours: int = 24) -> tuple:
        """Get auctions ending within specified hours"""
        if db_type == 'sqlite':
            query = '''
                SELECT * FROM Auction
                WHERE status = 'ACTIVE'
                    AND datetime(endsAt) BETWEEN datetime('now') AND datetime('now', '+{} hours')
                ORDER BY endsAt ASC
            '''.format(hours)
            return (query, tuple())
        else:
            query = '''
                SELECT * FROM "Auction"
                WHERE status = 'ACTIVE'
                    AND "endsAt" BETWEEN NOW() AND NOW() + INTERVAL '%s hours'
                ORDER BY "endsAt" ASC
            '''
            return (query, (hours,))
    
    @staticmethod
    def get_pre_auction(db_type: str) -> tuple:
        """Get all PRE_AUCTION items to check if they became ACTIVE"""
        if db_type == 'sqlite':
            query = "SELECT * FROM Auction WHERE status IN ('PRE_AUCTION', 'TEJU')"
        else:
            query = 'SELECT * FROM "Auction" WHERE status IN (\'PRE_AUCTION\', \'TEJU\')'
        
        return (query, tuple())
    
    @staticmethod
    def mark_finished(db_type: str, boe_id: str, final_bid: Optional[float] = None) -> tuple:
        """Mark auction as FINISHED"""
        if db_type == 'sqlite':
            if final_bid is not None:
                query = '''
                    UPDATE Auction
                    SET status = 'FINISHED', currentBid = ?, updatedAt = datetime('now')
                    WHERE boeId = ?
                '''
                return (query, (final_bid, boe_id))
            else:
                query = '''
                    UPDATE Auction
                    SET status = 'FINISHED', updatedAt = datetime('now')
                    WHERE boeId = ?
                '''
                return (query, (boe_id,))
        else:
            if final_bid is not None:
                query = '''
                    UPDATE "Auction"
                    SET status = 'FINISHED', "currentBid" = %s, "updatedAt" = NOW()
                    WHERE "boeId" = %s
                '''
                return (query, (final_bid, boe_id))
            else:
                query = '''
                    UPDATE "Auction"
                    SET status = 'FINISHED', "updatedAt" = NOW()
                    WHERE "boeId" = %s
                '''
                return (query, (boe_id,))
    
    @staticmethod
    def get_statistics(db_type: str) -> tuple:
        """Get auction statistics"""
        if db_type == 'sqlite':
            query = '''
                SELECT 
                    status,
                    COUNT(*) as count,
                    AVG(appraisalValue) as avg_value,
                    SUM(appraisalValue) as total_value
                FROM Auction
                GROUP BY status
            '''
        else:
            query = '''
                SELECT 
                    status,
                    COUNT(*) as count,
                    AVG("appraisalValue") as avg_value,
                    SUM("appraisalValue") as total_value
                FROM "Auction"
                GROUP BY status
            '''
        
        return (query, tuple())

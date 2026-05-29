from typing import Optional, List, Dict, Any
from datetime import datetime, timedelta

from database.adapter import get_database_adapter

# NOTE: This module is a compatibility wrapper.
# All database writes should use DatabaseAdapter (SQLite by default).

def _get_adapter():
    return get_database_adapter()

def upsert_auction(auction_data: Dict[str, Any]) -> str:
    """
    Insert or update an auction record
    Returns the auction ID
    """
    adapter = _get_adapter()
    return adapter.upsert_auction(auction_data)

def get_active_auctions() -> List[Dict[str, Any]]:
    """Get all ACTIVE auctions from database"""
    adapter = _get_adapter()
    return adapter.get_active_auctions()

def get_urgent_auctions(hours: int = 24) -> List[Dict[str, Any]]:
    """Get auctions ending within the specified hours"""
    adapter = _get_adapter()
    cutoff = datetime.now() + timedelta(hours=hours)
    return adapter.get_urgent_auctions(cutoff)

def mark_auction_finished(boe_id: str, final_bid: Optional[float] = None):
    """Mark an auction as FINISHED"""
    adapter = _get_adapter()
    conn = adapter.connect()
    try:
        now = datetime.now()
        if adapter.db_type == 'sqlite':
            if final_bid is not None:
                conn.execute(
                    'UPDATE Auction SET status = ?, currentBid = ?, updatedAt = ? WHERE boeId = ?',
                    ('CONCLUIDA_PORTAL', final_bid, now.isoformat(), boe_id)
                )
            else:
                conn.execute(
                    'UPDATE Auction SET status = ?, updatedAt = ? WHERE boeId = ?',
                    ('CONCLUIDA_PORTAL', now.isoformat(), boe_id)
                )
        else:
            if final_bid is not None:
                conn.cursor().execute(
                    'UPDATE "Auction" SET status = %s, "currentBid" = %s, "updatedAt" = %s WHERE "boeId" = %s',
                    ('CONCLUIDA_PORTAL', final_bid, now, boe_id)
                )
            else:
                conn.cursor().execute(
                    'UPDATE "Auction" SET status = %s, "updatedAt" = %s WHERE "boeId" = %s',
                    ('CONCLUIDA_PORTAL', now, boe_id)
                )
        conn.commit()
        print(f"🏁 Marked auction as CONCLUIDA_PORTAL: {boe_id}")
    except Exception as e:
        conn.rollback()
        print(f"❌ Error marking auction finished: {e}")
        raise

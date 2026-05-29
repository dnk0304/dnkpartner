#!/usr/bin/env python3
"""
Delete all auctions from AlertaSubastas source
"""

import sys
import sqlite3
from pathlib import Path

project_root = Path(__file__).parent.parent
db_path = project_root / 'data' / 'database' / 'prod.db'

def delete_alertasubastas_auctions():
    print("=" * 70)
    print("DELETE ALERTASUBASTAS AUCTIONS")
    print("=" * 70)
    
    # Connect to database
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Count AlertaSubastas auctions
    cursor.execute("SELECT COUNT(*) FROM Auction WHERE source = 'ALERTA_SUBASTAS'")
    count_before = cursor.fetchone()[0]
    
    print(f"\nAuctions from AlertaSubastas: {count_before:,}")
    
    if count_before == 0:
        print("No AlertaSubastas auctions found.")
        conn.close()
        return
    
    # Get total before deletion
    cursor.execute("SELECT COUNT(*) FROM Auction")
    total_before = cursor.fetchone()[0]
    print(f"Total auctions before deletion: {total_before:,}")
    
    # Delete AlertaSubastas auctions
    print(f"\nDeleting {count_before:,} auctions from AlertaSubastas...")
    cursor.execute("DELETE FROM Auction WHERE source = 'ALERTA_SUBASTAS'")
    conn.commit()
    
    # Verify deletion
    cursor.execute("SELECT COUNT(*) FROM Auction")
    total_after = cursor.fetchone()[0]
    
    deleted = total_before - total_after
    
    print(f"\n✓ Deletion complete!")
    print(f"Deleted: {deleted:,} auctions")
    print(f"Remaining: {total_after:,} auctions")
    
    # Show breakdown by source
    print("\nRemaining auctions by source:")
    cursor.execute("SELECT source, COUNT(*) FROM Auction GROUP BY source ORDER BY COUNT(*) DESC")
    for source, count in cursor.fetchall():
        print(f"  {source}: {count:,}")
    
    conn.close()
    print("=" * 70)

if __name__ == '__main__':
    try:
        delete_alertasubastas_auctions()
    except Exception as e:
        print(f"\nError: {e}")
        sys.exit(1)

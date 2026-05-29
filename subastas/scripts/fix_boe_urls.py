#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Script to fix BOE URLs in the production database.
Updates all auctions to have correct BOE portal URLs.
"""

import sqlite3
import sys
from pathlib import Path

# Fix Windows console encoding
if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

# Database path
DB_PATH = Path(__file__).parent.parent / "data" / "database" / "prod.db"

def fix_boe_urls():
    """Update all auction BOE links to use correct BOE portal format."""
    
    print("🔧 Fixing BOE URLs in production database...")
    print(f"📁 Database: {DB_PATH}")
    
    if not DB_PATH.exists():
        print(f"❌ Database not found at {DB_PATH}")
        sys.exit(1)
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    
    # Get statistics before
    cursor.execute("""
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN boeLink IS NOT NULL AND boeLink != '' THEN 1 END) as with_links,
            COUNT(CASE WHEN boeLink LIKE '%example.com%' OR boeLink LIKE '%/pdfs/%' THEN 1 END) as bad_links
        FROM Auction
    """)
    before_stats = cursor.fetchone()
    print(f"\n📊 Before fix:")
    print(f"  Total auctions: {before_stats[0]:,}")
    print(f"  With boeLink: {before_stats[1]:,}")
    print(f"  With bad/mock links: {before_stats[2]:,}")
    
    # Sample of current URLs
    cursor.execute("SELECT id, boeId, boeLink, status FROM Auction WHERE boeLink IS NOT NULL LIMIT 3")
    print(f"\n🔍 Sample of current URLs:")
    for row in cursor.fetchall():
        print(f"  BOE ID: {row[1]}")
        print(f"    Link: {row[2]}")
        print(f"    Status: {row[3]}")
    
    # Update all auctions with non-PRE_AUCTION status to have correct BOE portal URLs
    print(f"\n🔄 Updating BOE links...")
    
    cursor.execute("""
        UPDATE Auction 
        SET boeLink = 'https://subastas.boe.es/detalleSubasta.php?idSub=' || boeId
        WHERE status != 'PRE_AUCTION' 
        AND boeId IS NOT NULL 
        AND boeId != ''
    """)
    
    updated_count = cursor.rowcount
    print(f"  ✅ Updated {updated_count:,} auction links")
    
    # Set PRE_AUCTION boeLinks to NULL (they don't have BOE links yet)
    cursor.execute("""
        UPDATE Auction 
        SET boeLink = NULL
        WHERE status = 'PRE_AUCTION'
    """)
    
    pre_auction_count = cursor.rowcount
    print(f"  ✅ Cleared {pre_auction_count:,} pre-auction links")
    
    # Commit changes
    conn.commit()
    
    # Get statistics after
    cursor.execute("""
        SELECT 
            COUNT(*) as total,
            COUNT(CASE WHEN boeLink IS NOT NULL AND boeLink != '' THEN 1 END) as with_links,
            COUNT(CASE WHEN boeLink LIKE '%subastas.boe.es%' THEN 1 END) as correct_links
        FROM Auction
    """)
    after_stats = cursor.fetchone()
    print(f"\n📊 After fix:")
    print(f"  Total auctions: {after_stats[0]:,}")
    print(f"  With boeLink: {after_stats[1]:,}")
    print(f"  With correct BOE portal links: {after_stats[2]:,}")
    
    # Sample of fixed URLs
    cursor.execute("SELECT id, boeId, boeLink, status FROM Auction WHERE boeLink IS NOT NULL LIMIT 5")
    print(f"\n✨ Sample of fixed URLs:")
    for row in cursor.fetchall():
        print(f"  BOE ID: {row[1]}")
        print(f"    Link: {row[2]}")
        print(f"    Status: {row[3]}")
    
    # Show status breakdown
    cursor.execute("""
        SELECT status, COUNT(*) as count, 
               COUNT(CASE WHEN boeLink IS NOT NULL THEN 1 END) as with_link
        FROM Auction 
        GROUP BY status
    """)
    print(f"\n📈 By status:")
    for row in cursor.fetchall():
        print(f"  {row[0]}: {row[1]:,} total, {row[2]:,} with links")
    
    conn.close()
    print(f"\n🎉 BOE URLs fixed successfully!")

if __name__ == "__main__":
    fix_boe_urls()

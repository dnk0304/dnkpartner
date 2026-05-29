# -*- coding: utf-8 -*-
"""
Clear mock/seed data from the database to prepare for real scraper data.
"""
import sqlite3
import sys
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

db_path = Path('data/database/prod.db')

print("="*70)
print("🗑️  CLEAR MOCK DATA FROM DATABASE")
print("="*70)

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Count current auctions
cursor.execute("SELECT COUNT(*) FROM Auction")
total_before = cursor.fetchone()[0]

cursor.execute("""
    SELECT 
        CASE 
            WHEN boeId LIKE 'BOE-%' THEN 'Mock BOE'
            WHEN boeId LIKE 'SUB-%' THEN 'Mock SUB'
            WHEN boeId LIKE 'TEJU-%' THEN 'Mock TEJU'
            ELSE 'Real Scraped'
        END as type,
        COUNT(*) as count
    FROM Auction
    GROUP BY type
""")

print(f"\n📊 Current database content:")
print(f"  Total auctions: {total_before:,}")
for row in cursor.fetchall():
    type_name, count = row
    print(f"  {type_name:15} : {count:,}")

print(f"\n⚠️  WARNING: This will delete all mock/seed data!")
print(f"❓ Do you want to continue? (This script will proceed)")

# Delete all mock data (BOE-*, SUB-*, TEJU-*)
cursor.execute("""
    DELETE FROM Auction 
    WHERE boeId LIKE 'BOE-%' 
    OR boeId LIKE 'SUB-%' 
    OR boeId LIKE 'TEJU-%'
""")

deleted_count = cursor.rowcount
conn.commit()

# Count remaining auctions
cursor.execute("SELECT COUNT(*) FROM Auction")
total_after = cursor.fetchone()[0]

print(f"\n✅ Deletion complete:")
print(f"  Deleted: {deleted_count:,} mock auctions")
print(f"  Remaining: {total_after:,} real auctions")

conn.close()

print(f"\n🎯 Next steps:")
print(f"  1. Run the BOE scraper to fetch real auction data")
print(f"  2. Real auctions will have valid BOE IDs that work on the portal")
print("="*70)

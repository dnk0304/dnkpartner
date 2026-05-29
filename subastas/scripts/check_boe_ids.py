# -*- coding: utf-8 -*-
import sqlite3
import sys
from pathlib import Path

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

db_path = Path('data/database/prod.db')
conn = sqlite3.connect(db_path)
cursor = conn.cursor()

print("🔍 Checking BOE ID formats in database...")
print("\n" + "="*70)

# Check different BOE ID patterns
cursor.execute("""
    SELECT 
        CASE 
            WHEN boeId LIKE 'BOE-%' THEN 'Mock (BOE-*)'
            WHEN boeId LIKE 'SUB-%' THEN 'Mock (SUB-*)'
            WHEN boeId LIKE 'TEJU-%' THEN 'Pre-auction (TEJU-*)'
            ELSE 'Real Scraped'
        END as pattern,
        COUNT(*) as count,
        MIN(boeId) as example
    FROM Auction
    GROUP BY pattern
""")

print("📊 BOE ID Patterns:")
for row in cursor.fetchall():
    pattern, count, example = row
    print(f"  {pattern:20} | Count: {count:4} | Example: {example}")

print("\n" + "="*70)
print("\n🔍 Real scraped BOE IDs (if any):")

# Get real scraped auctions
cursor.execute("""
    SELECT boeId, boeLink, title, status
    FROM Auction
    WHERE boeId NOT LIKE 'BOE-%' 
    AND boeId NOT LIKE 'SUB-%' 
    AND boeId NOT LIKE 'TEJU-%'
    LIMIT 10
""")

rows = cursor.fetchall()
if rows:
    for row in rows:
        boe_id, boe_link, title, status = row
        print(f"\n  BOE ID: {boe_id}")
        print(f"  Link:   {boe_link}")
        print(f"  Title:  {title[:50]}...")
        print(f"  Status: {status}")
else:
    print("  ⚠️  No real scraped auctions found - all are mock data!")

conn.close()

#!/usr/bin/env python3
import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Count pre-auctions
cur.execute('SELECT COUNT(*) FROM Auction WHERE status IN ("PRE_AUCTION", "PROXIMA_APERTURA")')
count = cur.fetchone()[0]
print(f'Pre-auction count: {count}')

# Show sample data
cur.execute('SELECT title, province, status FROM Auction WHERE status IN ("PRE_AUCTION", "PROXIMA_APERTURA") LIMIT 5')
print('\nSample pre-auctions:')
for row in cur.fetchall():
    print(f'  - {row[0][:60]}... | {row[1]} | {row[2]}')

# Show status breakdown
cur.execute('SELECT status, COUNT(*) FROM Auction GROUP BY status ORDER BY COUNT(*) DESC')
print('\nAll statuses:')
for row in cur.fetchall():
    print(f'  {row[0]}: {row[1]}')

conn.close()

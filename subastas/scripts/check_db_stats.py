# -*- coding: utf-8 -*-
import sys
import io
sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding='utf-8')

import sqlite3
from pathlib import Path

DB_PATH = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

conn = sqlite3.connect(DB_PATH)
cur = conn.cursor()

# Status breakdown
cur.execute('SELECT status, COUNT(*) FROM Auction GROUP BY status ORDER BY COUNT(*) DESC')
print('\n📊 Auction Status Breakdown:')
for row in cur.fetchall():
    print(f'  {row[0]}: {row[1]}')

# Category breakdown
cur.execute('SELECT category, COUNT(*) FROM Auction WHERE category IS NOT NULL GROUP BY category ORDER BY COUNT(*) DESC LIMIT 10')
print('\n📋 Top 10 Categories:')
for row in cur.fetchall():
    print(f'  {row[0]}: {row[1]}')

# Auction type breakdown
cur.execute('SELECT auctionType, COUNT(*) FROM Auction WHERE auctionType IS NOT NULL GROUP BY auctionType')
print('\n🏛️  Auction Type Breakdown:')
for row in cur.fetchall():
    print(f'  {row[0]}: {row[1]}')

# Total
cur.execute('SELECT COUNT(*) FROM Auction')
print(f'\n✅ Total Auctions: {cur.fetchone()[0]}')

conn.close()

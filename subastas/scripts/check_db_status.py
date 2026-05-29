#!/usr/bin/env python3
"""Quick status check for database"""

import sqlite3
from pathlib import Path

db_path = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'

conn = sqlite3.connect(db_path)
cursor = conn.cursor()

# Total auctions
cursor.execute('SELECT COUNT(*) FROM Auction')
total = cursor.fetchone()[0]

# By status
cursor.execute('SELECT status, COUNT(*) FROM Auction GROUP BY status ORDER BY COUNT(*) DESC')
statuses = cursor.fetchall()

print('=' * 50)
print('DATABASE STATUS UPDATE')
print('=' * 50)
print(f'\nTotal auctions: {total:,}')
print(f'\nBy status:')
for status, count in statuses:
    print(f'  {status}: {count:,}')

conn.close()

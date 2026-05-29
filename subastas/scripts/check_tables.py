#!/usr/bin/env python3
import sqlite3
from pathlib import Path

db_path = Path(__file__).parent.parent / 'data' / 'database' / 'prod.db'
conn = sqlite3.connect(db_path)
cursor = conn.cursor()
cursor.execute('SELECT name FROM sqlite_master WHERE type="table"')
print([row[0] for row in cursor.fetchall()])
conn.close()

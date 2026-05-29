import sqlite3
from pathlib import Path

DB_PATH = Path("data/database/prod.db")

conn = sqlite3.connect(DB_PATH)
cursor = conn.cursor()

# Count AlertaSubastas auctions
cursor.execute("SELECT COUNT(*) FROM Auction WHERE originalSource = 'AlertaSubastas' OR source = 'AlertaSubastas'")
alerta_count = cursor.fetchone()[0]

# Count by status
cursor.execute("SELECT status, COUNT(*) FROM Auction WHERE originalSource = 'AlertaSubastas' OR source = 'AlertaSubastas' GROUP BY status")
status_counts = cursor.fetchall()

# Total auctions
cursor.execute("SELECT COUNT(*) FROM Auction")
total_count = cursor.fetchone()[0]

print("=" * 70)
print("DATABASE STATUS")
print("=" * 70)
print(f"Total auctions in database: {total_count}")
print(f"AlertaSubastas auctions: {alerta_count}")
print(f"\nAlertaSubastas by status:")
for status, count in status_counts:
    print(f"  {status}: {count}")
print("=" * 70)

conn.close()

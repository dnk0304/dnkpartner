import sqlite3
import sys

if sys.platform == 'win32':
    sys.stdout.reconfigure(encoding='utf-8')

conn = sqlite3.connect('C:/Users/D/Desktop/dnksubastas/data/database/prod.db')
cursor = conn.cursor()

print("=" * 70)
print("📊 DATABASE SUMMARY")
print("=" * 70)

# By status
cursor.execute('SELECT status, COUNT(*) as count FROM Auction GROUP BY status')
status_stats = cursor.fetchall()

print("\n🔹 BY STATUS:")
for status, count in status_stats:
    print(f"   {status:15} : {count:5,} auctions")

# By category (top 10)
cursor.execute('SELECT category, COUNT(*) as count FROM Auction GROUP BY category ORDER BY count DESC LIMIT 10')
category_stats = cursor.fetchall()

print("\n🔹 BY CATEGORY (Top 10):")
for category, count in category_stats:
    print(f"   {category:25} : {count:5,} auctions")

# Total
cursor.execute('SELECT COUNT(*) FROM Auction')
total = cursor.fetchone()[0]

print("\n" + "=" * 70)
print(f"✅ TOTAL: {total:,} AUCTIONS IN DATABASE")
print("=" * 70)

conn.close()

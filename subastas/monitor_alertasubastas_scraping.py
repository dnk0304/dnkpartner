#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Monitor AlertaSubastas scraping progress
Shows real-time database statistics
"""

import sys
import time
from pathlib import Path

# Fix Windows encoding
if sys.platform == 'win32':
    import codecs
    sys.stdout = codecs.getwriter('utf-8')(sys.stdout.buffer, 'strict')

sys.path.insert(0, str(Path(__file__).parent / 'scraper'))

from scraper.db import get_connection

def get_stats():
    """Get current database statistics"""
    conn = get_connection()
    cursor = conn.cursor()
    
    # Total auctions
    cursor.execute('SELECT COUNT(*) FROM "Auction"')
    total = cursor.fetchone()[0]
    
    # By status
    cursor.execute("""
        SELECT status, COUNT(*) 
        FROM "Auction" 
        GROUP BY status 
        ORDER BY COUNT(*) DESC
    """)
    by_status = cursor.fetchall()
    
    # Finished auctions count
    cursor.execute('SELECT COUNT(*) FROM "Auction" WHERE status = \'FINISHED\'')
    finished = cursor.fetchone()[0]
    
    # Recent additions (last 5 minutes)
    cursor.execute("""
        SELECT COUNT(*) 
        FROM "Auction" 
        WHERE "createdAt" >= NOW() - INTERVAL '5 minutes'
    """)
    recent = cursor.fetchone()[0]
    
    conn.close()
    
    return {
        'total': total,
        'by_status': by_status,
        'finished': finished,
        'recent': recent
    }

def main():
    """Monitor scraping progress"""
    print("=" * 80)
    print("🔍 ALERTASUBASTAS SCRAPING MONITOR")
    print("=" * 80)
    print("Monitoring database for new finished auctions...")
    print("Press Ctrl+C to stop\n")
    
    last_total = 0
    start_time = time.time()
    
    try:
        while True:
            stats = get_stats()
            
            # Calculate progress
            new_since_last = stats['total'] - last_total
            elapsed = time.time() - start_time
            rate = stats['total'] / elapsed * 60 if elapsed > 0 else 0
            
            # Clear screen (Windows compatible)
            print("\033[H\033[J", end="")
            
            # Display stats
            print("=" * 80)
            print(f"🔍 ALERTASUBASTAS SCRAPING MONITOR - {time.strftime('%H:%M:%S')}")
            print("=" * 80)
            print(f"\n📊 TOTAL AUCTIONS: {stats['total']:,}")
            print(f"🎯 FINISHED AUCTIONS: {stats['finished']:,}")
            print(f"📈 NEW (last 5 min): {stats['recent']:,}")
            print(f"⚡ RATE: ~{rate:.1f} auctions/minute")
            
            if new_since_last > 0:
                print(f"✨ ADDED SINCE LAST CHECK: +{new_since_last}")
            
            print(f"\n🔹 BY STATUS:")
            for status, count in stats['by_status']:
                percentage = (count / stats['total'] * 100) if stats['total'] > 0 else 0
                bar_length = int(percentage / 2)
                bar = "█" * bar_length + "░" * (50 - bar_length)
                print(f"   {status:15s} : {count:6,} {bar} {percentage:5.1f}%")
            
            print(f"\n⏱️  RUNNING TIME: {elapsed/3600:.1f} hours")
            print(f"🎯 TARGET: 200,000+ finished auctions")
            
            completion_pct = (stats['finished'] / 200000 * 100) if stats['finished'] > 0 else 0
            print(f"📊 COMPLETION: {completion_pct:.2f}%")
            
            print("\n" + "=" * 80)
            print("Press Ctrl+C to stop monitoring")
            
            last_total = stats['total']
            time.sleep(10)  # Update every 10 seconds
            
    except KeyboardInterrupt:
        print("\n\n✅ Monitoring stopped")
        print(f"Final count: {stats['total']:,} auctions ({stats['finished']:,} finished)")

if __name__ == '__main__':
    main()

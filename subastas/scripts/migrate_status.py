#!/usr/bin/env python3
"""
Database migration script to update status values to BOE-accurate format
"""
import sqlite3
import os

DB_PATH = os.path.join(os.path.dirname(__file__), '..', 'data', 'database', 'prod.db')

def migrate():
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Update status values to BOE-accurate format
    updates = [
        ('CELEBRANDOSE', 'ACTIVE'),
        ('PROXIMA_APERTURA', 'PRE_AUCTION'),
        ('SUSPENDIDA', 'SUSPENDED'),
        ('CONCLUIDA_PORTAL', 'FINISHED'),
    ]
    
    for new_status, old_status in updates:
        cur.execute(f'UPDATE Auction SET status = ? WHERE status = ?', (new_status, old_status))
        print(f'{old_status} -> {new_status}: {cur.rowcount} rows')
    
    conn.commit()
    
    # Verify the changes
    cur.execute('SELECT status, COUNT(*) FROM Auction GROUP BY status')
    print('\nNew status counts:')
    for status, count in cur.fetchall():
        print(f'  {status}: {count}')
    
    conn.close()
    print('\nMigration complete!')

if __name__ == '__main__':
    migrate()

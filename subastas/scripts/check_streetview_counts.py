#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Quick DB counts for active/pre address + streetview coverage.
"""

import sqlite3
from pathlib import Path

db = Path("data/database/prod.db")
conn = sqlite3.connect(db)
cur = conn.cursor()

cur.execute(
    "SELECT COUNT(1) FROM Auction "
    "WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA')"
)
print("Total active/pre:", cur.fetchone()[0])

cur.execute(
    "SELECT COUNT(1) FROM Auction "
    "WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA') "
    "AND address IS NOT NULL"
)
print("Active/pre with address:", cur.fetchone()[0])

cur.execute(
    "SELECT COUNT(1) FROM Auction "
    "WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA') "
    "AND (streetViewUrl IS NULL OR streetViewUrl = '')"
)
print("Active/pre with empty streetViewUrl:", cur.fetchone()[0])

cur.execute(
    "SELECT COUNT(1) FROM Auction "
    "WHERE status IN ('ACTIVE','CELEBRANDOSE','PRE_AUCTION','PROXIMA_APERTURA') "
    "AND address IS NOT NULL "
    "AND (streetViewUrl IS NULL OR streetViewUrl = '')"
)
print("Active/pre address + empty streetViewUrl:", cur.fetchone()[0])

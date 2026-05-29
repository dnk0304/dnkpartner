#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Count active/pre auctions missing Street View URLs.
"""

import sqlite3


def main():
    conn = sqlite3.connect("data/database/prod.db")
    cur = conn.cursor()
    cur.execute(
        """
        SELECT COUNT(1)
        FROM Auction
        WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
          AND (latitude IS NULL OR longitude IS NULL)
        """
    )
    print("missing_coords", cur.fetchone())
    cur.execute(
        """
        SELECT COUNT(1)
        FROM Auction
        WHERE status IN ('ACTIVE', 'CELEBRANDOSE', 'PRE_AUCTION', 'PROXIMA_APERTURA')
          AND latitude IS NOT NULL
          AND longitude IS NOT NULL
          AND (streetViewUrl IS NULL OR streetViewUrl = '')
        """
    )
    print("missing_streetview", cur.fetchone())
    conn.close()


if __name__ == "__main__":
    main()

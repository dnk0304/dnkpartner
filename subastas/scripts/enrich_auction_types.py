"""
Auction Type Enrichment Script
Detects and sets auction types (JUDICIAL, NOTARIAL, AEAT, etc.) for existing auctions

This script:
1. Identifies auctions without auction_type set
2. Analyzes court name and source to detect type
3. Updates the database with correct auction types
"""

import sys
import os
from pathlib import Path

# Add project root to path
project_root = Path(__file__).parent.parent
sys.path.insert(0, str(project_root))

import re
from datetime import datetime
import logging

# Setup logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Database connection
try:
    import better_sqlite3 as sqlite3
except ImportError:
    import sqlite3

DATABASE_PATH = project_root / 'data' / 'database' / 'prod.db'


# Auction type detection patterns
AUCTION_TYPE_PATTERNS = {
    'AEAT': [
        r'\bAEAT\b',
        r'\bAgencia Tributaria\b',
        r'\bAgencia Estatal de Administración Tributaria\b',
        r'\bDelegación de\s+(?:la\s+)?Agencia\b',
    ],
    'NOTARIAL': [
        r'\bNotaría\b',
        r'\bNotario\b',
        r'\bProtocolo notarial\b',
        r'\bNotarial\b',
    ],
    'TRIBUTARIA': [
        r'\bAyuntamiento\b',
        r'\bDiputación\b',
        r'\bConsell\b',
        r'\bCabildo\b',
        r'\bRecaudación\b',
        r'\bTesorería\s+(?:de\s+)?(?:la\s+)?(?:Corporación|Diputación|Consell)\b',
    ],
    'ADMINISTRATIVA': [
        r'\bSeguridad Social\b',
        r'\bTesorería General\b',
        r'\bAdministración\s+(?:General|del\s+Estado)\b',
    ],
    'JUDICIAL': [
        r'\bJuzgado\b',
        r'\bTribunal\b',
        r'\bAudiencia\b',
        r'\bSala\s+de\s+lo\b',
        r'\bJuzgados\b',
    ],
}

# Source to type mapping
SOURCE_TYPE_MAP = {
    'BANK_': 'BANCARIA',
    'HAYA': 'BANCARIA',
    'SERVIHABITAT': 'BANCARIA',
    'ALTAMIRA': 'BANCARIA',
    'SOLVIA': 'BANCARIA',
    'ANTICIPA': 'BANCARIA',
    'ALISEDA': 'BANCARIA',
}


def detect_auction_type(court_name: str, source: str) -> str:
    """
    Detect auction type from court name and source
    
    Args:
        court_name: Court/authority name
        source: Auction source
    
    Returns:
        Detected auction type (default: JUDICIAL)
    """
    # First check source for bank auctions
    source_upper = (source or '').upper()
    for source_prefix, auction_type in SOURCE_TYPE_MAP.items():
        if source_prefix in source_upper:
            return auction_type
    
    # Check court name patterns
    text = court_name or ''
    
    for auction_type, patterns in AUCTION_TYPE_PATTERNS.items():
        for pattern in patterns:
            if re.search(pattern, text, re.IGNORECASE):
                return auction_type
    
    # Default to JUDICIAL for BOE auctions
    return 'JUDICIAL'


def get_auctions_without_type(conn) -> list:
    """
    Get all auctions without auction_type set
    
    Args:
        conn: Database connection
    
    Returns:
        List of (id, courtName, source) tuples
    """
    cursor = conn.cursor()
    
    query = """
        SELECT id, courtName, source
        FROM Auction
        WHERE auctionType IS NULL
           OR auctionType = ''
        ORDER BY publishedAt DESC
    """
    
    cursor.execute(query)
    return cursor.fetchall()


def update_auction_type(conn, auction_id: str, auction_type: str):
    """
    Update an auction's type in the database
    
    Args:
        conn: Database connection
        auction_id: Auction ID
        auction_type: New auction type to set
    """
    cursor = conn.cursor()
    cursor.execute(
        "UPDATE Auction SET auctionType = ?, updatedAt = ? WHERE id = ?",
        (auction_type, datetime.now().isoformat(), auction_id)
    )


def enrich_auction_types(dry_run: bool = False) -> dict:
    """
    Main enrichment function - set auction types for all auctions
    
    Args:
        dry_run: If True, don't actually update the database
    
    Returns:
        Statistics dictionary
    """
    stats = {
        'total_without_type': 0,
        'updated': 0,
        'types_assigned': {},
        'errors': 0,
    }
    
    logger.info(f"Connecting to database: {DATABASE_PATH}")
    conn = sqlite3.connect(str(DATABASE_PATH))
    
    try:
        # Get all auctions without type
        auctions = get_auctions_without_type(conn)
        stats['total_without_type'] = len(auctions)
        
        logger.info(f"Found {len(auctions)} auctions without auction type")
        
        if len(auctions) == 0:
            logger.info("All auctions already have types assigned")
            return stats
        
        # Process each auction
        for idx, (auction_id, court_name, source) in enumerate(auctions):
            try:
                # Detect auction type
                auction_type = detect_auction_type(court_name, source)
                
                # Track type assignments
                if auction_type not in stats['types_assigned']:
                    stats['types_assigned'][auction_type] = 0
                stats['types_assigned'][auction_type] += 1
                
                if not dry_run:
                    update_auction_type(conn, auction_id, auction_type)
                stats['updated'] += 1
                
                # Progress log every 1000 items
                if (idx + 1) % 1000 == 0:
                    logger.info(f"  Processed {idx + 1}/{len(auctions)}...")
            
            except Exception as e:
                logger.error(f"Error processing auction {auction_id}: {e}")
                stats['errors'] += 1
        
        # Commit changes
        if not dry_run:
            conn.commit()
            logger.info("Changes committed to database")
        else:
            logger.info("DRY RUN - No changes made to database")
        
    finally:
        conn.close()
    
    return stats


def main():
    """Main entry point"""
    import argparse
    
    parser = argparse.ArgumentParser(description='Enrich auction types')
    parser.add_argument('--dry-run', action='store_true', help='Simulate without making changes')
    parser.add_argument('--verbose', '-v', action='store_true', help='Verbose output')
    args = parser.parse_args()
    
    if args.verbose:
        logging.getLogger().setLevel(logging.DEBUG)
    
    print("=" * 60)
    print("Auction Type Enrichment Script")
    print("=" * 60)
    
    stats = enrich_auction_types(dry_run=args.dry_run)
    
    print("\n" + "=" * 60)
    print("Results:")
    print("=" * 60)
    print(f"  Auctions without type: {stats['total_without_type']}")
    print(f"  Updated: {stats['updated']}")
    print(f"  Errors: {stats['errors']}")
    
    print("\n  Types assigned:")
    for auction_type, count in sorted(stats['types_assigned'].items(), key=lambda x: -x[1]):
        print(f"    {auction_type}: {count}")
    
    if args.dry_run:
        print("\n  [DRY RUN - No changes were made]")
    else:
        print("\n  ✅ Auction types updated successfully!")


if __name__ == '__main__':
    main()

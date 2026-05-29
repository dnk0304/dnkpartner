#!/usr/bin/env python3
"""
Run all scrapers to populate the database
- BOE Pre-auctions (PA status)
- BOE Vehicles
- Bank auctions (Servihabitat, Haya, Altamira)
- Category enrichment
"""
import sys
import os
import subprocess
import logging
from pathlib import Path
from datetime import datetime

# Add scraper directory to path
SCRIPT_DIR = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
SCRAPER_DIR = PROJECT_DIR / "scraper"
sys.path.insert(0, str(SCRAPER_DIR))

logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler(PROJECT_DIR / 'scraper' / 'logs' / 'full_scrape.log')
    ]
)
logger = logging.getLogger(__name__)

def run_boe_pre_auctions():
    """Run BOE pre-auction scraper (PA status)"""
    logger.info("=" * 60)
    logger.info("Starting BOE Pre-Auctions (PA) scraper...")
    logger.info("=" * 60)
    
    try:
        # Use property_scraper with pre mode
        result = subprocess.run(
            [sys.executable, str(SCRAPER_DIR / 'property_scraper.py'), '--mode', 'pre', '--pages', '50'],
            cwd=str(SCRAPER_DIR),
            capture_output=True,
            text=True,
            timeout=1800  # 30 min timeout
        )
        logger.info(f"Pre-auction scraper output:\n{result.stdout}")
        if result.returncode != 0:
            logger.error(f"Pre-auction scraper error:\n{result.stderr}")
        return result.returncode == 0
    except subprocess.TimeoutExpired:
        logger.warning("Pre-auction scraper timed out after 30 minutes")
        return False
    except Exception as e:
        logger.error(f"Pre-auction scraper failed: {e}")
        return False

def run_boe_vehicles():
    """Run BOE vehicle scraper"""
    logger.info("=" * 60)
    logger.info("Starting BOE Vehicles scraper...")
    logger.info("=" * 60)
    
    try:
        from scrapers.boe_vehicle_scraper import scrape_all_vehicles
        result = scrape_all_vehicles()
        logger.info(f"Vehicle scraper result: {result}")
        return True
    except Exception as e:
        logger.error(f"Vehicle scraper failed: {e}")
        return False

def run_bank_scrapers():
    """Run bank scrapers (Servihabitat, Haya, Altamira)"""
    logger.info("=" * 60)
    logger.info("Starting Bank scrapers...")
    logger.info("=" * 60)
    
    try:
        from tasks.bank_tasks import discover_all_banks
        result = discover_all_banks()
        logger.info(f"Bank scraper results: {result}")
        return True
    except Exception as e:
        logger.error(f"Bank scrapers failed: {e}")
        return False

def run_category_enrichment():
    """Enrich generic 'Subasta' categories"""
    logger.info("=" * 60)
    logger.info("Starting category enrichment...")
    logger.info("=" * 60)
    
    import sqlite3
    DB_PATH = PROJECT_DIR / "data" / "database" / "prod.db"
    
    conn = sqlite3.connect(DB_PATH)
    cur = conn.cursor()
    
    # Get auctions with generic category
    cur.execute("SELECT id, title FROM Auction WHERE category = 'Subasta' OR category IS NULL")
    auctions = cur.fetchall()
    
    logger.info(f"Found {len(auctions)} auctions to enrich")
    
    updated = 0
    for auction_id, title in auctions:
        if not title:
            continue
        
        category = detect_category(title)
        if category != 'Subasta':
            cur.execute("UPDATE Auction SET category = ? WHERE id = ?", (category, auction_id))
            updated += 1
    
    conn.commit()
    logger.info(f"Enriched {updated} auctions with proper categories")
    
    # Show category distribution
    cur.execute("SELECT category, COUNT(*) FROM Auction GROUP BY category ORDER BY COUNT(*) DESC")
    logger.info("Category distribution after enrichment:")
    for cat, count in cur.fetchall():
        logger.info(f"  {cat}: {count}")
    
    conn.close()
    return True

def detect_category(title: str) -> str:
    """Detect category from auction title"""
    if not title:
        return 'Otros inmuebles'
    
    text = title.lower()
    
    # Vehicles
    if any(w in text for w in ['turismo', 'vehículo', 'coche', 'automóvil', 'furgoneta', 'camión']):
        return 'Turismos'
    if any(w in text for w in ['moto', 'motocicleta', 'ciclomotor', 'scooter']):
        return 'Motocicletas'
    if any(w in text for w in ['barco', 'embarcación', 'yate', 'lancha', 'velero']):
        return 'Embarcaciones'
    
    # Properties
    if any(w in text for w in ['piso', 'vivienda', 'apartamento', 'ático', 'casa', 'chalet', 'dúplex', 'adosado']):
        return 'Viviendas'
    if any(w in text for w in ['local comercial', 'local', 'oficina', 'bajo comercial', 'comercio']):
        return 'Locales'
    if any(w in text for w in ['garaje', 'parking', 'plaza de garaje', 'aparcamiento', 'cochera']):
        return 'Garajes'
    if any(w in text for w in ['nave industrial', 'nave', 'almacén', 'bodega', 'industrial']):
        return 'Naves industriales'
    if any(w in text for w in ['terreno', 'parcela', 'solar', 'suelo']):
        return 'Terrenos'
    if any(w in text for w in ['finca rústica', 'finca', 'agrícola', 'rústica', 'rural']):
        return 'Fincas rústicas'
    if any(w in text for w in ['trastero', 'cuarto']):
        return 'Trasteros'
    
    # Default
    return 'Otros inmuebles'

def main():
    start_time = datetime.now()
    logger.info("=" * 60)
    logger.info(f"Starting full scrape at {start_time}")
    logger.info("=" * 60)
    
    results = {}
    
    # 1. Run category enrichment first (fast)
    results['enrichment'] = run_category_enrichment()
    
    # 2. Run vehicle scraper
    results['vehicles'] = run_boe_vehicles()
    
    # 3. Run bank scrapers
    results['banks'] = run_bank_scrapers()
    
    # 4. Run pre-auction scraper
    results['pre_auctions'] = run_boe_pre_auctions()
    
    end_time = datetime.now()
    duration = (end_time - start_time).total_seconds()
    
    logger.info("=" * 60)
    logger.info(f"Full scrape completed in {duration:.1f} seconds")
    logger.info(f"Results: {results}")
    logger.info("=" * 60)
    
    return results

if __name__ == '__main__':
    main()

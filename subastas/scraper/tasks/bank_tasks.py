"""
Bank Tasks
Celery tasks for scraping bank portals (Servihabitat, Haya, Altamira)
"""

from typing import List
import logging
from scrapers.servihabitat_scraper import ServihabitatScraper
from scrapers.haya_scraper import HayaScraper
from scrapers.altamira_scraper import AltamiraScraper
from scrapers.solvia_scraper import SolviaScraper
from scrapers.anticipa_scraper import AnticipaScraper
from scrapers.aliseda_scraper import AlisedaScraper
from database.adapter import DatabaseAdapter
from config.provinces import PROVINCES

logger = logging.getLogger(__name__)

# Import celery app if using Celery
# from .celery_app import celery_app

# For now, these are regular functions that can be called from scheduler
# To use with Celery, uncomment the @celery_app.task decorators

# @celery_app.task
def discover_servihabitat(provinces: List[str] = None):
    """
    Scrape Servihabitat portal for all provinces
    
    Args:
        provinces: List of province names to scrape (defaults to all)
    """
    logger.info("Starting Servihabitat discovery")
    db = DatabaseAdapter()
    
    if provinces is None:
        provinces = [p['name'] for p in PROVINCES]
    
    total_found = 0
    total_saved = 0
    
    listing_modes = ["venta_vivienda", "sinposesion"]

    for listing_mode in listing_modes:
        mode_label = "sinposesion" if listing_mode == "sinposesion" else "venta_vivienda"
        logger.info(f"Servihabitat mode: {mode_label}")
        for province in provinces:
            try:
                logger.info(f"Scraping Servihabitat for province: {province}")
                scraper = ServihabitatScraper(province=province, listing_mode=listing_mode)
                auctions = scraper.scrape(max_pages=5)
                
                # Save to database
                for auction in auctions:
                    try:
                        db.upsert_auction(auction)
                        total_saved += 1
                    except Exception as e:
                        logger.error(f"Error saving Servihabitat auction: {e}")
                
                total_found += len(auctions)
                logger.info(f"Servihabitat {province} ({mode_label}): Found {len(auctions)} auctions")
            
            except Exception as e:
                logger.error(f"Error scraping Servihabitat for {province} ({mode_label}): {e}")
    
    logger.info(f"Servihabitat discovery completed: {total_found} found, {total_saved} saved")
    return {'found': total_found, 'saved': total_saved}


# @celery_app.task
def discover_haya(provinces: List[str] = None):
    """
    Scrape Haya Real Estate portal
    
    Args:
        provinces: List of province names to scrape (defaults to all)
    """
    logger.info("Starting Haya discovery")
    db = DatabaseAdapter()
    
    if provinces is None:
        provinces = [p['name'] for p in PROVINCES]
    
    total_found = 0
    total_saved = 0
    
    for province in provinces:
        try:
            logger.info(f"Scraping Haya for province: {province}")
            scraper = HayaScraper(province=province)
            auctions = scraper.scrape(max_pages=5)
            
            for auction in auctions:
                try:
                    db.upsert_auction(auction)
                    total_saved += 1
                except Exception as e:
                    logger.error(f"Error saving Haya auction: {e}")
            
            total_found += len(auctions)
            logger.info(f"Haya {province}: Found {len(auctions)} auctions")
        
        except Exception as e:
            logger.error(f"Error scraping Haya for {province}: {e}")
    
    logger.info(f"Haya discovery completed: {total_found} found, {total_saved} saved")
    return {'found': total_found, 'saved': total_saved}


# @celery_app.task
def discover_altamira(provinces: List[str] = None):
    """
    Scrape Altamira portal
    
    Args:
        provinces: List of province names to scrape (defaults to all)
    """
    logger.info("Starting Altamira discovery")
    db = DatabaseAdapter()
    
    if provinces is None:
        provinces = [p['name'] for p in PROVINCES]
    
    total_found = 0
    total_saved = 0
    
    for province in provinces:
        try:
            logger.info(f"Scraping Altamira for province: {province}")
            scraper = AltamiraScraper(province=province)
            auctions = scraper.scrape(max_pages=5)
            
            for auction in auctions:
                try:
                    db.upsert_auction(auction)
                    total_saved += 1
                except Exception as e:
                    logger.error(f"Error saving Altamira auction: {e}")
            
            total_found += len(auctions)
            logger.info(f"Altamira {province}: Found {len(auctions)} auctions")
        
        except Exception as e:
            logger.error(f"Error scraping Altamira for {province}: {e}")
    
    logger.info(f"Altamira discovery completed: {total_found} found, {total_saved} saved")
    return {'found': total_found, 'saved': total_saved}


# @celery_app.task
def discover_all_banks():
    """
    Run all bank scrapers sequentially
    """
    logger.info("Starting all bank scrapers")
    
    results = {
        'servihabitat': discover_servihabitat(),
        'haya': discover_haya(),
        'altamira': discover_altamira(),
        'solvia': discover_solvia(),
        'anticipa': discover_anticipa(),
        'aliseda': discover_aliseda(),
    }
    
    logger.info(f"All bank scrapers completed: {results}")
    return results


def _discover_generic(scraper_cls, name: str, provinces: List[str] = None):
    logger.info(f"Starting {name} discovery")
    db = DatabaseAdapter()

    if provinces is None:
        provinces = [p['name'] for p in PROVINCES]

    total_found = 0
    total_saved = 0

    for province in provinces:
        try:
            logger.info(f"Scraping {name} for province: {province}")
            scraper = scraper_cls(province=province)
            auctions = scraper.scrape(max_pages=5)

            for auction in auctions:
                try:
                    db.upsert_auction(auction)
                    total_saved += 1
                except Exception as e:
                    logger.error(f"Error saving {name} auction: {e}")

            total_found += len(auctions)
            logger.info(f"{name} {province}: Found {len(auctions)} auctions")
        except Exception as e:
            logger.error(f"Error scraping {name} for {province}: {e}")

    logger.info(f"{name} discovery completed: {total_found} found, {total_saved} saved")
    return {'found': total_found, 'saved': total_saved}


def discover_solvia(provinces: List[str] = None):
    return _discover_generic(SolviaScraper, "Solvia", provinces)


def discover_anticipa(provinces: List[str] = None):
    return _discover_generic(AnticipaScraper, "Anticipa", provinces)


def discover_aliseda(provinces: List[str] = None):
    return _discover_generic(AlisedaScraper, "Aliseda", provinces)

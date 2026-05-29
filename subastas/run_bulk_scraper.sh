#!/bin/bash
# Bulk Historical Auction Scraper Runner (Linux/Mac)
# Scrapes maximum finished auctions from BOE Portal

echo "============================================"
echo "   BULK HISTORICAL AUCTION SCRAPER"
echo "============================================"
echo ""

cd scraper

# Check if virtual environment exists
if [ ! -d "../venv" ]; then
    echo "ERROR: Python virtual environment not found!"
    echo "Please run: python3 -m venv venv"
    exit 1
fi

# Activate virtual environment
source ../venv/bin/activate

echo "Starting bulk scraper..."
echo "This will scrape ALL Spanish provinces for finished auctions"
echo "Estimated time: Several hours to days depending on data volume"
echo ""
echo "Progress will be saved in scraper/progress/"
echo "You can stop and resume at any time with Ctrl+C"
echo ""

# Run with max pages and resume capability
python bulk_historical_scraper.py --pages 200 --delay 180 --resume

echo ""
echo "============================================"
echo "   SCRAPING COMPLETED"
echo "============================================"
echo ""
echo "Check scraper/progress/ for detailed statistics"

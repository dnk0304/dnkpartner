@echo off
REM Bulk Historical Auction Scraper Runner
REM Scrapes maximum finished auctions from BOE Portal

echo ============================================
echo    BULK HISTORICAL AUCTION SCRAPER
echo ============================================
echo.

cd scraper

REM Check if virtual environment exists
if not exist "..\venv" (
    echo ERROR: Python virtual environment not found!
    echo Please run: python -m venv venv
    pause
    exit /b 1
)

REM Activate virtual environment
call ..\venv\Scripts\activate.bat

echo Starting bulk scraper...
echo This will scrape ALL Spanish provinces for finished auctions
echo Estimated time: Several hours to days depending on data volume
echo.
echo Progress will be saved in scraper/progress/
echo You can stop and resume at any time with Ctrl+C
echo.

REM Run with max pages and resume capability
python bulk_historical_scraper.py --pages 200 --delay 180 --resume

echo.
echo ============================================
echo    SCRAPING COMPLETED
echo ============================================
echo.
echo Check scraper/progress/ for detailed statistics
pause

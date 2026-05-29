@echo off
REM Windows batch file to launch 6 parallel province update scrapers

echo ======================================================================
echo   BOE Province/Municipality Update - Parallel Scrapers
echo ======================================================================
echo.
echo Starting 6 scrapers to update auction location data...
echo Each scraper processes 15-day batches
echo Estimated time: 2-3 hours with all 6 running
echo.

cd /d "%~dp0"

REM Launch each scraper in a new window
start "Scraper 1 (2015-2017)" python scrapers\province_update_scraper.py --id 1 --start 2015-01-01 --end 2017-12-31
start "Scraper 2 (2018-2019)" python scrapers\province_update_scraper.py --id 2 --start 2018-01-01 --end 2019-12-31
start "Scraper 3 (2020-2021)" python scrapers\province_update_scraper.py --id 3 --start 2020-01-01 --end 2021-12-31
start "Scraper 4 (2022-2023)" python scrapers\province_update_scraper.py --id 4 --start 2022-01-01 --end 2023-12-31
start "Scraper 5 (2024-2025)" python scrapers\province_update_scraper.py --id 5 --start 2024-01-01 --end 2025-12-31
start "Scraper 6 (2026-Now)" python scrapers\province_update_scraper.py --id 6 --start 2026-01-01 --end 2026-12-31

echo.
echo ======================================================================
echo All 6 scrapers launched in separate windows!
echo ======================================================================
echo.
echo Monitor progress in the scraper directory:
echo   - province_update_1_progress.json through province_update_6_progress.json
echo   - province_update_1_YYYYMMDD.log through province_update_6_YYYYMMDD.log
echo.
echo Close individual windows to stop specific scrapers
echo.
pause

@echo off
REM Run 3 parallel category scrapers
REM Each scraper handles 1/3 of the 90 combinations (30 combinations each)

echo ======================================================================
echo Starting 3 Parallel Category Scrapers
echo ======================================================================
echo.
echo Batch 1: Combinations 1-30
echo Batch 2: Combinations 31-60
echo Batch 3: Combinations 61-90
echo.
echo Each batch will run with:
echo   - Max pages per combination: 10
echo   - Cooldown between combinations: 180 seconds
echo   - Headless mode: enabled
echo.
echo Press CTRL+C to stop all scrapers
echo ======================================================================
echo.

cd scraper

REM Start batch 1 in a new window
start "Category Scraper - Batch 1/3" cmd /k "python category_scraper.py --batch 1 --total-batches 3 --max-pages 10 --cooldown 180 --headless"

timeout /t 5 /nobreak > nul

REM Start batch 2 in a new window
start "Category Scraper - Batch 2/3" cmd /k "python category_scraper.py --batch 2 --total-batches 3 --max-pages 10 --cooldown 180 --headless"

timeout /t 5 /nobreak > nul

REM Start batch 3 in a new window
start "Category Scraper - Batch 3/3" cmd /k "python category_scraper.py --batch 3 --total-batches 3 --max-pages 10 --cooldown 180 --headless"

echo.
echo ======================================================================
echo All 3 scrapers have been launched in separate windows!
echo ======================================================================
echo.
echo Progress files:
echo   - scraper/progress/category_scraper_batch_1_progress.json
echo   - scraper/progress/category_scraper_batch_2_progress.json
echo   - scraper/progress/category_scraper_batch_3_progress.json
echo.
echo To stop all scrapers:
echo   1. Close the 3 scraper windows, OR
echo   2. Run: taskkill /F /IM python.exe
echo.
echo Press any key to exit this launcher (scrapers will continue running)...
pause > nul

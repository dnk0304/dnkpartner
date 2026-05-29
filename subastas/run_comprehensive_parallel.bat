@echo off
REM ========================================================================
REM COMPREHENSIVE PARALLEL SCRAPER LAUNCHER
REM Launches multiple parallel instances of the comprehensive scraper
REM Coverage: All categories × all provinces (4,680 combinations)
REM ========================================================================

echo.
echo ========================================================================
echo   COMPREHENSIVE PARALLEL SCRAPER LAUNCHER
echo ========================================================================
echo.
echo This will launch 10 parallel scraper instances to cover all
echo 4,680 combinations (Category × Province × Estado × Tipo de subasta)
echo.
echo Each instance will use:
echo   - Max pages: 10 (5,000 auctions per combination)
echo   - Results per page: 500
echo   - Cooldown: 120 seconds between combinations
echo.
echo Press Ctrl+C to cancel, or any key to continue...
pause > nul

echo.
echo Starting 10 parallel scraper instances...
echo.

REM Launch 10 instances with 2-second delays between each
start "Comprehensive Scraper Batch 1" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 1 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 2" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 2 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 3" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 3 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 4" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 4 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 5" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 5 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 6" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 6 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 7" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 7 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 8" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 8 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 9" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 9 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive Scraper Batch 10" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 10 --total-batches 10 --max-pages 10 --cooldown 120 --headless"

echo.
echo ========================================================================
echo   ALL 10 INSTANCES LAUNCHED!
echo ========================================================================
echo.
echo Each batch is processing ~468 combinations (4,680 / 10)
echo Progress files: scraper\progress\comprehensive_scraper_batch_X_progress.json
echo.
echo Estimated completion time: ~15-20 hours (with 10 parallel instances)
echo.
echo Monitor progress in the admin panel at http://localhost:3005/admin/scraper
echo.
pause

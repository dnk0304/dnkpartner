@echo off
REM ========================================================================
REM HISTORICAL PARALLEL SCRAPER LAUNCHER
REM Launches multiple parallel instances of the historical scraper
REM Coverage: Last 5 years (2021-2026) of finished auctions (7,800 combinations)
REM ========================================================================

echo.
echo ========================================================================
echo   HISTORICAL PARALLEL SCRAPER LAUNCHER (Last 5 Years)
echo ========================================================================
echo.
echo This will launch 10 parallel scraper instances to cover all
echo 7,800 combinations (5 years × 5 tipos × 2 estados × 3 bienes × 52 provinces)
echo.
echo Each instance will use:
echo   - Max pages: 20 (10,000 auctions per combination)
echo   - Results per page: 500
echo   - Cooldown: 90 seconds between combinations
echo   - Years: 2021, 2022, 2023, 2024, 2025, 2026
echo.
echo Press Ctrl+C to cancel, or any key to continue...
pause > nul

echo.
echo Starting 10 parallel historical scraper instances...
echo.

REM Launch 10 instances with 2-second delays between each
start "Historical Scraper Batch 1" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 1 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 2" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 2 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 3" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 3 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 4" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 4 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 5" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 5 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 6" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 6 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 7" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 7 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 8" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 8 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 9" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 9 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical Scraper Batch 10" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 10 --total-batches 10 --max-pages 20 --cooldown 90 --headless"

echo.
echo ========================================================================
echo   ALL 10 HISTORICAL INSTANCES LAUNCHED!
echo ========================================================================
echo.
echo Each batch is processing ~780 combinations (7,800 / 10)
echo Progress files: scraper\progress\historical_scraper_batch_X_progress.json
echo.
echo Estimated completion time: ~19-25 hours (with 10 parallel instances)
echo.
echo Monitor progress in the admin panel at http://localhost:3005/admin/scraper
echo.
pause

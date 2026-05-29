@echo off
REM ========================================================================
REM MASTER PARALLEL SCRAPER LAUNCHER
REM Launches ALL parallel scrapers simultaneously
REM - 10 Comprehensive scrapers (current auctions)
REM - 10 Historical scrapers (last 5 years)
REM Total: 20 parallel processes
REM ========================================================================

echo.
echo ========================================================================
echo   MASTER PARALLEL SCRAPER LAUNCHER
echo ========================================================================
echo.
echo WARNING: This will launch 20 parallel scraper instances!
echo.
echo Comprehensive Scrapers (10 instances):
echo   - 4,680 combinations (Category × Province × Estado × Tipo)
echo   - Current/Active auctions
echo.
echo Historical Scrapers (10 instances):
echo   - 7,800 combinations (Last 5 years of finished auctions)
echo   - 2021-2026 historical data
echo.
echo Total combinations: 12,480
echo Estimated time: ~24-48 hours with 20 parallel instances
echo.
echo Make sure your system can handle 20 Chrome instances!
echo.
echo Press Ctrl+C to cancel, or any key to continue...
pause > nul

echo.
echo ========================================================================
echo   LAUNCHING COMPREHENSIVE SCRAPERS (10 instances)
echo ========================================================================
echo.

start "Comprehensive 1" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 1 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 2" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 2 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 3" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 3 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 4" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 4 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 5" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 5 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 6" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 6 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 7" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 7 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 8" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 8 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 9" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 9 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

start "Comprehensive 10" cmd /k "cd /d %~dp0 && python scraper\comprehensive_category_scraper.py --batch 10 --total-batches 10 --max-pages 10 --cooldown 120 --headless"
timeout /t 2 /nobreak > nul

echo.
echo ========================================================================
echo   LAUNCHING HISTORICAL SCRAPERS (10 instances)
echo ========================================================================
echo.

start "Historical 1" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 1 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 2" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 2 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 3" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 3 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 4" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 4 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 5" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 5 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 6" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 6 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 7" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 7 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 8" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 8 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 9" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 9 --total-batches 10 --max-pages 20 --cooldown 90 --headless"
timeout /t 2 /nobreak > nul

start "Historical 10" cmd /k "cd /d %~dp0 && python scraper\historical_scraper.py --batch 10 --total-batches 10 --max-pages 20 --cooldown 90 --headless"

echo.
echo ========================================================================
echo   ALL 20 INSTANCES LAUNCHED!
echo ========================================================================
echo.
echo Comprehensive: 10 instances processing 4,680 combinations
echo Historical: 10 instances processing 7,800 combinations
echo Total: 12,480 combinations
echo.
echo Progress monitoring:
echo   - Comprehensive: scraper\progress\comprehensive_scraper_batch_X_progress.json
echo   - Historical: scraper\progress\historical_scraper_batch_X_progress.json
echo.
echo Admin panel: http://localhost:3005/admin/scraper
echo.
echo This will take 24-48 hours to complete!
echo.
pause

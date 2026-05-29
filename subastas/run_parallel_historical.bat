@echo off
REM ======================================================================
REM PARALLEL HISTORICAL FINISHED AUCTIONS SCRAPER - Last 5 Years
REM Launches 5 parallel instances to scrape:
REM - 4 finished states (Suspendida, Cancelada, Concluida, Finalizada)
REM - 3 property types (Inmuebles, Vehículos, Otros bienes muebles)
REM - 52 provinces
REM - 5 years (2022-2026)
REM = 3,120 total combinations
REM 
REM Each instance handles 624 combinations (~1/5 of total)
REM With 5 parallel instances, estimated time: 8-10 hours
REM ======================================================================

echo ======================================================================
echo    PARALLEL HISTORICAL SCRAPER - Last 5 Years
echo ======================================================================
echo.
echo Starting 5 parallel instances...
echo Each instance will scrape historical finished auctions
echo.
echo Total combinations: 3,120
echo Per instance: ~624 combinations
echo Estimated time: 8-10 hours
echo.
echo Database: data\database\prod.db
echo Progress files: scraper\progress\historical_finished_batch_N_progress.json
echo.
echo Monitor at: http://localhost:3005/admin/scraper
echo.
echo ======================================================================
echo.

REM Change to script directory
cd /d "%~dp0"

REM Activate venv if it exists
if exist "venv\Scripts\activate.bat" (
    echo Activating Python virtual environment...
    call venv\Scripts\activate.bat
)

REM Launch 5 parallel instances with 3-second delays
echo.
echo [1/5] Starting Batch 1 (Combinations 1-624)...
start "Historical Batch 1" cmd /k "python scraper\historical_finished_scraper.py --batch 1 --total-batches 5 --cooldown 20 --resume"
timeout /t 3 /nobreak >nul

echo [2/5] Starting Batch 2 (Combinations 625-1248)...
start "Historical Batch 2" cmd /k "python scraper\historical_finished_scraper.py --batch 2 --total-batches 5 --cooldown 20 --resume"
timeout /t 3 /nobreak >nul

echo [3/5] Starting Batch 3 (Combinations 1249-1872)...
start "Historical Batch 3" cmd /k "python scraper\historical_finished_scraper.py --batch 3 --total-batches 5 --cooldown 20 --resume"
timeout /t 3 /nobreak >nul

echo [4/5] Starting Batch 4 (Combinations 1873-2496)...
start "Historical Batch 4" cmd /k "python scraper\historical_finished_scraper.py --batch 4 --total-batches 5 --cooldown 20 --resume"
timeout /t 3 /nobreak >nul

echo [5/5] Starting Batch 5 (Combinations 2497-3120)...
start "Historical Batch 5" cmd /k "python scraper\historical_finished_scraper.py --batch 5 --total-batches 5 --cooldown 20 --resume"

echo.
echo ======================================================================
echo ✅ All 5 instances launched successfully!
echo ======================================================================
echo.
echo Monitor progress:
echo   - Web UI: http://localhost:3005/admin/scraper
echo   - Progress files: scraper\progress\historical_finished_batch_*.json
echo   - Database: data\database\prod.db
echo.
echo Each window shows real-time scraping progress
echo Expected completion: 8-10 hours
echo.
echo Press any key to exit launcher (scrapers will continue running)...
pause >nul

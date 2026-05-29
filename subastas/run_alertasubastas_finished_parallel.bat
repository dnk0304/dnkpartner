@echo off
REM ======================================================================
REM PARALLEL ALERTASUBASTAS FINISHED AUCTIONS SCRAPER
REM Launches 2 parallel instances to scrape ALL finished auctions
REM 
REM Batch 1: Provinces A-M (32 provinces)
REM Batch 2: Provinces N-Z (20 provinces)
REM 
REM 22 property types × 52 provinces = 1,144 combinations
REM Target: 200,000+ finished auctions
REM Estimated time: 10-15 hours per batch
REM ======================================================================

echo ======================================================================
echo    ALERTASUBASTAS FINISHED AUCTIONS - PARALLEL SCRAPER
echo ======================================================================
echo.
echo Starting 2 parallel instances...
echo Each instance will scrape finished auctions from AlertaSubastas
echo.
echo Batch 1: Provinces A-M (32 provinces × 22 types = 704 combinations)
echo Batch 2: Provinces N-Z (20 provinces × 22 types = 440 combinations)
echo.
echo Total target: 200,000+ finished auctions
echo Estimated time: 10-15 hours
echo.
echo Database: data\database\prod.db
echo.
echo Monitor at: http://localhost:3005/admin
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

REM Launch 2 parallel instances
echo.
echo [1/2] Starting Batch 1 (Provinces A-M) with AUTO-LOGIN...
start "AlertaSubastas Batch 1" cmd /k "python scraper\alertasubastas_finished_batch_auto.py --batch 1 --status finalizadas"
timeout /t 5 /nobreak >nul

echo [2/2] Starting Batch 2 (Provinces N-Z) with AUTO-LOGIN...
start "AlertaSubastas Batch 2" cmd /k "python scraper\alertasubastas_finished_batch_auto.py --batch 2 --status finalizadas"
timeout /t 2 /nobreak >nul

echo.
echo ======================================================================
echo ✅ Both instances launched successfully!
echo ======================================================================
echo.
echo IMPORTANT: 
echo   - Both batches use AUTO-LOGIN (saved browser session)
echo   - No manual login required!
echo.
echo Monitor progress:
echo   - Web UI: http://localhost:3005/admin
echo   - Database: data\database\prod.db
echo   - Run: python scraper\check_db.py
echo.
echo Each window shows real-time scraping progress
echo Expected completion: 10-15 hours
echo.
echo Press any key to exit launcher (scrapers will continue running)...
pause >nul

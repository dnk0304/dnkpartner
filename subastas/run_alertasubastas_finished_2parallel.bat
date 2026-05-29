@echo off
REM ======================================================================
REM ALERTASUBASTAS FINISHED AUCTIONS SCRAPER - 2 Parallel Instances
REM Target: 200k+ historical finished auctions from AlertaSubastas
REM ======================================================================

echo ======================================================================
echo    ALERTASUBASTAS FINISHED AUCTIONS SCRAPER - MANUAL LOGIN
echo ======================================================================
echo.
echo Starting 2 parallel instances to scrape ALL finished auctions...
echo.
echo ⚠️  IMPORTANT: You will need to LOG IN MANUALLY in each browser window!
echo.
echo Instance 1: ALL property types, provinces A-M (alphabetically)
echo Instance 2: ALL property types, provinces N-Z (alphabetically)
echo.
echo This will scrape ALL 22 property types × 52 provinces = 1,144 combinations
echo Target: 200,000+ historical finished auctions
echo Estimated time: 24-48 hours for full dataset
echo.
echo Database: data\database\prod.db
echo Current AlertaSubastas auctions: 558
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

REM Launch 2 parallel instances - split by province ranges
echo.
echo [1/2] Starting Batch 1 (Provinces A-M: a-coruna through melilla)...
start "AlertaSubastas Finished A-M" cmd /k "python scraper\alertasubastas_finished_batch.py --batch 1 --status finalizadas --manual-login"
timeout /t 10 /nobreak >nul

echo [2/2] Starting Batch 2 (Provinces N-Z: murcia through zaragoza)...  
start "AlertaSubastas Finished N-Z" cmd /k "python scraper\alertasubastas_finished_batch.py --batch 2 --status finalizadas --manual-login"

echo.
echo ======================================================================
echo ✅ All 2 instances launched successfully!
echo ======================================================================
echo.
echo Monitor progress:
echo   - Check database growth: python check_alerta_status.py
echo   - Each window shows real-time progress
echo   - Database: data\database\prod.db
echo.
echo Expected: 200,000+ finished auctions
echo Current: 558 auctions
echo Estimated completion: 24-48 hours
echo.
echo Press any key to exit launcher (scrapers will continue running)...
pause >nul

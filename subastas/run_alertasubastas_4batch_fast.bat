@echo off
REM ======================================================================
REM PARALLEL ALERTASUBASTAS FINISHED AUCTIONS SCRAPER - 4 BATCHES (FAST)
REM Launches 4 parallel instances for maximum speed
REM 
REM Batch 1: Provinces A-C (13 provinces)
REM Batch 2: Provinces C-J (13 provinces)
REM Batch 3: Provinces L-R (13 provinces)
REM Batch 4: Provinces S-Z (13 provinces)
REM 
REM 22 property types × 52 provinces = 1,144 combinations
REM Each batch: ~286 combinations
REM 
REM SPEED OPTIMIZATIONS:
REM - 4 parallel scrapers (was 2)
REM - Reduced delay: 0.5s list, 1s detail (was 2s)
REM - Full pagination support (50 pages per combo)
REM - Target: 200,000+ finished auctions
REM - Estimated time: 6-8 hours (down from 15-20)
REM ======================================================================

echo ======================================================================
echo    ALERTASUBASTAS FINISHED - 4 PARALLEL SCRAPERS (FAST MODE)
echo ======================================================================
echo.
echo Starting 4 parallel instances for maximum speed...
echo.
echo Batch 1: Provinces A-C  (13 provinces × 22 types = 286 combinations)
echo Batch 2: Provinces C-J  (13 provinces × 22 types = 286 combinations)
echo Batch 3: Provinces L-R  (13 provinces × 22 types = 286 combinations)
echo Batch 4: Provinces S-Z  (13 provinces × 22 types = 286 combinations)
echo.
echo Total combinations: 1,144
echo Target: 200,000+ finished auctions
echo.
echo SPEED IMPROVEMENTS:
echo   - 4 parallel scrapers (2x parallelization)
echo   - Reduced delays (4x faster per request)
echo   - Full pagination (up to 50 pages per combo)
echo.
echo Estimated time: 6-8 hours (down from 15-20 hours)
echo.
echo Database: data\database\prod.db
echo Monitor: http://localhost:3005/admin
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

REM Launch 4 parallel instances with 3-second delays
echo.
echo [1/4] Starting Batch 1 (Provinces A-C)...
start "AlertaSubastas Batch 1" cmd /k "python scraper\alertasubastas_finished_4batch.py --batch 1 --status finalizadas"
timeout /t 3 /nobreak >nul

echo [2/4] Starting Batch 2 (Provinces C-J)...
start "AlertaSubastas Batch 2" cmd /k "python scraper\alertasubastas_finished_4batch.py --batch 2 --status finalizadas"
timeout /t 3 /nobreak >nul

echo [3/4] Starting Batch 3 (Provinces L-R)...
start "AlertaSubastas Batch 3" cmd /k "python scraper\alertasubastas_finished_4batch.py --batch 3 --status finalizadas"
timeout /t 3 /nobreak >nul

echo [4/4] Starting Batch 4 (Provinces S-Z)...
start "AlertaSubastas Batch 4" cmd /k "python scraper\alertasubastas_finished_4batch.py --batch 4 --status finalizadas"

echo.
echo ======================================================================
echo ✅ All 4 instances launched successfully!
echo ======================================================================
echo.
echo Monitor progress:
echo   - Database check: python scraper\check_db.py
echo   - Completeness: python check_alertasubastas_completeness.py
echo   - Web UI: http://localhost:3005/admin
echo.
echo Each window shows real-time scraping progress
echo Expected completion: 6-8 hours
echo.

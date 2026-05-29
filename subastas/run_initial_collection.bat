@echo off
echo ========================================
echo Initial Data Collection
echo ========================================
echo.

REM Activate virtual environment if it exists
if exist venv\Scripts\activate.bat (
    call venv\Scripts\activate.bat
)

REM Run the collection script
python scripts\run_initial_collection.py %*

echo.
echo ========================================
echo Collection complete!
echo ========================================
pause

@echo off
REM Update .env file with new persistent database location

echo ============================================
echo    Updating .env for Persistent Database
echo ============================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo Creating .env from env.example.txt...
    copy env.example.txt .env
    echo.
)

echo Updating DATABASE_URL to persistent location...
powershell -Command "(Get-Content .env) -replace 'DATABASE_URL=\"file:.*\"', 'DATABASE_URL=\"file:./data/database/prod.db\"' | Set-Content .env"

echo.
echo ============================================
echo    .env Updated Successfully!
echo ============================================
echo.
echo Your database is now in the persistent location:
echo   data/database/prod.db
echo.
echo This location survives:
echo   - Server restarts
echo   - Code updates
echo   - npm install
echo.

pause

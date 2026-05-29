@echo off
REM Update .env file with new port settings

echo ============================================
echo    Updating .env for PORT 3005
echo ============================================
echo.

REM Check if .env exists
if not exist ".env" (
    echo Creating .env from env.example.txt...
    copy env.example.txt .env
    echo.
)

echo Updating NEXTAUTH_URL to http://localhost:3005...
powershell -Command "(Get-Content .env) -replace 'NEXTAUTH_URL=http://localhost:[0-9]+', 'NEXTAUTH_URL=http://localhost:3005' | Set-Content .env"

echo Updating PORT to 3005...
powershell -Command "(Get-Content .env) -replace 'PORT=[0-9]+', 'PORT=3005' | Set-Content .env"

echo.
echo ============================================
echo    .env Updated Successfully!
echo ============================================
echo.
echo Your app will now run on:
echo   http://localhost:3005
echo.

pause

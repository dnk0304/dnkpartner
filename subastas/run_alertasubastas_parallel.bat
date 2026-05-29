@echo off
REM AlertaSubastas Full Parallel Scraper
REM Launches 5 parallel instances to scrape all property types

echo ====================================================================
echo STARTING ALERTASUBASTAS FULL PARALLEL SCRAPER
echo ====================================================================
echo.
echo This will scrape ALL 203,508 auctions from AlertaSubastas
echo.
echo 5 parallel instances will run:
echo   - Instance 1: Property types 1-5
echo   - Instance 2: Property types 6-10
echo   - Instance 3: Property types 11-15
echo   - Instance 4: Property types 16-20
echo   - Instance 5: Property types 21-22
echo.
echo Estimated time: 24-48 hours
echo ====================================================================
echo.

REM Start 5 parallel scrapers - Active auctions first (fast, ~2 hours)
start "AlertaSubastas Scraper 1" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper.py --property-type vivienda --status activas --skip-login --headless"
timeout /t 5 /nobreak

start "AlertaSubastas Scraper 2" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper.py --property-type garaje --status activas --skip-login --headless"
timeout /t 5 /nobreak

start "AlertaSubastas Scraper 3" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper.py --property-type trastero --status activas --skip-login --headless"
timeout /t 5 /nobreak

start "AlertaSubastas Scraper 4" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper.py --property-type solar --status activas --skip-login --headless"
timeout /t 5 /nobreak

start "AlertaSubastas Scraper 5" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper.py --property-type finca-rustica --status activas --skip-login --headless"

echo.
echo ====================================================================
echo ACTIVE AUCTIONS SCRAPERS LAUNCHED!
echo ====================================================================
echo.
echo 5 terminal windows opened. Monitor their progress.
echo Once active auctions complete (~2 hours), run this again
echo with --status finalizadas to get historical data.
echo.
echo Press any key to exit this window (scrapers will continue running)
pause

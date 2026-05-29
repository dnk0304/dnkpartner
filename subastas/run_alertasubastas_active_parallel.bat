@echo off
REM AlertaSubastas Active Auctions Parallel Scraper
REM Launches 3 parallel instances to scrape active auctions (faster)

echo ====================================================================
echo STARTING ALERTASUBASTAS ACTIVE AUCTIONS SCRAPER
echo ====================================================================
echo.
echo This will scrape ACTIVE auctions from AlertaSubastas
echo.
echo 3 parallel instances will run different property types
echo Estimated time: 2-4 hours
echo ====================================================================
echo.

REM Start 3 parallel scrapers for active auctions
start "AlertaSubastas Active 1" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type vivienda --status activas --headless"
timeout /t 10 /nobreak

start "AlertaSubastas Active 2" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type local-comercial --status activas --headless"
timeout /t 10 /nobreak

start "AlertaSubastas Active 3" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type vehiculo --status activas --headless"

echo.
echo ====================================================================
echo ACTIVE AUCTIONS SCRAPERS LAUNCHED!
echo ====================================================================
echo.
echo 3 terminal windows opened. Monitor their progress.
echo.
echo Press any key to exit this window (scrapers will continue running)
pause

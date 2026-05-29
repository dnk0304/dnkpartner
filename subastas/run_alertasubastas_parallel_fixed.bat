@echo off
REM AlertaSubastas Full Parallel Scraper - FIXED VERSION
REM Launches 5 parallel instances to scrape different property types

echo ====================================================================
echo STARTING ALERTASUBASTAS PARALLEL SCRAPER (FIXED)
echo ====================================================================
echo.
echo This will scrape auctions from AlertaSubastas
echo.
echo 5 parallel instances will run different property types
echo Estimated time: 10-20 hours depending on data volume
echo ====================================================================
echo.

REM Start 5 parallel scrapers for finished auctions (historical data)
start "AlertaSubastas 1: vivienda+garaje" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type vivienda --status finalizadas --headless"
timeout /t 10 /nobreak

start "AlertaSubastas 2: local+trastero" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type local-comercial --status finalizadas --headless"
timeout /t 10 /nobreak

start "AlertaSubastas 3: solar+finca" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type solar --status finalizadas --headless"
timeout /t 10 /nobreak

start "AlertaSubastas 4: vehiculo+nave" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type vehiculo --status finalizadas --headless"
timeout /t 10 /nobreak

start "AlertaSubastas 5: otros" cmd /k "cd /d C:\Users\D\Desktop\dnksubastas && python scraper\alertasubastas_scraper_fixed.py --property-type otros-inmuebles --status finalizadas --headless"

echo.
echo ====================================================================
echo SCRAPERS LAUNCHED!
echo ====================================================================
echo.
echo 5 terminal windows opened. Monitor their progress.
echo Each scraper will run through all 52 provinces for its property type(s).
echo.
echo To see progress, check each terminal window.
echo.
echo Press any key to exit this window (scrapers will continue running)
pause

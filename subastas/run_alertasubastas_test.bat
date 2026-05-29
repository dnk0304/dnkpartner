@echo off
REM Test AlertaSubastas Scraper
echo ====================================================================
echo TESTING ALERTASUBASTAS SCRAPER
echo ====================================================================
echo.

cd /d C:\Users\D\Desktop\dnksubastas
python scraper\alertasubastas_scraper_fixed.py --test --property-type vivienda --province madrid --status activas

echo.
echo ====================================================================
echo TEST COMPLETE
echo ====================================================================
pause

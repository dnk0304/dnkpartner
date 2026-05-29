@echo off
REM dnksubastas Development Server Launcher
REM Configured to run on port 3005 (different from dennisproject on 3000)

echo ============================================
echo    DNKSUBASTAS - Development Server
echo    Running on http://localhost:3005
echo ============================================
echo.

REM Display port info
echo [INFO] This project runs on PORT 3005
echo [INFO] Your dennisproject runs on PORT 3000
echo [INFO] Both can run simultaneously!
echo.

REM Start the development server
npm run dev

pause

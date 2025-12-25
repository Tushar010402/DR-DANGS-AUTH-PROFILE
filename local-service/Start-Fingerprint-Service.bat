@echo off
title Dr. Dangs Fingerprint Service
color 0A

cd /d "%~dp0"

:: Check if Node.js is installed
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo Node.js is not installed!
    echo.
    echo Please download and install from: https://nodejs.org
    echo.
    start https://nodejs.org
    pause
    exit /b 1
)

:: Install dependencies if needed
if not exist "node_modules" (
    echo Installing dependencies ^(first time only^)...
    call npm install --production
    echo.
)

:: Start the service
echo Starting Fingerprint Service...
node service.js

:: Keep window open if error
pause

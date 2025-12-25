@echo off
title Dr. Dangs Fingerprint Service Setup
color 0A

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║     Dr. Dangs Fingerprint Scanner Service - Setup             ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.

:: Check for admin privileges
net session >nul 2>&1
if %errorLevel% neq 0 (
    echo [ERROR] Please run this installer as Administrator!
    echo Right-click on setup.bat and select "Run as administrator"
    pause
    exit /b 1
)

:: Check if Node.js is installed
where node >nul 2>&1
if %errorLevel% neq 0 (
    echo [INFO] Node.js not found. Installing Node.js...
    echo.
    echo Please download and install Node.js from:
    echo https://nodejs.org/
    echo.
    echo After installing Node.js, run this setup again.
    pause
    exit /b 1
)

echo [OK] Node.js found
for /f "tokens=*" %%i in ('node -v') do echo      Version: %%i
echo.

:: Install dependencies
echo [INFO] Installing dependencies...
call npm install
if %errorLevel% neq 0 (
    echo [ERROR] Failed to install dependencies
    pause
    exit /b 1
)
echo [OK] Dependencies installed
echo.

:: Generate SSL certificates if OpenSSL is available
where openssl >nul 2>&1
if %errorLevel% equ 0 (
    echo [INFO] Generating SSL certificates...
    node generate-certs.js
    echo.
)

:: Install as Windows service
echo [INFO] Installing Windows service...
node install-service.js
if %errorLevel% neq 0 (
    echo [WARNING] Could not install as service. Running in foreground mode.
    echo.
    echo Starting service manually...
    node service.js
)

echo.
echo ╔════════════════════════════════════════════════════════════════╗
echo ║     Installation Complete!                                    ║
echo ╠════════════════════════════════════════════════════════════════╣
echo ║  The fingerprint service is now running.                      ║
echo ║                                                               ║
echo ║  You can now open your browser and go to:                     ║
echo ║  https://auth.drdangscentrallab.com                           ║
echo ╚════════════════════════════════════════════════════════════════╝
echo.
pause

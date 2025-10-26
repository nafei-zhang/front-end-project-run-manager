@echo off
chcp 65001 >nul
echo ================================
echo Prepare Electron Offline Package
echo ================================
echo Please run this script on a machine with internet connection

REM Create offline packages directory
if not exist "offline-packages" mkdir "offline-packages"
cd offline-packages

echo Downloading Electron related packages...

REM Download main Electron packages
echo Downloading electron@27.0.0...
call npm pack electron@27.0.0

echo Downloading electron-builder@24.0.0...
call npm pack electron-builder@24.0.0

echo Downloading vite-plugin-electron@0.14.0...
call npm pack vite-plugin-electron@0.14.0

echo Downloading vite-plugin-electron-renderer@0.14.0...
call npm pack vite-plugin-electron-renderer@0.14.0

echo Downloading concurrently@8.0.0...
call npm pack concurrently@8.0.0

echo Downloading wait-on@7.0.0...
call npm pack wait-on@7.0.0

cd ..

echo Creating complete node_modules backup...
REM Install all dependencies and package them
call npm install
if exist "node_modules" (
    powershell -Command "Compress-Archive -Path 'node_modules' -DestinationPath 'offline-packages\node_modules.zip' -Force"
)

echo Setting up Electron cache directory...
REM Create Electron cache directory
if not exist "electron-cache" mkdir "electron-cache"
if not exist "electron-cache\27.0.0" mkdir "electron-cache\27.0.0"

REM Manual download instructions for Electron binary
echo ================================
echo Manual Steps Required:
echo 1. Visit: https://github.com/electron/electron/releases/tag/v27.0.0
echo 2. Download: electron-v27.0.0-win32-x64.zip
echo 3. Place file in: electron-cache\27.0.0\
echo ================================

echo Creating transfer package...
REM Create final transfer package
if exist "offline-packages" (
    powershell -Command "Compress-Archive -Path 'offline-packages','electron-cache' -DestinationPath 'electron-offline-package.zip' -Force"
)

echo ================================
echo Preparation Complete!
echo ================================
echo Generated files:
echo   - offline-packages\           (npm packages)
echo   - electron-cache\             (binary files)
echo   - electron-offline-package.zip (complete transfer package)
echo.
echo Transfer electron-offline-package.zip to target machine
echo Then extract and run offline-install.bat
echo ================================
pause
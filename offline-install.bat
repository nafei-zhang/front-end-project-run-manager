@echo off
chcp 65001 >nul
echo ================================
echo Electron Offline Installation
echo ================================

REM Check if offline packages directory exists
if not exist "offline-packages" (
    echo Error: offline-packages directory not found
    echo Please run prepare-offline.bat on a machine with internet first
    pause
    exit /b 1
)

echo Setting up offline installation environment...

REM Set npm offline mode
call npm config set offline true

REM Set Electron cache directory
set ELECTRON_CACHE=%CD%\electron-cache
if not exist "%ELECTRON_CACHE%" mkdir "%ELECTRON_CACHE%"

echo Installing offline packages...

REM Install pre-downloaded packages
cd offline-packages
for %%f in (*.tgz) do (
    echo Installing %%f...
    call npm install %%f --no-save
)

cd ..

REM If node_modules zip exists, extract it
if exist "offline-packages\node_modules.zip" (
    echo Extracting node_modules...
    powershell -Command "Expand-Archive -Path 'offline-packages\node_modules.zip' -DestinationPath '.' -Force"
)

echo Restoring npm online mode...
call npm config delete offline

echo ================================
echo Offline Installation Complete!
echo ================================
echo You can now run:
echo   npm run electron:dev  - Development mode
echo   npm run build         - Build project
echo ================================
pause
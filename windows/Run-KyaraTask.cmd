@echo off
setlocal

set "APP_DATA=%LOCALAPPDATA%\KyaraFreeOpener"
set "LOG_FILE=%APP_DATA%\task.log"

if not exist "%APP_DATA%" mkdir "%APP_DATA%"

echo.>> "%LOG_FILE%"
echo [%DATE% %TIME%] Starting Kyara task>> "%LOG_FILE%"

set "NODE=%ProgramFiles%\nodejs\node.exe"
if not exist "%NODE%" set "NODE=node"

"%NODE%" "%~dp0kyara-free-opener.cjs" --mode Run >> "%LOG_FILE%" 2>&1
set "EXIT_CODE=%ERRORLEVEL%"

echo [%DATE% %TIME%] Finished with exit code %EXIT_CODE%>> "%LOG_FILE%"
exit /b %EXIT_CODE%

@echo off
REM ===========================================================================
REM start-all.cmd
REM Starts the whole PROG2002 A2 project:
REM   1. MySQL   (Windows service MySQL84, or a local server if there is one)
REM   2. API     (Node.js + Express, http://localhost:3000)
REM   3. Website (static client server, http://localhost:5500)
REM
REM MySQL is looked for in this order:
REM   %MYSQL_HOME%, %USERPROFILE%\mysql, .\mysql in this project, then
REM   "Program Files\MySQL\MySQL Server *" (the official installer layout).
REM
REM Close the API and website windows to stop them. MySQL keeps running because
REM it is a Windows service.
REM ===========================================================================
setlocal enabledelayedexpansion
set "ROOT=%~dp0"

REM ---------------- locate MySQL -------------------------------------------
set "MYHOME="
if defined MYSQL_HOME if exist "%MYSQL_HOME%\bin\mysqld.exe" set "MYHOME=%MYSQL_HOME%"
if not defined MYHOME if exist "%USERPROFILE%\mysql\bin\mysqld.exe" set "MYHOME=%USERPROFILE%\mysql"
if not defined MYHOME if exist "%ROOT%mysql\bin\mysqld.exe" set "MYHOME=%ROOT%mysql"

REM Official installer layout. Newest version wins when several are present.
if not defined MYHOME (
    for /f "delims=" %%D in ('dir /b /ad /o-n "%ProgramFiles%\MySQL\MySQL Server *" 2^>nul') do (
        if not defined MYHOME if exist "%ProgramFiles%\MySQL\%%D\bin\mysqld.exe" set "MYHOME=%ProgramFiles%\MySQL\%%D"
    )
)

if not defined MYHOME (
    echo MySQL client tools were not found.
    echo Install MySQL with the official installer:
    echo     https://dev.mysql.com/downloads/installer/
    pause
    exit /b 1
)
set "BIN=%MYHOME%\bin"
echo Using MySQL at %MYHOME%

set "MYINI="
if exist "%MYHOME%\my.ini" set "MYINI=%MYHOME%\my.ini"
set "DEFAULTS="
if defined MYINI set "DEFAULTS=--defaults-file="%MYINI%""

REM ---------------- is the server already running? -------------------------
"%BIN%\mysqladmin.exe" %DEFAULTS% --protocol=TCP -h 127.0.0.1 -u root ping >nul 2>&1
if not errorlevel 1 (
    echo MySQL is already running.
    goto mysqlready
)
"%BIN%\mysqladmin.exe" %DEFAULTS% --protocol=TCP -h 127.0.0.1 -u charity_app ping >nul 2>&1
if not errorlevel 1 (
    echo MySQL is already running.
    goto mysqlready
)

REM ---------------- start it ----------------------------------------------
echo MySQL is not responding on 127.0.0.1:3306.
sc query MySQL84 >nul 2>&1
if not errorlevel 1 (
    echo Starting the Windows service MySQL84 ...
    net start MySQL84 >nul 2>&1
) else (
    if not defined MYINI (
        echo No my.ini was found for %MYHOME%, so a local server cannot be started.
        echo Start MySQL yourself, then run this script again.
        pause
        exit /b 1
    )
    echo Starting a local MySQL server ...
    start "MySQL" cmd /k ""%BIN%\mysqld.exe" --defaults-file="%MYINI%" --console"
)

echo Waiting for MySQL to accept connections...
set "MYSQL_READY=0"
for /l %%i in (1,1,30) do (
    if "!MYSQL_READY!"=="0" (
        "%BIN%\mysqladmin.exe" %DEFAULTS% --protocol=TCP -h 127.0.0.1 -u root ping >nul 2>&1
        if not errorlevel 1 set "MYSQL_READY=1"
        if "!MYSQL_READY!"=="0" timeout /t 1 /nobreak >nul
    )
)
if "!MYSQL_READY!"=="0" (
    echo MySQL did not start. Check the MySQL error log and the DB_ values in api\.env.
    pause
    exit /b 1
)

:mysqlready
echo MySQL is up.

if not exist "%ROOT%api\.env" (
    echo.
    echo WARNING: api\.env does not exist, so the API will try MySQL as user "root"
    echo          with an empty password and will probably fail.
    echo          Copy api\.env.example to api\.env and set the DB_ values.
    echo.
)

if not exist "%ROOT%api\node_modules" (
    echo Installing API dependencies ^(first run only^)...
    pushd "%ROOT%api"
    call npm install
    popd
)

echo Starting the API...
start "API - charity events" cmd /k "cd /d "%ROOT%api" && node server.js"

echo Starting the website...
start "Website - charity events" cmd /k "cd /d "%ROOT%clientside" && node serve-clientside.js"

timeout /t 3 /nobreak >nul
echo.
echo Everything is starting. Opening the website...
echo   Website      http://localhost:5500/index.html
echo   API health   http://localhost:3000/api/health
echo.
start "" http://localhost:5500/index.html
endlocal

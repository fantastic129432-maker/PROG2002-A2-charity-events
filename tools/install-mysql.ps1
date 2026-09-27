# ============================================================================
# install-mysql.ps1
# ----------------------------------------------------------------------------
# Installs the official MySQL Community Server (ZIP distribution) as a
# PER-USER installation, so it needs NO administrator rights and no UAC prompt.
#
# Default target: C:\Users\<you>\mysql
# (pass -InstallTo to choose somewhere else, for example a project folder)
#
# What "per-user" means here:
#   * MySQL is not registered as a Windows service (that step needs admin).
#   * Start it with the shortcut "MySQL - Start" on your Desktop or in the
#     Start Menu folder "MySQL (user)", or with start-mysql.cmd in the
#     installation folder.
#   * It listens on the normal MySQL port 3306, so MySQL Workbench, the mysql
#     command line client and the Node.js API all connect to it as usual.
#
# Usage (from the project root):
#   node tools\download-mysql-parallel.mjs
#   powershell -ExecutionPolicy Bypass -File tools\install-mysql.ps1
#
# Options:
#   -InstallTo "D:\mysql"    install somewhere else
#   -SkipShortcuts           do not create Desktop / Start Menu shortcuts
#   -AddToPath               add the bin folder to your user PATH
# ============================================================================
param(
    [string]$InstallTo = (Join-Path $env:USERPROFILE 'mysql'),
    [switch]$SkipShortcuts,
    [switch]$AddToPath
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$InstallRoot = $InstallTo
$ZipFile = Get-ChildItem (Join-Path $ProjectRoot '.mysql-install') -Filter '*.zip' -ErrorAction SilentlyContinue |
           Sort-Object Length -Descending | Select-Object -First 1

if (-not $ZipFile) {
    throw "No MySQL ZIP found in .mysql-install. Run 'node tools\download-mysql-parallel.mjs' first."
}

Write-Host "MySQL ZIP   : $($ZipFile.FullName)"
Write-Host "Install to  : $InstallRoot"
Write-Host ""

# ---------------------------------------------------------------------------
# 1. Extract a working MySQL (server + client + mysqladmin)
# ---------------------------------------------------------------------------
if (Test-Path (Join-Path $InstallRoot 'bin\mysqld.exe')) {
    Write-Host "[1/5] Already extracted - skipping."
} else {
    Write-Host "[1/5] Extracting (this takes a couple of minutes)..."
    $staging = Join-Path $ProjectRoot '.mysql-install\extract'
    if (Test-Path $staging) { Remove-Item $staging -Recurse -Force }
    New-Item -ItemType Directory -Force $staging | Out-Null

    # tar.exe is built into Windows 10/11 and reads ZIP archives directly.
    & tar.exe -xf $ZipFile.FullName -C $staging
    if ($LASTEXITCODE -ne 0) { throw "Extraction failed (tar exit code $LASTEXITCODE)." }

    $inner = Get-ChildItem $staging -Directory | Select-Object -First 1
    if (-not $inner) { throw "The ZIP did not contain a MySQL folder." }

    New-Item -ItemType Directory -Force $InstallRoot | Out-Null
    foreach ($folder in 'bin', 'lib', 'share', 'docs') {
        $from = Join-Path $inner.FullName $folder
        if (Test-Path $from) { Copy-Item $from $InstallRoot -Recurse -Force }
    }
    Get-ChildItem $inner.FullName -File | Copy-Item -Destination $InstallRoot -Force

    Remove-Item $staging -Recurse -Force
    Write-Host "      Extracted to $InstallRoot"
}

$bin = Join-Path $InstallRoot 'bin'
if (-not (Test-Path (Join-Path $bin 'mysqld.exe'))) {
    throw "mysqld.exe was not found in $bin - extraction did not work."
}
Write-Host "      $((& (Join-Path $bin 'mysqld.exe') --version) -join ' ')"

# ---------------------------------------------------------------------------
# 2. Write the configuration file
# ---------------------------------------------------------------------------
$dataDir = Join-Path $InstallRoot 'data'
$iniFile = Join-Path $InstallRoot 'my.ini'
$installUnix = $InstallRoot -replace '\\', '/'
$dataUnix = $dataDir -replace '\\', '/'

$ini = @"
# ============================================================================
# MySQL Community Server - per-user installation configuration
# Location : $InstallRoot
# Installed without administrator rights, so no Windows service is registered.
# Start and stop it with the shortcuts in "MySQL (user)" or the .cmd files here.
# ============================================================================

[mysqld]
basedir = $installUnix
datadir = $dataUnix
port    = 3306
bind-address = 127.0.0.1

# The PROG2002 A2 schema uses utf8mb4_0900_ai_ci, which needs MySQL 8.0.1+.
character-set-server = utf8mb4
collation-server     = utf8mb4_0900_ai_ci
default-storage-engine = InnoDB

innodb_buffer_pool_size = 256M
max_connections = 50

log-error = $dataUnix/mysql-error.log

# The authentication default is deliberately not set: MySQL 9/26 replaced
# default_authentication_plugin with authentication_policy.

[client]
port = 3306
default-character-set = utf8mb4
"@

Set-Content -Path $iniFile -Value $ini -Encoding ASCII
Write-Host "[2/5] Wrote $iniFile"

# ---------------------------------------------------------------------------
# 3. Initialise the data directory
# ---------------------------------------------------------------------------
if (Test-Path (Join-Path $dataDir 'mysql')) {
    Write-Host "[3/5] Data directory already initialised - skipping."
} else {
    Write-Host "[3/5] Initialising the data directory (about 30 seconds)..."
    New-Item -ItemType Directory -Force $dataDir | Out-Null

    # --initialize-insecure creates the root account with NO password. That is
    # acceptable for a local, loopback-only study database: the server listens
    # on 127.0.0.1 only and is never exposed to the network.
    & (Join-Path $bin 'mysqld.exe') --defaults-file="$iniFile" --initialize-insecure --console
    if ($LASTEXITCODE -ne 0) { throw "Initialisation failed (exit code $LASTEXITCODE)." }
    Write-Host "      Data directory ready."
}

# ---------------------------------------------------------------------------
# 4. Helper scripts inside the installation folder
# ---------------------------------------------------------------------------
$startCmd = @"
@echo off
REM Start the local MySQL server. Close this window to stop it.
setlocal
set "MYHOME=%~dp0"
echo Starting MySQL on 127.0.0.1:3306 ...
"%MYHOME%bin\mysqld.exe" --defaults-file="%MYHOME%my.ini" --console
endlocal
"@
Set-Content -Path (Join-Path $InstallRoot 'start-mysql.cmd') -Value $startCmd -Encoding ASCII

$stopCmd = @"
@echo off
REM Stop the local MySQL server gracefully.
setlocal
set "MYHOME=%~dp0"
echo Stopping MySQL...
"%MYHOME%bin\mysqladmin.exe" --defaults-file="%MYHOME%my.ini" -u root shutdown
if errorlevel 1 (echo MySQL is not running.) else (echo MySQL stopped.)
timeout /t 3 /nobreak >nul
endlocal
"@
Set-Content -Path (Join-Path $InstallRoot 'stop-mysql.cmd') -Value $stopCmd -Encoding ASCII

$consoleCmd = @"
@echo off
REM Open a mysql command line client. With no argument it selects charityevents_db.
setlocal
set "MYHOME=%~dp0"
if "%~1"=="" (
    "%MYHOME%bin\mysql.exe" --defaults-file="%MYHOME%my.ini" -u root charityevents_db
) else (
    "%MYHOME%bin\mysql.exe" --defaults-file="%MYHOME%my.ini" -u root %*
)
endlocal
"@
Set-Content -Path (Join-Path $InstallRoot 'mysql-console.cmd') -Value $consoleCmd -Encoding ASCII
Write-Host "[4/5] Created start-mysql.cmd, stop-mysql.cmd and mysql-console.cmd"

# ---------------------------------------------------------------------------
# 5. Shortcuts and optional PATH entry
# ---------------------------------------------------------------------------
if (-not $SkipShortcuts) {
    $shell = New-Object -ComObject WScript.Shell
    $startMenu = Join-Path ([Environment]::GetFolderPath('Programs')) 'MySQL (user)'
    New-Item -ItemType Directory -Force -Path $startMenu | Out-Null

    $items = @(
        @{ Name = 'MySQL - Start';             Target = (Join-Path $InstallRoot 'start-mysql.cmd') },
        @{ Name = 'MySQL - Stop';              Target = (Join-Path $InstallRoot 'stop-mysql.cmd') },
        @{ Name = 'MySQL - Console (charity)'; Target = (Join-Path $InstallRoot 'mysql-console.cmd') },
        @{ Name = 'MySQL - Folder';            Target = $InstallRoot }
    )
    foreach ($item in $items) {
        $link = $shell.CreateShortcut((Join-Path $startMenu ($item.Name + '.lnk')))
        $link.TargetPath = $item.Target
        $link.WorkingDirectory = $InstallRoot
        $link.IconLocation = "$bin\mysqladmin.exe,0"
        $link.Save()
    }
    foreach ($name in 'MySQL - Start', 'MySQL - Stop') {
        $link = $shell.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) ($name + '.lnk')))
        $link.TargetPath = (Join-Path $startMenu ($name + '.lnk'))
        $link.IconLocation = "$bin\mysqladmin.exe,0"
        $link.Save()
    }
    Write-Host "[5/5] Created Desktop and Start Menu shortcuts under 'MySQL (user)'"
} else {
    Write-Host "[5/5] Skipped shortcuts"
}

if ($AddToPath) {
    $pathScript = Join-Path $PSScriptRoot 'add-mysql-to-user-path.ps1'
    if (Test-Path $pathScript) { & $pathScript -BinDir $bin }
}

Write-Host ""
Write-Host "MySQL per-user installation complete."
Write-Host ""
Write-Host "Next steps:"
Write-Host "  1. Start it:  double-click 'MySQL - Start' on your Desktop"
Write-Host "  2. Load the assignment data:"
Write-Host "       powershell -ExecutionPolicy Bypass -File tools\load-database.ps1"
Write-Host "  3. Run everything:  start-all.cmd"

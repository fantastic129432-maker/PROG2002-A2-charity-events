# ============================================================================
# load-database.ps1
# ----------------------------------------------------------------------------
# Loads database/charityevents_db.sql into the local MySQL server and verifies
# the result. Run it AFTER the MySQL server is running.
#
# Usage (from the project root):
#   powershell -ExecutionPolicy Bypass -File tools\load-database.ps1
#
# Credentials, in order of precedence:
#   1. -User / -Password parameters
#   2. $env:DB_USER / $env:DB_PASSWORD
#   3. the values in api\.env
#   4. root with an empty password
#
# This script drops and recreates charityevents_db, so it needs an account with
# CREATE privileges (root or equivalent). The API itself uses the read-only
# account stored in api\.env, which is all Assessment 2 requires.
#
# Options:
#   -MySQLHome "C:\Program Files\MySQL\MySQL Server 8.4"
#   -SkipVerify
# ============================================================================
param(
    [string]$MySQLHome,
    [string]$User,
    [string]$Password,
    [switch]$SkipVerify
)

$ErrorActionPreference = 'Stop'

$ProjectRoot = Split-Path -Parent (Split-Path -Parent $MyInvocation.MyCommand.Path)
$Sql = Join-Path $ProjectRoot 'database\charityevents_db.sql'
if (-not (Test-Path $Sql)) { throw "SQL file not found: $Sql" }

# --- locate MySQL -----------------------------------------------------------
# find-mysql.ps1 is used when it is present, so a MySQL installation in a
# non-standard place is still found. When it is missing the script falls back to
# the usual locations and to mysqld.exe on PATH, which means every tool here is
# individually replaceable rather than one hard dependency.
$locator = Join-Path $PSScriptRoot 'find-mysql.ps1'
$info = @()
if (Test-Path $locator) {
    $info = @(& $locator -MySQLHome $MySQLHome)
}

if ($info.Count -eq 0) {
    $candidates = @()
    if ($MySQLHome) { $candidates += $MySQLHome }
    if ($env:MYSQL_HOME) { $candidates += $env:MYSQL_HOME }
    foreach ($root in @(
            (Join-Path $env:ProgramFiles 'MySQL'),
            (Join-Path ${env:ProgramFiles(x86)} 'MySQL'))) {
        if ($root -and (Test-Path $root)) {
            Get-ChildItem $root -Directory -ErrorAction SilentlyContinue |
                Where-Object { Test-Path (Join-Path $_.FullName 'bin\mysqld.exe') } |
                Sort-Object Name -Descending |
                ForEach-Object { $candidates += $_.FullName }
        }
    }
    $candidates += (Join-Path $env:USERPROFILE 'mysql')

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate 'bin\mysqld.exe'))) {
            $info = @((Resolve-Path $candidate).Path)
            break
        }
    }

    # The official installer keeps my.ini under ProgramData, whose folder name
    # carries the version, so it is discovered rather than assumed.
    if ($info.Count -eq 1) {
        $programData = Join-Path $env:ProgramData 'MySQL'
        if (Test-Path $programData) {
            $found = Get-ChildItem $programData -Recurse -Filter 'my.ini' -ErrorAction SilentlyContinue |
                     Select-Object -First 1
            if ($found) { $info += $found.FullName }
        }
    }
}

if ($info.Count -eq 0) {
    throw 'MySQL was not found. Install it with the official installer, or pass -MySQLHome "C:\path\to\mysql".'
}
$MySQLHome = $info[0]
$MyIni = if ($info.Count -gt 1) { $info[1] } else { '' }

# --- credentials ------------------------------------------------------------
function Read-EnvFileValue {
    param([string]$File, [string]$Key)
    if (-not (Test-Path $File)) { return $null }
    $line = Get-Content $File | Where-Object { $_ -match "^\s*$Key\s*=" } | Select-Object -First 1
    if (-not $line) { return $null }
    $value = ($line -split '=', 2)[1].Trim()
    return $value.Trim('"').Trim("'")
}

if (-not $User) {
    $User = $env:DB_USER
    if (-not $User) { $User = Read-EnvFileValue -File (Join-Path $ProjectRoot 'api\.env') -Key 'DB_USER' }
    if (-not $User) { $User = 'root' }
}
if (-not $Password) {
    $Password = $env:DB_PASSWORD
    if (-not $Password) { $Password = Read-EnvFileValue -File (Join-Path $ProjectRoot 'api\.env') -Key 'DB_PASSWORD' }
    if (-not $Password) { $Password = '' }
}

$bin = Join-Path $MySQLHome 'bin'
$defaultsArg = @()
if ($MyIni -and (Test-Path $MyIni)) { $defaultsArg = @("--defaults-file=$MyIni") }
$credentialArgs = @('-u', $User, '--protocol=TCP', '-h', '127.0.0.1')

Write-Host "MySQL home : $MySQLHome"
if ($MyIni) { Write-Host "my.ini     : $MyIni" }
Write-Host "Account    : $User"
Write-Host "SQL file   : $Sql"
Write-Host ""

function Invoke-MySqlClient {
    param([string[]]$ClientArgs, [switch]$CaptureOutput)
    # The password travels through MYSQL_PWD so it never appears in the
    # process command line or in this script's output.
    $env:MYSQL_PWD = $Password
    try {
        if ($CaptureOutput) {
            return (& (Join-Path $bin 'mysql.exe') @defaultsArg @credentialArgs @ClientArgs 2>&1)
        }
        & (Join-Path $bin 'mysql.exe') @defaultsArg @credentialArgs @ClientArgs
    } finally {
        Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    }
}

# --- wait for the server ----------------------------------------------------
Write-Host 'Waiting for MySQL to accept connections...'
$ready = $false
for ($i = 1; $i -le 30; $i++) {
    $env:MYSQL_PWD = $Password
    & (Join-Path $bin 'mysqladmin.exe') @defaultsArg @credentialArgs ping 2>$null | Out-Null
    $code = $LASTEXITCODE
    Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
    if ($code -eq 0) { $ready = $true; break }
    Start-Sleep -Seconds 1
}
if (-not $ready) {
    throw "MySQL is not responding on 127.0.0.1:3306, or the credentials for '$User' are rejected. Start the server (service MySQL84 or the 'MySQL - Start' shortcut) and check the DB_* values in api\.env."
}
Write-Host 'MySQL is up.'

# --- load -------------------------------------------------------------------
Write-Host 'Loading the database (this drops and recreates charityevents_db)...'
$env:MYSQL_PWD = $Password
$quotedDefaults = ($defaultsArg | ForEach-Object { '"' + $_ + '"' }) -join ' '
# cmd /c gives reliable input redirection for the MySQL client.
cmd /c "`"$(Join-Path $bin 'mysql.exe')`" $quotedDefaults -u $User --protocol=TCP -h 127.0.0.1 < `"$Sql`""
$loadCode = $LASTEXITCODE
Remove-Item Env:\MYSQL_PWD -ErrorAction SilentlyContinue
if ($loadCode -ne 0) { throw "Loading the SQL file failed (exit code $loadCode)." }

if ($SkipVerify) {
    Write-Host 'Loaded. Verification skipped.'
    return
}

# --- verify -----------------------------------------------------------------
Write-Host 'Loaded. Verifying...'
Invoke-MySqlClient -ClientArgs @('-t', '-e', @"
USE charityevents_db;
SELECT COUNT(*) AS events_total FROM events;
SELECT event_state, COUNT(*) AS how_many FROM vw_public_events GROUP BY event_state;
SELECT event_name, raised_amount, goal_amount, progress_percent
  FROM vw_public_events ORDER BY progress_percent DESC LIMIT 4;
"@)

Write-Host ''
Write-Host "Database charityevents_db is ready on $MySQLHome"

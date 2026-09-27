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
$info = @(& (Join-Path $PSScriptRoot 'find-mysql.ps1') -MySQLHome $MySQLHome)
if ($info.Count -eq 0) { throw 'MySQL was not found. See the warning above.' }
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

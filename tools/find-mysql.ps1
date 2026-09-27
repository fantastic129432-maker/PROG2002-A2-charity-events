# ============================================================================
# find-mysql.ps1
# ----------------------------------------------------------------------------
# Locates the MySQL installation this project should use and prints two lines:
#
#     <mysql home>
#     <path to my.ini, or an empty line if no readable my.ini exists>
#
# Called from the other tools:
#
#     $info = & "$PSScriptRoot\find-mysql.ps1"
#     $MySQLHome = $info[0]
#     $MyIni     = $info[1]
#
# Search order
#   1. -MySQLHome <path>                      explicit argument
#   2. $env:MYSQL_HOME                        environment variable
#   3. Program Files\MySQL\MySQL Server *     official MySQL Installer install
#   4. %USERPROFILE%\mysql                    per-user install
#   5. <project>\mysql                        portable install inside the project
#   6. mysqld.exe on PATH                     any other installation
#
# Writes a warning and returns nothing when MySQL cannot be found.
# ============================================================================
param([string]$MySQLHome)

function Get-MySqlHome {
    param([string]$Explicit)

    $candidates = @()
    if ($Explicit)       { $candidates += $Explicit }
    if ($env:MYSQL_HOME) { $candidates += $env:MYSQL_HOME }

    # Official installer layout, for example:
    #   C:\Program Files\MySQL\MySQL Server 8.4
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
    $candidates += (Join-Path (Split-Path -Parent $PSScriptRoot) 'mysql')

    foreach ($candidate in $candidates) {
        if ($candidate -and (Test-Path (Join-Path $candidate 'bin\mysqld.exe'))) {
            return (Resolve-Path $candidate).Path
        }
    }

    # Last resort: mysqld.exe already on PATH.
    $onPath = Get-Command mysqld.exe -ErrorAction SilentlyContinue
    if ($onPath) { return (Split-Path -Parent (Split-Path -Parent $onPath.Source)) }

    return $null
}

function Get-MySqlIni {
    param([Parameter(Mandatory)][string]$mysqlRoot)

    # A my.ini beside the binaries (portable install).
    $local = Join-Path $mysqlRoot 'my.ini'
    if (Test-Path $local) { return $local }

    # The official installer keeps my.ini under ProgramData and the folder name
    # includes the version, so it is discovered rather than assumed.
    $programData = Join-Path $env:ProgramData 'MySQL'
    if (Test-Path $programData) {
        $found = Get-ChildItem $programData -Recurse -Filter 'my.ini' -ErrorAction SilentlyContinue |
                 Select-Object -First 1
        if ($found) { return $found.FullName }
    }

    return ''
}

# -Explicit only when a path was actually supplied, so that an empty value does
# not trip the parameter validation inside Get-MySqlHome.
$mysqlRoot = if ($MySQLHome) { Get-MySqlHome -Explicit $MySQLHome } else { Get-MySqlHome }
if (-not $mysqlRoot) {
    Write-Warning @'
MySQL was not found. Install it in one of these ways:
  * Official installer (recommended, needs an administrator):
      https://dev.mysql.com/downloads/installer/
  * Per-user install without administrator rights:
      node tools\download-mysql-parallel.mjs
      powershell -ExecutionPolicy Bypass -File tools\install-mysql.ps1
'@
    return
}

$mysqlRoot
Get-MySqlIni -mysqlRoot $mysqlRoot

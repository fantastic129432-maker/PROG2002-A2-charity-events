# ============================================================================
# add-mysql-to-path.ps1
# ----------------------------------------------------------------------------
# Adds C:\Users\ASUS\mysql\bin to your PER-USER PATH, so you can type
# `mysql`, `mysqld`, `mysqladmin` or `mysqldump` in any new terminal.
#
# This changes only HKCU\Environment (your own user account). It does not need
# administrator rights and it does not affect other users on this computer.
#
# Run it once:
#   powershell -ExecutionPolicy Bypass -File "C:\Users\ASUS\mysql\add-mysql-to-path.ps1"
#
# Undo: run it again with -Remove
# ============================================================================
param([switch]$Remove)

$ErrorActionPreference = 'Stop'
$BinDir = 'C:\Users\ASUS\mysql\bin'

$current = [Environment]::GetEnvironmentVariable('Path', 'User')
if ($null -eq $current) { $current = '' }

$parts = $current.Split(';') | Where-Object { $_ -ne '' }

if ($Remove) {
    $parts = $parts | Where-Object { $_ -ne $BinDir }
    [Environment]::SetEnvironmentVariable('Path', ($parts -join ';'), 'User')
    Write-Host "Removed $BinDir from your user PATH."
    exit 0
}

if ($parts -contains $BinDir) {
    Write-Host "$BinDir is already on your user PATH."
} else {
    $updated = (@($parts) + $BinDir) -join ';'
    [Environment]::SetEnvironmentVariable('Path', $updated, 'User')
    Write-Host "Added $BinDir to your user PATH."
}

Write-Host ""
Write-Host "Open a NEW terminal and try:"
Write-Host "    mysql --version"
Write-Host "    mysql -u root charityevents_db -e ""SELECT COUNT(*) FROM events;"""

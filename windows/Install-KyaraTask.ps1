[CmdletBinding()]
param(
    [ValidateSet('Install', 'Remove')]
    [string]$Mode = 'Install'
)

$ErrorActionPreference = 'Stop'
$TaskName = 'Kyara Free Opener'

if ($Mode -eq 'Remove') {
    & schtasks.exe /Delete /TN $TaskName /F 2>$null
    Write-Output 'Scheduled task removed.'
    exit 0
}

$taskRunner = Join-Path $PSScriptRoot 'Run-KyaraTask.cmd'
if (-not (Test-Path -LiteralPath $taskRunner)) {
    throw "Task runner not found: $taskRunner"
}

# schtasks.exe is available on all supported Windows versions and supports a
# simple recurring minute schedule without version-specific CIM properties.
$taskCommand = "cmd.exe /c `"`"$taskRunner`"`""
& schtasks.exe /Create /TN $TaskName /TR $taskCommand /SC MINUTE /MO 10 /F
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to create the scheduled task.'
}

Write-Output "Task '$TaskName' created: runs every 10 minutes."

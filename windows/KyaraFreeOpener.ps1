[CmdletBinding()]
param(
    [ValidateSet('Init', 'Run', 'DryRun', 'Stats')]
    [string]$Mode = 'Run'
)

$ErrorActionPreference = 'Stop'
$nodeScript = Join-Path $PSScriptRoot 'kyara-free-opener.cjs'

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'Node.js was not found. Install Node.js LTS for Windows, then open a new PowerShell terminal.'
}

if (-not (Test-Path -LiteralPath $nodeScript)) {
    throw "Script not found: $nodeScript"
}

if ($Mode -ne 'Stats' -and -not (Test-Path -LiteralPath (Join-Path $PSScriptRoot 'node_modules\playwright'))) {
    throw 'Playwright is not installed. Run: npm install ; npx playwright install chromium'
}

& node $nodeScript --mode $Mode
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

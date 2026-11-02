Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$client = Join-Path $repoRoot 'tools\tunnel-client\bin\tunnel-client.exe'
$python = Join-Path $repoRoot 'civ7\.venv\Scripts\python.exe'
$profileDir = Join-Path $repoRoot '.sidkick\profiles'
$profilePath = Join-Path $profileDir 'sidkick.yaml'
$pythonCommandPath = $python.Replace('\', '/')
$mcpCommand = "`"$pythonCommandPath`" -m sidkick.server --transport stdio"

if (-not (Test-Path -LiteralPath $profilePath)) {
    throw 'Sidkick is not configured. Run configure-chatgpt-tunnel.ps1 first.'
}

$profileText = Get-Content -Raw -LiteralPath $profilePath
$tunnelMatch = [regex]::Match($profileText, '(?m)^\s*"?tunnel_id"?\s*:\s*"([^"]+)"')
$keyMatch = [regex]::Match($profileText, '(?m)^\s*"?api_key"?\s*:\s*"([^"]+)"')
if (-not $tunnelMatch.Success -or -not $keyMatch.Success) {
    throw 'The Sidkick tunnel profile is missing its tunnel ID or runtime-key reference.'
}
$tunnelId = $tunnelMatch.Groups[1].Value
$keyReference = $keyMatch.Groups[1].Value

& $client runtimes connect `
    --alias sidkick `
    --profile sidkick `
    --profile-dir $profileDir `
    --tunnel-id $tunnelId `
    --runtime-api-key $keyReference `
    --mcp-command $mcpCommand
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client connect failed with exit code $LASTEXITCODE"
}

& $client runtimes status sidkick --json
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client status failed with exit code $LASTEXITCODE"
}


Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$client = Join-Path $repoRoot 'tools\tunnel-client\bin\tunnel-client.exe'

$stopOutput = & $client runtimes stop sidkick
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client stop failed with exit code $LASTEXITCODE"
}

Write-Host 'Sidkick is stopped.'



Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$client = Join-Path $repoRoot 'tools\tunnel-client\bin\tunnel-client.exe'

& $client runtimes connect --alias sidkick
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client connect failed with exit code $LASTEXITCODE"
}

& $client runtimes status sidkick --json
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client status failed with exit code $LASTEXITCODE"
}


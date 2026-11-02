param(
    [Parameter(Mandatory = $true)]
    [ValidatePattern('^tunnel_[a-z0-9]{32}$')]
    [string] $TunnelId,

    [switch] $ReplaceKey
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$client = Join-Path $repoRoot 'tools\tunnel-client\bin\tunnel-client.exe'
$python = Join-Path $repoRoot 'civ7\.venv\Scripts\python.exe'
$runtimeDir = Join-Path $repoRoot '.sidkick'
$profileDir = Join-Path $runtimeDir 'profiles'
$keyPath = Join-Path $runtimeDir 'tunnel-runtime-key.txt'

if (-not (Test-Path -LiteralPath $client)) {
    throw 'The official tunnel-client is not installed under tools\tunnel-client.'
}
if (-not (Test-Path -LiteralPath $python)) {
    throw 'The Sidkick Python environment is missing under civ7\.venv.'
}

New-Item -ItemType Directory -Force -Path $profileDir | Out-Null

if ($ReplaceKey -or -not (Test-Path -LiteralPath $keyPath)) {
    $secureKey = Read-Host 'Paste the restricted tunnel runtime API key' -AsSecureString
    $secretPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureKey)
    try {
        $plainKey = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($secretPointer)
        [IO.File]::WriteAllText(
            $keyPath,
            $plainKey,
            [Text.UTF8Encoding]::new($false)
        )
    }
    finally {
        if ($null -ne $secretPointer) {
            [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($secretPointer)
        }
        Remove-Variable plainKey -ErrorAction SilentlyContinue
    }

}

$identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
& icacls.exe $keyPath /inheritance:r /grant:r "${identity}:(F)" | Out-Null
if ($LASTEXITCODE -ne 0) {
    throw "Restricting the runtime key file failed with exit code $LASTEXITCODE"
}

$pythonCommandPath = $python.Replace('\', '/')
$mcpCommand = "`"$pythonCommandPath`" -m sidkick.server --transport stdio"
$keyReference = "file:$keyPath"

& $client runtimes connect `
    --alias sidkick `
    --profile sidkick `
    --profile-dir $profileDir `
    --tunnel-id $TunnelId `
    --runtime-api-key $keyReference `
    --mcp-command $mcpCommand `
    --name Sidkick `
    --description 'Read-only Civilization VII strategy snapshots'

if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client connect failed with exit code $LASTEXITCODE"
}

& $client runtimes status sidkick --json
if ($LASTEXITCODE -ne 0) {
    throw "tunnel-client status failed with exit code $LASTEXITCODE"
}


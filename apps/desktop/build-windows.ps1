$ErrorActionPreference = "Stop"

# Set Rust toolchain paths (vcvarsall is called by the batch wrapper, but PATH still needs cargo)
$CARGO_HOME = "D:\Apps\rust\.cargo"
$RUSTUP_HOME = "D:\Apps\rust\.rustup"
$env:CARGO_HOME = $CARGO_HOME
$env:RUSTUP_HOME = $RUSTUP_HOME
$env:PATH = "$CARGO_HOME\bin;$env:PATH"

$KEY_FILE = Join-Path $CARGO_HOME "tauri-key.pem"

Write-Host "Using cargo: $(Get-Command cargo).Source"

Write-Host "========================================"
Write-Host "  ClaudePrism Windows Build (NSIS)"
Write-Host "========================================"
Write-Host ""

# Try to load existing signing key
if ((-not $env:TAURI_SIGNING_PRIVATE_KEY) -and (Test-Path $KEY_FILE)) {
    $env:TAURI_SIGNING_PRIVATE_KEY = [System.IO.File]::ReadAllText($KEY_FILE).Trim()
    Write-Host "Loaded signing key from $KEY_FILE"
}

# If no key, temporarily disable updater artifacts for local build
$configFile = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json"
$configBak = $null
if ((-not $env:TAURI_SIGNING_PRIVATE_KEY) -and (Test-Path $configFile)) {
    Write-Host "No signing key found. Temporarily disabling updater artifacts..."
    $content = [System.IO.File]::ReadAllText($configFile)
    $configBak = Join-Path $PSScriptRoot "src-tauri\tauri.conf.json.bak"
    [System.IO.File]::WriteAllText($configBak, $content)
    $content = $content -replace '"createUpdaterArtifacts":\s*true', '"createUpdaterArtifacts": false'
    [System.IO.File]::WriteAllText($configFile, $content)
}

if (-not (Test-Path "node_modules")) {
    Write-Host "Installing dependencies..."
    & pnpm install
    if ($LASTEXITCODE -ne 0) { throw "pnpm install failed" }
}

Write-Host "Building Tauri app (Windows NSIS installer)..."
Write-Host ""

& pnpm --filter @claude-prism/desktop tauri build --bundles nsis

# Restore config if backed up
if ($configBak -and (Test-Path $configBak)) {
    [System.IO.File]::WriteAllText($configFile, [System.IO.File]::ReadAllText($configBak))
    Remove-Item $configBak
    Write-Host "Restored tauri.conf.json"
}

if ($LASTEXITCODE -ne 0) { throw "Tauri build failed with exit code $LASTEXITCODE" }

Write-Host ""
Write-Host "========================================"
Write-Host "  Build complete!"
Write-Host ""
Write-Host "  Installer: src-tauri\target\release\bundle\nsis\ClaudePrism_*-setup.exe"
Write-Host "========================================"

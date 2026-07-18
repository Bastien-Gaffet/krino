# Publie une release Krino sur GitHub avec artefacts de mise à jour signés.
# Usage :  .\publier.ps1 [-Notes "Description de la version"]
# Prérequis : gh (GitHub CLI) connecté, clé privée dans ~\.tauri\krino.key
param([string]$Notes = "")

$ErrorActionPreference = "Stop"
$cle = Join-Path $env:USERPROFILE ".tauri\krino.key"
if (-not (Test-Path $cle)) { throw "Clé de signature introuvable : $cle" }
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content $cle -Raw
$env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = ""

$conf = Get-Content "src-tauri\tauri.conf.json" -Raw | ConvertFrom-Json
$version = $conf.version
Write-Host "Construction de Krino v$version..." -ForegroundColor Cyan

npm run tauri build
if ($LASTEXITCODE -ne 0) { throw "Échec du build" }

$bundle = "src-tauri\target\release\bundle"
$setup = Get-ChildItem "$bundle\nsis\*-setup.exe" | Select-Object -First 1
$sig = Get-Content "$($setup.FullName).sig" -Raw
$msi = Get-ChildItem "$bundle\msi\*.msi" | Select-Object -First 1

# Manifeste lu par l'updater intégré (endpoint releases/latest/download/latest.json)
$manifeste = @{
    version  = $version
    notes    = $Notes
    pub_date = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    platforms = @{
        "windows-x86_64" = @{
            signature = $sig.Trim()
            url = "https://github.com/Bastien-Gaffet/krino/releases/download/v$version/$($setup.Name)"
        }
    }
} | ConvertTo-Json -Depth 4
$manifestePath = "$bundle\latest.json"
[IO.File]::WriteAllText((Resolve-Path $bundle).Path + "\latest.json", $manifeste)

Write-Host "Création de la release v$version..." -ForegroundColor Cyan
gh release create "v$version" --title "Krino v$version" --notes $Notes `
    $setup.FullName "$($setup.FullName).sig" $msi.FullName $manifestePath
if ($LASTEXITCODE -ne 0) { throw "Échec de la release" }
Write-Host "Release v$version publiée — les installations existantes la proposeront au démarrage." -ForegroundColor Green

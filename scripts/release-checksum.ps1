$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$packageJson = Get-Content -LiteralPath (Join-Path $repositoryRoot "package.json") -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
$releaseDirectory = Join-Path $repositoryRoot "apps\desktop\release"
$artifactName = "VoiceAssistant-$version-x64.exe"
$artifactPath = Join-Path $releaseDirectory $artifactName
$checksumPath = "$artifactPath.sha256"

if (-not (Test-Path -LiteralPath $artifactPath)) {
  throw "Release artifact was not found. Run npm run dist:desktop or npm run release:check first: $artifactPath"
}

$hash = Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256
"$($hash.Hash.ToLowerInvariant())  $artifactName" | Set-Content -LiteralPath $checksumPath -Encoding ascii

Write-Host "SHA-256: $($hash.Hash.ToLowerInvariant())"
Write-Host "Checksum file: $checksumPath"

$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$releaseDirectory = Join-Path $repositoryRoot "apps\desktop\release"
$packageJsonPath = Join-Path $repositoryRoot "package.json"
$packageJson = Get-Content -LiteralPath $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
$expectedFileName = "VoiceAssistant-$version-x64.exe"
$expectedArtifactPath = Join-Path $releaseDirectory $expectedFileName
$minimumArtifactBytes = 50MB

function Invoke-Step {
  param(
    [Parameter(Mandatory = $true)][string]$Title,
    [Parameter(Mandatory = $true)][scriptblock]$Command
  )

  Write-Host ""
  Write-Host "=== $Title ===" -ForegroundColor Green
  & $Command
  if ($LASTEXITCODE -ne 0) {
    throw "$Title failed with exit code $LASTEXITCODE."
  }
}

function Assert-ReleaseArtifact {
  if (-not (Test-Path -LiteralPath $expectedArtifactPath)) {
    throw "Expected release artifact was not found: $expectedArtifactPath"
  }

  $artifact = Get-Item -LiteralPath $expectedArtifactPath
  if ($artifact.Length -lt $minimumArtifactBytes) {
    throw "Release artifact is unexpectedly small: $($artifact.Length) bytes."
  }

  if ($artifact.Name -notmatch [regex]::Escape($version)) {
    throw "Release artifact filename does not contain version $version`: $($artifact.Name)"
  }

  Write-Host "Release artifact: $($artifact.FullName)"
  Write-Host ("Artifact size: {0:N1} MB" -f ($artifact.Length / 1MB))
}

function Assert-NoPackagedSecrets {
  if (-not (Test-Path -LiteralPath $releaseDirectory)) {
    throw "Release directory is missing: $releaseDirectory"
  }

  $secretPattern = 'sk-(?:proj-)?[A-Za-z0-9_-]{20,}'
  $textExtensions = @(".json", ".yml", ".yaml", ".js", ".cjs", ".mjs", ".html", ".txt", ".md", ".map")
  $matches = New-Object System.Collections.Generic.List[string]

  Get-ChildItem -LiteralPath $releaseDirectory -Recurse -File |
    Where-Object { $textExtensions -contains $_.Extension.ToLowerInvariant() } |
    ForEach-Object {
      $hit = Select-String -LiteralPath $_.FullName -Pattern $secretPattern -AllMatches -ErrorAction SilentlyContinue
      if ($hit) {
        $matches.Add($_.FullName)
      }
    }

  if ($matches.Count -gt 0) {
    throw "Release output contains a string that looks like an OpenAI API key: $($matches -join ', ')"
  }

  Write-Host "Secret scan: no OpenAI API-key-looking strings found in generated text/config assets."
}

Push-Location $repositoryRoot
try {
  if (-not (Get-Command npm.cmd -ErrorAction SilentlyContinue)) {
    throw "npm.cmd was not found. Install Node.js 20 or newer and reopen the terminal."
  }

  Invoke-Step "Stop stale development processes" { & npm.cmd run stop:dev }
  Invoke-Step "Local knowledge regression suite" { & npm.cmd run test:knowledge }
  Invoke-Step "Backend tests" { & npm.cmd run test:backend }
  Invoke-Step "Development launcher tests" { & npm.cmd run test:launcher }
  Invoke-Step "Production build" { & npm.cmd run build }
  Invoke-Step "Windows verification wrapper" { & npm.cmd run verify:win }
  Invoke-Step "Windows portable desktop packaging" { & npm.cmd run dist:desktop }

  Write-Host ""
  Write-Host "=== Release artifact checks ===" -ForegroundColor Green
  Assert-ReleaseArtifact
  Assert-NoPackagedSecrets

  Invoke-Step "Packaged renderer smoke test" { & npm.cmd run test:packaged }
  Invoke-Step "Git whitespace check" { & git diff --check }

  Write-Host ""
  Write-Host "VoiceAssistant release check passed for version $version." -ForegroundColor Green
} catch {
  Write-Error $_
  exit 1
} finally {
  Pop-Location
}

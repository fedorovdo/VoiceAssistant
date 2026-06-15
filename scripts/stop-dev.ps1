$ErrorActionPreference = "Stop"

$repositoryRoot = Split-Path -Parent $PSScriptRoot
$ports = @(8787, 5173)
$listenerProcesses = @{}
$relatedElectron = @()

function Get-PortListeners {
  param([int]$Port)

  $listeners = @()
  foreach ($line in (& netstat.exe -ano -p tcp)) {
    if ($line -match '^\s*TCP\s+(\S+):(\d+)\s+\S+\s+LISTENING\s+(\d+)\s*$') {
      $localAddress = $Matches[1]
      $localPort = [int]$Matches[2]
      $ownerPid = [int]$Matches[3]
      if ($localPort -eq $Port) {
        $listeners += [PSCustomObject]@{
          LocalAddress = $localAddress
          LocalPort = $localPort
          OwningProcess = $ownerPid
        }
      }
    }
  }

  return @($listeners | Sort-Object OwningProcess -Unique)
}

Write-Host "Stopping stale VoiceAssistant development processes" -ForegroundColor Green

for ($attempt = 1; $attempt -le 3; $attempt++) {
  $foundThisAttempt = $false

  foreach ($port in $ports) {
    $listeners = @(Get-PortListeners -Port $port)

    foreach ($listener in $listeners) {
      $processId = [int]$listener.OwningProcess
      $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
      $processName = if ($process) { $process.ProcessName } else { "unknown" }

      if (-not $listenerProcesses.ContainsKey($processId)) {
        Write-Host "[found] $($listener.LocalAddress):$port  PID $processId  $processName" -ForegroundColor Yellow
        $listenerProcesses[$processId] = $processName
      }

      Write-Host "[stop]  PID $processId  $processName" -ForegroundColor Cyan
      try {
        Stop-Process -Id $processId -Force -ErrorAction Stop
      } catch {
        Write-Host "[warning] Could not stop PID $processId. Try: taskkill /PID $processId /T /F" -ForegroundColor Yellow
      }
      $foundThisAttempt = $true
    }
  }

  if (-not $foundThisAttempt) {
    break
  }

  Start-Sleep -Milliseconds 600
}

# Electron does not own the Vite port, so stop it only when its command line clearly
# points at this VoiceAssistant repository. If Windows blocks command-line inspection,
# listener cleanup above still remains safe and complete.
try {
  $relatedElectron = @(Get-CimInstance Win32_Process -Filter "Name = 'electron.exe'" -ErrorAction Stop | Where-Object {
    $_.CommandLine -and (
      $_.CommandLine.IndexOf($repositoryRoot, [StringComparison]::OrdinalIgnoreCase) -ge 0 -or
      $_.CommandLine -match "VoiceAssistant"
    )
  })

  foreach ($electron in $relatedElectron) {
    if ($listenerProcesses.ContainsKey([int]$electron.ProcessId)) {
      continue
    }

    Write-Host "[found] VoiceAssistant Electron  PID $($electron.ProcessId)" -ForegroundColor Yellow
    Write-Host "[stop]  PID $($electron.ProcessId)  electron" -ForegroundColor Cyan
    Stop-Process -Id $electron.ProcessId -Force -ErrorAction SilentlyContinue
  }
} catch {
  Write-Host "Electron command-line inspection was unavailable; no unrelated Electron processes were touched." -ForegroundColor DarkGray
}

if ($listenerProcesses.Count -eq 0 -and $relatedElectron.Count -eq 0) {
  Write-Host "No stale VoiceAssistant development processes were found." -ForegroundColor Green
} else {
  Write-Host "VoiceAssistant development cleanup complete." -ForegroundColor Green
}

$remainingListeners = @($ports | ForEach-Object { Get-PortListeners -Port $_ })
if ($remainingListeners.Count -gt 0) {
  Write-Host "Some development listeners are still running. Use npm run check:ports for details." -ForegroundColor Yellow
  exit 1
}

$ErrorActionPreference = "Stop"

$ports = @(8787, 5173)
$occupied = $false

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

Write-Host "VoiceAssistant development ports" -ForegroundColor Green

foreach ($port in $ports) {
  $listeners = @(Get-PortListeners -Port $port)

  if ($listeners.Count -eq 0) {
    Write-Host "[free]     127.0.0.1:$port" -ForegroundColor Green
    continue
  }

  $occupied = $true
  foreach ($listener in $listeners) {
    $processId = [int]$listener.OwningProcess
    $process = Get-Process -Id $processId -ErrorAction SilentlyContinue
    $processName = if ($process) { $process.ProcessName } else { "unknown" }

    Write-Host "[occupied] $($listener.LocalAddress):$port  PID $processId  $processName" -ForegroundColor Yellow
    Write-Host "           Suggested: taskkill /PID $processId /T /F" -ForegroundColor DarkGray
  }
}

if (-not $occupied) {
  Write-Host "All VoiceAssistant development ports are free." -ForegroundColor Green
}

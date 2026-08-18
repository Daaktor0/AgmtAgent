<#
  Starts the local agent. Leave this window open while you work in Word.

      powershell -ExecutionPolicy Bypass -File .\start.ps1
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $Root

if (-not (Test-Path "$Root\.venv\Scripts\python.exe")) {
  Write-Host "Not set up yet. Run setup.ps1 first." -ForegroundColor Red
  Read-Host "Press Enter to exit"; exit 1
}

Write-Host "Agreement Agent - local only, on https://localhost:8787" -ForegroundColor Cyan
Write-Host "Close this window to stop it.`n" -ForegroundColor DarkGray

& "$Root\.venv\Scripts\python.exe" -m server.app

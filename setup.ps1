<#
  Agreement Agent - Windows setup.

  Run once, from PowerShell, in the folder this file lives in:

      powershell -ExecutionPolicy Bypass -File .\setup.ps1

  It will:
    1. create a Python virtual environment and install dependencies
    2. generate a localhost HTTPS certificate and trust it (Word requires HTTPS)
    3. share a folder holding manifest.xml so Word can see the add-in
    4. print the three Trust Center clicks you still have to do by hand

  Steps 2 and 3 need administrator rights, so it will ask to elevate.
#>

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $MyInvocation.MyCommand.Definition
Set-Location $Root

function Say($m) { Write-Host "`n>> $m" -ForegroundColor Cyan }
function Ok($m)  { Write-Host "   $m" -ForegroundColor Green }
function Warn($m){ Write-Host "   $m" -ForegroundColor Yellow }

# ---------------------------------------------------------------- elevation
$isAdmin = ([Security.Principal.WindowsPrincipal] `
    [Security.Principal.WindowsIdentity]::GetCurrent()
  ).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)

if (-not $isAdmin) {
  Warn "Re-launching as administrator (needed to trust the certificate and share the catalog folder)."
  Start-Process powershell -Verb RunAs -ArgumentList `
    "-ExecutionPolicy Bypass -NoExit -File `"$PSCommandPath`""
  exit
}

# ---------------------------------------------------------------- 1. python
Say "Checking Python"
$py = $null
foreach ($c in @("py -3", "python")) {
  try {
    $v = & ([scriptblock]::Create("$c --version")) 2>&1
    if ($v -match "Python 3\.(\d+)" -and [int]$Matches[1] -ge 10) { $py = $c; break }
  } catch {}
}
if (-not $py) {
  Write-Host "`nPython 3.10 or newer is required. Install it from https://python.org/downloads" `
    -ForegroundColor Red
  Write-Host "Tick 'Add python.exe to PATH' during install, then run this script again."
  Read-Host "Press Enter to exit"; exit 1
}
Ok "Found: $((& ([scriptblock]::Create("$py --version")) 2>&1))"

Say "Creating virtual environment and installing dependencies"
if (-not (Test-Path "$Root\.venv")) {
  & ([scriptblock]::Create("$py -m venv `"$Root\.venv`""))
}
& "$Root\.venv\Scripts\python.exe" -m pip install --quiet --upgrade pip
& "$Root\.venv\Scripts\python.exe" -m pip install --quiet -r "$Root\requirements.txt"
Ok "Dependencies installed."

if (-not (Test-Path "$Root\config.yaml")) {
  Copy-Item "$Root\config.example.yaml" "$Root\config.yaml"
  Ok "Created config.yaml (add your OpenRouter key from the task pane later)."
}

# ---------------------------------------------------------------- 2. certificate
Say "Generating and trusting the localhost certificate"
& "$Root\.venv\Scripts\python.exe" "$Root\server\certs.py" | Out-Null
$certPath = "$Root\certs\localhost.crt"
if (-not (Test-Path $certPath)) { throw "Certificate generation failed." }

$thumb = (New-Object System.Security.Cryptography.X509Certificates.X509Certificate2 $certPath).Thumbprint
$already = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Thumbprint -eq $thumb }
if ($already) {
  Ok "Certificate already trusted."
} else {
  Import-Certificate -FilePath $certPath -CertStoreLocation Cert:\LocalMachine\Root | Out-Null
  Ok "Certificate installed into Trusted Root Certification Authorities."
}

# ---------------------------------------------------------------- 3. catalog share
Say "Publishing the add-in catalog folder"
$catalog   = Join-Path $Root "catalog"
$shareName = "AgreementAgent"
New-Item -ItemType Directory -Force -Path $catalog | Out-Null
Copy-Item "$Root\addin\manifest.xml" $catalog -Force

$existing = Get-SmbShare -Name $shareName -ErrorAction SilentlyContinue
if ($existing) {
  if ($existing.Path -ne $catalog) {
    Remove-SmbShare -Name $shareName -Force
    $existing = $null
  }
}
if (-not $existing) {
  New-SmbShare -Name $shareName -Path $catalog `
    -FullAccess "$env:USERDOMAIN\$env:USERNAME" | Out-Null
}
$unc = "\\$env:COMPUTERNAME\$shareName"
Ok "Shared at $unc"

# ---------------------------------------------------------------- 4. finish
$unc | Set-Content -Path "$Root\CATALOG-PATH.txt" -Encoding UTF8

Write-Host @"

------------------------------------------------------------------
  Setup complete. Two things left, both inside Word.
------------------------------------------------------------------

  A. Trust the catalog (once)

     Word  ->  File  ->  Options  ->  Trust Center
           ->  Trust Center Settings...  ->  Trusted Add-in Catalogs

     Catalog Url:   $unc
     Click 'Add catalog', tick 'Show in Menu', OK, OK.
     Then CLOSE AND REOPEN WORD.

  B. Start the agent, then insert the add-in

     Double-click  start.ps1  (or run: powershell -ExecutionPolicy Bypass -File .\start.ps1)

     Word  ->  Home  ->  Add-ins  ->  Advanced (or 'More Add-ins')
           ->  SHARED FOLDER  ->  Agreement Agent  ->  Add

  The catalog path is also saved in CATALOG-PATH.txt.

"@ -ForegroundColor White

Read-Host "Press Enter to close"

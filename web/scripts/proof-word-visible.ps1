param(
  [string]$Output,
  [string]$Source = "",
  [int]$TimeoutSeconds = 90
)

$wordPath = "C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"
if (-not (Test-Path $wordPath)) {
  Write-Output (ConvertTo-Json @{ ok = $false; error = "WORD_MISSING" } -Compress)
  exit 2
}
if (-not (Test-Path $Output)) {
  Write-Output (ConvertTo-Json @{ ok = $false; error = "FILE_MISSING"; path = $Output } -Compress)
  exit 2
}

$job = Start-Job -ScriptBlock {
  param($Output, $Source)
  $word = New-Object -ComObject Word.Application
  $word.Visible = $true
  $word.DisplayAlerts = -1
  $repair = $false
  $errorText = ""
  try {
    $doc = $word.Documents.Open($Output, $false, $true)
    $sourceDoc = $null
    if ($Source -and (Test-Path $Source)) {
      $sourceDoc = $word.Documents.Open($Source, $false, $true)
    }
    $result = @{
      ok = $true
      visible = [bool]$word.Visible
      displayAlerts = [int]$word.DisplayAlerts
      pages = [int]$doc.ComputeStatistics(2)
      revisions = [int]$doc.Revisions.Count
      comments = [int]$doc.Comments.Count
      tables = [int]$doc.Tables.Count
      inlineShapes = [int]$doc.InlineShapes.Count
      saved = [bool]$doc.Saved
      sourceRevisions = if ($sourceDoc) { [int]$sourceDoc.Revisions.Count } else { $null }
      sourceComments = if ($sourceDoc) { [int]$sourceDoc.Comments.Count } else { $null }
    }
    if ($sourceDoc) { $sourceDoc.Close([ref]$false) }
    $doc.Close([ref]$false)
    $result
  } catch {
    @{ ok = $false; error = $_.Exception.Message; repairSuspected = $true }
  } finally {
    $word.Quit()
    [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
  }
} -ArgumentList $Output, $Source

$finished = Wait-Job $job -Timeout $TimeoutSeconds
if (-not $finished) {
  Stop-Job $job -ErrorAction SilentlyContinue
  Remove-Job $job -Force -ErrorAction SilentlyContinue
  Write-Output (ConvertTo-Json @{ ok = $false; blocked = $true; error = "visible_word_open_timed_out"; timeoutSeconds = $TimeoutSeconds } -Compress)
  exit 3
}
$result = Receive-Job $job
Remove-Job $job -Force -ErrorAction SilentlyContinue
Write-Output ($result | ConvertTo-Json -Compress)
if ($result.ok) { exit 0 } else { exit 1 }

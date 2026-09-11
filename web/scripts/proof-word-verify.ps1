param(
  [string]$Root = (Resolve-Path (Join-Path $PSScriptRoot "..\..\docs\proof\word-review")).Path
)

$wordPath = "C:\Program Files\Microsoft Office\root\Office16\WINWORD.EXE"
if (-not (Test-Path $wordPath)) {
  Write-Output "WORD_MISSING"
  exit 2
}

$pairs = @(
  @{ Name = "body"; Source = "body.docx"; Output = "body_Proofread.docx"; Corrections = 2; Comments = 2 },
  @{ Name = "table"; Source = "table.docx"; Output = "table_Proofread.docx"; Corrections = 2; Comments = 2 },
  @{ Name = "prior_review"; Source = "prior_review.docx"; Output = "prior_review_Proofread.docx"; Corrections = 2; Comments = 2 },
  @{ Name = "party_name"; Source = "party_name.docx"; Output = "party_name_Proofread.docx"; Corrections = 0; Comments = 0 },
  @{ Name = "user_report"; Source = "user_report.docx"; Output = "user_report_Proofread.docx"; Corrections = 2; Comments = 2 }
)

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$failed = 0
try {
  foreach ($pair in $pairs) {
    $output = Join-Path $Root $pair.Output
    if (-not (Test-Path $output)) {
      if ($pair.Name -eq "user_report") {
        Write-Output "$($pair.Name) SKIPPED"
        continue
      }
      Write-Output "$($pair.Name) FILE_MISSING"
      $failed++
      continue
    }
    $doc = $word.Documents.Open($output, $false, $true)
    try {
      $revisions = $doc.Revisions.Count
      $comments = $doc.Comments.Count
      $ok = ($revisions -ge $pair.Corrections) -and ($comments -ge $pair.Comments)
      Write-Output "$($pair.Name) revisions=$revisions comments=$comments expected_corrections>=$($pair.Corrections) expected_comments>=$($pair.Comments) $(if ($ok) { 'PASS' } else { 'FAIL' })"
      if (-not $ok) { $failed++ }
    } finally {
      $doc.Close([ref]$false)
    }
  }
} finally {
  $word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}

if ($failed -gt 0) { exit 1 }
exit 0

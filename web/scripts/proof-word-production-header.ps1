$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$root = Resolve-Path (Join-Path $PSScriptRoot "..\..\docs\proof\word-review")
$path = Join-Path $root.Path "production_header_typo_Proofread.docx"
if (-not (Test-Path $path)) { Write-Output "FILE_MISSING"; exit 1 }

$zip = [IO.Compression.ZipFile]::OpenRead($path)
try {
  $entry = $zip.GetEntry("word/header1.xml")
  $reader = New-Object IO.StreamReader($entry.Open())
  $xml = $reader.ReadToEnd()
  $reader.Close()
  Write-Output ("xml_header_del=" + ([regex]::Matches($xml, "<w:del\b").Count))
  Write-Output ("xml_header_ins=" + ([regex]::Matches($xml, "<w:ins\b").Count))
  Write-Output ("xml_header_comment=" + ([regex]::Matches($xml, "<w:commentRangeStart\b").Count))
  Write-Output ("xml_header_recieve=" + $xml.Contains("recieve"))
  Write-Output ("xml_header_receive=" + $xml.Contains("receive"))
} finally {
  $zip.Dispose()
}

function Open-HeaderStory([string]$file) {
  $word = New-Object -ComObject Word.Application
  $word.Visible = $false
  $word.DisplayAlerts = 0
  $doc = $word.Documents.Open($file, $false, $false)
  return @{ Word = $word; Doc = $doc; Header = $doc.StoryRanges.Item(7) }
}

function Close-HeaderStory($handle) {
  $handle.Doc.Close([ref]$false)
  $handle.Word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($handle.Word) | Out-Null
}

$accept = Open-HeaderStory $path
try {
  $before = $accept.Header.Text
  if ($before.Length -gt 120) { $before = $before.Substring(0, 120) }
  Write-Output ("story7_revisions=" + $accept.Header.Revisions.Count)
  Write-Output ("story7_text_before=" + $before)
  Write-Output ("doc_revisions=" + $accept.Doc.Revisions.Count)
  Write-Output ("doc_comments=" + $accept.Doc.Comments.Count)
  $accept.Header.Revisions.AcceptAll()
  $after = $accept.Doc.StoryRanges.Item(7).Text
  if ($after.Length -gt 120) { $after = $after.Substring(0, 120) }
  Write-Output ("story7_text_after_accept=" + $after)
  Write-Output ("story7_revisions_after_accept=" + $accept.Doc.StoryRanges.Item(7).Revisions.Count)
} finally {
  Close-HeaderStory $accept
}

$reject = Open-HeaderStory $path
try {
  $reject.Header.Revisions.RejectAll()
  $rejected = $reject.Doc.StoryRanges.Item(7).Text
  if ($rejected.Length -gt 120) { $rejected = $rejected.Substring(0, 120) }
  Write-Output ("story7_text_after_reject=" + $rejected)
  Write-Output ("story7_revisions_after_reject=" + $reject.Doc.StoryRanges.Item(7).Revisions.Count)
} finally {
  Close-HeaderStory $reject
}

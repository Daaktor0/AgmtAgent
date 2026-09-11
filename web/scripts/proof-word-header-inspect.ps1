$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.IO.Compression.FileSystem
$path = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..\..\docs\proof\word-review")).Path "header_typo_Proofread.docx"
$zip = [IO.Compression.ZipFile]::OpenRead($path)
try {
  $entry = $zip.GetEntry("word/header1.xml")
  $reader = New-Object IO.StreamReader($entry.Open())
  $xml = $reader.ReadToEnd()
  $reader.Close()
  Write-Output ("header_del=" + ([regex]::Matches($xml, "<w:del\b").Count))
  Write-Output ("header_ins=" + ([regex]::Matches($xml, "<w:ins\b").Count))
  Write-Output ("header_has_recieve=" + $xml.Contains("recieve"))
  Write-Output ("header_has_receive=" + $xml.Contains("receive"))
} finally {
  $zip.Dispose()
}

$word = New-Object -ComObject Word.Application
$word.Visible = $false
$word.DisplayAlerts = 0
$doc = $word.Documents.Open($path, $false, $true)
try {
  Write-Output ("doc.Revisions=" + $doc.Revisions.Count)
  Write-Output ("doc.Comments=" + $doc.Comments.Count)
  foreach ($n in 1,2,5,6,7,8,9,10,11) {
    try {
      $story = $doc.StoryRanges.Item($n)
      $snippet = $story.Text
      if ($snippet.Length -gt 80) { $snippet = $snippet.Substring(0, 80) }
      Write-Output ("story " + $n + " revisions=" + $story.Revisions.Count + " text=" + $snippet)
    } catch {
      Write-Output ("story " + $n + " missing")
    }
  }
} finally {
  $doc.Close([ref]$false)
  $word.Quit()
  [System.Runtime.Interopservices.Marshal]::ReleaseComObject($word) | Out-Null
}

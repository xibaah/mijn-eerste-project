# Kleine lokale webserver voor de Routeplanner (geen installatie nodig).
# Wordt gestart door "Start Routeplanner.bat".
$ErrorActionPreference = 'Stop'
$root = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
if (-not $root.EndsWith('\')) { $root += '\' }

$types = @{
  '.html' = 'text/html; charset=utf-8'
  '.js' = 'text/javascript; charset=utf-8'
  '.css' = 'text/css; charset=utf-8'
  '.png' = 'image/png'
  '.svg' = 'image/svg+xml'
  '.webmanifest' = 'application/manifest+json'
}

# Zoek een vrije poort vanaf 8000.
$listener = $null
foreach ($port in 8000..8020) {
  $candidate = New-Object System.Net.HttpListener
  $candidate.Prefixes.Add("http://localhost:$port/")
  try { $candidate.Start(); $listener = $candidate; break } catch { $candidate.Close() }
}
if (-not $listener) { Write-Host 'Geen vrije poort gevonden tussen 8000 en 8020.'; exit 1 }

$url = "http://localhost:$port/"
Write-Host ''
Write-Host "  Routeplanner draait op $url"
Write-Host '  Laat dit venster open zolang je de app gebruikt. Sluit het om te stoppen.'
Write-Host ''
Start-Process $url

while ($listener.IsListening) {
  $ctx = $listener.GetContext()
  $res = $ctx.Response
  try {
    $rel = [Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath.TrimStart('/'))
    if ($rel -eq '') { $rel = 'index.html' }
    $path = [IO.Path]::GetFullPath((Join-Path $root $rel))
    if ($path.StartsWith($root, [StringComparison]::OrdinalIgnoreCase) -and (Test-Path -LiteralPath $path -PathType Leaf)) {
      $bytes = [IO.File]::ReadAllBytes($path)
      $ext = [IO.Path]::GetExtension($path).ToLower()
      if ($types.ContainsKey($ext)) { $res.ContentType = $types[$ext] } else { $res.ContentType = 'application/octet-stream' }
      $res.ContentLength64 = $bytes.Length
      $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $res.StatusCode = 404
    }
  } catch {
    $res.StatusCode = 500
  } finally {
    $res.Close()
  }
}

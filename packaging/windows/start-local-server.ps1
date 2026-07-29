$ErrorActionPreference = "Stop"

$Root = Split-Path -Parent $MyInvocation.MyCommand.Path
$AppRoot = Join-Path $Root "app"

if (-not (Test-Path $AppRoot -PathType Container)) {
  Write-Host "Cannot find the app folder:" -ForegroundColor Red
  Write-Host $AppRoot
  Write-Host ""
  Write-Host "Please keep the app folder next to this launcher."
  exit 1
}

function Get-MimeType {
  param([string]$Path)

  switch ([System.IO.Path]::GetExtension($Path).ToLowerInvariant()) {
    ".html" { "text/html; charset=utf-8"; break }
    ".js" { "text/javascript; charset=utf-8"; break }
    ".mjs" { "text/javascript; charset=utf-8"; break }
    ".css" { "text/css; charset=utf-8"; break }
    ".json" { "application/json; charset=utf-8"; break }
    ".png" { "image/png"; break }
    ".jpg" { "image/jpeg"; break }
    ".jpeg" { "image/jpeg"; break }
    ".webp" { "image/webp"; break }
    ".svg" { "image/svg+xml"; break }
    ".ico" { "image/x-icon"; break }
    ".glb" { "model/gltf-binary"; break }
    ".gltf" { "model/gltf+json"; break }
    ".bin" { "application/octet-stream"; break }
    ".fbx" { "application/octet-stream"; break }
    ".mp3" { "audio/mpeg"; break }
    ".wav" { "audio/wav"; break }
    default { "application/octet-stream"; break }
  }
}

function Write-Response {
  param(
    [System.Net.HttpListenerContext]$Context,
    [int]$StatusCode,
    [byte[]]$Bytes,
    [string]$ContentType
  )

  $Context.Response.StatusCode = $StatusCode
  $Context.Response.ContentType = $ContentType
  $Context.Response.Headers["Cache-Control"] = "no-cache"
  $Context.Response.ContentLength64 = $Bytes.Length
  $Context.Response.OutputStream.Write($Bytes, 0, $Bytes.Length)
}

$port = 5173
$started = $false
$listener = $null

while (-not $started -and $port -lt 5200) {
  $prefix = "http://127.0.0.1:$port/"
  $candidateListener = [System.Net.HttpListener]::new()
  try {
    $candidateListener.Prefixes.Add($prefix)
    $candidateListener.Start()
    $listener = $candidateListener
    $started = $true
  } catch {
    $candidateListener.Close()
    $port += 1
  }
}

if (-not $started) {
  Write-Host "Could not start a local server on ports 5173-5199." -ForegroundColor Red
  Write-Host "Please close other local dev servers and try again."
  exit 1
}

$url = "http://127.0.0.1:$port/"
Write-Host "AI Native Engine is running:" -ForegroundColor Green
Write-Host $url
Write-Host ""
Write-Host "Keep this window open while using the app."
Write-Host "Press Ctrl+C to stop."
Write-Host ""

Start-Process $url

try {
  while ($listener.IsListening) {
    $context = $listener.GetContext()
    try {
      $requestPath = [System.Uri]::UnescapeDataString($context.Request.Url.AbsolutePath.TrimStart("/"))
      if ([string]::IsNullOrWhiteSpace($requestPath)) {
        $requestPath = "index.html"
      }

      $safeRelativePath = $requestPath.Replace("/", [System.IO.Path]::DirectorySeparatorChar)
      $candidatePath = Join-Path $AppRoot $safeRelativePath
      $fullPath = [System.IO.Path]::GetFullPath($candidatePath)
      $fullAppRoot = [System.IO.Path]::GetFullPath($AppRoot)
      $fullAppRootWithSlash = $fullAppRoot.TrimEnd([System.IO.Path]::DirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar

      if (-not $fullPath.StartsWith($fullAppRootWithSlash, [System.StringComparison]::OrdinalIgnoreCase)) {
        $message = [System.Text.Encoding]::UTF8.GetBytes("403 Forbidden")
        Write-Response $context 403 $message "text/plain; charset=utf-8"
        continue
      }

      if (-not (Test-Path $fullPath -PathType Leaf)) {
        if ($context.Request.Url.AbsolutePath -notmatch "\.[^/]+$") {
          $fullPath = Join-Path $AppRoot "index.html"
        } else {
          $message = [System.Text.Encoding]::UTF8.GetBytes("404 Not Found")
          Write-Response $context 404 $message "text/plain; charset=utf-8"
          continue
        }
      }

      $bytes = [System.IO.File]::ReadAllBytes($fullPath)
      Write-Response $context 200 $bytes (Get-MimeType $fullPath)
    } catch {
      $message = [System.Text.Encoding]::UTF8.GetBytes("500 Server Error")
      Write-Response $context 500 $message "text/plain; charset=utf-8"
    } finally {
      $context.Response.OutputStream.Close()
    }
  }
} finally {
  if ($listener.IsListening) {
    $listener.Stop()
  }
  $listener.Close()
}

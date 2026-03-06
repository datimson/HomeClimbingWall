param(
  [string]$DesignId = 'classic',
  [string]$AtlasPath = '',
  [string]$ManifestPath = '',
  [string]$TextureRoot = ''
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

$legacyRoot = Join-Path $PSScriptRoot '..\textures'
if ([string]::IsNullOrWhiteSpace($TextureRoot)) {
  $TextureRoot = Join-Path $PSScriptRoot ("..\textures\designs\{0}" -f $DesignId)
}
if (!(Test-Path $TextureRoot) -and $DesignId -eq 'classic') {
  $legacyWalls = Join-Path $legacyRoot 'walls'
  if (Test-Path $legacyWalls) { $TextureRoot = $legacyRoot }
}
if ([string]::IsNullOrWhiteSpace($AtlasPath)) {
  $AtlasPath = Join-Path $TextureRoot 'texture-atlas.png'
}
if ([string]::IsNullOrWhiteSpace($ManifestPath)) {
  $ManifestPath = Join-Path $TextureRoot 'texture-atlas.manifest.json'
}

if (!(Test-Path $ManifestPath)) { throw "Manifest not found: $ManifestPath" }
if (!(Test-Path $AtlasPath)) { throw "Atlas image not found: $AtlasPath" }
if (!(Test-Path $TextureRoot)) { throw "Texture root not found: $TextureRoot" }

$manifestRaw = Get-Content -Path $ManifestPath -Raw
$manifest = $manifestRaw | ConvertFrom-Json

if (!$manifest.entries -or !$manifest.entries.Count) {
  throw "Manifest has no texture entries: $ManifestPath"
}

$textureRootFull = (Resolve-Path $TextureRoot).Path
$atlas = [System.Drawing.Bitmap]::FromFile((Resolve-Path $AtlasPath).Path)
$written = 0

# Preflight atlas bounds check with a clear error message.
$requiredW = 0
$requiredH = 0
foreach ($entry in $manifest.entries) {
  $x = [int][Math]::Round([double]$entry.x)
  $y = [int][Math]::Round([double]$entry.y)
  $w = [int][Math]::Round([double]$entry.width)
  $h = [int][Math]::Round([double]$entry.height)
  if ($w -le 0 -or $h -le 0) { continue }
  $requiredW = [Math]::Max($requiredW, $x + $w)
  $requiredH = [Math]::Max($requiredH, $y + $h)
}
if ($atlas.Width -lt $requiredW -or $atlas.Height -lt $requiredH) {
  $actualW = $atlas.Width
  $actualH = $atlas.Height
  $atlas.Dispose()
  throw (
    "Atlas size does not match manifest. " +
    "Actual: ${actualW}x${actualH}, " +
    "Required at least: ${requiredW}x${requiredH}. " +
    "Likely cause: atlas export trimmed/cropped transparent area. " +
    "Re-export texture-atlas.png at full canvas size without trimming."
  )
}

foreach ($entry in $manifest.entries) {
  $relPath = [string]$entry.path
  if ([string]::IsNullOrWhiteSpace($relPath)) { continue }

  $x = [int][Math]::Round([double]$entry.x)
  $y = [int][Math]::Round([double]$entry.y)
  $w = [int][Math]::Round([double]$entry.width)
  $h = [int][Math]::Round([double]$entry.height)
  if ($w -le 0 -or $h -le 0) { continue }

  if ($x -lt 0 -or $y -lt 0 -or ($x + $w) -gt $atlas.Width -or ($y + $h) -gt $atlas.Height) {
    throw "Entry out of atlas bounds: $relPath at [$x,$y,$w,$h]"
  }

  $targetPath = Join-Path $textureRootFull ($relPath.Replace('/', '\'))
  $targetDir = Split-Path -Path $targetPath -Parent
  if ($targetDir -and !(Test-Path $targetDir)) { New-Item -ItemType Directory -Path $targetDir | Out-Null }

  $srcRect = New-Object System.Drawing.Rectangle $x, $y, $w, $h
  # Clone exact pixels to preserve alpha/transparency without any resampling/compositing.
  $slice = $atlas.Clone($srcRect, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $slice.Save($targetPath, [System.Drawing.Imaging.ImageFormat]::Png)
  $slice.Dispose()
  $written++
}

$atlas.Dispose()
Write-Output "Unpacked $written textures to: $textureRootFull"

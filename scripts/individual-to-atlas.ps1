param(
  [string]$DesignId = 'classic',
  [string]$TextureRoot = '',
  [string]$AtlasPath = '',
  [string]$ManifestPath = '',
  [switch]$IncludeBumps,
  [int]$Columns = 6,
  [int]$Padding = 56,
  [int]$Gap = 56,
  [int]$LabelHeight = 58
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

$textureRootFull = (Resolve-Path $TextureRoot).Path
$wallsDir = Join-Path $textureRootFull 'walls'
$volumesDir = Join-Path $textureRootFull 'volumes'

if (!(Test-Path $wallsDir)) { throw "Missing walls texture directory: $wallsDir" }
if (!(Test-Path $volumesDir)) { throw "Missing volume texture directory: $volumesDir" }

$pngFilter = if ($IncludeBumps) { '*.png' } else { '*.png' }

$wallFiles = Get-ChildItem -Path $wallsDir -Filter $pngFilter -File |
  Where-Object { $IncludeBumps -or $_.BaseName -notlike '*-bump' }
$volumeFiles = Get-ChildItem -Path $volumesDir -Filter $pngFilter -File |
  Where-Object { $IncludeBumps -or $_.BaseName -notlike '*-bump' }

$allFiles = @($wallFiles + $volumeFiles)
if (!$allFiles.Count) { throw 'No textures found to pack.' }

function RelPath([string]$fullPath, [string]$rootPath) {
  return $fullPath.Substring($rootPath.Length + 1).Replace('\', '/')
}

$preset = @{
  'volumes/cornerAB.png' = @{ col = 0; row = 0 }
  'volumes/dartB.png'    = @{ col = 1; row = 0 }
  'walls/G.png'          = @{ col = 2; row = 0 }
  'volumes/ceilingG.png' = @{ col = 3; row = 0 }
  'volumes/dartC.png'    = @{ col = 4; row = 0 }

  # Wall column order (left -> right): E, A, B, C, D, F
  # (E has no s2 texture, so row 1 col 0 is intentionally empty.)
  'walls/A-s2.png'       = @{ col = 1; row = 1 }
  'walls/B-s2.png'       = @{ col = 2; row = 1 }
  'walls/C-s2.png'       = @{ col = 3; row = 1 }
  'walls/D-s2.png'       = @{ col = 4; row = 1 }
  'walls/F-s2.png'       = @{ col = 5; row = 1 }

  'walls/E-s1.png'       = @{ col = 0; row = 2 }
  'walls/A-s1.png'       = @{ col = 1; row = 2 }
  'walls/B-s1.png'       = @{ col = 2; row = 2 }
  'walls/C-s1.png'       = @{ col = 3; row = 2 }
  'walls/D-s1.png'       = @{ col = 4; row = 2 }
  'walls/F-s1.png'       = @{ col = 5; row = 2 }

  'walls/E-kick.png'     = @{ col = 0; row = 3 }
  'walls/A-kick.png'     = @{ col = 1; row = 3 }
  'walls/B-kick.png'     = @{ col = 2; row = 3 }
  'walls/C-kick.png'     = @{ col = 3; row = 3 }
  'walls/D-kick.png'     = @{ col = 4; row = 3 }
  'walls/F-kick.png'     = @{ col = 5; row = 3 }

  'walls/E.png'          = @{ col = 0; row = 4 }
  'walls/A.png'          = @{ col = 1; row = 4 }
  'walls/B.png'          = @{ col = 2; row = 4 }
  'walls/C.png'          = @{ col = 3; row = 4 }
  'walls/D.png'          = @{ col = 4; row = 4 }
  'walls/F.png'          = @{ col = 5; row = 4 }
}

$textures = @()
$maxW = 0
$maxH = 0
foreach ($file in ($allFiles | Sort-Object FullName)) {
  $rel = RelPath $file.FullName $textureRootFull
  $bmp = [System.Drawing.Bitmap]::FromFile($file.FullName)
  $maxW = [Math]::Max($maxW, $bmp.Width)
  $maxH = [Math]::Max($maxH, $bmp.Height)
  $textures += [pscustomobject]@{
    path = $rel
    file = $file.FullName
    bmp = $bmp
    width = $bmp.Width
    height = $bmp.Height
  }
}

$placed = @()
$usedPreset = @{}
$extras = @()

foreach ($t in $textures) {
  if ($preset.ContainsKey($t.path) -and !$usedPreset.ContainsKey($t.path)) {
    $slot = $preset[$t.path]
    $usedPreset[$t.path] = $true
    $placed += [pscustomobject]@{
      path = $t.path
      bmp = $t.bmp
      width = $t.width
      height = $t.height
      col = [int]$slot.col
      row = [int]$slot.row
    }
  } else {
    $extras += $t
  }
}

$extraStartRow = 5
for ($i = 0; $i -lt $extras.Count; $i++) {
  $col = $i % $Columns
  $row = $extraStartRow + [Math]::Floor($i / $Columns)
  $t = $extras[$i]
  $placed += [pscustomobject]@{
    path = $t.path
    bmp = $t.bmp
    width = $t.width
    height = $t.height
    col = [int]$col
    row = [int]$row
  }
}

$maxCol = (($placed | Measure-Object -Property col -Maximum).Maximum)
$maxRow = (($placed | Measure-Object -Property row -Maximum).Maximum)
$colCount = [Math]::Max($Columns, $maxCol + 1)
$rowCount = $maxRow + 1

$rowStride = $LabelHeight + $maxH
$atlasW = ($Padding * 2) + ($colCount * $maxW) + (($colCount - 1) * $Gap)
$atlasH = ($Padding * 2) + ($rowCount * $rowStride) + (($rowCount - 1) * $Gap)

$atlas = New-Object System.Drawing.Bitmap $atlasW, $atlasH, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
$g = [System.Drawing.Graphics]::FromImage($atlas)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
$g.Clear([System.Drawing.Color]::FromArgb(0, 24, 25, 28))

$labelFont = New-Object System.Drawing.Font('Segoe UI', 18, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
$labelBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(240, 235, 240, 248))
$rowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 78, 88, 103))

$manifestEntries = @()
foreach ($p in ($placed | Sort-Object row, col, path)) {
  $cellX = $Padding + ($p.col * ($maxW + $Gap))
  $cellY = $Padding + ($p.row * ($rowStride + $Gap))
  $imgX = $cellX + [int](($maxW - $p.width) / 2)
  $imgY = $cellY + $LabelHeight + [int](($maxH - $p.height) / 2)

  $g.FillRectangle($rowBrush, $cellX, $cellY, $maxW, $LabelHeight)
  # Leave image cells transparent so alpha survives atlas round-trips.

  $label = $p.path.Replace('walls/', 'W: ').Replace('volumes/', 'V: ').Replace('.png', '')
  $g.DrawString($label, $labelFont, $labelBrush, $cellX + 10, $cellY + 14)
  $g.DrawImage($p.bmp, $imgX, $imgY, $p.width, $p.height)

  $manifestEntries += [ordered]@{
    path = $p.path
    x = $imgX
    y = $imgY
    width = $p.width
    height = $p.height
    cellCol = $p.col
    cellRow = $p.row
  }
}

$atlasOutDir = Split-Path -Path $AtlasPath -Parent
if ($atlasOutDir -and !(Test-Path $atlasOutDir)) { New-Item -ItemType Directory -Path $atlasOutDir | Out-Null }
$manifestOutDir = Split-Path -Path $ManifestPath -Parent
if ($manifestOutDir -and !(Test-Path $manifestOutDir)) { New-Item -ItemType Directory -Path $manifestOutDir | Out-Null }

$atlas.Save($AtlasPath, [System.Drawing.Imaging.ImageFormat]::Png)

$manifest = [ordered]@{
  version = 1
  createdUtc = [DateTime]::UtcNow.ToString('o')
  atlasPath = (Resolve-Path $AtlasPath).Path
  textureRoot = $textureRootFull
  settings = [ordered]@{
    columns = $colCount
    rows = $rowCount
    tileWidth = $maxW
    tileHeight = $maxH
    gap = $Gap
    padding = $Padding
    labelHeight = $LabelHeight
  }
  entries = $manifestEntries
}
$manifest | ConvertTo-Json -Depth 6 | Set-Content -Path $ManifestPath -Encoding UTF8

$labelFont.Dispose()
$labelBrush.Dispose()
$rowBrush.Dispose()
$g.Dispose()
$atlas.Dispose()
foreach ($t in $textures) { $t.bmp.Dispose() }

Write-Output "Packed $($manifestEntries.Count) textures into: $AtlasPath"
Write-Output "Manifest written to: $ManifestPath"

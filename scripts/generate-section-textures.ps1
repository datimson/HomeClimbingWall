param(
  [string]$DesignId = 'classic',
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

$textureRoot = $TextureRoot
$wallsDir = Join-Path $textureRoot 'walls'
$volumesDir = Join-Path $textureRoot 'volumes'
if (!(Test-Path $wallsDir)) { New-Item -ItemType Directory -Path $wallsDir | Out-Null }
if (!(Test-Path $volumesDir)) { New-Item -ItemType Directory -Path $volumesDir | Out-Null }
$wallsDir = (Resolve-Path $wallsDir).Path
$volumesDir = (Resolve-Path $volumesDir).Path
$size = 2048

$templates = @(
  @{ subdir = 'walls'; file = 'A.png'; label = 'A' },
  @{ subdir = 'walls'; file = 'B.png'; label = 'B' },
  @{ subdir = 'walls'; file = 'C.png'; label = 'C' },
  @{ subdir = 'walls'; file = 'D.png'; label = 'D' },
  @{ subdir = 'walls'; file = 'E.png'; label = 'E' },
  @{ subdir = 'walls'; file = 'F.png'; label = 'F' },
  @{ subdir = 'walls'; file = 'G.png'; label = 'G' },

  @{ subdir = 'walls'; file='A-kick.png'; label='A KICK' }, @{ subdir = 'walls'; file='A-s1.png'; label='A S1' }, @{ subdir = 'walls'; file='A-s2.png'; label='A S2' },
  @{ subdir = 'walls'; file='B-kick.png'; label='B KICK' }, @{ subdir = 'walls'; file='B-s1.png'; label='B S1' }, @{ subdir = 'walls'; file='B-s2.png'; label='B S2' },
  @{ subdir = 'walls'; file='C-kick.png'; label='C KICK' }, @{ subdir = 'walls'; file='C-s1.png'; label='C S1' }, @{ subdir = 'walls'; file='C-s2.png'; label='C S2' },
  @{ subdir = 'walls'; file='D-kick.png'; label='D KICK' }, @{ subdir = 'walls'; file='D-s1.png'; label='D S1' }, @{ subdir = 'walls'; file='D-s2.png'; label='D S2' },
  @{ subdir = 'walls'; file='E-kick.png'; label='E KICK' }, @{ subdir = 'walls'; file='E-s1.png'; label='E S1' },
  @{ subdir = 'walls'; file='F-kick.png'; label='F KICK' }, @{ subdir = 'walls'; file='F-s1.png'; label='F S1' }, @{ subdir = 'walls'; file='F-s2.png'; label='F S2' },

  @{ subdir = 'volumes'; file = 'cornerAB.png'; label = 'CORNER AB' },
  @{ subdir = 'volumes'; file = 'ceilingG.png'; label = 'CEILING G' },
  @{ subdir = 'volumes'; file = 'dartB.png'; label = 'DART B' },
  @{ subdir = 'volumes'; file = 'dartC.png'; label = 'DART C' }
)

function New-Template([string]$path, [string]$label, [int]$size) {
  $bmp = New-Object System.Drawing.Bitmap $size, $size
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $g.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
  $g.Clear([System.Drawing.Color]::FromArgb(255, 243, 246, 250))

  $minorPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 201, 211, 223), 2)
  $majorPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 163, 179, 198), 4)

  for ($p = 0; $p -le $size; $p += 128) {
    $g.DrawLine($minorPen, $p, 0, $p, $size)
    $g.DrawLine($minorPen, 0, $p, $size, $p)
  }
  for ($p = 0; $p -le $size; $p += 512) {
    $g.DrawLine($majorPen, $p, 0, $p, $size)
    $g.DrawLine($majorPen, 0, $p, $size, $p)
  }

  $red = [System.Drawing.Color]::FromArgb(255, 220, 54, 54)
  $cornerPen = New-Object System.Drawing.Pen($red, 13)
  $innerPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 190, 55, 55), 6)
  $m = [math]::Round($size * 0.035)
  $arm = [math]::Round($size * 0.12)
  $inset = [math]::Round($size * 0.09)

  $g.DrawLine($cornerPen, $m, $m, $m + $arm, $m)
  $g.DrawLine($cornerPen, $m, $m, $m, $m + $arm)
  $g.DrawLine($cornerPen, $size - $m - $arm, $m, $size - $m, $m)
  $g.DrawLine($cornerPen, $size - $m, $m, $size - $m, $m + $arm)
  $g.DrawLine($cornerPen, $m, $size - $m, $m + $arm, $size - $m)
  $g.DrawLine($cornerPen, $m, $size - $m - $arm, $m, $size - $m)
  $g.DrawLine($cornerPen, $size - $m - $arm, $size - $m, $size - $m, $size - $m)
  $g.DrawLine($cornerPen, $size - $m, $size - $m - $arm, $size - $m, $size - $m)
  $g.DrawRectangle($innerPen, $inset, $inset, $size - 2 * $inset, $size - 2 * $inset)

  $crossPen = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(220, 88, 105, 124), 10)
  $cx = $size / 2
  $cy = $size / 2
  $cl = [math]::Round($size * 0.045)
  $g.DrawLine($crossPen, $cx - $cl, $cy, $cx + $cl, $cy)
  $g.DrawLine($crossPen, $cx, $cy - $cl, $cx, $cy + $cl)

  $fontSize = 420
  $font = $null
  do {
    if ($font) { $font.Dispose() }
    $font = New-Object System.Drawing.Font('Segoe UI', [float]$fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $sz = $g.MeasureString($label, $font)
    if ($sz.Width -le ($size * 0.74) -and $sz.Height -le ($size * 0.26)) { break }
    $fontSize -= 12
  } while ($fontSize -gt 80)

  $brush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 33, 42, 58))
  $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(100, 255, 255, 255))
  $sz = $g.MeasureString($label, $font)
  $x = ($size - $sz.Width) / 2
  $y = ($size - $sz.Height) / 2
  $g.DrawString($label, $font, $shadowBrush, $x + 4, $y + 4)
  $g.DrawString($label, $font, $brush, $x, $y)

  $cornerPen.Dispose(); $innerPen.Dispose(); $crossPen.Dispose()
  $minorPen.Dispose(); $majorPen.Dispose()
  $brush.Dispose(); $shadowBrush.Dispose()
  $font.Dispose()
  $g.Dispose()

  $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
  $bmp.Dispose()
}

foreach ($t in $templates) {
  $outDir = if ($t.subdir -eq 'volumes') { $volumesDir } else { $wallsDir }
  New-Template -path (Join-Path $outDir $t.file) -label $t.label -size $size
}

$testPath = Join-Path $wallsDir '_test.png'
if (Test-Path $testPath) { Remove-Item $testPath -Force }
$testPath = Join-Path $volumesDir '_test.png'
if (Test-Path $testPath) { Remove-Item $testPath -Force }

Write-Output ("Generated {0} templates in {1}" -f $templates.Count, (Resolve-Path $textureRoot).Path)

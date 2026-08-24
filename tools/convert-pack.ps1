param(
  [string]$Pack   = "$PSScriptRoot\..\purchased-fish",
  [string]$OutDir = "$PSScriptRoot\..\assets\models\pack",
  [int]   $MaxTex = 1024,
  [int]   $Quality = 85
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not $env:FBX2GLTF -or -not (Test-Path $env:FBX2GLTF)) {
  throw "Set `$env:FBX2GLTF to the converter path (npm install --no-save fbx2gltf)."
}
$fbx2 = (Get-Item $env:FBX2GLTF).FullName

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$jpegParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$jpegParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), $Quality

function ConvertTexture($src, $dst, $max) {
  $img = [System.Drawing.Image]::FromFile($src)
  $k = [Math]::Min(1.0, [double]$max / [double]$img.Width)
  $w = [Math]::Max(1, [int]($img.Width * $k))
  $h = [Math]::Max(1, [int]($img.Height * $k))
  $bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $h
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.DrawImage($img, 0, 0, $w, $h)
  $g.Dispose(); $img.Dispose()
  $bmp.Save($dst, $jpegCodec, $jpegParams)
  $bmp.Dispose()
}

$work = Join-Path $env:TEMP ('aqua-pack-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null
if (Test-Path $OutDir) {
  Get-ChildItem $OutDir -Recurse -File | Remove-Item -Force
  Get-ChildItem $OutDir -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending |
    Remove-Item -Recurse -Force -EA SilentlyContinue
}
New-Item -ItemType Directory -Force $OutDir | Out-Null

$list = @()

foreach ($f in (Get-ChildItem "$Pack\fbx" -Filter *.fbx | Sort-Object Name)) {
  $key = ($f.BaseName -replace '[^a-zA-Z0-9]', '').ToLower()
  $dir = Join-Path $work $key
  New-Item -ItemType Directory -Force $dir | Out-Null
  Copy-Item $f.FullName $dir -Force

  Push-Location $dir
  & $fbx2 -i $f.Name -o $key | Out-Null
  Pop-Location

  $outDirRaw = Join-Path $dir ($key + '_out')
  $gltfPath = Join-Path $outDirRaw "$key.gltf"
  if (-not (Test-Path $gltfPath)) { Write-Host "  skipped (conversion failed): $($f.Name)" -ForegroundColor Yellow; continue }

  $gltf = [IO.File]::ReadAllText($gltfPath)
  if ($gltf -notmatch '"images"') {
    Write-Host "  skipped (no textures): $($f.Name)" -ForegroundColor Yellow; continue
  }
  $bin = Join-Path $outDirRaw 'buffer.bin'
  if ((Test-Path $bin) -and (Get-Item $bin).Length -lt 2048) {
    Write-Host "  skipped (empty model): $($f.Name)" -ForegroundColor Yellow; continue
  }

  $gltf = [Regex]::Replace($gltf,
    '("baseColorFactor"\s*:\s*\[\s*[\d.eE+-]+\s*,\s*[\d.eE+-]+\s*,\s*[\d.eE+-]+\s*,\s*)[\d.eE+-]+',
    '${1}1')
  $gltf = $gltf -replace '"alphaMode"\s*:\s*"BLEND"', '"alphaMode" : "OPAQUE"'

  foreach ($png in (Get-ChildItem $outDirRaw -Filter *.png -File)) {
    $jpg = [IO.Path]::ChangeExtension($png.FullName, '.jpg')
    ConvertTexture $png.FullName $jpg $MaxTex
    $gltf = $gltf.Replace($png.Name, [IO.Path]::GetFileName($jpg))
    Remove-Item $png.FullName -Force
  }
  [IO.File]::WriteAllText($gltfPath, $gltf, (New-Object Text.UTF8Encoding $false))

  $dest = Join-Path $OutDir $key
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item "$outDirRaw\*" $dest -Force

  $kb = [math]::Round((Get-ChildItem $dest -File | Measure-Object Length -Sum).Sum / 1KB)
  $title = ($f.BaseName -replace '[_-]+', ' ').Trim()
  $title = (Get-Culture).TextInfo.ToTitleCase($title.ToLower())
  $list += [pscustomobject]@{ name = $key; title = $title; url = "/assets/models/pack/$key/$key.gltf" }
  "  {0,-30} {1,5} KB" -f $key, $kb
}

[IO.File]::WriteAllText(
  (Join-Path $OutDir 'pack.json'),
  ($list | ConvertTo-Json -Depth 3),
  (New-Object Text.UTF8Encoding $false))
Remove-Item $work -Recurse -Force -EA SilentlyContinue

$total = [math]::Round((Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host ""
Write-Host "Done: $($list.Count) models, $total MB" -ForegroundColor Green

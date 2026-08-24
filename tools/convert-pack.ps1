param(
  [string]$Pack   = "$PSScriptRoot\..\purchased-fish",
  [string]$OutDir = "$PSScriptRoot\..\assets\models\pack",
  [int]   $MaxTex = 1024,
  [int]   $Quality = 85
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

# Find FBX2glTF automatically when it was installed through npm.
# FBX2glTF is distributed by the fbx2gltf npm package with a Windows binary at:
#   node_modules/fbx2gltf/bin/Windows_NT/FBX2glTF.exe
# A manually supplied FBX2GLTF environment variable still takes priority.
function Resolve-Fbx2Gltf {
  if ($env:FBX2GLTF) {
    $candidate = $env:FBX2GLTF
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Get-Item -LiteralPath $candidate).FullName
    }
    throw "FBX2GLTF points to a file that does not exist: $candidate"
  }

  $projectRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
  $candidates = @(
    (Join-Path $projectRoot 'node_modules\fbx2gltf\bin\Windows_NT\FBX2glTF.exe'),
    (Join-Path $projectRoot 'node_modules\fbx2gltf\bin\Windows\FBX2glTF.exe'),
    (Join-Path $projectRoot 'node_modules\fbx2gltf\bin\windows\FBX2glTF.exe')
  )

  foreach ($candidate in $candidates) {
    if (Test-Path -LiteralPath $candidate -PathType Leaf) {
      return (Get-Item -LiteralPath $candidate).FullName
    }
  }

  $cmd = Get-Command 'FBX2glTF.exe' -ErrorAction SilentlyContinue
  if ($cmd) {
    return $cmd.Source
  }

  throw @"
FBX2glTF was not found.

Install it in this project with:
  npm install --no-save fbx2gltf

Then run this script again.

If you already have FBX2glTF installed somewhere else, set:
  `$env:FBX2GLTF = 'C:\path\to\FBX2glTF.exe'
"@
}

$fbx2 = Resolve-Fbx2Gltf
Write-Host "Using FBX2glTF: $fbx2" -ForegroundColor Cyan

if (-not (Test-Path -LiteralPath $Pack -PathType Container)) {
  throw "Pack folder not found: $Pack"
}

$fbxDir = Join-Path $Pack 'fbx'
if (-not (Test-Path -LiteralPath $fbxDir -PathType Container)) {
  throw "FBX folder not found: $fbxDir"
}

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$jpegParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$jpegParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), $Quality

function ConvertTexture($src, $dst, $max) {
  $img = [System.Drawing.Image]::FromFile($src)
  try {
    $k = [Math]::Min(1.0, [double]$max / [double]$img.Width)
    $w = [Math]::Max(1, [int]($img.Width * $k))
    $h = [Math]::Max(1, [int]($img.Height * $k))
    $bmp = New-Object System.Drawing.Bitmap -ArgumentList $w, $h
    try {
      $g = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $g.DrawImage($img, 0, 0, $w, $h)
      }
      finally {
        $g.Dispose()
      }
      $bmp.Save($dst, $jpegCodec, $jpegParams)
    }
    finally {
      $bmp.Dispose()
    }
  }
  finally {
    $img.Dispose()
  }
}

$work = Join-Path $env:TEMP ('aqua-pack-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
New-Item -ItemType Directory -Force $work | Out-Null

try {
  if (Test-Path -LiteralPath $OutDir) {
    Get-ChildItem $OutDir -Recurse -File | Remove-Item -Force
    Get-ChildItem $OutDir -Recurse -Directory | Sort-Object { $_.FullName.Length } -Descending |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Force $OutDir | Out-Null

  $list = @()

  foreach ($f in (Get-ChildItem $fbxDir -Filter *.fbx -File | Sort-Object Name)) {
    $key = ($f.BaseName -replace '[^a-zA-Z0-9]', '').ToLower()
    if (-not $key) {
      Write-Host "  skipped (invalid filename): $($f.Name)" -ForegroundColor Yellow
      continue
    }

    $dir = Join-Path $work $key
    New-Item -ItemType Directory -Force $dir | Out-Null
    Copy-Item $f.FullName $dir -Force

    Push-Location $dir
    try {
      & $fbx2 -i $f.Name -o $key | Out-Null
      if ($LASTEXITCODE -ne 0) {
        Write-Host "  skipped (converter exit code $LASTEXITCODE): $($f.Name)" -ForegroundColor Yellow
        continue
      }
    }
    finally {
      Pop-Location
    }

    $outDirRaw = Join-Path $dir ($key + '_out')
    $gltfPath = Join-Path $outDirRaw "$key.gltf"
    if (-not (Test-Path -LiteralPath $gltfPath -PathType Leaf)) {
      Write-Host "  skipped (conversion produced no glTF): $($f.Name)" -ForegroundColor Yellow
      continue
    }

    $gltf = [IO.File]::ReadAllText($gltfPath)
    if ($gltf -notmatch '"images"') {
      Write-Host "  skipped (no textures): $($f.Name)" -ForegroundColor Yellow
      continue
    }

    $bin = Join-Path $outDirRaw 'buffer.bin'
    if ((Test-Path -LiteralPath $bin) -and (Get-Item -LiteralPath $bin).Length -lt 2048) {
      Write-Host "  skipped (empty model): $($f.Name)" -ForegroundColor Yellow
      continue
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
    $list += [pscustomobject]@{
      name = $key
      title = $title
      url = "/assets/models/pack/$key/$key.gltf"
    }
    "  {0,-30} {1,5} KB" -f $key, $kb
  }

  [IO.File]::WriteAllText(
    (Join-Path $OutDir 'pack.json'),
    ($list | ConvertTo-Json -Depth 3),
    (New-Object Text.UTF8Encoding $false))

  $total = [math]::Round((Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
  Write-Host ""
  Write-Host "Done: $($list.Count) models, $total MB" -ForegroundColor Green
}
finally {
  Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue
}

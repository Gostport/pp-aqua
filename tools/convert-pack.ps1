# Конвертация купленного пака CGTrader (Coral Reef Fish Collection, pack 8)
# в glTF, которые понимает сцена.
#
#   $env:FBX2GLTF = "путь\к\FBX2glTF.exe"      # npm install --no-save fbx2gltf
#   powershell -File tools\convert-pack.ps1
#
# Результат — assets/models/pack/<рыба>/ и pack.json со списком.
# В git ничего из этого не идёт: пак лицензионный, перезаливать его нельзя.
# Потерялись файлы — прогони скрипт заново по архивам из «купил 3д рыбок».
#
# Почему НЕ .glb, хотя один файл был бы удобнее.
# Текстуры зашиты внутрь самих .fbx, и при сборке в .glb конвертер вкладывает
# их как есть — 2048×2048 PNG, по 3–4 МБ на рыбу, 110 МБ на пак. Ужимать файлы
# на диске бесполезно: конвертер их не смотрит, он берёт встроенные.
# Поэтому собираем в .gltf с внешними текстурами — вот их уже можно ужать
# и перекодировать. Геометрия у этих моделей весит смешные 48 КБ, весь вес
# был в картинке.
#
# Текстуры из папки textures/ распаковывать не нужно вообще: всё необходимое
# уже внутри .fbx. Отдельные .rar — это те же карты в исходном разрешении,
# пригодятся, если понадобится пересобрать в лучшем качестве.

param(
  [string]$Pack   = "$PSScriptRoot\..\купил 3д рыбок",
  [string]$OutDir = "$PSScriptRoot\..\assets\models\pack",
  [int]   $MaxTex = 1024,
  [int]   $Quality = 85
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing

if (-not $env:FBX2GLTF -or -not (Test-Path $env:FBX2GLTF)) {
  throw "Укажи путь к конвертеру: `$env:FBX2GLTF = '...\FBX2glTF.exe' (npm install --no-save fbx2gltf)"
}
$fbx2 = (Get-Item $env:FBX2GLTF).FullName

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
$jpegParams = New-Object System.Drawing.Imaging.EncoderParameters 1
$jpegParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter ([System.Drawing.Imaging.Encoder]::Quality), $Quality

# Уменьшаем и перекодируем в JPEG. Прозрачность фону рыбы не нужна:
# силуэт задаёт геометрия, а не альфа-канал.
function ConvertTexture($src, $dst, $max) {
  $img = [System.Drawing.Image]::FromFile($src)
  # 1.0, а не 1: с целой единицей PowerShell выбирает Min(int,int)
  # и коэффициент 0.5 схлопывается в ноль.
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
# Чистим содержимое, а не саму папку: её может держать открытая консоль,
# и тогда пересборка падала бы на ровном месте.
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
  if (-not (Test-Path $gltfPath)) { Write-Host "  пропуск (не сконвертировалась): $($f.Name)" -ForegroundColor Yellow; continue }

  $gltf = [IO.File]::ReadAllText($gltfPath)

  # Брак в паке попадается: у пары рыб текстуры лежат только в отдельных
  # архивах и в .fbx не вшиты — такая модель приедет серой болванкой.
  # Пустая геометрия тоже встречается. И то и другое отсеиваем здесь,
  # чтобы в игру не попало.
  if ($gltf -notmatch '"images"') {
    Write-Host "  пропуск (нет текстур): $($f.Name)" -ForegroundColor Yellow; continue
  }
  $bin = Join-Path $outDirRaw 'buffer.bin'
  if ((Test-Path $bin) -and (Get-Item $bin).Length -lt 2048) {
    Write-Host "  пропуск (пустая модель): $($f.Name)" -ForegroundColor Yellow; continue
  }

  # У части моделей в FBX задан канал прозрачности, и конвертер переносит его
  # в baseColorFactor как alpha = 0 — рыба становится полностью невидимой.
  # В аквариуме им прозрачность не нужна вообще: силуэт задаёт геометрия.
  # Поэтому альфу возвращаем в единицу, а BLEND переводим в OPAQUE — заодно
  # уходит лишняя сортировка полупрозрачных при отрисовке.
  $gltf = [Regex]::Replace($gltf,
    '("baseColorFactor"\s*:\s*\[\s*[\d.eE+-]+\s*,\s*[\d.eE+-]+\s*,\s*[\d.eE+-]+\s*,\s*)[\d.eE+-]+',
    '${1}1')
  $gltf = $gltf -replace '"alphaMode"\s*:\s*"BLEND"', '"alphaMode" : "OPAQUE"'

  # Текстуры конвертер выложил рядом с .gltf — ужимаем и правим ссылки.
  foreach ($png in (Get-ChildItem $outDirRaw -Filter *.png -File)) {
    $jpg = [IO.Path]::ChangeExtension($png.FullName, '.jpg')
    ConvertTexture $png.FullName $jpg $MaxTex
    $gltf = $gltf.Replace($png.Name, [IO.Path]::GetFileName($jpg))
    Remove-Item $png.FullName -Force
  }
  # Без BOM: Set-Content -Encoding utf8 в PowerShell 5.1 его дописывает,
  # а JSON.parse на стороне Node от него давится.
  [IO.File]::WriteAllText($gltfPath, $gltf, (New-Object Text.UTF8Encoding $false))

  $dest = Join-Path $OutDir $key
  New-Item -ItemType Directory -Force $dest | Out-Null
  Copy-Item "$outDirRaw\*" $dest -Force

  $kb = [math]::Round((Get-ChildItem $dest -File | Measure-Object Length -Sum).Sum / 1KB)
  $title = ($f.BaseName -replace '[_-]+', ' ').Trim()
  $title = (Get-Culture).TextInfo.ToTitleCase($title.ToLower())
  $list += [pscustomobject]@{ name = $key; title = $title; url = "/assets/models/pack/$key/$key.gltf" }
  "  {0,-30} {1,5} КБ" -f $key, $kb
}

[IO.File]::WriteAllText(
  (Join-Path $OutDir 'pack.json'),
  ($list | ConvertTo-Json -Depth 3),
  (New-Object Text.UTF8Encoding $false))
Remove-Item $work -Recurse -Force -EA SilentlyContinue

$total = [math]::Round((Get-ChildItem $OutDir -Recurse -File | Measure-Object Length -Sum).Sum / 1MB, 1)
Write-Host ""
Write-Host "готово: $($list.Count) моделей, $total МБ" -ForegroundColor Green

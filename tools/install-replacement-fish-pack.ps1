param(
  [Parameter(Mandatory = $true)]
  [string]$Source,
  [string]$OutDir = "$PSScriptRoot\..\assets\models\pack"
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$manifestPath = Join-Path $root 'assets\coloring\manifest.json'

if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
  throw "Coloring manifest not found: $manifestPath"
}

$sourcePath = (Resolve-Path $Source).Path
$temp = $null
try {
  if (Test-Path -LiteralPath $sourcePath -PathType Leaf) {
    if ([IO.Path]::GetExtension($sourcePath).ToLowerInvariant() -ne '.zip') {
      throw 'Source file must be a ZIP archive or a directory containing GLB files.'
    }
    $temp = Join-Path $env:TEMP ('aqua-fish-' + [guid]::NewGuid().ToString('N'))
    New-Item -ItemType Directory -Force $temp | Out-Null
    Expand-Archive -LiteralPath $sourcePath -DestinationPath $temp -Force
    $sourceRoot = $temp
  } else {
    $sourceRoot = $sourcePath
  }

  $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
  $models = Get-ChildItem -LiteralPath $sourceRoot -Recurse -File -Filter *.glb
  if (-not $models.Count) { throw "No .glb files found under: $sourceRoot" }

  function Normalize([string]$s) {
    return (($s -replace '[^a-zA-Z0-9]', '').ToLowerInvariant())
  }

  $index = @{}
  foreach ($file in $models) {
    $key = Normalize $file.BaseName
    if ($key -and -not $index.ContainsKey($key)) { $index[$key] = $file }
  }

  if (Test-Path -LiteralPath $OutDir) {
    Get-ChildItem -LiteralPath $OutDir -Recurse -File | Remove-Item -Force
    Get-ChildItem -LiteralPath $OutDir -Recurse -Directory |
      Sort-Object { $_.FullName.Length } -Descending |
      Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
  }
  New-Item -ItemType Directory -Force $OutDir | Out-Null

  $pack = @()
  $missing = @()
  $used = @{}

  foreach ($fish in $manifest.fish) {
    $name = [string]$fish.name
    $wanted = Normalize $name
    $match = $null

    if ($index.ContainsKey($wanted)) {
      $match = $index[$wanted]
    } else {
      $candidates = $models | Where-Object {
        $n = Normalize $_.BaseName
        $n -eq $wanted -or $n.StartsWith($wanted) -or $wanted.StartsWith($n)
      }
      if ($candidates.Count -eq 1) { $match = $candidates[0] }
    }

    if (-not $match) {
      $missing += $name
      continue
    }

    $destDir = Join-Path $OutDir $wanted
    New-Item -ItemType Directory -Force $destDir | Out-Null
    $dest = Join-Path $destDir "$wanted.glb"
    Copy-Item -LiteralPath $match.FullName -Destination $dest -Force
    $used[$match.FullName] = $true

    $title = $name
    if ($fish.titles -and $fish.titles.en) { $title = [string]$fish.titles.en }
    elseif ($fish.title) { $title = [string]$fish.title }

    $pack += [pscustomobject]@{
      name = $wanted
      title = $title
      url = "/assets/models/pack/$wanted/$wanted.glb"
    }
    Write-Host ("  {0,-18} <- {1}" -f $wanted, $match.Name) -ForegroundColor Green
  }

  $packPath = Join-Path $OutDir 'pack.json'
  $pack | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $packPath -Encoding UTF8

  Write-Host ''
  Write-Host "Installed $($pack.Count) replacement fish models." -ForegroundColor Green
  Write-Host "Pack manifest: $packPath" -ForegroundColor Cyan

  if ($missing.Count) {
    Write-Warning "No replacement model matched these coloring species: $($missing -join ', ')"
    Write-Host 'The pack installer does not invent substitutes. Add a matching CC0 GLB and run it again.' -ForegroundColor Yellow
  }

  $unused = $models | Where-Object { -not $used.ContainsKey($_.FullName) }
  Write-Host "Unused GLB files: $($unused.Count)" -ForegroundColor DarkGray
  Write-Host ''
  Write-Host 'Source: Quaternius Animated Fish Bundle, CC0.' -ForegroundColor DarkCyan
  Write-Host 'https://poly.pizza/bundle/Animated-Fish-Bundle-44zhHN1UbT' -ForegroundColor DarkCyan
}
finally {
  if ($temp) { Remove-Item -LiteralPath $temp -Recurse -Force -ErrorAction SilentlyContinue }
}

param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $root "backup\runtime-fix-$stamp"
New-Item -ItemType Directory -Force $backup | Out-Null

$files = @(
  (Join-Path $root 'server.js'),
  (Join-Path $root 'demos\realistic-tank.html')
)
foreach ($file in $files) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) { throw "Missing file: $file" }
  Copy-Item -LiteralPath $file -Destination (Join-Path $backup (Split-Path $file -Leaf)) -Force
}

# server.js: remove Russian runtime output and single-line Russian comments.
$serverPath = Join-Path $root 'server.js'
$server = Get-Content -LiteralPath $serverPath -Raw -Encoding UTF8
$server = $server.Replace('console.log(`Аквариумы: http://localhost:${PORT}/`);', 'console.log(`Aquariums: http://localhost:${PORT}/`);')
$server = $server.Replace('console.log(`С телефона (Wi-Fi ${name}): http://${net.address}:${PORT}/`);', 'console.log(`Phone (Wi-Fi ${name}): http://${net.address}:${PORT}/`);')
$server = $server.Replace("name: 'Аквариум'", "name: 'Aquarium'")
$server = [regex]::Replace($server, '(?m)^\s*//[^\r\n]*[\u0400-\u04FF][^\r\n]*(?:\r?\n|$)', '')
[IO.File]::WriteAllText($serverPath, $server, (New-Object Text.UTF8Encoding $false))

# realistic-tank.html: make missing model-pack entries visible instead of silently dropping fish.
$tankPath = Join-Path $root 'demos\realistic-tank.html'
$tank = Get-Content -LiteralPath $tankPath -Raw -Encoding UTF8
$tank = $tank.Replace('<html lang="ru">', '<html lang="en">')
$tank = $tank.Replace('<title data-t="tank.doctitle">Аквариум</title>', '<title data-t="tank.doctitle">Aquarium</title>')

$anchor = "  function withPackModel(name, cb) {"
$helper = @'
  function showModelError(name) {
    var id = 'model-pack-error';
    var el = document.getElementById(id);
    if (!el) {
      el = document.createElement('div');
      el.id = id;
      el.style.cssText = 'position:fixed;left:50%;bottom:18px;transform:translateX(-50%);z-index:40;max-width:min(680px,calc(100vw - 28px));padding:12px 16px;border:1px solid rgba(255,120,120,.45);border-radius:12px;background:rgba(45,10,16,.94);color:#ffdfe2;font:13px/1.45 system-ui,sans-serif;box-shadow:0 12px 40px rgba(0,0,0,.35)';
      document.body.appendChild(el);
    }
    el.textContent = '3D model missing for "' + name + '". Install the replacement fish pack, then reload the aquarium.';
    console.error('[AQUA] 3D model missing for:', name, 'The fish record and texture were saved, but no model is available in /api/pack.');
  }

'@
if ($tank -notmatch [regex]::Escape('function showModelError(name)')) {
  $tank = $tank.Replace($anchor, $helper + $anchor)
}
$tank = $tank.Replace('      if (!item) return;', '      if (!item) { showModelError(name); return; }')
$tank = $tank.Replace("        console.error('пак: не загрузилась ' + name, err);", "        console.error('[AQUA] Failed to load 3D model:', name, err); showModelError(name);")
$tank = $tank.Replace("        console.error('пак не собран — запусти tools/convert-pack.ps1');", "        console.error('[AQUA] Model pack is not installed or could not be loaded. Install the replacement fish pack.');")
$tank = $tank.Replace("          console.warn('нет шаблона для вида ' + item.kind + ' — рыбка пропущена');", "          console.warn('[AQUA] No coloring template for fish kind:', item.kind);")
$tank = [regex]::Replace($tank, '(?m)^\s*//[^\r\n]*[\u0400-\u04FF][^\r\n]*(?:\r?\n|$)', '')
[IO.File]::WriteAllText($tankPath, $tank, (New-Object Text.UTF8Encoding $false))

# Validate that the two runtime files contain no Cyrillic and still parse as JavaScript where applicable.
$remaining = @()
foreach ($file in $files) {
  $text = Get-Content -LiteralPath $file -Raw -Encoding UTF8
  if ($text -match '[\u0400-\u04FF]') { $remaining += $file }
}
if ($remaining.Count) {
  Write-Warning 'Cyrillic remains in:'
  $remaining | ForEach-Object { Write-Warning $_ }
} else {
  Write-Host 'No Cyrillic remains in server.js or demos/realistic-tank.html.' -ForegroundColor Green
}

Write-Host "Backup created: $backup" -ForegroundColor DarkCyan
Write-Host 'Runtime fixes applied.' -ForegroundColor Green
Write-Host 'Restart node server.js before testing.' -ForegroundColor Cyan

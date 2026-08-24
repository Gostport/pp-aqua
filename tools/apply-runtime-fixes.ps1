param(
  [switch]$Force
)

$ErrorActionPreference = 'Stop'
$root = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$backup = Join-Path $root ("backup\runtime-fix-{0}" -f $stamp)
New-Item -ItemType Directory -Force $backup | Out-Null

$serverPath = Join-Path $root 'server.js'
$tankPath = Join-Path $root 'demos\realistic-tank.html'

foreach ($file in @($serverPath, $tankPath)) {
  if (-not (Test-Path -LiteralPath $file -PathType Leaf)) {
    throw "Missing file: $file"
  }
  Copy-Item -LiteralPath $file -Destination (Join-Path $backup (Split-Path $file -Leaf)) -Force
}

# Read/write as UTF-8. This script itself is ASCII-only so Windows PowerShell 5.1
# cannot misread its source text because of a missing UTF-8 BOM.
$server = [IO.File]::ReadAllText($serverPath, [Text.UTF8Encoding]::new($false))
$tank = [IO.File]::ReadAllText($tankPath, [Text.UTF8Encoding]::new($false))

# Keep the runtime messages in English. Use regex so the replacement also works
# if the source text has been mojibaked by an older checkout.
$server = [regex]::Replace(
  $server,
  'console\.log\(`[^`\r\n]*http://localhost:\$\{PORT\}/`\);',
  'console.log(`Aquariums: http://localhost:${PORT}/`);',
  [Text.RegularExpressions.RegexOptions]::IgnoreCase
)
$server = [regex]::Replace(
  $server,
  'console\.log\(`[^`\r\n]*Wi-Fi[^`\r\n]*http://\$\{\$?\{?net\.address\}?\}:\$\{PORT\}/`\);',
  'console.log(`Phone (Wi-Fi ${name}): http://${net.address}:${PORT}/`);',
  [Text.RegularExpressions.RegexOptions]::IgnoreCase
)

# Make the missing-model path explicit instead of silently returning.
$anchor = '  function withPackModel(name, cb) {'
if ($tank.IndexOf('function showModelError(name)') -lt 0) {
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
  if ($tank.IndexOf($anchor) -lt 0) {
    throw 'Could not find withPackModel() anchor in realistic-tank.html'
  }
  $tank = $tank.Replace($anchor, $helper + $anchor)
}

$tank = $tank.Replace(
  '      if (!item) return;',
  '      if (!item) { showModelError(name); return; }'
)
$tank = $tank.Replace(
  "        console.error('pak: model load failed ' + name, err);",
  "        console.error('[AQUA] Failed to load 3D model:', name, err); showModelError(name);"
)
$tank = $tank.Replace(
  "        console.error('pak not built - run tools/convert-pack.ps1');",
  "        console.error('[AQUA] Model pack is not installed or could not be loaded. Install the replacement fish pack.');"
)

# Write UTF-8 without BOM. JavaScript and Node both accept it, and this avoids
# PowerShell 5.1 adding an unexpected BOM to the runtime files.
[IO.File]::WriteAllText($serverPath, $server, [Text.UTF8Encoding]::new($false))
[IO.File]::WriteAllText($tankPath, $tank, [Text.UTF8Encoding]::new($false))

Write-Host "Backup created: $backup" -ForegroundColor DarkCyan
Write-Host 'Runtime fixes applied.' -ForegroundColor Green
Write-Host 'Restart node server.js before testing.' -ForegroundColor Cyan

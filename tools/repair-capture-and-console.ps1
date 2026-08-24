$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$serverPath = Join-Path $root 'server.js'
$capturePath = Join-Path $root 'assets\capture.js'

function Replace-Exact([string]$text, [string]$old, [string]$new, [string]$label) {
    if (-not $text.Contains($old)) {
        throw "Expected text not found: $label"
    }
    return $text.Replace($old, $new)
}

Write-Host 'Repairing server console messages...'
$server = [IO.File]::ReadAllText($serverPath, [Text.Encoding]::UTF8)

$serverReplacements = @{
    'console.log(`корзина: удалено безвозвратно ${gone} шт. старше ${TRASH_DAYS} дней`);' = 'console.log(`Trash: permanently removed ${gone} item(s) older than ${TRASH_DAYS} days`);'
    'console.log(`пароль аквариума ${t.id} изменён`);' = 'console.log(`Tank password changed: ${t.id}`);'
    'console.log(`- аквариум ${t.id} → в корзину (data/trash-tanks)`);' = 'console.log(`- tank ${t.id} moved to trash (data/trash-tanks)`);'
    'console.log(`+ рыбка из пака ${model.name} в ${t.id} — всего ${listFish(t).length}`);' = 'console.log(`+ pack fish ${model.name} added to ${t.id} — total ${listFish(t).length}`);'
    'console.log(`+ рыбка ${data.kind} в ${t.id} (${Math.round(png.length / 1024)} КБ) — всего ${listFish(t).length}`);' = 'console.log(`+ fish ${data.kind} added to ${t.id} (${Math.round(png.length / 1024)} KB) — total ${listFish(t).length}`);'
    'console.log(`- рыбка ${delMatch[1]} из ${t.id} → в корзину`);' = 'console.log(`- fish ${delMatch[1]} from ${t.id} moved to trash`);'
    'console.log(`аквариум ${t.id} очищен, ${list.length} рыбок → в корзину`);' = 'console.log(`tank ${t.id} cleared, ${list.length} fish moved to trash`);'
    'console.log(`+ фон ${name} в ${t.id} (${Math.round(buf.length / 1024)} КБ)`);' = 'console.log(`+ background ${name} added to ${t.id} (${Math.round(buf.length / 1024)} KB)`);'
    'console.log(`- фон ${name} из ${t.id} удалён`);' = 'console.log(`- background ${name} removed from ${t.id}`);'
    'console.log(`🐟 корм насыпан в ${t.id}`);' = 'console.log(`🐟 fish fed in ${t.id}`);'
    'console.log(`+ аквариум «${meta.name}» (${id}), фон ${background}`);' = 'console.log(`+ tank "${meta.name}" (${id}), background ${background}`);'
    'console.log(`Аквариумы: http://localhost:${PORT}/`);' = 'console.log(`Aquariums: http://localhost:${PORT}/`);'
    'console.log(`С телефона (Wi-Fi ${name}): http://${net.address}:${PORT}/`);' = 'console.log(`Phone (Wi-Fi ${name}): http://${net.address}:${PORT}/`);'
}

foreach ($old in $serverReplacements.Keys) {
    $server = Replace-Exact $server $old $serverReplacements[$old] $old
}
[IO.File]::WriteAllText($serverPath, $server, [Text.Encoding]::UTF8)

Write-Host 'Repairing capture marker geometry...'
$capture = [IO.File]::ReadAllText($capturePath, [Text.Encoding]::UTF8)

$quadPattern = '(?s)  function quadOf\(pts\) \{.*?\n  \}\n\n  // ── метки'
$quadReplacement = @'
  // Normalize a detected marker quad to TL, TR, BR, BL order.
  // The previous implementation returned the four hull points in an arbitrary
  // order, which made marker sampling depend on the winning hull pair.
  function orderQuad(q) {
    var tl = q[0], tr = q[0], br = q[0], bl = q[0];
    var minSum = q[0][0] + q[0][1], maxSum = minSum;
    var maxDiff = q[0][0] - q[0][1], minDiff = maxDiff;
    for (var i = 1; i < q.length; i++) {
      var x = q[i][0], y = q[i][1], sum = x + y, diff = x - y;
      if (sum < minSum) { minSum = sum; tl = q[i]; }
      if (sum > maxSum) { maxSum = sum; br = q[i]; }
      if (diff > maxDiff) { maxDiff = diff; tr = q[i]; }
      if (diff < minDiff) { minDiff = diff; bl = q[i]; }
    }
    return [tl, tr, br, bl];
  }

  function quadOf(pts) {
    var h = hull(pts);
    if (h.length < 4) return null;
    var best = null, bestArea = 0;
    for (var a = 0; a < h.length; a++) {
      for (var b = a + 1; b < h.length; b++) {
        var dx = h[b][0] - h[a][0], dy = h[b][1] - h[a][1];
        var cMax = 0, cPt = null, dMax = 0, dPt = null;
        for (var k = 0; k < h.length; k++) {
          var cr = (h[k][0] - h[a][0]) * dy - (h[k][1] - h[a][1]) * dx;
          if (cr > cMax) { cMax = cr; cPt = h[k]; }
          if (-cr > dMax) { dMax = -cr; dPt = h[k]; }
        }
        if (cPt && dPt) {
          var area = (cMax + dMax) / 2;
          if (area > bestArea) { bestArea = area; best = [h[a], cPt, h[b], dPt]; }
        }
      }
    }
    return best ? orderQuad(best) : null;
  }

  // ── метки
'@

$newCapture = [regex]::Replace($capture, $quadPattern, $quadReplacement, 1)
if ($newCapture -eq $capture) {
    throw 'Could not replace capture.js quadOf function.'
}

$newCapture = Replace-Exact $newCapture 'var tries = [0.55, 0.45, 0.65, 0.72, 0.38];' 'var tries = [0.55, 0.45, 0.65, 0.72, 0.38, 0.82, 0.30];' 'capture threshold list'
[IO.File]::WriteAllText($capturePath, $newCapture, [Text.Encoding]::UTF8)

Write-Host 'Validating JavaScript...'
node --check $serverPath
node --check $capturePath
if ($LASTEXITCODE -ne 0) { throw 'JavaScript validation failed.' }

Write-Host ''
Write-Host 'Done. Restart the server with:'
Write-Host '  node server.js'

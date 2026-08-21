# Пережимает фоны из assets/backgrounds в webp — их отдаёт server.js всем,
# кто прислал «Accept: image/webp», то есть практически всем.
#
#   python tools/make-webp.py
#
# Результат — assets/backgrounds/webp/<то же имя>.webp. Двойники лежат
# в подпапке, а не рядом с оригиналом: listBackgrounds() в server.js читает
# папку целиком и показал бы каждый фон в выборе дважды.
#
# Оригиналы остаются на месте и никуда не деваются: имя фона в настройках
# аквариума — по-прежнему «01-0.png», и браузер без поддержки webp получит
# именно png. Поэтому забыть прогнать скрипт после нового фона не страшно —
# он просто будет отдаваться тяжёлым.
#
# Почему png тут был плохим выбором: это фотографические рифы, а не графика
# с плоскими заливками. Замер на девяти фонах: 22.29 МБ png → 2.47 МБ webp
# при quality=85, PSNR 35.3 дБ. За 3D-сценой разницу не видно, а фоны
# составляли 61% всего трафика сайта.
#
# Нужен Pillow: pip install pillow. В зависимости проекта он не идёт —
# node-сервер про него не знает, скрипт запускают руками при смене фонов.

import os
import sys
from PIL import Image

QUALITY = 85
ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC = os.path.join(ROOT, 'assets', 'backgrounds')
DST = os.path.join(SRC, 'webp')

os.makedirs(DST, exist_ok=True)

total_before = total_after = 0
for name in sorted(os.listdir(SRC)):
    stem, ext = os.path.splitext(name)
    if ext.lower() not in ('.png', '.jpg', '.jpeg'):
        continue
    src = os.path.join(SRC, name)
    dst = os.path.join(DST, stem + '.webp')
    # method=6 — самый медленный и самый плотный режим кодировщика.
    # Фонов девять, лишние секунды здесь дешевле лишних килобайт у каждого.
    Image.open(src).convert('RGB').save(dst, 'WEBP', quality=QUALITY, method=6)
    before, after = os.path.getsize(src), os.path.getsize(dst)
    total_before += before
    total_after += after
    print('%-14s %7.2f МБ -> %6.0f КБ  (-%.0f%%)'
          % (name, before / 1048576, after / 1024, 100 * (1 - after / before)))

if not total_before:
    sys.exit('в assets/backgrounds нечего пережимать')

print('итого %.2f МБ -> %.2f МБ  (-%.0f%%)'
      % (total_before / 1048576, total_after / 1048576,
         100 * (1 - total_after / total_before)))

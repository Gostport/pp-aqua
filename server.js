// Сервер игры «009 aqua»: статика проекта + API аквариумов.
// Без зависимостей: node server.js → http://localhost:8000
//
// Аквариумов много, каждый живёт своей жизнью в data/tanks/<id>/.
// Регистрации нет; список своих аквариумов браузер держит в localStorage.
//
// Доступа два уровня:
//   ссылка (код из 10 знаков) — смотреть, кормить, добавлять рыбок, менять фон;
//   пароль                    — необратимое: удаление рыбок и аквариума,
//                               смена имени. Пароль клиент присылает в
//                               заголовке X-Tank-Pass, на сервере от него
//                               хранится только scrypt-хеш.
//
// Страницы:
//   /                     — список своих аквариумов
//   /t/<id>               — сам аквариум
//   /t/<id>/admin         — управление
//   /t/<id>/capture       — съёмка листа с телефона
//   /print.html           — раскраски (общие для всех)
//
// Общее для всех аквариумов:
//   POST   /api/tanks {name, password?} — создать → {id, name, created, password}
//   GET    /api/pack                  — покупные модели рыб [{name, title, url}]
//
// Внутри аквариума, префикс /api/t/<id>. Помеченные 🔒 требуют заголовок
// X-Tank-Pass с паролем аквариума:
//   GET    …/meta                     — {id, name, created, locked, fishCount, preview, backgroundUrl}
//   POST   …/auth {password}          — проверить пароль
//   POST   …/password {password}   🔒 — сменить пароль
//   POST   …/preview {image}          — снимок сцены для карточки на главной
//   PATCH  …/meta {name}           🔒 — переименовать
//   DELETE …                       🔒 — удалить аквариум целиком (в data/trash-tanks)
//   GET    …/fish                     — список рыбок [{id, kind, created}]
//   GET    …/fish/<fid>/texture.png   — текстура рыбки
//   POST   …/fish {kind, texture}     — добавить раскрашенную (dataURL png/jpeg)
//   POST   …/fish {type:'pack',model} — добавить покупную из пака
//   DELETE …/fish/<fid>            🔒 — удалить одну рыбку
//   DELETE …/fish                  🔒 — очистить аквариум
//   GET    …/settings                 — настройки сцены + метки событий
//   POST   …/settings {…}             — изменить настройки (фон)
//   POST   …/feed                     — покормить
//   GET    …/backgrounds              — фоны [{name, url, custom}]
//   POST   …/backgrounds {image}      — загрузить свой фон
//   DELETE …/backgrounds/<name>       — удалить свой фон (встроенные защищены)
//
// Пароль стережёт только необратимое: удаление рыбок и аквариума, смену
// имени и самого пароля. Добавить рыбку, покормить и сменить фон может любой,
// у кого есть ссылка: ребёнок открывает съёмку с телефона, и требовать там
// пароль — значит убить всю затею, а испортить этим ничего нельзя.
'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');

const ROOT = __dirname;
const PORT = 8000;
const MAX_BODY = 12 * 1024 * 1024;

const TANKS = path.join(ROOT, 'data', 'tanks');
const TANKS_TRASH = path.join(ROOT, 'data', 'trash-tanks');

// Встроенные фоны общие для всех аквариумов и удалению не подлежат.
// Загруженные лежат внутри своего аквариума.
const BG_DIR = path.join(ROOT, 'assets', 'backgrounds');

fs.mkdirSync(TANKS, { recursive: true });

// ── идентификаторы аквариумов ──────────────────────────────────────────────
// Алфавит без похожих знаков: нет 0/O, 1/l/I. 31^10 ≈ 8·10^14 — перебором
// не берётся, но остаётся читаемым и произносимым вслух.
const ID_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const TANK_ID_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;

function newTankId() {
  const bytes = require('crypto').randomBytes(10);
  let s = '';
  for (let i = 0; i < 10; i++) s += ID_ALPHABET[bytes[i] % ID_ALPHABET.length];
  return TANK_ID_RE.test(s) ? s : newTankId();
}

// Все пути аквариума в одном месте: дальше по коду никто не склеивает их руками.
function tank(id) {
  const dir = path.join(TANKS, id);
  return {
    id,
    dir,
    meta: path.join(dir, 'meta.json'),
    settings: path.join(dir, 'settings.json'),
    preview: path.join(dir, 'preview.jpg'),
    fish: path.join(dir, 'fish'),
    trash: path.join(dir, 'trash'),
    backgrounds: path.join(dir, 'backgrounds')
  };
}

// Папки создаём лениво, перед первой записью: аквариум, в который ничего
// не положили, не должен оставлять следов на диске.
function ensureTank(t) {
  fs.mkdirSync(t.fish, { recursive: true });
  fs.mkdirSync(t.trash, { recursive: true });
  fs.mkdirSync(t.backgrounds, { recursive: true });
}

function readMeta(t) {
  try { return JSON.parse(fs.readFileSync(t.meta, 'utf8')); }
  catch (e) { return { id: t.id, name: 'Аквариум', created: null }; }
}

// Наружу отдаём без соли и хеша: в meta.json они соседи имени, а в ответе
// им делать нечего. locked — есть ли у аквариума пароль вообще.
function publicMeta(m) {
  return { id: m.id, name: m.name, created: m.created, locked: !!m.hash };
}

// ── пак покупных моделей ───────────────────────────────────────────────────
// Список общий для всех аквариумов и лежит в assets/models/pack/pack.json,
// который собирает tools/convert-pack.ps1. Читаем с диска каждый раз: пак
// меняется только при пересборке, а кэш пришлось бы сбрасывать руками.
const PACK_FILE = path.join(ROOT, 'assets', 'models', 'pack', 'pack.json');

function listPack() {
  try {
    const raw = fs.readFileSync(PACK_FILE, 'utf8').replace(/^﻿/, '');
    const list = JSON.parse(raw);
    return Array.isArray(list) ? list : [];
  } catch (e) { return []; }
}

// ── события ────────────────────────────────────────────────────────────────
// Кормление — мгновенное событие, а не настройка: живёт в памяти и по
// аквариумам разложено отдельно, чтобы корм в одном не сыпался в другом.
// Перезапуск его сбрасывает, и это правильно: событие длится секунды.
//
// Здесь же счётчик неудачных паролей: он тоже про «прямо сейчас» и тоже
// не переживает перезапуск.
const events = new Map();
function tankEvents(id) {
  if (!events.has(id)) events.set(id, { feedAt: 0, fails: 0, blockUntil: 0 });
  return events.get(id);
}

// ── пароль аквариума ───────────────────────────────────────────────────────
// Два уровня доступа. Ссылка (она же код из 10 знаков) даёт смотреть: её
// отправляют ребёнку, бабушке, вешают на телевизор. Пароль даёт управлять:
// переименовать, сменить фон, удалить рыбок или весь аквариум.
//
// Почему код остался длинным. Он и есть защита от перебора: 31^10 ≈ 8·10^14
// вариантов, при тысяче запросов в секунду перебор занял бы десятки тысяч
// лет. Пятизначный код (100 000 вариантов) кончился бы за минуты, и чужие
// детские рисунки читал бы любой желающий — короткий код удобен, но
// защищать им нечего.
//
// На диске пароля нет: только соль и scrypt-хеш от него. Клиент присылает
// пароль в заголовке при каждой правке — сеть тут домашняя, без TLS,
// но и хранить на сервере нечего.
const crypto = require('crypto');

function makePass() {
  // Шесть цифр: диктуется по телефону, набирается на пульте телевизора.
  // Против перебора работает не длина, а задержка после промахов.
  return String(crypto.randomInt(100000, 1000000));
}

function hashPass(pass, salt) {
  return crypto.scryptSync(String(pass), salt, 32).toString('hex');
}

function samePass(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

// Промахи считаем на аквариум, а не на адрес: адресов у желающего много,
// аквариум — один. После пяти промахов пауза, дальше она удваивается.
const FAILS_FREE = 5;
const BLOCK_BASE = 20 * 1000;
const BLOCK_MAX = 10 * 60 * 1000;

function blockedFor(ev) {
  return Math.max(0, ev.blockUntil - Date.now());
}

function noteFail(ev) {
  ev.fails++;
  if (ev.fails > FAILS_FREE) {
    const n = ev.fails - FAILS_FREE - 1;
    ev.blockUntil = Date.now() + Math.min(BLOCK_BASE * Math.pow(2, n), BLOCK_MAX);
  }
}

// Пароль верный? Аквариумы, заведённые до паролей, остаются открытыми:
// запереть их задним числом — значит отобрать доступ у хозяина, который
// пароля никогда не видел. Админка предложит ему задать пароль сама.
function checkPass(t, ev, given) {
  const m = readMeta(t);
  if (!m.hash) return 'open';
  if (blockedFor(ev)) return 'blocked';
  if (given && samePass(hashPass(given, m.salt), m.hash)) { ev.fails = 0; ev.blockUntil = 0; return 'ok'; }
  noteFail(ev);
  return 'no';
}

function authed(req, t, ev) {
  const r = checkPass(t, ev, req.headers['x-tank-pass']);
  return r === 'open' || r === 'ok';
}

// Ответ на попытку изменить что-то без пароля. Пауза после серии промахов
// отдаётся честно: клиенту есть что показать человеку.
function denied(res, t, ev) {
  const wait = blockedFor(ev);
  if (wait) {
    return send(res, 429, JSON.stringify({ error: 'слишком много попыток', retryAfter: Math.ceil(wait / 1000) }));
  }
  send(res, 401, '{"error":"нужен пароль аквариума"}');
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.wasm': 'application/wasm',
  '.md': 'text/markdown; charset=utf-8',
  '.ico': 'image/x-icon'
};

function send(res, code, body, type) {
  res.writeHead(code, { 'Content-Type': type || 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(body);
}

// Тело запроса с потолком: без него один POST кладёт сервер по памяти.
function readBody(req, res, onDone) {
  let body = '', size = 0, tooBig = false;
  req.on('data', (chunk) => {
    size += chunk.length;
    if (size > MAX_BODY) { tooBig = true; req.destroy(); return; }
    body += chunk;
  });
  req.on('end', () => {
    if (tooBig) return;
    try { onDone(body ? JSON.parse(body) : {}); }
    catch (e) { send(res, 400, JSON.stringify({ error: String(e.message || e) })); }
  });
}

// ── рыбки ──────────────────────────────────────────────────────────────────
function listFish(t) {
  try {
    return fs.readdirSync(t.fish)
      .filter((f) => f.endsWith('.json'))
      .map((f) => {
        try { return JSON.parse(fs.readFileSync(path.join(t.fish, f), 'utf8')); }
        catch (e) { return null; }
      })
      .filter(Boolean)
      .sort((a, b) => (a.id < b.id ? -1 : 1));
  } catch (e) { return []; }
}

// Удаление — это перенос в корзину аквариума: детский рисунок жалко терять
// из-за случайного клика. Вернуть рыбку = перенести пару файлов обратно.
function trashFish(t, fid) {
  let n = 0;
  fs.mkdirSync(t.trash, { recursive: true });
  for (const ext of ['.json', '.png']) {
    const src = path.join(t.fish, fid + ext);
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(t.trash, fid + ext));
      n++;
    }
  }
  return n;
}

// ── фоны ───────────────────────────────────────────────────────────────────
const IMG_RE = /\.(png|jpe?g|webp)$/i;
const UPLOAD_PREFIX = 'up-';
const isUpload = (name) => name.startsWith(UPLOAD_PREFIX);

function readDirSafe(dir) {
  try { return fs.readdirSync(dir).filter((f) => IMG_RE.test(f)).sort(); }
  catch (e) { return []; }
}

// Отдаём сразу с готовым URL: клиенту незачем знать, в какой папке лежит файл.
function listBackgrounds(t) {
  return [
    ...readDirSafe(BG_DIR).map((name) => ({ name, url: '/assets/backgrounds/' + name, custom: false })),
    ...readDirSafe(t.backgrounds).map((name) => ({
      name, url: '/data/tanks/' + t.id + '/backgrounds/' + name, custom: true
    }))
  ];
}

function backgroundUrl(t, name) {
  if (!name) return null;
  const found = listBackgrounds(t).find((b) => b.name === name);
  return found ? found.url : null;
}

// Фон в аквариуме есть всегда, поэтому нужен кто-то, кто его выберет:
// при создании аквариума, а ещё когда прежний фон удалили.
function randomBackground() {
  const list = readDirSafe(BG_DIR);
  return list.length ? list[Math.floor(Math.random() * list.length)] : null;
}

// ── настройки ──────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { background: null };

function readSettings(t) {
  let s;
  try {
    s = Object.assign({}, DEFAULT_SETTINGS, JSON.parse(fs.readFileSync(t.settings, 'utf8')));
  } catch (e) {
    s = Object.assign({}, DEFAULT_SETTINGS);
  }
  // Аквариум без фона — чёрная коробка, такого варианта у нас нет. Если фон
  // потерялся (старый аквариум, битое имя), выдаём случайный и запоминаем,
  // иначе он менялся бы при каждом обращении.
  if (!backgroundUrl(t, s.background)) {
    s.background = randomBackground();
    if (s.background) writeSettings(t, s);
  }
  return s;
}

function writeSettings(t, s) {
  ensureTank(t);
  fs.writeFileSync(t.settings, JSON.stringify(s));
}

// ── API внутри аквариума ───────────────────────────────────────────────────
function handleTankApi(req, res, t, url) {
  // Аквариум заводится только явно, через POST /api/tanks. Значит нет папки —
  // нет аквариума: либо код выдуман, либо аквариум удалили. Отвечать «пусто»
  // тут нельзя — главная по этому 404 вычищает призраков из своего списка,
  // а запись оживила бы удалённый аквариум со старой вкладки на телефоне.
  if (!fs.existsSync(t.dir)) return send(res, 404, '{"error":"нет такого аквариума"}');

  const ev = tankEvents(t.id);

  if (req.method === 'GET' && url === '/meta') {
    const s = readSettings(t);
    let preview = null;
    try {
      // Метка времени в адресе: без неё браузер показывал бы вчерашний
      // снимок из кэша, а он меняется при каждой правке аквариума.
      preview = '/data/tanks/' + t.id + '/preview.jpg?v=' + fs.statSync(t.preview).mtimeMs;
    } catch (e) { /* снимка ещё нет */ }
    return send(res, 200, JSON.stringify(Object.assign(publicMeta(readMeta(t)), {
      fishCount: listFish(t).length,
      preview: preview,
      // Запасная картинка для карточки, пока снимка нет: фон доступен всегда,
      // а снимок появляется только когда аквариум кто-то открыл.
      backgroundUrl: backgroundUrl(t, s.background)
    })));
  }

  // Снимок сцены для карточки на главной. Присылает сама сцена, когда
  // в аквариуме что-то изменилось.
  if (req.method === 'POST' && url === '/preview') {
    return readBody(req, res, (data) => {
      const m = /^data:image\/jpeg;base64,/.exec(data.image || '');
      if (!m) return send(res, 400, '{"error":"нужен image: dataURL jpeg"}');
      const buf = Buffer.from(data.image.slice(m[0].length), 'base64');
      if (!buf.length) return send(res, 400, '{"error":"пустой снимок"}');
      ensureTank(t);
      fs.writeFileSync(t.preview, buf);
      send(res, 200, JSON.stringify({ ok: true, bytes: buf.length }));
    });
  }

  // Проверка пароля. Отдельная ручка нужна затем, чтобы админка спрашивала
  // пароль один раз на входе, а не выясняла его правильность на первой же
  // попытке что-нибудь удалить.
  if (req.method === 'POST' && url === '/auth') {
    return readBody(req, res, (data) => {
      const r = checkPass(t, ev, data.password);
      if (r !== 'ok' && r !== 'open') return denied(res, t, ev);
      send(res, 200, JSON.stringify({ ok: true, locked: r === 'ok' }));
    });
  }

  // Смена пароля — и способ завести его аквариуму, оставшемуся с тех пор,
  // когда паролей не было: там authed() пропускает всех.
  if (req.method === 'POST' && url === '/password') {
    if (!authed(req, t, ev)) return denied(res, t, ev);
    return readBody(req, res, (data) => {
      const pass = String(data.password || '').trim();
      if (pass.length < 4) return send(res, 400, '{"error":"пароль от 4 знаков"}');
      const meta = readMeta(t);
      meta.salt = crypto.randomBytes(16).toString('hex');
      meta.hash = hashPass(pass, meta.salt);
      ensureTank(t);
      fs.writeFileSync(t.meta, JSON.stringify(meta));
      console.log(`пароль аквариума ${t.id} изменён`);
      send(res, 200, JSON.stringify({ ok: true }));
    });
  }

  if (req.method === 'PATCH' && url === '/meta') {
    if (!authed(req, t, ev)) return denied(res, t, ev);
    return readBody(req, res, (data) => {
      const meta = readMeta(t);
      meta.name = String(data.name || '').trim().slice(0, 60) || meta.name;
      ensureTank(t);
      fs.writeFileSync(t.meta, JSON.stringify(meta));
      send(res, 200, JSON.stringify(publicMeta(meta)));
    });
  }

  // Удаление аквариума — тоже перенос, а не стирание: внутри детские рисунки.
  if (req.method === 'DELETE' && url === '/') {
    if (!authed(req, t, ev)) return denied(res, t, ev);
    if (fs.existsSync(t.dir)) {
      fs.mkdirSync(TANKS_TRASH, { recursive: true });
      fs.renameSync(t.dir, path.join(TANKS_TRASH, t.id + '-' + Date.now()));
    }
    events.delete(t.id);
    console.log(`- аквариум ${t.id} → в корзину (data/trash-tanks)`);
    return send(res, 200, '{"ok":true}');
  }

  if (req.method === 'GET' && url === '/fish') {
    return send(res, 200, JSON.stringify(listFish(t)));
  }

  const texMatch = url.match(/^\/fish\/([a-z0-9-]+)\/texture\.png$/);
  if (req.method === 'GET' && texMatch) {
    const file = path.join(t.fish, texMatch[1] + '.png');
    if (!fs.existsSync(file)) return send(res, 404, '{"error":"not found"}');
    return send(res, 200, fs.readFileSync(file), 'image/png');
  }

  // В аквариуме живут рыбки двух пород, и обе заводятся здесь.
  //   раскрашенные — {kind, texture}: рядом с записью ложится <id>.png
  //                  с рисунком ребёнка;
  //   покупные      — {type:'pack', model}: картинки нет, текстура своя,
  //                  внутри модели.
  // У старых записей поля type нет — они раскрашенные по умолчанию.
  if (req.method === 'POST' && url === '/fish') {
    return readBody(req, res, (data) => {
      const fid = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 6);

      if (data.type === 'pack') {
        const model = listPack().find((m) => m.name === data.model);
        if (!model) return send(res, 400, '{"error":"нет такой модели в паке"}');
        ensureTank(t);
        fs.writeFileSync(path.join(t.fish, fid + '.json'), JSON.stringify({
          id: fid, type: 'pack', model: model.name, title: model.title,
          created: new Date().toISOString()
        }));
        console.log(`+ рыбка из пака ${model.name} в ${t.id} — всего ${listFish(t).length}`);
        return send(res, 200, JSON.stringify({ ok: true, id: fid }));
      }

      if (!data.kind || !/^data:image\/(png|jpeg);base64,/.test(data.texture || '')) {
        return send(res, 400, '{"error":"нужны kind и texture (dataURL png/jpeg)"}');
      }
      ensureTank(t);
      const png = Buffer.from(data.texture.split(',')[1], 'base64');
      fs.writeFileSync(path.join(t.fish, fid + '.png'), png);
      fs.writeFileSync(path.join(t.fish, fid + '.json'), JSON.stringify({
        id: fid, kind: String(data.kind), created: new Date().toISOString()
      }));
      console.log(`+ рыбка ${data.kind} в ${t.id} (${Math.round(png.length / 1024)} КБ) — всего ${listFish(t).length}`);
      send(res, 200, JSON.stringify({ ok: true, id: fid }));
    });
  }

  const delMatch = url.match(/^\/fish\/([a-z0-9-]+)$/);
  if (req.method === 'DELETE' && delMatch) {
    if (!authed(req, t, ev)) return denied(res, t, ev);
    const n = trashFish(t, delMatch[1]);
    if (n) console.log(`- рыбка ${delMatch[1]} из ${t.id} → в корзину`);
    return send(res, n ? 200 : 404, JSON.stringify({ ok: !!n }));
  }

  if (req.method === 'DELETE' && url === '/fish') {
    if (!authed(req, t, ev)) return denied(res, t, ev);
    const list = listFish(t);
    list.forEach((f) => trashFish(t, f.id));
    console.log(`аквариум ${t.id} очищен, ${list.length} рыбок → в корзину`);
    return send(res, 200, JSON.stringify({ ok: true, removed: list.length }));
  }

  if (req.method === 'GET' && url === '/backgrounds') {
    return send(res, 200, JSON.stringify(listBackgrounds(t)));
  }

  // Имя файла придумывает сервер — так в папку не попадёт ни «../»,
  // ни перезапись чужого файла одинаковым именем.
  if (req.method === 'POST' && url === '/backgrounds') {
    return readBody(req, res, (data) => {
      const m = /^data:image\/(png|jpeg|webp);base64,/.exec(data.image || '');
      if (!m) return send(res, 400, '{"error":"нужен image: dataURL png/jpeg/webp"}');
      const buf = Buffer.from(data.image.slice(m[0].length), 'base64');
      if (!buf.length) return send(res, 400, '{"error":"пустая картинка"}');
      ensureTank(t);
      const ext = m[1] === 'jpeg' ? '.jpg' : '.' + m[1];
      const name = UPLOAD_PREFIX + Date.now().toString(36) + '-' +
                   Math.random().toString(36).slice(2, 6) + ext;
      fs.writeFileSync(path.join(t.backgrounds, name), buf);
      console.log(`+ фон ${name} в ${t.id} (${Math.round(buf.length / 1024)} КБ)`);
      send(res, 200, JSON.stringify({
        ok: true, name, url: '/data/tanks/' + t.id + '/backgrounds/' + name
      }));
    });
  }

  const bgDelMatch = url.match(/^\/backgrounds\/(.+)$/);
  if (req.method === 'DELETE' && bgDelMatch) {
    const name = path.basename(bgDelMatch[1]);
    if (!isUpload(name) || !IMG_RE.test(name)) {
      return send(res, 403, '{"error":"встроенный фон удалить нельзя"}');
    }
    const file = path.join(t.backgrounds, name);
    if (!fs.existsSync(file)) return send(res, 404, '{"error":"not found"}');
    fs.unlinkSync(file);
    // Если удалили фон, который сейчас стоит в сцене, — выдаём случайный,
    // иначе аквариум остался бы с битой ссылкой до следующей смены настроек.
    const s = readSettings(t);
    if (s.background === name) writeSettings(t, { background: randomBackground() });
    console.log(`- фон ${name} из ${t.id} удалён`);
    return send(res, 200, '{"ok":true}');
  }

  if (req.method === 'GET' && url === '/settings') {
    const s = readSettings(t);
    return send(res, 200, JSON.stringify(Object.assign(s, {
      backgroundUrl: backgroundUrl(t, s.background),
      feedAt: ev.feedAt
    })));
  }

  if ((req.method === 'POST' || req.method === 'PUT') && url === '/settings') {
    return readBody(req, res, (patch) => {
      const cur = readSettings(t);
      const merged = Object.assign({}, cur, patch);
      // Храним только известные ключи. Неизвестное имя фона не оставляет
      // аквариум пустым, а сохраняет прежнюю картинку.
      const clean = {
        background: (typeof merged.background === 'string' && backgroundUrl(t, merged.background))
          ? merged.background : cur.background
      };
      writeSettings(t, clean);
      send(res, 200, JSON.stringify(clean));
    });
  }

  if (req.method === 'POST' && url === '/feed') {
    ev.feedAt = Date.now();
    console.log(`🐟 корм насыпан в ${t.id}`);
    return send(res, 200, JSON.stringify({ ok: true, feedAt: ev.feedAt }));
  }

  send(res, 404, '{"error":"unknown api"}');
}

function handleApi(req, res, url) {
  // Пак один на все аквариумы, поэтому ручка общая.
  if (req.method === 'GET' && url === '/api/pack') {
    return send(res, 200, JSON.stringify(listPack()));
  }

  if (req.method === 'POST' && url === '/api/tanks') {
    return readBody(req, res, (data) => {
      const id = newTankId();
      const t = tank(id);
      ensureTank(t);
      // Пароль либо свой, либо придуманный сервером: аквариум без пароля
      // не заводим — потом его никто не поставит, а рыбок удалит любой,
      // кому переслали ссылку.
      const pass = String(data.password || '').trim() || makePass();
      const salt = crypto.randomBytes(16).toString('hex');
      const meta = {
        id,
        name: String(data.name || '').trim().slice(0, 60) || 'Мой аквариум',
        created: new Date().toISOString(),
        salt,
        hash: hashPass(pass, salt)
      };
      fs.writeFileSync(t.meta, JSON.stringify(meta));
      // Новый аквариум сразу с картинкой: какая достанется — дело случая.
      const background = randomBackground();
      writeSettings(t, { background });
      console.log(`+ аквариум «${meta.name}» (${id}), фон ${background}`);
      // Единственный раз, когда пароль уходит с сервера в открытом виде:
      // страница показывает его хозяину и просит сохранить.
      send(res, 200, JSON.stringify(Object.assign(publicMeta(meta), { password: pass })));
    });
  }

  const m = url.match(/^\/api\/t\/([^/]+)(\/.*)?$/);
  if (m) {
    if (!TANK_ID_RE.test(m[1])) return send(res, 404, '{"error":"нет такого аквариума"}');
    return handleTankApi(req, res, tank(m[1]), m[2] || '/');
  }

  send(res, 404, '{"error":"unknown api"}');
}

// ── статика ────────────────────────────────────────────────────────────────
// Красивые адреса аквариума разворачиваются в обычные файлы. Сами страницы
// достают id из location.pathname, поэтому файл один на все аквариумы.
function pageFor(url) {
  if (url === '/') return 'index.html';
  const m = url.match(/^\/t\/([^/]+)(?:\/(admin|capture))?\/?$/);
  if (!m || !TANK_ID_RE.test(m[1])) return null;
  if (m[2] === 'admin') return 'admin.html';
  if (m[2] === 'capture') return 'capture.html';
  return 'demos/realistic-tank.html';
}

// Раздаём перечисленное, а не всё, что лежит рядом с сервером. Иначе по сети
// уезжает и .git, и детские рисунки из data/, и купленный пак моделей —
// папка с ним лежит в том же каталоге проекта.
const STATIC_DIRS = ['/assets/', '/vendor/', '/demos/', '/tools/'];
const STATIC_FILES = ['/print.html', '/favicon.ico'];
// Из data наружу смотрят только две вещи: свои фоны и снимок сцены.
// Текстуры рыбок отдаёт API, всё остальное — не для сети.
const DATA_FILE_RE = /^\/data\/tanks\/([^/]+)\/(?:preview\.jpg|backgrounds\/[\w.-]+)$/;

function staticFor(url) {
  const data = url.match(DATA_FILE_RE);
  const allowed = data
    ? TANK_ID_RE.test(data[1])
    : STATIC_FILES.includes(url) || STATIC_DIRS.some((dir) => url.startsWith(dir));
  if (!allowed) return null;

  const file = path.normalize(path.join(ROOT, url));
  // Сравниваем с разделителем на конце: без него мимо проверки проходит
  // соседняя папка, имя которой начинается так же («…/009 aqua-backup»).
  return file.startsWith(ROOT + path.sep) ? file : null;
}

http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  if (url.startsWith('/api/')) return handleApi(req, res, url);

  const page = pageFor(url);
  const file = page ? path.join(ROOT, page) : staticFor(url);

  if (!file) return send(res, 404, 'not found', 'text/plain');
  if (!fs.existsSync(file) || !fs.statSync(file).isFile()) {
    return send(res, 404, 'not found', 'text/plain');
  }

  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': MIME[ext] || 'application/octet-stream' };
  // код без кэша: иначе браузер молча живёт на старой версии страницы после правок
  if (ext === '.html' || ext === '.js' || ext === '.css') headers['Cache-Control'] = 'no-cache';
  res.writeHead(200, headers);
  fs.createReadStream(file).pipe(res);
}).listen(PORT, '0.0.0.0', () => {
  console.log(`Аквариумы: http://localhost:${PORT}/`);
  const nets = os.networkInterfaces();
  for (const name of Object.keys(nets)) {
    for (const net of nets[name]) {
      if (net.family === 'IPv4' && !net.internal) {
        console.log(`С телефона (Wi-Fi ${name}): http://${net.address}:${PORT}/`);
      }
    }
  }
});

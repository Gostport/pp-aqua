// Какой аквариум открыт, какие мы знаем и от каких помним пароль.
//
// Регистрации нет: id аквариума в адресе — он же приглашение посмотреть.
// Список своих аквариумов браузер держит в localStorage, поэтому на своём
// устройстве код вводить не нужно никогда — он нужен только чтобы открыть
// аквариум на другом.
//
// Управление закрыто паролем, и его браузер тоже помнит — по одному на
// аквариум. Хранится он как есть: сервер держит только хеш, а тут пароль
// нужен целиком, чтобы прикладывать к каждой правке. Кто дошёл до чужого
// localStorage, тот и так уже за компьютером хозяина.
(function () {
  'use strict';

  var ID_RE = /^[abcdefghjkmnpqrstuvwxyz23456789]{10}$/;
  var m = location.pathname.match(/^\/t\/([^/]+)/);
  var id = (m && ID_RE.test(m[1])) ? m[1] : null;

  var KEY = 'aqua.tanks';

  function known() {
    try {
      var list = JSON.parse(localStorage.getItem(KEY));
      return Array.isArray(list) ? list.filter(function (x) { return ID_RE.test(x); }) : [];
    } catch (e) { return []; }
  }

  function save(list) {
    try { localStorage.setItem(KEY, JSON.stringify(list)); } catch (e) { /* приватный режим */ }
  }

  function remember(tid) {
    if (!ID_RE.test(tid)) return;
    var list = known();
    if (list.indexOf(tid) === -1) { list.push(tid); save(list); }
  }

  function forget(tid) {
    save(known().filter(function (x) { return x !== tid; }));
  }

  // Открыли ссылку, которой раньше не видели, — аквариум попадает в свой
  // список. Дальше он найдётся на главной сам, без ввода кода.
  // Демо с главной (?demo) — витрина, а не свой: в список не пишем, иначе
  // у каждого новичка навсегда поселился бы чужой аквариум.
  if (id && !/(^|[?&])demo(=|&|$)/.test(location.search)) remember(id);

  // ── пароли ───────────────────────────────────────────────────────────────
  var PASS_KEY = 'aqua.pass.';

  function pass(tid) {
    try { return localStorage.getItem(PASS_KEY + (tid || id)) || null; } catch (e) { return null; }
  }

  function setPass(tid, value) {
    try {
      if (value) localStorage.setItem(PASS_KEY + tid, value);
      else localStorage.removeItem(PASS_KEY + tid);
    } catch (e) { /* приватный режим */ }
  }

  // Тот же fetch, только с паролем в заголовке, если он у нас есть.
  // Через него идут все правки; чтение обходится и обычным fetch.
  function send(url, opts) {
    opts = opts || {};
    var headers = {};
    var src = opts.headers || {};
    Object.keys(src).forEach(function (k) { headers[k] = src[k]; });
    if (opts.body && !headers['Content-Type']) headers['Content-Type'] = 'application/json';
    var p = pass(opts.tank || id);
    if (p) headers['X-Tank-Pass'] = p;
    return fetch(url, {
      method: opts.method || (opts.body ? 'POST' : 'GET'),
      headers: headers,
      body: opts.body
    });
  }

  // Спросить пароль и проверить его на сервере. Нужен Modal — страницы,
  // где управляют аквариумом, его подключают.
  function askPass(tid, opts) {
    tid = tid || id;
    opts = opts || {};
    var t = function (key) { return window.I18N ? window.I18N.t(key) : key; };
    return window.Modal.prompt({
      title: opts.title || t('pass.ask.title'),
      text: opts.text || t('pass.ask.text'),
      placeholder: t('pass.ask.ph'),
      maxLength: 60,
      mono: true,
      confirmLabel: t('pass.ask.ok')
    }).then(function (value) {
      if (value === null) return false;
      return fetch('/api/t/' + tid + '/auth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: value })
      }).then(function (r) {
        if (r.ok) { setPass(tid, value); return true; }
        return r.json().catch(function () { return {}; }).then(function (e) {
          return window.Modal.alert({
            title: t(r.status === 429 ? 'pass.many.title' : 'pass.bad.title'),
            text: r.status === 429
              ? window.I18N.t('pass.many.text', { n: e.retryAfter || 60 })
              : t('pass.bad.text')
          }).then(function () { return false; });
        });
      }, function () { return false; });
    });
  }

  window.Tank = {
    id: id,
    api: id ? '/api/t/' + id : null,
    url: id ? '/t/' + id : null,
    isValidId: function (x) { return ID_RE.test(String(x || '').trim().toLowerCase()); },
    known: known,
    remember: remember,
    forget: forget,
    pass: pass,
    setPass: setPass,
    send: send,
    askPass: askPass
  };
})();

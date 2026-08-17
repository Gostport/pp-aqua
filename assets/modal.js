// Модальные окна вместо браузерных confirm / alert / prompt.
//
//   Modal.confirm({title, text, image, caption, fields, confirmLabel}) → Promise<bool>
//   Modal.alert  ({title, text, fields})                                → Promise<void>
//   Modal.prompt ({title, text, value, placeholder, …})                 → Promise<string|null>
//   Modal.choose ({title, text, image, buttons:[{label,value,kind}]})   → Promise<value>
//
// fields — строки вида {label, value}: так показывают код и пароль аквариума,
// которые надо не прочитать, а сохранить. Значение копируется нажатием.
//
// Отмена — по кнопке, по Escape и по клику мимо окна.
//
// Зачем не нативные:
//   · нативное окно не покажет, ЧТО удаляется, а здесь удаляют детский
//     рисунок — увидеть его перед удалением важнее экономии кода;
//   · confirm и prompt намертво блокируют страницу: сцена в соседней вкладке
//     встаёт, анимация замирает;
//   · выглядят они по-разному в каждом браузере и всегда чужеродно.
(function () {
  'use strict';

  var CSS = [
    '.mdl-back{position:fixed;inset:0;z-index:100;display:grid;place-content:center;',
    '  background:rgba(2,10,18,.72);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);',
    '  animation:mdl-fade .14s ease-out}',
    '@keyframes mdl-fade{from{opacity:0}to{opacity:1}}',
    '@keyframes mdl-pop{from{opacity:0;transform:translateY(8px) scale(.97)}to{opacity:1;transform:none}}',
    '.mdl-box{width:min(92vw,420px);background:#0b2033;color:var(--ink,#eaf6ff);',
    '  border:1px solid var(--line,rgba(140,200,255,.16));border-radius:18px;',
    '  padding:24px;box-shadow:0 30px 80px rgba(0,10,20,.6);',
    '  font:15px/1.5 "Segoe UI",system-ui,sans-serif;animation:mdl-pop .16s cubic-bezier(.2,.7,.2,1)}',
    '.mdl-box h3{margin:0 0 8px;font-size:18px;font-weight:620}',
    '.mdl-box p{margin:0;color:var(--muted,#8aa6bd);font-size:14px}',
    '.mdl-shot{margin:16px 0 4px;border-radius:12px;overflow:hidden;background:#0a2233}',
    '.mdl-shot img{width:100%;aspect-ratio:2/1;object-fit:contain;display:block}',
    '.mdl-cap{margin:8px 0 0;text-align:center;font-weight:600;font-size:14px}',
    '.mdl-box input{width:100%;margin-top:16px;font:inherit;font-size:15px;',
    '  background:rgba(4,16,28,.6);color:var(--ink,#eaf6ff);',
    '  border:1px solid var(--line,rgba(140,200,255,.16));border-radius:10px;padding:10px 14px}',
    '.mdl-box input:focus{outline:none;border-color:var(--accent,#58d6ff)}',
    '.mdl-box input.mono{font-family:ui-monospace,Consolas,monospace;font-size:14px}',
    '.mdl-field{display:flex;align-items:center;gap:12px;margin-top:12px;padding:12px 14px;',
    '  background:rgba(88,214,255,.07);border:1px solid var(--line,rgba(140,200,255,.16));',
    '  border-radius:12px}',
    '.mdl-field span{color:var(--muted,#8aa6bd);font-size:13px}',
    '.mdl-field b{margin-left:auto;font-family:ui-monospace,Consolas,monospace;font-size:17px;',
    '  letter-spacing:1.5px;color:var(--accent,#58d6ff);cursor:pointer;user-select:all}',
    '.mdl-field b:hover{filter:brightness(1.15)}',
    '.mdl-row{display:flex;gap:10px;margin-top:20px}',
    // Три ответа в строку не помещаются, да и выбирать из столбика проще.
    '.mdl-row.mdl-col{flex-direction:column}',
    '.mdl-row button{flex:1;cursor:pointer;font:inherit;font-size:14px;padding:10px 16px;',
    '  border-radius:11px;border:1px solid var(--line,rgba(140,200,255,.16));',
    '  background:rgba(88,214,255,.1);color:var(--ink,#eaf6ff);transition:background .15s,border-color .15s}',
    '.mdl-row button:hover{background:rgba(88,214,255,.2)}',
    '.mdl-row button.mdl-go{background:rgba(88,214,255,.85);border-color:var(--accent,#58d6ff);',
    '  color:#04101c;font-weight:600}',
    '.mdl-row button.mdl-go:hover{filter:brightness(1.08)}',
    '.mdl-row button.mdl-danger{background:rgba(255,107,122,.14);border-color:rgba(255,107,122,.4);',
    '  color:#ff9aa6;font-weight:600}',
    '.mdl-row button.mdl-danger:hover{background:rgba(255,107,122,.28)}',
    '.mdl-row button:focus-visible{outline:2px solid var(--accent,#58d6ff);outline-offset:2px}'
  ].join('');

  var styled = false;
  function ensureStyle() {
    if (styled) return;
    styled = true;
    var s = document.createElement('style');
    s.textContent = CSS;
    document.head.appendChild(s);
  }

  // Общая начинка всех трёх окон. Возвращает то, что вернула нажатая кнопка,
  // либо cancelValue при отмене.
  function open(opts) {
    ensureStyle();
    return new Promise(function (resolve) {
      var before = document.activeElement;

      var back = document.createElement('div');
      back.className = 'mdl-back';
      var box = document.createElement('div');
      box.className = 'mdl-box';
      box.setAttribute('role', 'dialog');
      box.setAttribute('aria-modal', 'true');

      var h = document.createElement('h3');
      h.textContent = opts.title || '';
      box.appendChild(h);

      if (opts.text) {
        var p = document.createElement('p');
        p.textContent = opts.text;
        box.appendChild(p);
      }

      // Картинка — главное в окнах удаления: видно, что именно убираем.
      if (opts.image) {
        var shot = document.createElement('div');
        shot.className = 'mdl-shot';
        var img = document.createElement('img');
        img.src = opts.image;
        img.alt = '';
        shot.appendChild(img);
        box.appendChild(shot);
      }
      if (opts.caption) {
        var cap = document.createElement('p');
        cap.className = 'mdl-cap';
        cap.textContent = opts.caption;
        box.appendChild(cap);
      }

      // Код и пароль: их не читают, а переписывают, поэтому крупно,
      // моноширинно и с копированием по нажатию.
      (opts.fields || []).forEach(function (f) {
        var row = document.createElement('div');
        row.className = 'mdl-field';
        var label = document.createElement('span');
        label.textContent = f.label;
        var value = document.createElement('b');
        value.textContent = f.value;
        value.title = 'Нажми, чтобы скопировать';
        value.onclick = function () {
          if (!navigator.clipboard) return;
          navigator.clipboard.writeText(f.value).then(function () {
            var was = value.textContent;
            value.textContent = 'скопировано';
            setTimeout(function () { value.textContent = was; }, 900);
          }, function () { /* без разрешения на буфер — перепишет руками */ });
        };
        row.appendChild(label);
        row.appendChild(value);
        box.appendChild(row);
      });

      var input = null;
      if (opts.input) {
        input = document.createElement('input');
        input.type = 'text';
        input.value = opts.input.value || '';
        if (opts.input.placeholder) input.placeholder = opts.input.placeholder;
        if (opts.input.maxLength) input.maxLength = opts.input.maxLength;
        if (opts.input.mono) input.className = 'mono';
        box.appendChild(input);
      }

      var row = document.createElement('div');
      row.className = 'mdl-row' + (opts.buttons.length > 2 ? ' mdl-col' : '');
      var buttons = [];
      opts.buttons.forEach(function (b) {
        var el = document.createElement('button');
        el.textContent = b.label;
        if (b.kind) el.className = 'mdl-' + b.kind;
        el.onclick = function () { close(b.value === undefined ? true : b.value); };
        row.appendChild(el);
        buttons.push(el);
      });
      box.appendChild(row);
      back.appendChild(box);
      document.body.appendChild(back);

      // Фокус: в окне с полем — на поле, иначе на кнопку, указанную в focus.
      // По умолчанию это первая кнопка: в опасных окнах она «Отмена», и
      // случайный Enter ничего не сломает.
      var focusIndex = opts.focus === undefined ? 0 : opts.focus;
      if (input) { input.focus(); input.select(); }
      else if (buttons[focusIndex]) buttons[focusIndex].focus();

      function value() {
        if (!input) return true;
        return input.value;
      }

      function close(v) {
        document.removeEventListener('keydown', onKey, true);
        back.remove();
        if (before && before.focus) before.focus();
        resolve(v === true && input ? value() : v);
      }

      function onKey(e) {
        if (e.key === 'Escape') { e.preventDefault(); close(opts.cancelValue); return; }
        if (e.key === 'Enter') {
          // В окне с полем и в простом уведомлении Enter подтверждает.
          // В окне удаления — только если фокус уже на кнопке действия:
          // подтверждать снос вслепую нельзя.
          var go = buttons[buttons.length - 1];
          if (input || buttons.length === 1 || document.activeElement === go) {
            e.preventDefault();
            close(input ? value() : true);
          }
          return;
        }
        if (e.key === 'Tab') {
          e.preventDefault();
          var order = input ? [input].concat(buttons) : buttons;
          var i = order.indexOf(document.activeElement);
          var next = order[(i + (e.shiftKey ? -1 : 1) + order.length) % order.length];
          if (next) next.focus();
        }
      }

      back.onclick = function (e) { if (e.target === back) close(opts.cancelValue); };
      document.addEventListener('keydown', onKey, true);
    });
  }

  window.Modal = {
    confirm: function (o) {
      o = o || {};
      return open({
        title: o.title || 'Подтвердить?',
        text: o.text, image: o.image, caption: o.caption, fields: o.fields,
        cancelValue: false,
        buttons: [
          { label: o.cancelLabel || 'Отмена', value: false },
          { label: o.confirmLabel || 'Удалить', value: true, kind: o.kind || 'danger' }
        ]
      });
    },

    alert: function (o) {
      o = o || {};
      return open({
        title: o.title || 'Сообщение',
        text: o.text,
        fields: o.fields,
        cancelValue: true,
        buttons: [{ label: o.okLabel || 'Понятно', value: true, kind: 'go' }]
      });
    },

    // Выбор из нескольких действий: возвращает value нажатой кнопки.
    // Отмена (Escape, клик мимо) даёт cancelValue, по умолчанию null.
    choose: function (o) {
      o = o || {};
      return open({
        title: o.title || '',
        text: o.text, image: o.image, caption: o.caption, fields: o.fields,
        cancelValue: o.cancelValue === undefined ? null : o.cancelValue,
        buttons: o.buttons || []
      });
    },

    // Возвращает введённую строку либо null, если отменили.
    prompt: function (o) {
      o = o || {};
      return open({
        title: o.title || '',
        text: o.text,
        input: {
          value: o.value || '', placeholder: o.placeholder,
          maxLength: o.maxLength, mono: o.mono
        },
        cancelValue: null,
        buttons: [
          { label: o.cancelLabel || 'Отмена', value: null },
          { label: o.confirmLabel || 'Сохранить', value: true, kind: 'go' }
        ]
      });
    }
  };
})();

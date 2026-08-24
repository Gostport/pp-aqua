(function () {
  'use strict';

  var LANGS = ['en', 'pl'];
  var STORAGE_KEY = 'aqua.lang';

  var DICT = {
    en: {
      'cap.title': '🐠 Bring your fish to life!',
      'cap.sub': 'Colour the fish on the sheet, take a photo — and it will swim in the aquarium',
      'cap.back': '← to the aquarium',
      'cap.shoot': 'Photograph the sheet',
      'cap.camera': 'Open camera',
      'cap.choose': 'Choose an existing photo',
      'cap.camera.capture': 'Take photo',
      'cap.camera.close': 'Close camera',
      'cap.camera.https': 'Live camera needs HTTPS. Use an HTTPS address or choose an existing photo.',
      'cap.camera.unsupported': 'This browser cannot access the camera. Choose an existing photo instead.',
      'cap.camera.permission': 'Camera access was blocked. Allow camera access in the browser and try again.',
      'cap.hint': 'Put the sheet on a table so that all four black squares are in the frame',
      'cap.qr': 'Easier on a phone: point its camera at the code and the shooting opens there',
      'cap.searching': 'Looking for the fish in the photo…',
      'cap.reviving': 'the fish is coming alive…',
      'cap.release': 'Release into the aquarium! 🌊',
      'cap.retake': 'Retake',
      'cap.boost': 'Brighter colours',
      'cap.done': 'The fish has swum into the aquarium!',
      'cap.done.sub': 'Look at the big screen — it is already there',
      'cap.done.sub.embed': 'Close this window — it is already swimming',
      'cap.again': 'Photograph another one',
      'cap.retry': 'Try again',
      'cap.sending': 'The fish is swimming to the aquarium…',
      'cap.err.manifest': 'manifest.json did not load — check that the server is running.',
      'cap.err.photo': 'Could not open the photo, try again.',
      'cap.itis': 'It’s a {name}!',
      'cap.photo': 'Your fish',
      'cap.err.nofish': 'The fish got lost — photograph the sheet again.',
      'cap.err.status': 'The server answered {code}',
      'cap.err.markers': 'Found {n} markers out of 4. Photograph the whole sheet, in good light and without glare — all four black squares have to be in the frame.',
      'cap.err.send': 'Sending failed: {msg}'
    },
    pl: {
      'cap.title': '🐠 Ożyw swoją rybkę!',
      'cap.sub': 'Pokoloruj rybkę na kartce, zrób zdjęcie — a popłynie w akwarium',
      'cap.back': '← do akwarium',
      'cap.shoot': 'Sfotografuj kartkę',
      'cap.camera': 'Otwórz aparat',
      'cap.choose': 'Wybierz istniejące zdjęcie',
      'cap.camera.capture': 'Zrób zdjęcie',
      'cap.camera.close': 'Zamknij aparat',
      'cap.camera.https': 'Aparat na żywo wymaga HTTPS. Użyj adresu HTTPS albo wybierz istniejące zdjęcie.',
      'cap.camera.unsupported': 'Ta przeglądarka nie może użyć aparatu. Wybierz istniejące zdjęcie.',
      'cap.camera.permission': 'Dostęp do aparatu został zablokowany. Zezwól na dostęp w przeglądarce i spróbuj ponownie.',
      'cap.hint': 'Połóż kartkę na stole tak, żeby wszystkie cztery czarne kwadraty były w kadrze',
      'cap.qr': 'Wygodniej telefonem: skieruj aparat na kod, a zdjęcie zrobisz tam',
      'cap.searching': 'Szukam rybki na zdjęciu…',
      'cap.reviving': 'rybka ożywa…',
      'cap.release': 'Wypuść do akwarium! 🌊',
      'cap.retake': 'Zrób jeszcze raz',
      'cap.boost': 'Żywsze kolory',
      'cap.done': 'Rybka popłynęła do akwarium!',
      'cap.done.sub': 'Spójrz na duży ekran — już tam jest',
      'cap.done.sub.embed': 'Zamknij okno — już pływa',
      'cap.again': 'Sfotografuj następną',
      'cap.retry': 'Spróbuj jeszcze raz',
      'cap.sending': 'Rybka płynie do akwarium…',
      'cap.err.manifest': 'Nie wczytał się manifest.json — sprawdź, czy serwer działa.',
      'cap.err.photo': 'Nie udało się otworzyć zdjęcia, spróbuj jeszcze raz.',
      'cap.itis': 'To {name}!',
      'cap.photo': 'Twoja rybka',
      'cap.err.nofish': 'Rybka się zgubiła — zrób zdjęcie kartki jeszcze raz.',
      'cap.err.status': 'Serwer odpowiedział {code}',
      'cap.err.markers': 'Znaleziono {n} znaczników z 4. Sfotografuj całą kartkę, przy dobrym świetle i bez odblasków — wszystkie cztery czarne kwadraty muszą być w kadrze.',
      'cap.err.send': 'Nie udało się wysłać: {msg}'
    }
  };

  var lang = localStorage.getItem(STORAGE_KEY);
  if (!LANGS.includes(lang)) lang = 'en';

  function t(key, vars) {
    var text = (DICT[lang] && DICT[lang][key]) || DICT.en[key] || key;
    if (vars) Object.keys(vars).forEach(function (k) { text = text.replace(new RegExp('\\{' + k + '\\}', 'g'), vars[k]); });
    return text;
  }

  function apply(root) {
    root = root || document;
    root.querySelectorAll('[data-t]').forEach(function (el) { el.textContent = t(el.getAttribute('data-t')); });
    root.querySelectorAll('[data-t-alt]').forEach(function (el) { el.alt = t(el.getAttribute('data-t-alt')); });
    document.documentElement.lang = lang;
  }

  window.I18N = {
    get lang() { return lang; },
    get langs() { return LANGS.slice(); },
    t: t,
    apply: apply,
    set: function (next) {
      if (!LANGS.includes(next)) return;
      lang = next;
      localStorage.setItem(STORAGE_KEY, lang);
      apply();
    }
  };

  document.addEventListener('DOMContentLoaded', function () { apply(); });
})();

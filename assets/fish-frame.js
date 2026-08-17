// Как рыба устроена: где у неё ось тела, где бок и с какого конца голова.
//
// Модуль общий для сцены и для превью в админке. Держать две копии этой
// логики нельзя: они разъезжаются, и рыбка плывёт правильно, а на картинке
// в списке стоит боком — ровно это и случилось, пока разбор был только
// в сцене.
//
// Габарит для задачи не годится вовсе, он ошибается дважды:
//   ось тела  — дискус выше, чем длиннее, а у крылатки габарит задают
//               растопыренные плавники, и «самая длинная сторона» указывает
//               поперёк рыбы. Такая рыба плывёт боком;
//   голова    — у длиннорылых и дисковидных толстый конец оказывается
//               основанием хвоста. На покупном паке габаритная прикидка
//               перевернула 19 моделей из 28.
//
// Скелет говорит честно и то и другое:
//   ось тела  — вдоль неё вытянута цепочка костей (позвоночник);
//   бок       — по ней сильнее мотает концы тела;
//   голова    — тот конец, где мотает меньше: хвост машет, голова почти
//               неподвижна.
(function () {
  'use strict';

  var AX = ['x', 'y', 'z'];

  // Возвращает {axes:{body,up,lat}, headAtMax} либо null, если скелета
  // или анимации нет — тогда вызывающий решает по габариту.
  function fromSkeleton(gltf) {
    var clip = (gltf.animations || [])[0];
    if (!clip) return null;
    var root = gltf.scene;
    var bones = [];
    root.traverse(function (o) { if (o.isBone) bones.push(o); });
    if (bones.length < 3) return null;

    var mixer = new THREE.AnimationMixer(root);
    mixer.clipAction(clip).play();
    var dur = clip.duration || 1, snaps = [];
    [0, 0.2, 0.4, 0.6, 0.8].forEach(function (f) {
      mixer.setTime(f * dur);
      root.updateWorldMatrix(true, true);
      snaps.push(bones.map(function (b) { return b.getWorldPosition(new THREE.Vector3()); }));
    });
    // возвращаем модель в исходную позу и убираем за собой временный микшер
    mixer.setTime(0);
    mixer.uncacheRoot(root);
    root.updateWorldMatrix(true, true);

    // Часть клипов вдобавок везёт рыбу вперёд, и это перемещение на порядок
    // больше виляния хвоста. Для выбора осей его надо убрать, иначе «самой
    // подвижной» окажется ось, вдоль которой рыбу просто несёт.
    var local = snaps.map(function (s) {
      var c = new THREE.Vector3();
      s.forEach(function (p) { c.add(p); });
      c.divideScalar(s.length);
      return s.map(function (p) { return p.clone().sub(c); });
    });

    var spread = {};
    AX.forEach(function (a) {
      var lo = Infinity, hi = -Infinity;
      local[0].forEach(function (p) { if (p[a] < lo) lo = p[a]; if (p[a] > hi) hi = p[a]; });
      spread[a] = hi - lo;
    });
    // Ось тела — вдоль неё вытянута цепочка костей.
    var body = AX.slice().sort(function (a, b) { return spread[b] - spread[a]; })[0];
    var rest = AX.filter(function (a) { return a !== body; });

    var bLo = Infinity, bHi = -Infinity;
    local[0].forEach(function (p) { if (p[body] < bLo) bLo = p[body]; if (p[body] > bHi) bHi = p[body]; });
    var bSpan = (bHi - bLo) || 1;

    // Бок — ось, по которой сильнее мотает КОНЦЫ тела. Считать средний размах
    // по всем костям нельзя: у дисковидных рыб плавники по всей длине шевелятся
    // не меньше хвоста, и «самой подвижной» ошибочно выходит высота.
    function endSway(a) {
      var sLo = 0, nLo = 0, sHi = 0, nHi = 0;
      local[0].forEach(function (p, i) {
        var mn = Infinity, mx = -Infinity;
        local.forEach(function (s) { var q = s[i][a]; if (q < mn) mn = q; if (q > mx) mx = q; });
        var d = mx - mn, along = (p[body] - bLo) / bSpan;
        if (along < 0.25) { sLo += d; nLo++; }
        else if (along > 0.75) { sHi += d; nHi++; }
      });
      return Math.max(sLo / Math.max(nLo, 1), sHi / Math.max(nHi, 1));
    }
    var lat = endSway(rest[0]) >= endSway(rest[1]) ? rest[0] : rest[1];
    var up = rest[0] === lat ? rest[1] : rest[0];

    // Голова — где меньше мотает вбок. Здесь берём ИСХОДНЫЕ положения, без
    // вычитания сдвига: общий перенос одинаково добавляется обоим концам
    // и в сравнении сокращается сам. А вот вычитание центра масс тут вредит —
    // на моделях с десятком костей центр уезжает вместе с хвостом и делает
    // неподвижную голову «подвижной».
    var lo0 = Infinity, hi0 = -Infinity;
    snaps[0].forEach(function (p) { if (p[body] < lo0) lo0 = p[body]; if (p[body] > hi0) hi0 = p[body]; });
    var span = (hi0 - lo0) || 1;
    var sLow = 0, nLow = 0, sHigh = 0, nHigh = 0;
    snaps[0].forEach(function (p, i) {
      var along = (p[body] - lo0) / span;
      var mn = Infinity, mx = -Infinity;
      snaps.forEach(function (s) { var q = s[i][lat]; if (q < mn) mn = q; if (q > mx) mx = q; });
      var d = mx - mn;
      // середину не считаем: там размах промежуточный и только шумит
      if (along < 0.4) { sLow += d; nLow++; }
      else if (along > 0.6) { sHigh += d; nHigh++; }
    });
    if (!nLow || !nHigh) return null;

    return {
      axes: { body: body, up: up, lat: lat },
      headAtMax: (sHigh / nHigh) < (sLow / nLow)
    };
  }

  // Габарит модели в мировых координатах плюс центр масс вершин —
  // нужен и запасной прикидке, и для того, чтобы вписать рыбу в кадр.
  function bounds(root) {
    root.updateWorldMatrix(true, true);
    var box = new THREE.Box3(), sum = new THREE.Vector3(), v = new THREE.Vector3(), n = 0;
    root.traverse(function (o) {
      if (!o.isMesh) return;
      var p = o.geometry.attributes.position;
      for (var i = 0; i < p.count; i++) {
        v.fromBufferAttribute(p, i).applyMatrix4(o.matrixWorld);
        box.expandByPoint(v); sum.add(v); n++;
      }
    });
    return {
      box: box,
      size: box.getSize(new THREE.Vector3()),
      center: box.getCenter(new THREE.Vector3()),
      centroid: sum.divideScalar(Math.max(n, 1))
    };
  }

  function axisVec(name, sign) {
    return new THREE.Vector3(name === 'x' ? sign : 0, name === 'y' ? sign : 0, name === 'z' ? sign : 0);
  }

  // Кватернион, приводящий модель к общему виду: нос → +Z, спина → +Y.
  // Спину определяем по центру масс: у рыбы брюхо мясистое, а спинной
  // плавник тонкий, значит спина там, где пусто.
  function orientQuat(axes, headAtMax, b) {
    var forward = axisVec(axes.body, headAtMax ? 1 : -1);
    // Где у рыбы спина. glTF авторится «Y вверх», и если ось «вверх» совпала
    // с Y — доверяем этому. Прикидка по массе (брюхо тяжелее спины) остаётся
    // запасной: на покупном паке она верна у 27 моделей из 28, а спинорога
    // переворачивала кверху брюхом — у него плавники сверху крупнее брюха,
    // и центр масс уезжает выше центра габарита. У рыбы-бабочки запас был
    // 0.4% — то есть следующей перевернулась бы она.
    var upVec = axes.up === 'y'
      ? axisVec('y', 1)
      : axisVec(axes.up, b.centroid[axes.up] < b.center[axes.up] ? 1 : -1);
    var right = new THREE.Vector3().crossVectors(upVec, forward);
    return new THREE.Quaternion()
      .setFromRotationMatrix(new THREE.Matrix4().makeBasis(right, upVec, forward))
      .invert();
  }

  window.FishFrame = {
    fromSkeleton: fromSkeleton,
    bounds: bounds,
    axisVec: axisVec,
    orientQuat: orientQuat
  };
})();

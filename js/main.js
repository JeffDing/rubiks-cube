(function () {
  'use strict';

  var Core = window.RubikCore;
  var SPACING = 1.04;
  var CUBIE = 0.96;
  var STICKER = 0.84;
  var THRESHOLD_PX = 9;
  var PAN_LIMIT = 2.6;

  var state = Core.createState();
  var history = [];

  var scene = new THREE.Scene();
  var camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
  var renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  var stage = document.getElementById('stage');
  renderer.domElement.style.touchAction = 'none';
  stage.appendChild(renderer.domElement);
  var canvas = renderer.domElement;

  var board = new THREE.Group();
  scene.add(board);

  var cubieMeshes = [];
  var pickables = [];
  var stickerGeo = new THREE.PlaneGeometry(STICKER, STICKER);
  var bodyGeo = new THREE.BoxGeometry(CUBIE, CUBIE, CUBIE);
  var bodyMat = new THREE.MeshStandardMaterial({ color: 0x14161c, roughness: 0.85, metalness: 0.05 });
  var zAxis = new THREE.Vector3(0, 0, 1);

  function makeStickerMat(color) {
    return new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.45, metalness: 0.08 });
  }

  function build() {
    for (var i = 0; i < state.cubies.length; i++) {
      var c = state.cubies[i];
      var g = new THREE.Group();
      var body = new THREE.Mesh(bodyGeo, bodyMat);
      g.add(body);
      for (var s = 0; s < c.stickers.length; s++) {
        var st = c.stickers[s];
        var n = new THREE.Vector3(st.n[0], st.n[1], st.n[2]);
        var mat = makeStickerMat(st.color);
        var plane = new THREE.Mesh(stickerGeo, mat);
        plane.quaternion.setFromUnitVectors(zAxis, n);
        plane.position.copy(n).multiplyScalar(CUBIE / 2 + 0.012);
        plane.userData = { ci: i, localNormal: n.clone() };
        g.add(plane);
        pickables.push(plane);
      }
      g.position.set(c.pos[0] * SPACING, c.pos[1] * SPACING, c.pos[2] * SPACING);
      board.add(g);
      cubieMeshes.push(g);
    }
  }

  function syncCubie(i) {
    var c = state.cubies[i];
    var g = cubieMeshes[i];
    g.position.set(c.pos[0] * SPACING, c.pos[1] * SPACING, c.pos[2] * SPACING);
    var x = new THREE.Vector3(c.ori[0][0], c.ori[1][0], c.ori[2][0]);
    var y = new THREE.Vector3(c.ori[0][1], c.ori[1][1], c.ori[2][1]);
    var z = new THREE.Vector3(c.ori[0][2], c.ori[1][2], c.ori[2][2]);
    var m = new THREE.Matrix4().makeBasis(x, y, z);
    g.quaternion.setFromRotationMatrix(m);
  }

  function syncAll() {
    for (var i = 0; i < cubieMeshes.length; i++) syncCubie(i);
  }

  var lights = new THREE.Group();
  (function addLights() {
    var hemi = new THREE.HemisphereLight(0xffffff, 0x223044, 0.9);
    var key = new THREE.DirectionalLight(0xffffff, 0.75);
    key.position.set(6, 8, 9);
    var fill = new THREE.DirectionalLight(0xffffff, 0.35);
    fill.position.set(-7, -4, -6);
    var rim = new THREE.DirectionalLight(0xffffff, 0.25);
    rim.position.set(-4, 6, -8);
    lights.add(hemi, key, fill, rim);
  })();
  scene.add(lights);

  var azTarget = 0.62, polTarget = 1.02, distTarget = 7.4;
  var az = azTarget, pol = polTarget, dist = distTarget;
  var target = new THREE.Vector3(0, 0, 0);

  function updateCamera() {
    var sp = Math.sin(pol);
    camera.position.set(
      target.x + dist * sp * Math.sin(az),
      target.y + dist * Math.cos(pol),
      target.z + dist * sp * Math.cos(az)
    );
    camera.lookAt(target);
  }

  function resize() {
    var w = stage.clientWidth || window.innerWidth;
    var h = stage.clientHeight || window.innerHeight;
    renderer.setSize(w, h);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener('resize', resize);

  var queue = [];
  var afterDrain = [];
  var animating = false;
  var blockInput = false;

  function easeInOut(t) { return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

  function process() {
    if (animating) return;
    var item = queue.shift();
    if (!item) {
      var cb;
      while ((cb = afterDrain.shift())) cb();
      return;
    }
    runTurn(item.move, item.manual, item.dur);
  }

  function runTurn(move, manual, dur) {
    animating = true;
    var ai = Core.axisIndex(move.axis);
    var parts = [];
    for (var i = 0; i < state.cubies.length; i++) {
      if (state.cubies[i].pos[ai] === move.layer) parts.push(i);
    }
    var pivot = new THREE.Group();
    board.add(pivot);
    for (var p = 0; p < parts.length; p++) pivot.attach(cubieMeshes[parts[p]]);
    var axisVec = new THREE.Vector3(move.axis === 'x' ? 1 : 0, move.axis === 'y' ? 1 : 0, move.axis === 'z' ? 1 : 0);
    var total = move.dir * Math.PI / 2;
    var duration = dur || 170;
    var start = performance.now();

    function frame(now) {
      var t = Math.min(1, (now - start) / duration);
      pivot.setRotationFromAxisAngle(axisVec, total * easeInOut(t));
      if (t < 1) {
        requestAnimationFrame(frame);
      } else {
        finish();
      }
    }

    function finish() {
      Core.applyRotation(state, move);
      board.updateMatrixWorld(true);
      for (var p = 0; p < parts.length; p++) {
        board.attach(cubieMeshes[parts[p]]);
        syncCubie(parts[p]);
      }
      board.remove(pivot);
      animating = false;
      board.updateMatrixWorld(true);
      afterMove(move, manual);
      process();
    }

    requestAnimationFrame(frame);
  }

  function enqueue(move, opts) {
    opts = opts || {};
    queue.push({ move: move, manual: !!opts.manual, dur: opts.dur });
    process();
  }

  function enqueueBatch(moves, opts, onDone) {
    for (var i = 0; i < moves.length; i++) {
      queue.push({ move: moves[i], manual: false, dur: opts.dur });
    }
    if (onDone) afterDrain.push(onDone);
    process();
  }

  var scrambled = false;
  var winShown = false;
  var timerRunning = false;
  var startTime = 0;
  var elapsed = 0;
  var steps = 0;

  var elSteps = document.getElementById('steps');
  var elTimer = document.getElementById('timer');
  var elFlag = document.getElementById('flag');
  var elNote = document.getElementById('note');

  function fmt(ms) {
    var s = Math.floor(ms / 1000);
    var m = Math.floor(s / 60);
    var ss = s % 60;
    var cs = Math.floor((ms % 1000) / 10);
    return (m < 10 ? '0' : '') + m + ':' + (ss < 10 ? '0' : '') + ss + '.' + (cs < 10 ? '0' : '') + cs;
  }

  function updateStatus() {
    elSteps.textContent = steps;
    elTimer.textContent = fmt(elapsed);
    elFlag.textContent = Core.isSolved(state) ? '已还原' : (scrambled ? '已打乱' : '就绪');
    elFlag.className = Core.isSolved(state) ? 'flag ok' : 'flag';
  }

  function afterMove(move, manual) {
    if (manual) {
      steps++;
      history.push(move);
      if (scrambled && !timerRunning) {
        timerRunning = true;
        startTime = performance.now() - elapsed;
      }
      updateStatus();
      if (scrambled && !winShown && Core.isSolved(state)) {
        winShown = true;
        timerRunning = false;
        showNote('恭喜还原成功！步数 ' + steps + ' · 用时 ' + fmt(elapsed));
      }
    }
  }

  function showNote(text) {
    elNote.textContent = text;
    elNote.classList.add('show');
    clearTimeout(showNote._t);
    showNote._t = setTimeout(function () { elNote.classList.remove('show'); }, 4200);
  }

  function doShuffle() {
    if (blockInput || animating) return;
    blockInput = true;
    scrambled = true;
    winShown = false;
    timerRunning = false;
    elapsed = 0;
    steps = 0;
    history = [];
    elNote.classList.remove('show');
    var moves = Core.scramble(22);
    for (var i = 0; i < moves.length; i++) history.push(moves[i]);
    updateStatus();
    enqueueBatch(moves, { dur: 85 }, function () {
      blockInput = false;
      elapsed = 0;
      updateStatus();
      flashHint();
    });
  }

  function doSolve() {
    if (blockInput || animating) return;
    if (Core.isSolved(state)) { showNote('魔方已是还原状态'); return; }
    blockInput = true;
    timerRunning = false;
    var sol = Core.solve(history);
    if (!sol.length) { blockInput = false; return; }
    showNote('自动还原中…共 ' + sol.length + ' 步');
    enqueueBatch(sol, { dur: 130 }, function () {
      history = [];
      steps = 0;
      scrambled = false;
      blockInput = false;
      updateStatus();
    });
  }

  function doReset() {
    if (blockInput || animating) return;
    for (var i = history.length - 1; i >= 0; i--) {
      Core.applyRotation(state, Core.negate(history[i]));
    }
    syncAll();
    history = [];
    steps = 0;
    scrambled = false;
    winShown = false;
    timerRunning = false;
    elapsed = 0;
    updateStatus();
    showNote('已瞬间复原');
  }

  function doResetView() {
    azTarget = 0.62; polTarget = 1.02; distTarget = 7.4;
    target.set(0, 0, 0);
  }

  function flashHint() {
    elNote.textContent = '拖动贴纸转层 · 拖动空白转视角 · 右键/双指拖动移动魔方 · 滚轮缩放';
    elNote.classList.add('show');
    clearTimeout(flashHint._t);
    flashHint._t = setTimeout(function () { elNote.classList.remove('show'); }, 2800);
  }

  var raycaster = new THREE.Raycaster();

  function getNDC(ev) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: ((ev.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((ev.clientY - rect.top) / rect.height) * 2 + 1
    };
  }

  function applyOri(ori, v) {
    var x = ori[0][0] * v.x + ori[0][1] * v.y + ori[0][2] * v.z;
    var y = ori[1][0] * v.x + ori[1][1] * v.y + ori[1][2] * v.z;
    var z = ori[2][0] * v.x + ori[2][1] * v.y + ori[2][2] * v.z;
    return new THREE.Vector3(Math.round(x), Math.round(y), Math.round(z)).normalize();
  }

  function decideMove(ci, localNormal, dxPx, dyPx) {
    var c = state.cubies[ci];
    var n = applyOri(c.ori, localNormal);
    var comps = [Math.abs(n.x), Math.abs(n.y), Math.abs(n.z)];
    var nAxis = comps[0] >= comps[1] && comps[0] >= comps[2] ? 0 : comps[1] >= comps[2] ? 1 : 2;
    var other = [0, 1, 2].filter(function (k) { return k !== nAxis; });
    var a1 = other[0];
    var a2 = other[1];
    var unit = function (idx) {
      var v = new THREE.Vector3();
      v.setComponent(idx, 1);
      return v;
    };
    var a1u = unit(a1);
    var a2u = unit(a2);
    camera.updateMatrixWorld(true);
    var right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
    var up = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 1);
    var disp = right.multiplyScalar(dxPx).add(up.multiplyScalar(-dyPx));
    var p1 = disp.dot(a1u);
    var p2 = disp.dot(a2u);
    var motionUnit, motionSign, rotUnit, rotIdx;
    if (Math.abs(p1) >= Math.abs(p2)) {
      motionUnit = a1u; motionSign = p1 >= 0 ? 1 : -1; rotUnit = a2u; rotIdx = a2;
    } else {
      motionUnit = a2u; motionSign = p2 >= 0 ? 1 : -1; rotUnit = a1u; rotIdx = a1;
    }
    var pos = new THREE.Vector3(c.pos[0], c.pos[1], c.pos[2]);
    var layer = pos.getComponent(rotIdx);
    var lever = pos.clone();
    lever.setComponent(rotIdx, 0);
    var v = new THREE.Vector3().crossVectors(rotUnit, lever);
    var mDotV = motionUnit.dot(v);
    var dir = (mDotV >= 0 ? 1 : -1) * motionSign;
    var axisChar = rotIdx === 0 ? 'x' : rotIdx === 1 ? 'y' : 'z';
    return { axis: axisChar, layer: layer, dir: dir };
  }

  var pointers = new Map();
  var mode = null;
  var turnCtx = null;
  var orbitCtx = { x: 0, y: 0 };
  var panCtx = { x: 0, y: 0, ox: 0, oy: 0, oz: 0 };
  var pinchDist = 0;
  var pinchCenter = { x: 0, y: 0 };

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function panShift(px, py, into) {
    var k = dist * 0.0017;
    camera.updateMatrixWorld(true);
    var e = camera.matrixWorld.elements;
    var rx = e[0], ry = e[1], rz = e[2];
    var ux = e[4], uy = e[5], uz = e[6];
    var ox = (rx * px + ux * (-py)) * k;
    var oy = (ry * px + uy * (-py)) * k;
    var oz = (rz * px + uz * (-py)) * k;
    into.set(
      clamp(into.x + ox, -PAN_LIMIT, PAN_LIMIT),
      clamp(into.y + oy, -PAN_LIMIT, PAN_LIMIT),
      clamp(into.z + oz, -PAN_LIMIT, PAN_LIMIT)
    );
  }

  function dist2() {
    var arr = Array.from(pointers.values());
    if (arr.length < 2) return 0;
    var dx = arr[0].x - arr[1].x;
    var dy = arr[0].y - arr[1].y;
    return Math.hypot(dx, dy);
  }

  function onDown(ev) {
    canvas.setPointerCapture && canvas.setPointerCapture(ev.pointerId);
    pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pointers.size === 2) {
      mode = 'pinch';
      pinchDist = dist2();
      var c = Array.from(pointers.values());
      pinchCenter.x = (c[0].x + c[1].x) / 2;
      pinchCenter.y = (c[0].y + c[1].y) / 2;
      return;
    }
    var forcePan = (ev.button === 2) || (ev.button === 0 && ev.shiftKey) || ev.ctrlKey;
    var forceOrbit = (ev.button === 1);
    if (forcePan) {
      mode = 'pan';
      panCtx.x = ev.clientX; panCtx.y = ev.clientY;
      panCtx.ox = target.x; panCtx.oy = target.y; panCtx.oz = target.z;
      return;
    }
    if (!forceOrbit && !blockInput) {
      var ndc = getNDC(ev);
      raycaster.setFromCamera(ndc, camera);
      var hits = raycaster.intersectObjects(pickables, false);
      if (hits.length) {
        var h = hits[0];
        mode = 'turn';
        turnCtx = { ci: h.object.userData.ci, ln: h.object.userData.localNormal, x0: ev.clientX, y0: ev.clientY, resolved: false };
        return;
      }
    }
    mode = 'orbit';
    orbitCtx.x = ev.clientX;
    orbitCtx.y = ev.clientY;
  }

  function onMove(ev) {
    if (pointers.has(ev.pointerId)) pointers.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (mode === 'pinch') {
      var c = Array.from(pointers.values());
      if (c.length >= 2) {
        var cx = (c[0].x + c[1].x) / 2;
        var cy = (c[0].y + c[1].y) / 2;
        panShift(cx - pinchCenter.x, cy - pinchCenter.y, target);
        pinchCenter.x = cx; pinchCenter.y = cy;
        var d = dist2();
        if (pinchDist > 0 && d > 0) distTarget = clamp(distTarget * (pinchDist / d), 4.5, 12);
        pinchDist = d;
      }
      return;
    }
    if (mode === 'pan') {
      target.set(panCtx.ox, panCtx.oy, panCtx.oz);
      panShift(ev.clientX - panCtx.x, ev.clientY - panCtx.y, target);
      return;
    }
    if (mode === 'orbit') {
      var dx = ev.clientX - orbitCtx.x;
      var dy = ev.clientY - orbitCtx.y;
      orbitCtx.x = ev.clientX;
      orbitCtx.y = ev.clientY;
      azTarget -= dx * 0.006;
      polTarget = clamp(polTarget - dy * 0.006, 0.18, Math.PI - 0.18);
      return;
    }
    if (mode === 'turn' && turnCtx && !turnCtx.resolved) {
      var tx = ev.clientX - turnCtx.x0;
      var ty = ev.clientY - turnCtx.y0;
      if (Math.hypot(tx, ty) > THRESHOLD_PX) {
        turnCtx.resolved = true;
        var mv = decideMove(turnCtx.ci, turnCtx.ln, tx, ty);
        if (mv) enqueue(mv, { manual: true, dur: 165 });
      }
    }
  }

  function onUp(ev) {
    pointers.delete(ev.pointerId);
    if (pointers.size === 1) {
      var arr = Array.from(pointers.values());
      mode = 'orbit';
      orbitCtx.x = arr[0].x;
      orbitCtx.y = arr[0].y;
    } else if (pointers.size === 0) {
      mode = null;
      turnCtx = null;
    }
  }

  canvas.addEventListener('pointerdown', onDown);
  canvas.addEventListener('pointermove', onMove);
  canvas.addEventListener('pointerup', onUp);
  canvas.addEventListener('pointercancel', onUp);
  canvas.addEventListener('pointerleave', onUp);
  canvas.addEventListener('contextmenu', function (e) { e.preventDefault(); });
  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    distTarget = clamp(distTarget * (1 + e.deltaY * 0.0012), 4.5, 12);
  }, { passive: false });

  document.getElementById('btn-shuffle').addEventListener('click', doShuffle);
  document.getElementById('btn-solve').addEventListener('click', doSolve);
  document.getElementById('btn-reset').addEventListener('click', doReset);
  document.getElementById('btn-view').addEventListener('click', doResetView);

  var faceWrap = document.getElementById('faces');
  var FACE_LABEL = { U: '上', D: '下', F: '前', B: '后', R: '右', L: '左' };
  for (var fi = 0; fi < Core.LETTERS.length; fi++) {
    (function (L) {
      var btn = document.createElement('button');
      btn.className = 'face-btn';
      btn.innerHTML = '<b>' + L + '</b><i>' + FACE_LABEL[L] + '</i>';
      btn.title = '转动 ' + L + ' 面（按住 Shift 反向）';
      btn.addEventListener('click', function (ev) {
        if (blockInput) return;
        enqueue(Core.standardMove(L, ev.shiftKey), { manual: true, dur: 165 });
      });
      faceWrap.appendChild(btn);
    })(Core.LETTERS[fi]);
  }

  window.addEventListener('keydown', function (ev) {
    var k = (ev.key || '').toUpperCase();
    if (Core.LETTERS.indexOf(k) !== -1) {
      if (document.activeElement && /INPUT|TEXTAREA/.test(document.activeElement.tagName)) return;
      ev.preventDefault();
      if (blockInput) return;
      enqueue(Core.standardMove(k, ev.shiftKey), { manual: true, dur: 165 });
    }
  });

  setInterval(function () {
    if (timerRunning) {
      elapsed = performance.now() - startTime;
      elTimer.textContent = fmt(elapsed);
    }
  }, 47);

  build();
  resize();
  updateCamera();
  updateStatus();

  var last = performance.now();
  function loop() {
    var now = performance.now();
    var dt = (now - last) / 1000;
    last = now;
    var k = Math.min(1, dt * 12);
    az += (azTarget - az) * k;
    pol += (polTarget - pol) * k;
    dist += (distTarget - dist) * k;
    updateCamera();
    renderer.render(scene, camera);
    requestAnimationFrame(loop);
  }
  loop();
})();

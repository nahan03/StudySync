/* Painted, gently animated backgrounds you can play with:
     Flashcards  -> night train   (tap the card stack to flip a card)
     Practice    -> rainy exam hall (tap a green lamp to switch it)
     Library     -> owl library   (the owl watches your mouse; tap it to open the coach)
     Study page  -> rainy night café, when chosen in Appearance (tap the espresso machine). Every few minutes it
                    drifts to another view of the café (cafe_views.js); the button in the corner skips ahead.
   Drawn on <canvas id="st-scene">: data-scene picks the scene, or the Study background "cafe". */
(function () {
  var cv = document.getElementById('st-scene');
  if (!cv) return;
  var root = document.getElementById('st-root'), ctx = cv.getContext('2d');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, DPR = 1, S = 1, LM = 0, RM = 0, st = null, sceneId = '', running = false, last = 0, lastFrame = 0, t0 = performance.now();

  /* ───────── painting helpers ───────── */
  function R(seed) { var s = seed % 2147483647 || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function off(w, h) { var c = document.createElement('canvas'); w = w || W; h = h || H; c.width = Math.round(w * DPR); c.height = Math.round(h * DPR); var x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return [c, x]; }
  function lg(x, x0, y0, x1, y1, stops) { var g = x.createLinearGradient(x0, y0, x1, y1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rg(x, cx, cy, r0, r1, stops) { var g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); stops.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function glow(x, cx, cy, r, col, a) { if (r <= 0) return; x.fillStyle = rg(x, cx, cy, 0, r, [[0, col.replace('A', a)], [1, col.replace('A', 0)]]); x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
  var WARM = 'rgba(255,207,134,A)';
  function wood(x, X, Y, w, h, c1, c2, r, vertical) {
    x.fillStyle = lg(x, X, Y, vertical ? X + w : X, vertical ? Y : Y + h, [[0, c1], [1, c2]]); x.fillRect(X, Y, w, h);
    x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip(); x.globalAlpha = .16;
    for (var i = 0; i < (vertical ? w : h) / 2.5; i++) { x.strokeStyle = r() < .5 ? '#000' : '#ffdcaa'; x.lineWidth = .5 + r(); x.beginPath(); var p = (vertical ? X : Y) + r() * (vertical ? w : h), a = 1 + r() * 3, len = vertical ? h : w;
      for (var k = 0; k <= len; k += 16) { var o = Math.sin(k / (50 + r() * 30) + i) * a; if (vertical) x.lineTo(p + o, Y + k); else x.lineTo(X + k, p + o); } x.stroke(); }
    x.restore(); x.globalAlpha = 1;
  }
  function shadow(x, cx, cy, rx, ry, a) { x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.fillStyle = rg(x, 0, 0, 0, rx, [[0, 'rgba(0,0,0,' + (a || .45) + ')'], [1, 'rgba(0,0,0,0)']]); x.beginPath(); x.arc(0, 0, rx, 0, 7); x.fill(); x.restore(); }
  function lighting(x, lights, base) {
    var o = off(), d = o[1]; d.fillStyle = 'rgba(10,7,14,' + base + ')'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    lights.forEach(function (l) { var a = l[3] || .9; d.fillStyle = rg(d, l[0], l[1], 0, l[2], [[0, 'rgba(0,0,0,' + a + ')'], [.5, 'rgba(0,0,0,' + a * .5 + ')'], [1, 'rgba(0,0,0,0)']]); d.fillRect(l[0] - l[2], l[1] - l[2], l[2] * 2, l[2] * 2); });
    x.drawImage(o[0], 0, 0, W, H);
    x.fillStyle = rg(x, W / 2, H * .45, Math.min(W, H) * .3, Math.max(W, H) * .8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.5)']]); x.fillRect(0, 0, W, H);
    return o[0];
  }
  function books(x, X, Y, w, h, r) {
    var cols = ['#7a2f2a', '#2f4a5e', '#55602e', '#8a5a2b', '#4a3a66', '#9c6f22', '#2e5a52', '#6a3040', '#c0a070'], px = X;
    while (px < X + w - 6 * S) { var bw = (6 + r() * 9) * S, bh = h * (.6 + r() * .38), c = cols[Math.floor(r() * cols.length)];
      x.fillStyle = lg(x, px, 0, px + bw, 0, [[0, c], [.7, c], [1, 'rgba(0,0,0,.6)']]); x.fillRect(px, Y + h - bh, bw, bh);
      x.fillStyle = 'rgba(255,215,150,.32)'; x.fillRect(px, Y + h - bh * .8, bw, 1.4 * S); x.fillRect(px, Y + h - bh * .3, bw, 1.4 * S); px += bw + .6; }
  }
  function shelf(x, X, Y, w, h, n, r) {
    wood(x, X, Y, w, h, '#3a2716', '#2a1c10', r, true); var sh = h / n;
    for (var i = 0; i < n; i++) { var y = Y + i * sh; x.fillStyle = '#140d07'; x.fillRect(X + 8 * S, y + 6 * S, w - 16 * S, sh - 16 * S); books(x, X + 10 * S, y + 6 * S, w - 20 * S, sh - 16 * S, r); wood(x, X, y + sh - 10 * S, w, 10 * S, '#5a3d24', '#3a2716', r); }
  }
  function card(x, cx, cy, w, h, rot, text, back) {
    x.save(); x.translate(cx, cy); x.rotate(rot);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(-w / 2 + 3 * S, -h / 2 + 5 * S, w, h);
    x.fillStyle = back ? '#eef4ea' : '#f6efdf'; x.fillRect(-w / 2, -h / 2, w, h);
    x.fillStyle = 'rgba(200,70,60,.7)'; x.fillRect(-w / 2, -h / 2 + h * .2, w, 1.4 * S);
    x.fillStyle = 'rgba(80,120,180,.25)'; for (var y = -h / 2 + h * .36; y < h / 2 - 2; y += h * .14) x.fillRect(-w / 2, y, w, 1);
    if (text) { x.fillStyle = back ? '#2a5a3a' : '#2a2a2a'; x.textAlign = 'center'; x.textBaseline = 'middle'; var fs = h * .2; x.font = Math.round(fs) + 'px Kalam, Caveat, cursive';
      while (fs > 7 && x.measureText(text).width > w * .9) { fs -= 1; x.font = Math.round(fs) + 'px Kalam, Caveat, cursive'; } x.fillText(text, 0, h * .1); x.textBaseline = 'alphabetic'; }
    x.restore();
  }
  function steam(x, sx, sy, t, s, a) { for (var k = 0; k < 3; k++) { var ph = (t * .35 + k / 3) % 1; x.strokeStyle = 'rgba(255,240,220,' + ((a || .22) * (1 - ph)) + ')'; x.lineWidth = 3 * s; x.lineCap = 'round'; x.beginPath();
    for (var y = 0; y < 40; y += 4) x.lineTo(sx + (k - 1) * 8 * s + Math.sin(y * .15 + t * 2 + k) * 5 * s, sy - 6 * s - ph * 30 * s - y * s); x.stroke(); } }
  function motes(n, r, area) { var a = []; for (var i = 0; i < n; i++) a.push({ x: area[0] + r() * area[2], y: area[1] + r() * area[3], r: .6 + r() * 1.6, vx: (r() - .5) * 6, vy: -1 - r() * 5, p: r() * 6 }); return a; }
  function drawMotes(x, list, dt, t, area) { list.forEach(function (m) { m.x += m.vx * dt; m.y += m.vy * dt; if (m.y < area[1]) m.y = area[1] + area[3]; if (m.x < area[0]) m.x = area[0] + area[2]; if (m.x > area[0] + area[2]) m.x = area[0];
    x.globalAlpha = .2 + .45 * (Math.sin(t * 1.4 + m.p) * .5 + .5); x.fillStyle = '#FFE2A8'; x.beginPath(); x.arc(m.x, m.y, m.r, 0, 7); x.fill(); }); x.globalAlpha = 1; }
  function inside(px, py, b) { return b && px >= b[0] && px <= b[0] + b[2] && py >= b[1] && py <= b[1] + b[3]; }
  function rain(n, r, area) { return motes(n, r, area).map(function (m) { m.v = 380 + r() * 220; return m; }); }
  /* clear night, rain or snow: a different one each time a page opens */
  var WEATHER = (function () { var list = ['clear', 'rain', 'snow']; try { var n = parseInt(localStorage.getItem('studySyncSceneWeather') || '0', 10) || 0; localStorage.setItem('studySyncSceneWeather', String(n + 1)); return list[n % 3]; } catch (e) { return list[Math.floor(Math.random() * 3)]; } })();
  window.ssSceneWeather = function (w) { WEATHER = w; };
  function skyGrad(x, y0, h) {
    return WEATHER === 'snow' ? lg(x, 0, y0, 0, y0 + h, [[0, '#1e2840'], [1, '#4a5672']])
      : WEATHER === 'rain' ? lg(x, 0, y0, 0, y0 + h, [[0, '#080c16'], [1, '#1a2030']])
      : lg(x, 0, y0, 0, y0 + h, [[0, '#070c1c'], [.7, '#16223c'], [1, '#2a2a40']]);
  }
  function skyStars(r, n) { var a = []; for (var i = 0; i < n; i++) a.push([r(), r() * .6, r()]); return a; }
  function drawStars(x, list, b, t) { if (WEATHER !== 'clear') return; list.forEach(function (s2) { x.globalAlpha = .4 + .5 * Math.sin(t + s2[2] * 9); x.fillStyle = '#fff'; x.fillRect(b[0] + s2[0] * b[2], b[1] + s2[1] * b[3], 1.4, 1.4); }); x.globalAlpha = 1; }
  function drawMoon(x, cx, cy, r) { if (WEATHER === 'rain') return; var a = WEATHER === 'snow' ? .45 : 1; glow(x, cx, cy, r * 4, 'rgba(235,240,255,A)', .3 * a); x.globalAlpha = a; x.fillStyle = '#eef0ff'; x.beginPath(); x.arc(cx, cy, r, 0, 7); x.fill(); x.globalAlpha = 1; }
  /* rain or snow falling across a window b = [x, y, w, h]; wind > 0 blows it to the left (the train adds its speed) */
  function drawWeather(x, list, b, dt, t, wind) {
    wind = wind || 0;
    if (WEATHER === 'rain') {
      x.strokeStyle = 'rgba(190,210,255,.32)'; x.lineWidth = 1; x.beginPath();
      list.forEach(function (d) { d.y += d.v * dt; d.x -= wind * d.v * dt; if (d.y > b[1] + b[3]) { d.y = b[1] - 20; d.x = b[0] + Math.random() * b[2] * (1 + wind); } if (d.x < b[0] - 30) d.x += b[2]; x.moveTo(d.x, d.y); x.lineTo(d.x + wind * 14 * S, d.y - 14 * S); });
      x.stroke();
    } else if (WEATHER === 'snow') {
      x.fillStyle = 'rgba(240,244,255,.85)';
      list.forEach(function (d) { d.y += (26 + d.p * 7) * dt * (1 + wind * .4); d.x += (Math.sin(t + d.p) * 12 - wind * 330) * dt; if (d.y > b[1] + b[3]) { d.y = b[1] - 4; d.x = b[0] + Math.random() * b[2]; } if (d.x < b[0]) d.x += b[2]; if (d.x > b[0] + b[2]) d.x -= b[2]; x.beginPath(); x.arc(d.x, d.y, 1 + d.p * .25, 0, 7); x.fill(); });
    }
  }


  /* draw something on a small canvas, shade it with the room's darkness, then put it in the scene */
  var shadeCache = {};
  function shaded(x, key, bx, by, bw, bh, alpha, dark, fn, blur) {
    bx = Math.floor(bx); by = Math.floor(by); bw = Math.max(1, Math.ceil(bw)); bh = Math.max(1, Math.ceil(bh));
    var c = shadeCache[key] || (shadeCache[key] = document.createElement('canvas'));
    if (c.width !== Math.round(bw * DPR) || c.height !== Math.round(bh * DPR)) { c.width = Math.round(bw * DPR); c.height = Math.round(bh * DPR); }
    var g = c.getContext('2d'); g.setTransform(DPR, 0, 0, DPR, 0, 0); g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1; g.clearRect(0, 0, bw, bh);
    g.save(); g.translate(-bx, -by); fn(g); g.restore();
    g.globalCompositeOperation = 'source-atop'; g.globalAlpha = alpha; g.drawImage(dark, -bx, -by, W, H); g.globalAlpha = 1; g.globalCompositeOperation = 'source-over';
    if (blur) x.filter = 'blur(' + blur + 'px)'; x.drawImage(c, bx, by, bw, bh); if (blur) x.filter = 'none';
  }
  /* little sound effects (only ever after a tap, so the browser allows them) */
  var actx = null;
  function sfx(kind) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)(); if (actx.state === 'suspended') actx.resume();
      var now = actx.currentTime, out = actx.createGain(); out.gain.value = .22; out.connect(actx.destination);
      if (kind === 'steam') {
        var len = 1.7, buf = actx.createBuffer(1, Math.floor(actx.sampleRate * len), actx.sampleRate), d = buf.getChannelData(0);
        for (var i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        var src = actx.createBufferSource(); src.buffer = buf; var hp = actx.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 2600;
        var g = actx.createGain(); g.gain.setValueAtTime(0, now); g.gain.linearRampToValueAtTime(.45, now + .08); g.gain.exponentialRampToValueAtTime(.001, now + len);
        src.connect(hp); hp.connect(g); g.connect(out); src.start(now); src.stop(now + len);
      }
      if (kind === 'steam' || kind === 'clink') {
        var at = kind === 'steam' ? now + 1.9 : now;
        [2900, 4300, 6100].forEach(function (f, k) { var o = actx.createOscillator(), gg = actx.createGain(); o.frequency.value = f; gg.gain.setValueAtTime(.14 / (k + 1), at); gg.gain.exponentialRampToValueAtTime(.0001, at + .45); o.connect(gg); gg.connect(out); o.start(at); o.stop(at + .5); });
      }
      if (kind === 'buzz') { var o2 = actx.createOscillator(), g2 = actx.createGain(); o2.type = 'sawtooth'; o2.frequency.value = 118; g2.gain.setValueAtTime(.06, now); g2.gain.exponentialRampToValueAtTime(.0001, now + .45); o2.connect(g2); g2.connect(out); o2.start(now); o2.stop(now + .5); }
    } catch (e) { /* no sound available */ }
  }
  function anyMusic() { var a = document.getElementById('gmp-audio'); return !!((window.SSMixer && window.SSMixer.isPlaying()) || (a && !a.paused)); }

  /* ── café people ──
     Drawn with a small figure kit so they belong in the painted room: real proportions (a standing adult is
     about 270 units, a unit is S), tapered limbs shaded across their width, two-bone arms and legs solved with ik(),
     soft cloth gradients and quiet profile faces. Every pose is a set of targets that the hands, head and body
     ease toward, so all movement is smooth. */
  var SKIN = ['#c99272', '#7a4c36'], SKIN_D = ['#8e5c42', '#4a2c1e'], SKIN_B = ['#9a6446', '#55331f'], SKIN_C = ['#e2b796', '#9c7052'];
  function mix(a, b, k) { return a + (b - a) * k; }
  function smooth(k) { k = Math.max(0, Math.min(1, k)); return k * k * (3 - 2 * k); }
  function mixP(a, b, k) { k = smooth(k); return [mix(a[0], b[0], k), mix(a[1], b[1], k)]; }
  function ease(cur, to, dt, rate) { return cur + (to - cur) * Math.min(1, dt * (rate || 6)); }
  function ease2(p, to, dt, rate) { p[0] = ease(p[0], to[0], dt, rate); p[1] = ease(p[1], to[1], dt, rate); return p; }
  /* two-bone solver: shoulder (or hip) -> elbow (knee) -> wrist (ankle); bend +1 / -1 picks the side the joint goes */
  function ik(sx, sy, tx, ty, a, b, bend) {
    var dx = tx - sx, dy = ty - sy, d = Math.max(.01, Math.min(Math.hypot(dx, dy), a + b - .01)), an = Math.atan2(dy, dx);
    var c = Math.acos(Math.max(-1, Math.min(1, (a * a + d * d - b * b) / (2 * a * d)))), e = an + bend * c;
    return [sx + Math.cos(e) * a, sy + Math.sin(e) * a, sx + Math.cos(an) * d, sy + Math.sin(an) * d];
  }
  /* a tapered, round-ended segment, lit on its upper side */
  function seg(g, x1, y1, x2, y2, w1, w2, c1, c2) {
    var dx = x2 - x1, dy = y2 - y1, l = Math.hypot(dx, dy) || 1, nx = -dy / l, ny = dx / l, an = Math.atan2(dy, dx), m = Math.max(w1, w2) / 2;
    var lx = nx, ly = ny; if (lx * -.45 + ly * -.9 < 0) { lx = -lx; ly = -ly; }
    var mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
    g.fillStyle = c2 ? lg(g, mx + lx * m, my + ly * m, mx - lx * m, my - ly * m, [[0, c1], [.45, c1], [1, c2]]) : c1;
    g.beginPath(); g.moveTo(x1 + nx * w1 / 2, y1 + ny * w1 / 2); g.lineTo(x2 + nx * w2 / 2, y2 + ny * w2 / 2);
    g.arc(x2, y2, w2 / 2, an + Math.PI / 2, an - Math.PI / 2, true); g.lineTo(x1 - nx * w1 / 2, y1 - ny * w1 / 2);
    g.arc(x1, y1, w1 / 2, an - Math.PI / 2, an + Math.PI / 2, true); g.fill();
  }
  /* an arm to a hand target; kind: 'long' sleeve, 'rolled' to the elbow, 'tee' short sleeve. Returns [elbow, wrist, hand] */
  function arm(g, sx, sy, hx, hy, u, bend, cloth, skin, kind) {
    var j = ik(sx, sy, hx, hy, 48 * u, 44 * u, bend), ex = j[0], ey = j[1], wx = j[2], wy = j[3], bare = kind !== 'long';
    if (kind === 'tee') { seg(g, sx, sy, ex, ey, 12.5 * u, 10 * u, skin[0], skin[1]); seg(g, sx, sy, mix(sx, ex, .45), mix(sy, ey, .45), 16 * u, 15 * u, cloth[0], cloth[1]); }
    else seg(g, sx, sy, ex, ey, 15 * u, 12.5 * u, cloth[0], cloth[1]);
    seg(g, ex, ey, wx, wy, bare ? 10.5 * u : 12.5 * u, bare ? 7.5 * u : 10 * u, bare ? skin[0] : cloth[0], bare ? skin[1] : cloth[1]);
    if (kind === 'rolled') seg(g, ex, ey, mix(ex, wx, .2), mix(ey, wy, .2), 14 * u, 13 * u, cloth[0], cloth[1]);
    var a = Math.atan2(wy - ey, wx - ex), hx2 = wx + Math.cos(a) * 4 * u, hy2 = wy + Math.sin(a) * 4 * u;
    g.fillStyle = skin[0]; g.beginPath(); g.ellipse(hx2, hy2, 6.6 * u, 4.6 * u, a, 0, 7); g.fill();
    g.fillStyle = skin[1]; g.globalAlpha = .45; g.beginPath(); g.ellipse(hx2 - Math.sin(a) * 1.6 * u, hy2 + Math.cos(a) * 1.6 * u, 5 * u, 2.2 * u, a, 0, 7); g.fill(); g.globalAlpha = 1;
    return [ex, ey, wx, wy, hx2, hy2];
  }
  function shoe(g, ax, ay, u, lift) {
    g.save(); g.translate(ax, ay); g.rotate(-lift * .35);
    g.fillStyle = lg(g, 0, -4 * u, 0, 6 * u, [[0, '#2a2420'], [1, '#0a0908']]); g.beginPath(); g.moveTo(-6 * u, -3 * u); g.lineTo(7 * u, -3.5 * u);
    g.quadraticCurveTo(18 * u, -1 * u, 18.5 * u, 4 * u); g.lineTo(-6.5 * u, 5 * u); g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,220,180,.12)'; g.fillRect(-5 * u, -3 * u, 14 * u, 1.2 * u); g.restore();
  }
  function mug(g, x, y, u, col, tilt) {   /* (x, y) = bottom centre */
    g.save(); g.translate(x, y); g.rotate(tilt || 0);
    g.strokeStyle = col[1]; g.lineWidth = 2.2 * u; g.beginPath(); g.arc(6.5 * u, -6.5 * u, 3.6 * u, -1.4, 1.4); g.stroke();
    g.fillStyle = lg(g, -6 * u, 0, 6 * u, 0, [[0, col[1]], [.35, col[0]], [.5, 'rgba(255,248,236,.9)'], [.62, col[0]], [1, col[1]]]); rr(g, -6 * u, -13 * u, 12 * u, 13 * u, [1, 1, 3.5 * u, 3.5 * u]); g.fill();
    g.fillStyle = '#3a2010'; g.beginPath(); g.ellipse(0, -13 * u, 5.4 * u, 1.3 * u, 0, 0, 7); g.fill(); g.restore();
  }
  /* the side away from the light falls into shadow */
  function sideShade(g, x0, x1, y0, y1, litRight) {
    g.save(); g.globalCompositeOperation = 'source-atop';
    g.fillStyle = lg(g, x0, 0, x1, 0, litRight ? [[0, 'rgba(10,6,4,.5)'], [.55, 'rgba(10,6,4,.1)'], [1, 'rgba(255,210,150,.12)']] : [[0, 'rgba(255,210,150,.12)'], [.45, 'rgba(10,6,4,.1)'], [1, 'rgba(10,6,4,.5)']]);
    g.fillRect(x0, y0, x1 - x0, y1 - y0); g.restore();
  }
  /* a head in profile looking +x, centred on (0,0), about 26 units tall at u = 1 */
  function profileHead(g, u, skin) {
    g.fillStyle = skin; g.beginPath();
    g.moveTo(-9 * u, -6 * u); g.bezierCurveTo(-10 * u, -15 * u, -1 * u, -14 * u, 7 * u, -10 * u);
    g.bezierCurveTo(9 * u, -8 * u, 10 * u, -5 * u, 10 * u, -3 * u); g.lineTo(12.5 * u, 1.5 * u); g.lineTo(10.2 * u, 2.6 * u);
    g.quadraticCurveTo(11 * u, 4.5 * u, 10 * u, 5.4 * u); g.quadraticCurveTo(10.6 * u, 6.6 * u, 9.6 * u, 7.4 * u);
    g.quadraticCurveTo(9 * u, 10.5 * u, 4.5 * u, 11.5 * u); g.lineTo(-1 * u, 10 * u); g.quadraticCurveTo(-8 * u, 6 * u, -9 * u, -6 * u); g.fill();
    g.fillStyle = 'rgba(120,60,40,.35)'; g.beginPath(); g.ellipse(-1 * u, 1 * u, 2 * u, 3 * u, .2, 0, 7); g.fill();   /* ear */
  }
  /* a whole head: skin, a quiet eye and brow, hair in one of a few styles, glasses or a beanie */
  function head(g, x, y, u, o, tilt) {
    var h = u * 1.45; g.save(); g.translate(x, y); g.rotate(tilt || 0);
    var hair = lg(g, -10 * h, -16 * h, 8 * h, 8 * h, [[0, o.hair[0]], [1, o.hair[1]]]);
    if (o.style === 'long') { g.fillStyle = hair; g.beginPath(); g.moveTo(-3 * h, -9 * h); g.bezierCurveTo(-15 * h, -7 * h, -14 * h, 13 * h, -12 * h, 21 * h); g.quadraticCurveTo(-6 * h, 24 * h, -1 * h, 20 * h); g.quadraticCurveTo(-4 * h, 10 * h, -2 * h, 2 * h); g.fill(); }
    profileHead(g, h, lg(g, -9 * h, 0, 12 * h, 0, [[0, o.skin[1]], [.55, o.skin[0]], [1, o.skin[0]]]));
    g.fillStyle = 'rgba(255,160,120,.12)'; g.beginPath(); g.arc(5 * h, 3.4 * h, 3.4 * h, 0, 7); g.fill();   /* warm cheek */
    g.fillStyle = '#1c120c'; g.beginPath(); g.ellipse(6.9 * h, -2.2 * h, 1.15 * h, (o.down ? .28 : .72) * h, 0, 0, 7); g.fill();
    g.strokeStyle = 'rgba(40,20,10,.55)'; g.lineWidth = .7 * h; g.beginPath(); g.moveTo(5.5 * h, -3 * h); g.quadraticCurveTo(6.9 * h, -3.6 * h, 8.2 * h, -2.8 * h); g.stroke();   /* lid */
    g.strokeStyle = o.hair[1]; g.lineWidth = 1.1 * h; g.beginPath(); g.moveTo(4.6 * h, -5.2 * h); g.quadraticCurveTo(7 * h, -6.4 * h, 9.2 * h, -5.3 * h); g.stroke();   /* brow */
    g.strokeStyle = 'rgba(90,40,30,.55)'; g.lineWidth = .6 * h; g.beginPath(); g.moveTo(9.2 * h, 5.6 * h); g.lineTo(10.3 * h, 5.5 * h); g.stroke();   /* mouth */
    g.fillStyle = hair;
    if (o.style === 'beanie') {
      g.beginPath(); g.moveTo(-10.6 * h, 5 * h); g.quadraticCurveTo(-12 * h, -1 * h, -9 * h, -3 * h); g.lineTo(-4 * h, -2 * h); g.quadraticCurveTo(-5 * h, 2 * h, -4.5 * h, 6 * h); g.fill();   /* hair under the hat */
      g.fillStyle = lg(g, -12 * h, -18 * h, 10 * h, 0, [[0, o.hat[0]], [1, o.hat[1]]]);
      g.beginPath(); g.moveTo(-11.8 * h, -.5 * h); g.bezierCurveTo(-13.5 * h, -19.5 * h, 8 * h, -21.5 * h, 10.2 * h, -7.6 * h); g.closePath(); g.fill();
      g.strokeStyle = o.hat[1]; g.lineWidth = 3.4 * h; g.beginPath(); g.moveTo(-11.4 * h, -1.6 * h); g.lineTo(9.6 * h, -8.2 * h); g.stroke();   /* folded brim */
      g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = .5 * h; for (var k = -9; k < 9; k += 2.2) { g.beginPath(); g.moveTo(k * h, -2.6 * h - (k + 9) * .3 * h); g.lineTo(k * h + .3 * h, -.4 * h - (k + 9) * .3 * h); g.stroke(); }
    } else {
      g.beginPath(); g.moveTo(-10.4 * h, 5 * h); g.bezierCurveTo(-15 * h, -15 * h, -1 * h, -21 * h, 9.4 * h, -9.2 * h);
      g.quadraticCurveTo(4 * h, -10.5 * h, 2 * h, -6 * h); g.quadraticCurveTo(1.5 * h, -2 * h, -2 * h, -2.4 * h); g.quadraticCurveTo(-4.5 * h, 1 * h, -4.5 * h, 6 * h); g.closePath(); g.fill();
      if (o.style === 'curly') for (var c = 0; c < 10; c++) { var an = (150 + c * 20) * Math.PI / 180; g.beginPath(); g.arc(-1 * h + Math.cos(an) * 10.5 * h, -4 * h + Math.sin(an) * 10.5 * h, 4.2 * h, 0, 7); g.fill(); }
      if (o.style === 'bun') { g.beginPath(); g.arc(-10 * h, -10.5 * h, 5 * h, 0, 7); g.fill(); g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = .8 * h; g.beginPath(); g.arc(-10 * h, -10.5 * h, 3 * h, 0, 7); g.stroke(); }
      g.strokeStyle = 'rgba(255,220,180,.2)'; g.lineWidth = .9 * h; g.beginPath(); g.moveTo(-6 * h, -12 * h); g.quadraticCurveTo(1 * h, -15.5 * h, 7 * h, -10.2 * h); g.stroke();   /* light on the hair */
    }
    if (o.glasses) { g.strokeStyle = '#1a120c'; g.lineWidth = .75 * h; rr(g, 4.6 * h, -4.5 * h, 5.6 * h, 4.2 * h, 1.6 * h); g.fillStyle = 'rgba(200,220,255,.12)'; g.fill(); g.stroke(); g.beginPath(); g.moveTo(4.6 * h, -2.6 * h); g.lineTo(-1 * h, -1.4 * h); g.stroke(); }
    g.restore();
  }

  /* the barista, behind the counter (base = the counter top); B holds her pose: face, walk, ph, hn/hf (hand targets), look, task */
  function drawBarista(g, px, base, u, t, B) {
    g.save(); g.translate(px, base); g.scale(B.face, 1);
    var br = Math.sin(t * 1.7) * .8 * u, bob = -Math.abs(Math.sin(B.ph * Math.PI * 2)) * 2.2 * u * B.walk, sy = -51 * u + br + bob;
    var tee = ['#3d3633', '#191513'], teeD = ['#28221f', '#0f0c0b'];
    arm(g, -6 * u, sy + 5 * u, B.hf[0], B.hf[1], u, 1, teeD, SKIN_D, 'tee');   /* far arm */
    g.fillStyle = lg(g, -19 * u, 0, 21 * u, 0, [[0, tee[1]], [.55, tee[0]], [1, tee[0]]]);
    g.beginPath(); g.moveTo(-15 * u, sy - 2 * u); g.quadraticCurveTo(-21 * u, sy + 30 * u, -17 * u, 60 * u); g.lineTo(16 * u, 60 * u);
    g.quadraticCurveTo(22 * u, sy + 36 * u, 18 * u, sy + 12 * u); g.quadraticCurveTo(16 * u, sy - 2 * u, 8 * u, sy - 5 * u); g.quadraticCurveTo(-4 * u, sy - 7 * u, -15 * u, sy - 2 * u); g.fill();
    g.fillStyle = lg(g, -4 * u, 0, 22 * u, 0, [[0, '#6a4e32'], [.6, '#a8865e'], [1, '#8e6e48']]);   /* canvas apron */
    g.beginPath(); g.moveTo(0, sy + 11 * u); g.lineTo(15 * u, sy + 10 * u); g.quadraticCurveTo(22 * u, sy + 32 * u, 20 * u, 60 * u); g.lineTo(-4 * u, 60 * u); g.quadraticCurveTo(-3 * u, sy + 32 * u, 0, sy + 11 * u); g.fill();
    g.strokeStyle = 'rgba(60,40,20,.55)'; g.lineWidth = .8 * u; g.beginPath(); g.moveTo(3 * u, sy + 38 * u); g.lineTo(20 * u, sy + 37 * u); g.stroke();
    g.strokeStyle = '#4a2e1a'; g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(2 * u, sy + 12 * u); g.quadraticCurveTo(-1 * u, sy + 3 * u, -3 * u, sy - 4 * u); g.stroke();   /* leather strap */
    seg(g, 1 * u, sy, 3.5 * u, sy - 13 * u, 12 * u, 10.5 * u, SKIN[0], SKIN[1]);
    head(g, 4 * u, sy - 27 * u, u, { skin: SKIN, hair: ['#3a2418', '#120a06'], style: 'bun', down: B.look > .55 }, -.04 + B.look * .24);
    var hn = arm(g, 8 * u, sy + 5 * u, B.hn[0], B.hn[1], u, 1, tee, SKIN, 'tee');   /* near arm */
    if (B.task === 'wipe' && B.walk < .5) { g.fillStyle = '#ddd4c2'; g.beginPath(); g.ellipse(hn[4], hn[5] + 2 * u, 9 * u, 3 * u, 0, 0, 7); g.fill(); }
    if (B.carry) mug(g, hn[4] + 2 * u, hn[5] + 6 * u, u, ['#efe7d8', '#a89c88']);
    g.restore();
  }

  /* the waiter, full height, walking with a tray (foot = the floor line); Wt: dir, wk (how much he is walking), ph (gait phase), look */
  function drawWaiter(g, px, foot, u, t, Wt) {
    var wk = Wt.wk, p = ((Wt.ph % 1) + 1) % 1, A = 24 * u * wk;
    g.save(); g.translate(px, foot); g.scale(Wt.dir, 1);
    shadow(g, 0, 0, 36 * u, 6 * u, .5);
    function footAt(q) { q = ((q % 1) + 1) % 1; if (q < .5) return [A - q / .5 * 2 * A, 0, 0]; var k = (q - .5) / .5; return [-A + 2 * A * smooth(k), -Math.sin(k * Math.PI) * 12 * u * wk, Math.sin(k * Math.PI) * wk]; }
    var hipY = -140 * u - 2.4 * u * wk * Math.cos(4 * Math.PI * p - Math.PI), fa = footAt(p), fb = footAt(p + .5);
    fa[0] += 6 * u * (1 - wk); fb[0] -= 5 * u * (1 - wk);
    function leg(f, c1, c2) { var j = ik(0, hipY, f[0], f[1] - 7 * u, 67 * u, 68 * u, -1); seg(g, 0, hipY, j[0], j[1], 19 * u, 14 * u, c1, c2); seg(g, j[0], j[1], j[2], j[3], 14 * u, 10 * u, c1, c2); shoe(g, j[2], j[3], u, f[2]); }
    leg(fb, '#1c1c22', '#09090c'); leg(fa, '#2c2c34', '#121216');
    g.save(); g.translate(0, hipY); g.rotate(.05 * wk); g.translate(0, -hipY);
    var sh = hipY - 80 * u, shirt = ['#f0e9dd', '#b3aa9c'], shirtD = ['#cfc7ba', '#8e8678'];
    var trayH = [36 * u, sh + 36 * u + Math.sin(p * 4 * Math.PI) * 1.2 * u * wk], th = arm(g, -3 * u, sh + 6 * u, trayH[0], trayH[1], u, 1, shirtD, SKIN_D, 'rolled');
    g.fillStyle = lg(g, -17 * u, 0, 19 * u, 0, [[0, shirt[1]], [.5, shirt[0]], [1, shirt[0]]]);
    g.beginPath(); g.moveTo(-15 * u, sh + 2 * u); g.quadraticCurveTo(-19 * u, hipY - 30 * u, -14 * u, hipY + 4 * u); g.lineTo(15 * u, hipY + 4 * u);
    g.quadraticCurveTo(19 * u, sh + 40 * u, 15 * u, sh + 4 * u); g.quadraticCurveTo(8 * u, sh - 4 * u, -15 * u, sh + 2 * u); g.fill();
    g.fillStyle = lg(g, -16 * u, 0, 18 * u, 0, [[0, '#0e0e12'], [.6, '#26262c'], [1, '#1c1c22']]);   /* waistcoat */
    g.beginPath(); g.moveTo(-15 * u, sh + 9 * u); g.quadraticCurveTo(-18 * u, hipY - 30 * u, -15 * u, hipY + 2 * u); g.lineTo(15 * u, hipY + 2 * u);
    g.quadraticCurveTo(18 * u, sh + 40 * u, 16 * u, sh + 22 * u); g.lineTo(8 * u, sh + 6 * u); g.lineTo(-2 * u, sh + 4 * u); g.closePath(); g.fill();
    g.fillStyle = '#9a8a62'; for (var b = 0; b < 3; b++) { g.beginPath(); g.arc(15.4 * u, sh + 32 * u + b * 12 * u, 1.1 * u, 0, 7); g.fill(); }
    var knee = Math.max(fa[0], fb[0]) * .35;   /* long bistro apron, swinging with the front knee */
    g.fillStyle = lg(g, -14 * u, 0, 22 * u, 0, [[0, '#0a0a0c'], [.6, '#1e1e22'], [1, '#141418']]);
    g.beginPath(); g.moveTo(-14 * u, hipY - 6 * u); g.lineTo(16 * u, hipY - 6 * u); g.quadraticCurveTo(22 * u + knee, hipY + 40 * u, 20 * u + knee, hipY + 84 * u); g.lineTo(-11 * u + knee * .5, hipY + 82 * u); g.quadraticCurveTo(-15 * u, hipY + 40 * u, -14 * u, hipY - 6 * u); g.fill();
    g.strokeStyle = 'rgba(255,240,220,.08)'; g.lineWidth = 1 * u; g.beginPath(); g.moveTo(4 * u, hipY); g.quadraticCurveTo(6 * u + knee * .4, hipY + 40 * u, 5 * u + knee, hipY + 80 * u); g.stroke();
    seg(g, 1.5 * u, sh + 1 * u, 3 * u, sh - 11 * u, 14 * u, 12.5 * u, SKIN[0], SKIN[1]);
    head(g, 4 * u, sh - 26 * u, u, { skin: SKIN, hair: ['#2a1c14', '#0c0806'], style: 'short' }, .04 + (Wt.give || 0) * .22);
    g.fillStyle = lg(g, 0, th[5] - 6 * u, 0, th[5], [[0, '#f2f2f0'], [1, '#7c7c7a']]); g.beginPath(); g.ellipse(th[4] + 4 * u, th[5] - 3 * u, 32 * u, 4.6 * u, 0, 0, 7); g.fill();   /* tray */
    for (var c = 0; c < Wt.cups; c++) { var cx = th[4] - 14 * u + c * 16 * u; g.fillStyle = '#e8e2d6'; g.beginPath(); g.ellipse(cx, th[5] - 6 * u, 8 * u, 2 * u, 0, 0, 7); g.fill(); mug(g, cx, th[5] - 6.5 * u, u * .85, c === 1 ? ['#c86a3c', '#7a3a1c'] : ['#f2ece0', '#a89e8c']); }
    var gv = Wt.give || 0, gt = Wt.giveTo || [0, 0];   /* the free arm swings against the near leg, or hands a coffee over */
    var hand = arm(g, 6 * u, sh + 6 * u, mix(-fa[0] * .75 + 3 * u, gt[0], gv), mix(hipY + 12 * u, gt[1], gv), u, 1, shirt, SKIN, 'rolled');
    if (gv > .05 && !Wt.placed) mug(g, hand[4] + 2 * u, hand[5] + 6 * u, u * .9, ['#f2ece0', '#a89e8c']);
    g.restore(); g.restore();
  }

  /* the customer on a tall stool, back to you (cy = the ledge they lean on); C: h (left hand), sip, cupIn, look */
  function drawCustomer(g, cx, cy, u, t, C) {
    var seat = cy + 50 * u, shY = cy - 44 * u + Math.sin(t * 1.5) * .6 * u, jeans = ['#3a4258', '#181c28'], sweater = ['#c79a3e', '#5e4216'];
    g.strokeStyle = '#4e4e54'; g.lineCap = 'round'; g.lineWidth = 3 * u; g.beginPath();
    var leg = C.stool || 124; g.moveTo(cx - 14 * u, seat + 4 * u); g.lineTo(cx - 14 * u - leg * .065 * u, seat + leg * u); g.moveTo(cx + 14 * u, seat + 4 * u); g.lineTo(cx + 14 * u + leg * .065 * u, seat + leg * u); g.stroke();
    if (leg > 100) { g.strokeStyle = '#6a6a70'; g.lineWidth = 2.4 * u; g.beginPath(); g.ellipse(cx, seat + 70 * u, 19 * u, 4 * u, 0, 0, 7); g.stroke(); }   /* footrest on a tall stool */
    seg(g, cx - 12 * u, seat + 6 * u, cx - 15 * u, seat + 64 * u, 14 * u, 10 * u, jeans[0], jeans[1]); seg(g, cx + 12 * u, seat + 6 * u, cx + 16 * u, seat + 64 * u, 14 * u, 10 * u, jeans[0], jeans[1]);
    g.fillStyle = '#1a120c'; g.beginPath(); g.ellipse(cx - 15 * u, seat + 69 * u, 7 * u, 4 * u, 0, 0, 7); g.ellipse(cx + 16 * u, seat + 69 * u, 7 * u, 4 * u, 0, 0, 7); g.fill();
    g.fillStyle = lg(g, 0, seat - 6 * u, 0, seat + 8 * u, [[0, '#7a3e26'], [1, '#2e140a']]); g.beginPath(); g.ellipse(cx, seat + 2 * u, 27 * u, 7 * u, 0, 0, 7); g.fill();
    g.fillStyle = lg(g, cx - 26 * u, 0, cx + 26 * u, 0, [[0, jeans[0]], [1, jeans[1]]]); rr(g, cx - 25 * u, seat - 16 * u, 50 * u, 20 * u, 8 * u); g.fill();
    var lit = [[0, '#dcae52'], [.4, sweater[0]], [1, sweater[1]]];
    var sd = C.side || -1, lite = ['#d8a84a', '#6a4a18'], dim = ['#a07a2e', '#4a3210'];   /* both arms go forward onto the ledge, behind the back */
    arm(g, cx - sd * 24 * u, shY + 9 * u, cx - sd * 13 * u, cy - 3 * u, u, sd > 0 ? 1 : -1, sd > 0 ? lite : dim, sd > 0 ? SKIN : SKIN_D, 'long');
    var la = arm(g, cx + sd * 24 * u, shY + 9 * u, C.h[0], C.h[1], u, sd > 0 ? -1 : 1, sd > 0 ? dim : lite, sd > 0 ? SKIN_D : SKIN, 'long');   /* this one lifts the cup */
    if (C.cupIn) mug(g, la[4] - 1 * u, la[5] + 6 * u, u, ['#f2ece0', '#a89e8c']);
    g.fillStyle = lg(g, cx - 30 * u, 0, cx + 30 * u, 0, lit);
    g.beginPath(); g.moveTo(cx - 24 * u, seat - 6 * u); g.quadraticCurveTo(cx - 30 * u, shY + 40 * u, cx - 30 * u, shY + 8 * u); g.quadraticCurveTo(cx - 28 * u, shY - 2 * u, cx - 12 * u, shY - 4 * u);
    g.lineTo(cx + 12 * u, shY - 4 * u); g.quadraticCurveTo(cx + 28 * u, shY - 2 * u, cx + 30 * u, shY + 8 * u); g.quadraticCurveTo(cx + 30 * u, shY + 40 * u, cx + 24 * u, seat - 6 * u); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(50,30,6,.22)'; g.lineWidth = 1 * u; for (var k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(cx + k * 7 * u, shY + 4 * u); g.quadraticCurveTo(cx + k * 7.6 * u, shY + 40 * u, cx + k * 6.8 * u, seat - 14 * u); g.stroke(); }   /* knit */
    g.fillStyle = 'rgba(40,24,4,.35)'; rr(g, cx - 24 * u, seat - 14 * u, 48 * u, 8 * u, 3 * u); g.fill();   /* ribbed hem */
    g.fillStyle = 'rgba(30,18,4,.25)'; g.beginPath(); g.ellipse(cx + 2 * u, shY + 30 * u, 4 * u, 26 * u, 0, 0, 7); g.fill();   /* the spine's soft valley */
    if (leg <= 100) {   /* at a table: a bentwood chair back in front of them, so they read as sitting */
      g.strokeStyle = '#2a1a10'; g.lineCap = 'round'; g.lineWidth = 4.5 * u; g.beginPath();
      g.moveTo(cx - 24 * u, seat + leg * u); g.lineTo(cx - 24 * u, seat - 40 * u); g.bezierCurveTo(cx - 24 * u, seat - 62 * u, cx + 24 * u, seat - 62 * u, cx + 24 * u, seat - 40 * u); g.lineTo(cx + 24 * u, seat + leg * u);
      g.moveTo(cx - 24 * u, seat - 18 * u); g.quadraticCurveTo(cx, seat - 10 * u, cx + 24 * u, seat - 18 * u); g.stroke();
      g.strokeStyle = 'rgba(255,210,160,.18)'; g.lineWidth = 1.2 * u; g.beginPath(); g.moveTo(cx - 25.5 * u, seat - 40 * u); g.bezierCurveTo(cx - 25.5 * u, seat - 63 * u, cx + 22 * u, seat - 63.5 * u, cx + 22.5 * u, seat - 46 * u); g.stroke();
      g.fillStyle = '#3a2416'; g.beginPath(); g.ellipse(cx, seat + 4 * u, 28 * u, 6 * u, 0, 0, 7); g.fill();
    }
    seg(g, cx, shY - 2 * u, cx - C.look * 1.5 * u, shY - 14 * u, 13 * u, 12 * u, SKIN_D[0], SKIN_D[1]);
    var hx = cx - C.look * 3 * u, hy = shY - 31 * u;
    if (C.look > .05) { g.globalAlpha = C.look; g.fillStyle = SKIN[0]; g.beginPath(); g.ellipse(hx - 12 * u, hy + 4 * u, 3.4 * u, 7 * u, .15, 0, 7); g.fill(); g.globalAlpha = 1; }   /* a cheek as they glance at the window */
    g.fillStyle = lg(g, hx - 14 * u, hy - 18 * u, hx + 14 * u, hy + 22 * u, [[0, '#5a3422'], [.5, '#3a2014'], [1, '#1e0e06']]);
    g.beginPath(); g.moveTo(hx - 13 * u, hy); g.bezierCurveTo(hx - 15 * u, hy - 24 * u, hx + 15 * u, hy - 24 * u, hx + 13 * u, hy); g.quadraticCurveTo(hx + 16 * u, hy + 16 * u, hx + 11 * u, hy + 26 * u);
    g.quadraticCurveTo(hx, hy + 30 * u, hx - 11 * u, hy + 26 * u); g.quadraticCurveTo(hx - 16 * u, hy + 16 * u, hx - 13 * u, hy); g.fill();
    g.strokeStyle = 'rgba(255,200,150,.16)'; g.lineWidth = 1.1 * u; for (var s2 = -1; s2 <= 1; s2++) { g.beginPath(); g.moveTo(hx + s2 * 5 * u, hy - 15 * u); g.quadraticCurveTo(hx + s2 * 7 * u, hy + 6 * u, hx + s2 * 5 * u, hy + 24 * u); g.stroke(); }
    g.strokeStyle = '#18181a'; g.lineWidth = 2.6 * u; g.beginPath(); g.arc(hx, hy - 1 * u, 14.5 * u, Math.PI * 1.08, Math.PI * 1.92); g.stroke();   /* headphones */
    g.fillStyle = '#1e1e22'; g.beginPath(); g.ellipse(hx - 14.5 * u, hy + 3 * u, 3.6 * u, 7 * u, 0, 0, 7); g.ellipse(hx + 14.5 * u, hy + 3 * u, 3.6 * u, 7 * u, 0, 0, 7); g.fill();
  }

  /* students at the table in front of the counter: body first (chair, legs, torso, head), then the table, then the arms */
  function studentBody(g, P, u) {
    g.save(); g.translate(P.x, P.y); g.scale(P.face, 1);
    g.strokeStyle = '#24160c'; g.lineCap = 'round'; g.lineWidth = 4 * u; g.beginPath();   /* bentwood bistro chair */
    g.moveTo(-8 * u, 4 * u); g.quadraticCurveTo(-20 * u, -40 * u, -13 * u, -80 * u); g.moveTo(-12 * u, -16 * u); g.quadraticCurveTo(-24 * u, -48 * u, -16 * u, -74 * u);
    g.moveTo(-14 * u, 8 * u); g.lineTo(-19 * u, 80 * u); g.moveTo(22 * u, 8 * u); g.lineTo(27 * u, 80 * u); g.stroke();
    g.fillStyle = lg(g, 0, 0, 0, 8 * u, [[0, '#5a3a22'], [1, '#2a1a0e']]); rr(g, -19 * u, 1 * u, 46 * u, 7 * u, 3 * u); g.fill();
    seg(g, 4 * u, -2 * u, 46 * u, -2 * u, 17 * u, 13 * u, P.legs[1], '#08080a'); seg(g, 46 * u, -2 * u, 49 * u, 70 * u, 12 * u, 9 * u, P.legs[1], '#08080a'); shoe(g, 49 * u, 72 * u, u, 0);
    seg(g, 0, 2 * u, 42 * u, 4 * u, 18 * u, 14 * u, P.legs[0], P.legs[1]); seg(g, 42 * u, 4 * u, 43 * u, 74 * u, 13 * u, 10 * u, P.legs[0], P.legs[1]); shoe(g, 43 * u, 76 * u, u, 0);
    g.save(); g.rotate(P.lean);
    var c0 = Math.cos(-P.lean), s0 = Math.sin(-P.lean);   /* hand targets live in the unrotated frame */
    P._far = arm(g, -2 * u, -86 * u, P.hf[0] * c0 - P.hf[1] * s0, P.hf[0] * s0 + P.hf[1] * c0, u, 1, P.topD, P.skinD, 'long');   /* far arm, behind the body */
    g.fillStyle = lg(g, -16 * u, 0, 20 * u, 0, [[0, P.top[1]], [.55, P.top[0]], [1, P.top[0]]]);
    g.beginPath(); g.moveTo(-14 * u, 4 * u); g.quadraticCurveTo(-20 * u, -46 * u, -12 * u, -88 * u); g.quadraticCurveTo(-5 * u, -99 * u, 9 * u, -96 * u);
    g.quadraticCurveTo(21 * u, -90 * u, 22 * u, -62 * u); g.quadraticCurveTo(24 * u, -28 * u, 18 * u, 4 * u); g.closePath(); g.fill();
    if (P.hood) { g.fillStyle = P.top[1]; g.beginPath(); g.ellipse(-8 * u, -92 * u, 11 * u, 7 * u, -.3, 0, 7); g.fill(); g.strokeStyle = 'rgba(240,230,210,.5)'; g.lineWidth = 1 * u; g.beginPath(); g.moveTo(9 * u, -90 * u); g.lineTo(11 * u, -70 * u); g.stroke(); }
    else { g.strokeStyle = 'rgba(0,0,0,.3)'; g.lineWidth = 2.4 * u; g.beginPath(); g.moveTo(-4 * u, -95 * u); g.quadraticCurveTo(4 * u, -90 * u, 10 * u, -94 * u); g.stroke(); }
    seg(g, 3 * u, -92 * u, 8 * u, -106 * u, 12 * u, 10.5 * u, P.skin[0], P.skin[1]);
    head(g, 13 * u, -121 * u, u, P.headO, P.look + P.nod);
    g.restore(); g.restore();
  }
  function studentArms(g, P, u, t) {
    g.save(); g.translate(P.x, P.y); g.scale(P.face, 1); g.save(); g.rotate(P.lean);
    var cs = Math.cos(-P.lean), sn = Math.sin(-P.lean);   /* hand targets live in the unrotated frame */
    function un(p) { return [p[0] * cs - p[1] * sn, p[0] * sn + p[1] * cs]; }
    var f = P._far; if (f) { var a = Math.atan2(f[3] - f[1], f[2] - f[0]); seg(g, mix(f[0], f[2], .55), mix(f[1], f[3], .55), f[2], f[3], 11 * u, 7.5 * u, P.topD[0], P.topD[1]); g.fillStyle = P.skinD[0]; g.beginPath(); g.ellipse(f[2] + Math.cos(a) * 4 * u, f[3] + Math.sin(a) * 4 * u, 6.4 * u, 4.4 * u, a, 0, 7); g.fill(); }
    var hn = un(P.hn), h = arm(g, 6 * u, -84 * u, hn[0], hn[1], u, 1, P.top, P.skin, 'long');
    if (P.cupIn) mug(g, h[4] + 3 * u, h[5] + 6 * u, u, P.mug, P.act === 'sip' && P.k > .38 && P.k < .68 ? -.5 : 0);
    else if (P.pen) { g.strokeStyle = '#1e2c5a'; g.lineWidth = 1.6 * u; g.beginPath(); g.moveTo(h[4] + 3 * u, h[5] + 2 * u); g.lineTo(h[4] - 4 * u, h[5] - 11 * u); g.stroke(); }
    g.restore(); g.restore();
  }
  /* what a student does next, and where their hands and head go */
  function studentTick(P, t, dt, edt, u, chatting) {
    P.left -= dt;
    if (chatting > 0 && P.act !== 'chat' && P.act !== 'sip') { P.act = 'chat'; P.left = chatting; }
    if (P.left <= 0) {
      var r = Math.random(), acc = 0; P.act = 'work';
      for (var i = 0; i < P.acts.length; i++) { acc += P.acts[i][1]; if (r < acc) { P.act = P.acts[i][0]; break; } }
      P.left = P.act === 'work' ? 4 + Math.random() * 5 : P.act === 'sip' ? 99 : P.act === 'page' ? 1.4 : 2.5 + Math.random() * 2.5; P.k = 0;
    }
    var TY = P.TY, aL = P.anchor, look = .3, lean = .1, nod = 0, cs = Math.cos(P.lean), sn = Math.sin(P.lean);
    function rot(x, y) { return [x * cs - y * sn, x * sn + y * cs]; }
    var mouth = rot(33 * u, -106 * u), chin = rot(24 * u, -98 * u);
    var work = P.kind === 'write'
      ? [[aL + 16 * u + ((t * .6) % 1) * 12 * u + Math.sin(t * 11) * 1.4 * u, TY - 5 * u + Math.sin(t * 17) * .6 * u], [aL + 3 * u, TY - 4 * u]]
      : [[aL + 14 * u + Math.sin(t * 23) * 1.6 * u, TY - 5 * u - Math.abs(Math.sin(t * 19)) * 1.6 * u], [aL + 4 * u + Math.sin(t * 21 + 1) * 1.6 * u, TY - 5 * u - Math.abs(Math.sin(t * 17 + 2)) * 1.6 * u]];
    var tN = work[0], tF = work[1]; P.cupIn = false; P.pen = P.kind === 'write';
    if (P.act === 'work') { look = P.kind === 'write' ? .5 : .3; lean = P.kind === 'write' ? .16 : .1; }
    else if (P.act === 'think') { tN = chin; look = -.12; lean = .03; }
    else if (P.act === 'read') { tN = chin; tF = [aL, TY - 4 * u]; look = .18; lean = -.05; }
    else if (P.act === 'stretch') { tN = [20 * u, -196 * u]; tF = [8 * u, -190 * u]; look = -.3; lean = -.14; P.pen = false; }
    else if (P.act === 'page') { P.k += dt / 1.3; var pk = Math.min(1, P.k); tF = [aL + 30 * u - 26 * u * smooth(pk), TY - 6 * u - Math.sin(pk * Math.PI) * 10 * u]; look = .5; lean = .14; }
    else if (P.act === 'chat') { tN = P.kind === 'write' ? [aL + 6 * u + Math.sin(t * 2.6) * 6 * u, TY - 16 * u - Math.abs(Math.sin(t * 2)) * 8 * u] : [aL + 4 * u, TY - 4 * u]; look = -.06; lean = .02; nod = Math.sin(t * (P.kind === 'write' ? 4.5 : 6.5)) * .05; }
    else if (P.act === 'sip') {
      P.k += dt / 3.6; var k = P.k, cup = [P.cupL, TY - 6 * u], rest = work[0];
      tN = k < .2 ? mixP(rest, cup, k / .2) : k < .38 ? mixP(cup, mouth, (k - .2) / .18) : k < .68 ? mouth : k < .84 ? mixP(mouth, cup, (k - .68) / .16) : mixP(cup, rest, (k - .84) / .16);
      P.cupIn = k >= .2 && k < .84; P.pen = false; look = k > .38 && k < .68 ? -.22 : .1; lean = .05; if (k >= 1) P.left = 0;
    }
    if (P.cupIn) P.pen = false;
    ease2(P.hn, tN, edt, P.act === 'sip' ? 14 : 7); ease2(P.hf, tF, edt, 7);
    P.look = ease(P.look, look, edt, 3); P.lean = ease(P.lean, lean, edt, 2.5); P.nod = ease(P.nod, nod, edt, 10);
  }
  function drawStudents(g, ST, u, t) {
    var A = ST.a, B = ST.b, tx = ST.x, top = ST.top, fy = ST.fy;
    studentBody(g, A, u); studentBody(g, B, u);
    g.fillStyle = '#1a120c'; g.fillRect(tx - 4 * u, top, 8 * u, fy - top); g.beginPath(); g.ellipse(tx, fy, 30 * u, 5 * u, 0, 0, 7); g.fill();   /* pedestal */
    g.fillStyle = lg(g, 0, top - 9 * u, 0, top, [[0, '#6a4628'], [1, '#8a5e36']]); g.beginPath(); g.moveTo(tx - 64 * u, top); g.lineTo(tx - 58 * u, top - 9 * u); g.lineTo(tx + 58 * u, top - 9 * u); g.lineTo(tx + 64 * u, top); g.closePath(); g.fill();
    g.fillStyle = lg(g, 0, top, 0, top + 6 * u, [[0, '#4a2e18'], [1, '#22140a']]); g.fillRect(tx - 64 * u, top, 128 * u, 6 * u);
    g.fillStyle = 'rgba(255,220,170,.18)'; g.fillRect(tx - 64 * u, top - .5 * u, 128 * u, 1 * u);
    /* the open notebook (a page turns when she flips it) */
    var nb = A.x + A.anchor * A.face, ny = top - 1.5 * u;
    g.fillStyle = '#e9e1cc'; g.beginPath(); g.moveTo(nb, ny); g.lineTo(nb + 3 * u, ny - 7 * u); g.lineTo(nb + 35 * u, ny - 7 * u); g.lineTo(nb + 33 * u, ny); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(70,80,110,.45)'; g.lineWidth = .7 * u; for (var l = 1; l < 4; l++) { g.beginPath(); g.moveTo(nb + 3 * u + l * .4 * u, ny - l * 1.7 * u); g.lineTo(nb + 15 * u, ny - l * 1.7 * u); g.moveTo(nb + 19 * u, ny - l * 1.7 * u); g.lineTo(nb + 32 * u, ny - l * 1.7 * u); g.stroke(); }
    g.strokeStyle = 'rgba(60,40,20,.5)'; g.beginPath(); g.moveTo(nb + 17 * u, ny); g.lineTo(nb + 18 * u, ny - 7 * u); g.stroke();
    if (A.act === 'page' && A.k < 1) { var pk = smooth(A.k), px = nb + 17.5 * u, w = 15 * u * Math.cos(pk * Math.PI); g.fillStyle = '#f4ecd8'; g.beginPath(); g.moveTo(px, ny - 3 * u); g.quadraticCurveTo(px + w * .6, ny - 3 * u - Math.abs(Math.sin(pk * Math.PI)) * 16 * u, px + w, ny - 4 * u); g.lineTo(px, ny - 4 * u); g.closePath(); g.fill(); }
    /* his laptop: thin base on the table, screen tilted toward him */
    var lb = B.x + B.anchor * B.face, ly = top - 4 * u, hinge = lb - 32 * u;
    g.fillStyle = '#4a4c54'; g.beginPath(); g.moveTo(lb, ly); g.lineTo(hinge, ly); g.lineTo(hinge, ly - 2.4 * u); g.lineTo(lb, ly - 2.4 * u); g.fill();
    g.strokeStyle = '#2c2e34'; g.lineWidth = 2.6 * u; g.lineCap = 'round'; g.beginPath(); g.moveTo(hinge, ly - 1.5 * u); g.lineTo(hinge + 8 * u, ly - 33 * u); g.stroke();
    g.strokeStyle = 'rgba(160,190,255,.55)'; g.lineWidth = 1 * u; g.beginPath(); g.moveTo(hinge + 1.6 * u, ly - 3 * u); g.lineTo(hinge + 9.4 * u, ly - 32 * u); g.stroke();
    if (!A.cupIn) mug(g, A.x + A.cupL * A.face, top - 2 * u, u, A.mug);
    if (!B.cupIn) mug(g, B.x + B.cupL * B.face, top - 2 * u, u, B.mug);
    studentArms(g, A, u, t); studentArms(g, B, u, t);
    g.globalCompositeOperation = 'source-atop'; glow(g, hinge + 4 * u, ly - 20 * u, 70 * u, 'rgba(120,160,255,A)', .2); g.globalCompositeOperation = 'source-over';   /* the screen's cool light on his face */
  }

  /* people walking past outside the window, softly out of focus; umbrellas when it rains */
  function passerby(g, px, base, s, t, umbrella, coat) {
    var ph = t * 5, a = Math.sin(ph), hip = base - 70 * s;
    g.strokeStyle = '#0a0c14'; g.lineCap = 'round'; g.lineWidth = 9 * s; g.beginPath(); g.moveTo(px, hip); g.lineTo(px + a * 14 * s, base); g.moveTo(px, hip); g.lineTo(px - a * 14 * s, base); g.stroke();
    g.fillStyle = coat; g.beginPath(); g.moveTo(px - 14 * s, base - 128 * s); g.quadraticCurveTo(px - 20 * s, base - 80 * s, px - 16 * s, base - 50 * s); g.lineTo(px + 16 * s, base - 50 * s); g.quadraticCurveTo(px + 20 * s, base - 80 * s, px + 14 * s, base - 128 * s); g.quadraticCurveTo(px, base - 134 * s, px - 14 * s, base - 128 * s); g.fill();
    g.beginPath(); g.ellipse(px, base - 144 * s, 10 * s, 12 * s, 0, 0, 7); g.fill();
    if (umbrella) { g.strokeStyle = '#0a0c14'; g.lineWidth = 2 * s; g.beginPath(); g.moveTo(px + 8 * s, base - 110 * s); g.lineTo(px + 8 * s, base - 168 * s); g.stroke();
      g.fillStyle = '#121624'; g.beginPath(); g.moveTo(px - 32 * s, base - 160 * s); g.quadraticCurveTo(px + 8 * s, base - 210 * s, px + 48 * s, base - 160 * s); g.quadraticCurveTo(px + 8 * s, base - 168 * s, px - 32 * s, base - 160 * s); g.fill(); }
  }

  /* a little wooden radio: the dial glows while music plays */
  function drawRadio(g, px, base, s, on, t) {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.ellipse(px, base, 34 * s, 5 * s, 0, 0, 7); g.fill();
    g.fillStyle = lg(g, px - 32 * s, 0, px + 32 * s, 0, [[0, '#6a3a1e'], [.5, '#9a5e30'], [1, '#5a2e16']]); rr(g, px - 32 * s, base - 42 * s, 64 * s, 42 * s, [14 * s, 14 * s, 4 * s, 4 * s]); g.fill();
    g.fillStyle = '#d8c8a0'; rr(g, px - 26 * s, base - 34 * s, 30 * s, 26 * s, 6 * s); g.fill();
    g.strokeStyle = 'rgba(90,60,30,.5)'; g.lineWidth = 1; for (var k = 0; k < 5; k++) { g.beginPath(); g.moveTo(px - 24 * s, base - 30 * s + k * 5 * s); g.lineTo(px + 2 * s, base - 30 * s + k * 5 * s); g.stroke(); }   /* speaker cloth */
    g.fillStyle = on ? '#ffd27a' : '#6a5a3a'; rr(g, px + 8 * s, base - 34 * s, 18 * s, 12 * s, 3 * s); g.fill();
    if (on) { g.globalCompositeOperation = 'lighter'; glow(g, px + 17 * s, base - 28 * s, 26 * s, WARM, .5); g.globalCompositeOperation = 'source-over'; g.fillStyle = '#c0392b'; g.fillRect(px + 10 * s + ((Math.sin(t * .3) + 1) / 2) * 14 * s, base - 34 * s, 1.5 * s, 12 * s); }
    g.fillStyle = '#3a2a1a'; g.beginPath(); g.arc(px + 12 * s, base - 14 * s, 4 * s, 0, 7); g.arc(px + 23 * s, base - 14 * s, 4 * s, 0, 7); g.fill();
  }

  /* ── café extras: plants, the pastry case, the wall clock, menu doodles, candles ── */
  var GREENS = [['#7fae5c', '#3c6a32'], ['#6a9e4e', '#2e5628'], ['#8cbc66', '#4a7a3a'], ['#5e8e46', '#26481e']];
  function leaf(g, x0, y0, len, wid, ang, c) {   /* a pointed leaf, from its stem end */
    g.save(); g.translate(x0, y0); g.rotate(ang);
    g.fillStyle = lg(g, 0, -wid, 0, wid, [[0, c[0]], [1, c[1]]]);
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(len * .45, -wid, len, 0); g.quadraticCurveTo(len * .45, wid, 0, 0); g.fill();
    g.strokeStyle = 'rgba(20,40,16,.45)'; g.lineWidth = Math.max(.6, wid * .12); g.beginPath(); g.moveTo(0, 0); g.lineTo(len * .85, 0); g.stroke(); g.restore();
  }
  /* a trailing pothos in a terracotta pot standing on a shelf (base = the shelf top); its vines hang over the edge */
  function pothos(g, x0, base, s, r, vines, drop) {
    for (var v = 0; v < vines; v++) {
      var vx = x0 + (v - (vines - 1) / 2) * 7 * s, len = drop * (.5 + r() * .5), sway = (r() - .5) * 24 * s, n = Math.floor(len / (9 * s));
      g.strokeStyle = '#34522a'; g.lineWidth = 1.3 * s; g.beginPath(); g.moveTo(vx, base); g.quadraticCurveTo(vx + sway, base + len * .5, vx + sway * .5, base + len); g.stroke();
      for (var k = 1; k <= n; k++) { var f = k / n, lx = (1 - f) * (1 - f) * vx + 2 * f * (1 - f) * (vx + sway) + f * f * (vx + sway * .5), ly = base + f * len;
        leaf(g, lx, ly, (8 + r() * 5) * s, (3.6 + r() * 1.8) * s, (k % 2 ? .5 : Math.PI - .5) + (r() - .5) * .7, GREENS[Math.floor(r() * 4)]); }
    }
    g.fillStyle = lg(g, x0 - 15 * s, 0, x0 + 15 * s, 0, [[0, '#7a3e22'], [.4, '#c0704a'], [1, '#5e2e18']]);
    g.beginPath(); g.moveTo(x0 - 14 * s, base - 22 * s); g.lineTo(x0 + 14 * s, base - 22 * s); g.lineTo(x0 + 11 * s, base); g.lineTo(x0 - 11 * s, base); g.closePath(); g.fill();
    g.fillStyle = '#a85a38'; g.fillRect(x0 - 16 * s, base - 25 * s, 32 * s, 5 * s);
    for (var t2 = 0; t2 < 10; t2++) leaf(g, x0 + (r() - .5) * 18 * s, base - 23 * s, (10 + r() * 6) * s, (4.4 + r() * 2) * s, -Math.PI / 2 + (r() - .5) * 2.6, GREENS[Math.floor(r() * 4)]);
  }
  function monsteraLeaf(g, x0, y0, sz, ang, c) {   /* a big split leaf pointing along ang */
    g.save(); g.translate(x0, y0); g.rotate(ang + Math.PI / 2);
    g.fillStyle = lg(g, -sz, 0, sz, 0, [[0, c[1]], [.5, c[0]], [1, c[1]]]);
    g.beginPath(); g.moveTo(0, sz * .12); g.bezierCurveTo(-sz, -sz * .05, -sz * .72, -sz * 1.1, 0, -sz * 1.02); g.bezierCurveTo(sz * .72, -sz * 1.1, sz, -sz * .05, 0, sz * .12); g.fill();
    g.strokeStyle = 'rgba(18,26,12,.6)'; g.lineWidth = Math.max(.8, sz * .035); g.lineCap = 'round';
    for (var i = 0; i < 3; i++) { var yy = -sz * (.3 + i * .22), ex = sz * (.86 - Math.abs(i - 1.5) * .12); g.beginPath(); g.moveTo(-ex, yy - sz * .04); g.lineTo(-sz * .3, yy + sz * .05); g.moveTo(ex, yy - sz * .04); g.lineTo(sz * .3, yy + sz * .05); g.stroke(); }   /* the splits */
    g.strokeStyle = 'rgba(210,240,170,.35)'; g.lineWidth = Math.max(.8, sz * .035); g.beginPath(); g.moveTo(0, sz * .1); g.lineTo(0, -sz * .92); g.stroke();
    g.restore();
  }
  /* a monstera in a woven basket on the floor */
  function floorPlant(g, x0, base, s, r) {
    var top = base - 44 * s;
    for (var k = 0; k < 10; k++) {
      var a = -Math.PI / 2 + (k - 4.5) * .16 + (r() - .5) * .12, len = (58 + r() * 52) * s, ex = x0 + Math.cos(a) * len, ey = top + Math.sin(a) * len;
      g.strokeStyle = '#3a6230'; g.lineWidth = 2.4 * s; g.beginPath(); g.moveTo(x0 + (r() - .5) * 10 * s, top + 6 * s); g.quadraticCurveTo(x0 + Math.cos(a) * len * .3, top + Math.sin(a) * len * .75, ex, ey); g.stroke();
      monsteraLeaf(g, ex, ey, (24 + r() * 12) * s, a + (r() - .5) * .9, GREENS[Math.floor(r() * 4)]);
    }
    g.fillStyle = lg(g, x0 - 24 * s, 0, x0 + 24 * s, 0, [[0, '#4a3a26'], [.45, '#a8885c'], [1, '#3e3020']]);
    g.beginPath(); g.moveTo(x0 - 24 * s, top); g.lineTo(x0 + 24 * s, top); g.lineTo(x0 + 19 * s, base); g.lineTo(x0 - 19 * s, base); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(40,28,14,.5)'; g.lineWidth = 1 * s; for (var w = 1; w < 6; w++) { var wy = top + w * 7.4 * s; g.beginPath(); g.moveTo(x0 - 24 * s + w * .8 * s, wy); g.lineTo(x0 + 24 * s - w * .8 * s, wy); g.stroke(); }   /* weave */
    shadow(g, x0, base, 30 * s, 5 * s, .5);
  }
  /* pastries */
  function croissant(g, cx, by, s) {
    g.fillStyle = lg(g, 0, by - 10 * s, 0, by, [[0, '#f2b464'], [1, '#a05a1c']]); g.beginPath(); g.moveTo(cx - 11 * s, by); g.quadraticCurveTo(cx - 9 * s, by - 9 * s, cx, by - 10 * s); g.quadraticCurveTo(cx + 9 * s, by - 9 * s, cx + 11 * s, by); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(110,50,14,.6)'; g.lineWidth = .9 * s; for (var k = -1; k <= 1; k++) { g.beginPath(); g.moveTo(cx + k * 4.5 * s, by - 9 * s); g.lineTo(cx + k * 5.5 * s, by - 1 * s); g.stroke(); }
  }
  function muffin(g, cx, by, s, top) {
    g.fillStyle = '#d8bc8c'; g.beginPath(); g.moveTo(cx - 7 * s, by - 8 * s); g.lineTo(cx + 7 * s, by - 8 * s); g.lineTo(cx + 5.5 * s, by); g.lineTo(cx - 5.5 * s, by); g.closePath(); g.fill();
    g.strokeStyle = 'rgba(120,90,50,.5)'; g.lineWidth = .7 * s; for (var k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(cx + k * 2.6 * s, by - 8 * s); g.lineTo(cx + k * 2.1 * s, by); g.stroke(); }
    g.fillStyle = top; g.beginPath(); g.ellipse(cx, by - 9 * s, 8.5 * s, 6 * s, 0, Math.PI, 0); g.fill();
    g.fillStyle = 'rgba(255,240,220,.25)'; g.beginPath(); g.ellipse(cx - 3 * s, by - 12 * s, 3 * s, 1.6 * s, -.3, 0, 7); g.fill();
  }
  function cakeSlice(g, cx, by, s) {
    g.fillStyle = '#f2e2c4'; g.beginPath(); g.moveTo(cx - 9 * s, by); g.lineTo(cx + 9 * s, by); g.lineTo(cx + 9 * s, by - 13 * s); g.lineTo(cx - 9 * s, by - 9 * s); g.closePath(); g.fill();
    g.fillStyle = '#5a2e18'; g.fillRect(cx - 9 * s, by - 4.6 * s, 18 * s, 2.6 * s); g.beginPath(); g.moveTo(cx - 9 * s, by - 9 * s); g.lineTo(cx + 9 * s, by - 13 * s); g.lineTo(cx + 9 * s, by - 10.5 * s); g.lineTo(cx - 9 * s, by - 7 * s); g.fill();
    g.fillStyle = '#c0392b'; g.beginPath(); g.arc(cx + 4 * s, by - 14 * s, 2.4 * s, 0, 7); g.fill();
  }
  /* a lit glass pastry case on the bar (X = left edge, base = the counter top) */
  function pastryCase(g, X, base, w, h, s, r) {
    wood(g, X, base - 9 * s, w, 9 * s, '#5a3a20', '#2a180c', r);
    var top = base - 9 * s - h, mid = top + h * .52;
    g.fillStyle = lg(g, 0, top, 0, base - 9 * s, [[0, '#4a3020'], [1, '#24160c']]); g.fillRect(X + 2 * s, top, w - 4 * s, h);
    g.fillStyle = lg(g, 0, top, 0, top + h, [[0, 'rgba(255,214,150,.45)'], [1, 'rgba(255,214,150,.08)']]); g.fillRect(X + 2 * s, top, w - 4 * s, h);   /* its little light */
    g.fillStyle = 'rgba(225,238,245,.55)'; g.fillRect(X + 2 * s, mid, w - 4 * s, 1.6 * s);   /* glass shelf */
    for (var px = X + 13 * s; px < X + w - 10 * s; px += 22 * s) croissant(g, px, mid, s);
    var tops = ['#6a3a1e', '#b8783e', '#7a4a8a'], i = 0;
    for (var qx = X + 12 * s; qx < X + w - 9 * s; qx += 20 * s, i++) { if (i % 3 === 2) cakeSlice(g, qx, base - 10 * s, s); else muffin(g, qx, base - 10 * s, s, tops[i % 3]); }
    g.fillStyle = 'rgba(200,225,240,.10)'; g.fillRect(X, top, w, h);   /* front glass */
    g.fillStyle = lg(g, X, top, X + w, base, [[0, 'rgba(255,255,255,0)'], [.3, 'rgba(255,255,255,.22)'], [.36, 'rgba(255,255,255,0)'], [.7, 'rgba(255,255,255,0)'], [.74, 'rgba(255,255,255,.12)'], [.8, 'rgba(255,255,255,0)']]); g.fillRect(X, top, w, h);
    g.strokeStyle = '#b08a4e'; g.lineWidth = 2 * s; g.strokeRect(X + 1 * s, top, w - 2 * s, h);
    g.fillStyle = '#f2ead6'; g.fillRect(X + 6 * s, base - 8 * s, 14 * s, 6 * s); g.fillStyle = 'rgba(60,40,20,.7)'; g.fillRect(X + 8 * s, base - 5.5 * s, 10 * s, 1 * s);   /* price tag */
  }
  /* the wall clock: face in the background, hands every frame at the real time */
  function clockFace(g, cx, cy, R, s) {
    g.fillStyle = 'rgba(0,0,0,.35)'; g.beginPath(); g.arc(cx + 3 * s, cy + 5 * s, R, 0, 7); g.fill();
    g.fillStyle = lg(g, cx - R, cy - R, cx + R, cy + R, [[0, '#8a5e36'], [1, '#2e1c0e']]); g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill();
    g.fillStyle = rg(g, cx - R * .3, cy - R * .3, 0, R, [[0, '#f6eedb'], [1, '#d6c8a8']]); g.beginPath(); g.arc(cx, cy, R * .84, 0, 7); g.fill();
    g.strokeStyle = '#2a1a10'; for (var k = 0; k < 60; k++) { var a = k / 60 * Math.PI * 2, big = k % 5 === 0, r0 = R * (big ? .66 : .74); g.lineWidth = (big ? 2 : .8) * s; g.beginPath(); g.moveTo(cx + Math.cos(a) * r0, cy + Math.sin(a) * r0); g.lineTo(cx + Math.cos(a) * R * .8, cy + Math.sin(a) * R * .8); g.stroke(); }
    g.fillStyle = '#7a5a3a'; g.textAlign = 'center'; g.font = '700 ' + Math.max(6, Math.round(R * .14)) + 'px Karla, sans-serif'; g.fillText('STUDYSYNC', cx, cy + R * .38);
  }
  function clockHands(g, cx, cy, R, s, d) {
    var sec = d.getSeconds() + d.getMilliseconds() / 1000, min = d.getMinutes() + sec / 60, hr = (d.getHours() % 12) + min / 60;
    function hand(a, len, w, col) { g.strokeStyle = col; g.lineWidth = w; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - Math.sin(a) * len * .14, cy + Math.cos(a) * len * .14); g.lineTo(cx + Math.sin(a) * len, cy - Math.cos(a) * len); g.stroke(); }
    hand(hr / 12 * Math.PI * 2, R * .42, 3.4 * s, '#1e140c'); hand(min / 60 * Math.PI * 2, R * .62, 2.2 * s, '#1e140c'); hand(sec / 60 * Math.PI * 2, R * .68, 1 * s, '#b8392c');
    g.fillStyle = '#b8392c'; g.beginPath(); g.arc(cx, cy, 2.4 * s, 0, 7); g.fill();
    g.fillStyle = 'rgba(255,255,255,.10)'; g.beginPath(); g.ellipse(cx - R * .3, cy - R * .38, R * .36, R * .16, -.5, 0, 7); g.fill();   /* glass */
  }
  /* chalk doodles in the empty corner of the menu board */
  function menuDoodles(g, mb, s) {
    var by = mb.y + mb.h - 12 * s, cx = mb.x + mb.w - 30 * s;
    g.strokeStyle = 'rgba(240,240,230,.75)'; g.lineWidth = 1.4 * s; g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath(); g.moveTo(cx - 11 * s, by - 18 * s); g.lineTo(cx + 9 * s, by - 18 * s); g.lineTo(cx + 7 * s, by - 3 * s); g.quadraticCurveTo(cx - 1 * s, by + 1 * s, cx - 9 * s, by - 3 * s); g.closePath(); g.stroke();   /* a cup */
    g.beginPath(); g.arc(cx + 11 * s, by - 12 * s, 4 * s, -1.4, 1.4); g.stroke();
    g.beginPath(); g.ellipse(cx - 1 * s, by + 1 * s, 15 * s, 2.5 * s, 0, 0, Math.PI); g.stroke();
    [-4, 2].forEach(function (o) { g.beginPath(); g.moveTo(cx + o * s, by - 21 * s); g.quadraticCurveTo(cx + (o - 3) * s, by - 25 * s, cx + o * s, by - 29 * s); g.quadraticCurveTo(cx + (o + 3) * s, by - 33 * s, cx + o * s, by - 37 * s); g.stroke(); });   /* steam */
    g.fillStyle = 'rgba(242,196,106,.85)'; g.font = Math.round(12 * s) + 'px Caveat, Kalam, cursive'; g.textAlign = 'left'; g.fillText('today: rain & lo-fi ♡', mb.x + 12 * s, by);
    g.strokeStyle = 'rgba(240,240,230,.4)'; g.lineWidth = 1 * s; g.beginPath(); g.moveTo(mb.x + mb.w * .3, mb.y + 28 * s); g.quadraticCurveTo(mb.x + mb.w * .5, mb.y + 31 * s, mb.x + mb.w * .7, mb.y + 28 * s); g.stroke();   /* underline the title */
  }
  /* a tea light in a little glass, flickering, with its warm glow */
  function candle(g, cx, base, s, t, seed) {
    var fl = 1 + Math.sin(t * 13 + seed) * .08 + Math.sin(t * 29 + seed * 3) * .05;
    g.globalCompositeOperation = 'lighter'; glow(g, cx, base - 9 * s, 46 * s * fl, 'rgba(255,190,110,A)', .3); g.globalCompositeOperation = 'source-over';
    g.fillStyle = 'rgba(230,190,140,.35)'; rr(g, cx - 6 * s, base - 11 * s, 12 * s, 11 * s, 2 * s); g.fill();
    g.fillStyle = '#efe4cc'; g.fillRect(cx - 4.5 * s, base - 6 * s, 9 * s, 5 * s);
    g.fillStyle = 'rgba(255,214,140,.95)'; g.beginPath(); g.ellipse(cx + Math.sin(t * 5 + seed) * .6 * s, base - 9.5 * s, 1.8 * s, 3.6 * s * fl, 0, 0, 7); g.fill();
    g.fillStyle = '#fff6dc'; g.beginPath(); g.ellipse(cx, base - 8.6 * s, .8 * s, 1.6 * s, 0, 0, 7); g.fill();
  }

  var TERMS = [['Mitosis', 'a cell splits in two'], ['F = ma', 'force = mass x accel.'], ['Osmosis', 'water through a membrane'], ['Allele', 'a version of a gene'], ['1789', 'French Revolution'], ['Catalyst', 'speeds up a reaction'], ['Photosynthesis', 'light into sugar'], ['Simile', 'a comparison with like/as']];
  var SCENES = {};

  /* ═════════ FLASHCARDS · NIGHT TRAIN ═════════ */
  SCENES.train = {
    build: function () {
      var r = R(11), o = off(), x = o[1], win = { x: W * .03, y: H * .12, w: W * .94, h: H * .48 }, tabY = H * .74;
      wood(x, 0, 0, W, H, '#3a2418', '#24160d', r, true);
      for (var px = 0; px < W; px += 90 * S) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(px, 0, 2, H); }
      x.fillStyle = '#120b07'; rr(x, win.x - 10 * S, win.y - 10 * S, win.w + 20 * S, win.h + 20 * S, 26 * S); x.fill();
      x.fillStyle = '#5a1f22'; x.fillRect(0, tabY + 30 * S, W, H);
      for (var sx = 0; sx < W; sx += 40 * S) { x.fillStyle = 'rgba(0,0,0,.18)'; x.fillRect(sx, tabY + 30 * S, 2 * S, H); }
      wood(x, W * .01, tabY, W * .98, 24 * S, '#7a5232', '#4a301c', r); x.fillStyle = '#c9b48a'; x.fillRect(W * .01, tabY + 22 * S, W * .98, 3 * S);
      var lampY = win.y + win.h * .35;
      [W * .012, W * .988].forEach(function (lx) { x.fillStyle = '#b08a4e'; rr(x, lx - 6 * S, lampY - 18 * S, 12 * S, 36 * S, 4 * S); x.fill(); x.fillStyle = '#fff2d0'; x.beginPath(); x.arc(lx, lampY - 22 * S, 9 * S, 0, 7); x.fill(); });
      var stackX = Math.max(62 * S, Math.min(W * .1, LM * .5)), cupX = W - Math.max(46 * S, Math.min(W * .1, RM * .45));
      card(x, stackX - 4 * S, tabY - 6 * S, 92 * S, 58 * S, -.1); card(x, stackX + 2 * S, tabY - 9 * S, 92 * S, 58 * S, .06);
      x.fillStyle = '#e8e2d6'; x.beginPath(); x.ellipse(cupX, tabY + 2 * S, 34 * S, 8 * S, 0, 0, 7); x.fill();
      lighting(x, [[W * .012, lampY, 260 * S, .95], [W * .988, lampY, 260 * S, .95], [W / 2, win.y + win.h / 2, W * .5, .6], [stackX, tabY, 200 * S, .8], [cupX, tabY, 200 * S, .8]], .6);
      x.globalCompositeOperation = 'lighter'; glow(x, W * .012, lampY - 22 * S, 60 * S, WARM, .6); glow(x, W * .988, lampY - 22 * S, 60 * S, WARM, .6); x.globalCompositeOperation = 'source-over';
      function strip(w, draw) { var c = off(w, win.h); draw(c[1], w); return c[0]; }
      var far = strip(W * 2, function (s, w) { s.fillStyle = '#1c2a44'; s.beginPath(); s.moveTo(0, win.h); for (var i = 0; i <= w; i += 20) s.lineTo(i, win.h * .62 - Math.sin(i / 160) * 22 * S - Math.sin(i / 57) * 7 * S); s.lineTo(w, win.h); s.fill();
        for (var k = 0; k < 18; k++) { s.fillStyle = 'rgba(255,200,120,' + (.4 + r() * .4) + ')'; s.beginPath(); s.arc(r() * w, win.h * (.64 + r() * .1), 1.6 * S, 0, 7); s.fill(); } });
      var mid = strip(W * 2, function (s, w) { s.fillStyle = '#0d1424'; for (var i = 0; i < w; i += (10 + r() * 24) * S) { var th = (30 + r() * 46) * S; for (var k = 0; k < 3; k++) { var ky = win.h * .9 - th + k * th * .28; s.beginPath(); s.moveTo(i, ky); s.lineTo(i + th * (.25 + k * .08), ky + th * .45); s.lineTo(i - th * (.25 + k * .08), ky + th * .45); s.fill(); } } s.fillRect(0, win.h * .9, w, win.h); });
      var stars = []; for (var k2 = 0; k2 < 70; k2++) stars.push([r(), r() * .5, r()]);
      return { bg: o[0], win: win, far: far, mid: mid, stars: stars, precip: rain(WEATHER === 'snow' ? 160 : 180, r, [win.x, win.y, win.w, win.h]), off: [0, 0, 0], cup: [cupX, tabY + 2 * S], flip: 0, side: 0, term: 0, stackX: stackX, tabY: tabY, stack: [stackX - 55 * S, tabY - 44 * S, 110 * S, 64 * S] };
    },
    tick: function (st, x, t, dt) {
      var w = st.win; st.off[0] = (st.off[0] + dt * 10 * S) % (W * 2); st.off[1] = (st.off[1] + dt * 70 * S) % (W * 2); st.off[2] = (st.off[2] + dt * 520 * S) % (420 * S);
      x.save(); rr(x, w.x, w.y, w.w, w.h, 20 * S); x.clip();
      x.fillStyle = skyGrad(x, w.y, w.h); x.fillRect(w.x, w.y, w.w, w.h);
      drawStars(x, st.stars, [w.x, w.y, w.w, w.h * .8], t); drawMoon(x, w.x + w.w * .78, w.y + w.h * .22, 15 * S);
      x.drawImage(st.far, w.x - st.off[0], w.y, W * 2, w.h); x.drawImage(st.far, w.x - st.off[0] + W * 2, w.y, W * 2, w.h);
      x.drawImage(st.mid, w.x - st.off[1], w.y, W * 2, w.h); x.drawImage(st.mid, w.x - st.off[1] + W * 2, w.y, W * 2, w.h);
      x.fillStyle = '#05070d'; for (var px = -st.off[2]; px < W + 420 * S; px += 420 * S) { x.fillRect(w.x + px, w.y + w.h * .2, 7 * S, w.h); x.fillRect(w.x + px - 30 * S, w.y + w.h * .26, 60 * S, 3 * S); }
      x.strokeStyle = 'rgba(10,10,14,.9)'; x.lineWidth = 1.2; x.beginPath(); for (var px2 = -st.off[2]; px2 < W + 420 * S; px2 += 420 * S) { x.moveTo(w.x + px2 - 400 * S, w.y + w.h * .27); x.quadraticCurveTo(w.x + px2 - 200 * S, w.y + w.h * .34, w.x + px2, w.y + w.h * .27); } x.stroke();
      drawWeather(x, st.precip, [w.x, w.y, w.w, w.h], dt, t, .8);
      glow(x, w.x + w.w * .5, w.y + w.h * .7, w.w * .28, 'rgba(255,220,170,A)', .05);
      x.fillStyle = 'rgba(10,7,14,.35)'; x.fillRect(w.x, w.y, w.w, w.h);
      x.restore();
      x.strokeStyle = lg(x, 0, w.y, 0, w.y + w.h, [[0, '#c9b48a'], [.5, '#6a5a3a'], [1, '#c9b48a']]); x.lineWidth = 6 * S; rr(x, w.x, w.y, w.w, w.h, 20 * S); x.stroke();
      var rattle = Math.sin(t * 38) * .6 * S + Math.sin(t * 7) * .4 * S, c = st.cup;
      x.fillStyle = lg(x, c[0] - 22 * S, 0, c[0] + 22 * S, 0, [[0, '#a8a296'], [.5, '#d8d2c6'], [1, '#8a847a']]); rr(x, c[0] - 20 * S, c[1] - 34 * S + rattle, 40 * S, 32 * S, [3 * S, 3 * S, 10 * S, 10 * S]); x.fill();
      x.fillStyle = '#5a3420'; x.beginPath(); x.ellipse(c[0], c[1] - 34 * S + rattle, 20 * S, 5 * S, 0, 0, 7); x.fill(); steam(x, c[0], c[1] - 34 * S + rattle, t, S);
      if (st.flip > 0) st.flip = Math.max(0, st.flip - dt * 2.4);
      var sc = Math.abs(Math.cos((1 - st.flip) * Math.PI)), back = st.flip > .5 ? st.side === 0 : st.side === 1, tm = TERMS[st.term % TERMS.length];
      x.save(); x.translate(st.stackX, st.tabY - 12 * S); x.scale(st.flip > 0 ? Math.max(.04, sc) : 1, 1); card(x, 0, 0, 96 * S, 60 * S, -.03, back ? tm[1] : tm[0], back); x.restore();
    },
    click: function (st, px, py) { if (inside(px, py, st.stack)) { st.flip = 1; if (st.side === 1) { st.side = 0; st.term++; } else st.side = 1; return true; } },
    hover: function (st, px, py) { return inside(px, py, st.stack); }
  };

  /* ═════════ PRACTICE · RAINY EXAM HALL ═════════ */
  SCENES.hall = {
    build: function () {
      var r = R(41), o = off(), x = o[1], ww = Math.max(70 * S, Math.min(W * .13, LM * .8)), wins = [[Math.max(8 * S, (LM - ww) / 2), H * .1, ww, H * .5], [W - Math.max(8 * S, (RM - ww) / 2) - ww, H * .1, ww, H * .5]];
      x.fillStyle = lg(x, 0, 0, 0, H, [[0, '#2a2620'], [1, '#1a1612']]); x.fillRect(0, 0, W, H);
      for (var p = 0; p < W; p += 110 * S) { x.fillStyle = 'rgba(0,0,0,.2)'; x.fillRect(p, 0, 6 * S, H * .66); }
      wood(x, 0, H * .66, W, H * .34, '#4a3220', '#2a1c10', r);
      wins.forEach(function (w) { x.fillStyle = '#0e0c0a'; rr(x, w[0] - 8 * S, w[1] - 8 * S, w[2] + 16 * S, w[3] + 16 * S, [w[2] / 2 + 8 * S, w[2] / 2 + 8 * S, 0, 0]); x.fill(); });
      var lamps = [];
      for (var row = 0; row < 3; row++) { var y = H * (.7 + row * .1), sc = .75 + row * .2;
        for (var c = 0; c < 7; c++) { var cx = W * (.04 + c * .155) + (row % 2) * W * .03; if (cx > W * .98) continue;
          wood(x, cx - 60 * S * sc, y, 120 * S * sc, 12 * S * sc, '#7a5232', '#4a301c', r); x.fillStyle = '#f2ece0'; x.fillRect(cx - 26 * S * sc, y + 2 * S, 30 * S * sc, 7 * S * sc);
          lamps.push({ x: cx + 34 * S * sc, y: y, s: sc, on: r() < .75 }); } }
      lighting(x, [[wins[0][0] + ww / 2, H * .35, 300 * S, .8], [wins[1][0] + ww / 2, H * .35, 300 * S, .8]], .62);
      return { bg: o[0], wins: wins, lamps: lamps, stars: skyStars(r, 30), precip: wins.map(function (w) { return rain(70, r, w); }) };
    },
    tick: function (st, x, t, dt) {
      st.wins.forEach(function (w, i) { x.save(); rr(x, w[0], w[1], w[2], w[3], [w[2] / 2, w[2] / 2, 0, 0]); x.clip();
        x.fillStyle = skyGrad(x, w[1], w[3]); x.fillRect(w[0], w[1], w[2], w[3]);
        drawStars(x, st.stars, w, t); drawMoon(x, w[0] + w[2] * (i ? .3 : .7), w[1] + w[3] * .2, 8 * S);
        drawWeather(x, st.precip[i], w, dt, t, 0);
        x.strokeStyle = '#1a1612'; x.lineWidth = 4 * S; x.beginPath(); x.moveTo(w[0] + w[2] / 2, w[1]); x.lineTo(w[0] + w[2] / 2, w[1] + w[3]); x.moveTo(w[0], w[1] + w[3] * .5); x.lineTo(w[0] + w[2], w[1] + w[3] * .5); x.stroke(); x.restore(); });
      st.lamps.forEach(function (l) { var s = S * l.s;
        if (l.on) { x.globalCompositeOperation = 'lighter'; glow(x, l.x - 10 * s, l.y, 120 * s, 'rgba(255,214,140,A)', .3); x.globalCompositeOperation = 'source-over'; }
        x.fillStyle = '#b08a3e'; x.fillRect(l.x - 1.5 * s, l.y - 26 * s, 3 * s, 26 * s); x.fillRect(l.x - 8 * s, l.y - 2 * s, 16 * s, 3 * s);
        x.fillStyle = lg(x, 0, l.y - 38 * s, 0, l.y - 26 * s, [[0, l.on ? '#3a9a60' : '#1e4a30'], [1, l.on ? '#1a6a40' : '#0e2a1a']]); x.beginPath(); x.moveTo(l.x - 22 * s, l.y - 26 * s); x.quadraticCurveTo(l.x, l.y - 44 * s, l.x + 22 * s, l.y - 26 * s); x.closePath(); x.fill();
        if (l.on) { x.fillStyle = '#fff0c8'; x.fillRect(l.x - 18 * s, l.y - 27 * s, 36 * s, 2 * s); } });
    },
    lampAt: function (st, px, py) { return st.lamps.filter(function (q) { return Math.abs(px - q.x) < 26 * S * q.s && py < q.y + 4 * S && py > q.y - 46 * S * q.s; })[0]; },
    click: function (st, px, py) { var l = this.lampAt(st, px, py); if (l) { l.on = !l.on; return true; } },
    hover: function (st, px, py) { return !!this.lampAt(st, px, py); }
  };

  /* ═════════ LIBRARY · THE OWL LIBRARY (the owl is your coach) ═════════ */
  var OWL_TIPS = ['Hoo! Ask me anything.', 'Need a summary?', 'Explain it back to me!', 'Stuck? Let’s break it down.', 'Quiz me on your notes!'];
  /* the owl: blinks, breathes, watches the mouse, hoots a tip when tapped */
  function OWL_DRAW(st, x, t, dt) {
      var o = st.owl, s = S * 1.1, hop = o.hoot > 0 ? Math.abs(Math.sin(o.hoot * 12)) * 6 * s : 0, by = o.y - hop, breathe = 1 + .02 * Math.sin(t * 2);
      o.nextBlink -= dt; if (o.nextBlink <= 0) { o.blink = .18; o.nextBlink = 2 + Math.random() * 4; } o.blink = Math.max(0, o.blink - dt); o.hoot = Math.max(0, o.hoot - dt * .45);
      shadow(x, o.x, o.y, 30 * s, 5 * s, .5);
      x.save(); x.translate(o.x, by - 30 * s); x.scale(1, breathe);
      x.fillStyle = rg(x, -8 * s, -10 * s, 4, 50 * s, [[0, '#9a7a52'], [1, '#4a3420']]); x.beginPath(); x.ellipse(0, 0, 26 * s, 32 * s, 0, 0, 7); x.fill();   /* body */
      [-1, 1].forEach(function (k) { x.fillStyle = '#5a3e24'; x.beginPath(); x.ellipse(k * 20 * s, 4 * s, 10 * s, 24 * s, k * .25 - (o.hoot > 1.6 ? k * .6 : 0), 0, 7); x.fill();   /* wings (they lift when it hoots) */
        x.strokeStyle = 'rgba(30,20,10,.35)'; x.lineWidth = 1; for (var f = 0; f < 3; f++) { x.beginPath(); x.arc(k * 20 * s, (f * 8 - 2) * s, 7 * s, k < 0 ? .2 : 1.2, k < 0 ? 1.8 : 2.9); x.stroke(); } });
      x.fillStyle = '#e2cca6'; x.beginPath(); x.ellipse(0, 9 * s, 15 * s, 18 * s, 0, 0, 7); x.fill();   /* chest */
      x.strokeStyle = 'rgba(120,90,60,.55)'; x.lineWidth = 1.1; for (var c = 0; c < 4; c++) for (var cc = -1; cc <= 1; cc++) { x.beginPath(); x.arc(cc * 6 * s, (2 + c * 7) * s, 3.5 * s, .4, 2.7); x.stroke(); }
      x.restore();
      x.fillStyle = '#6a4a2e'; x.beginPath(); x.moveTo(o.x - 22 * s, by - 52 * s); x.lineTo(o.x - 27 * s, by - 74 * s); x.lineTo(o.x - 10 * s, by - 58 * s); x.moveTo(o.x + 22 * s, by - 52 * s); x.lineTo(o.x + 27 * s, by - 74 * s); x.lineTo(o.x + 10 * s, by - 58 * s); x.fill();   /* ear tufts */
      x.fillStyle = rg(x, o.x - 6 * s, by - 56 * s, 2, 26 * s, [[0, '#9a7a52'], [1, '#6a4a2e']]); x.beginPath(); x.ellipse(o.x, by - 50 * s, 24 * s, 18 * s, 0, 0, 7); x.fill();   /* head */
      [-1, 1].forEach(function (k) { var ex = o.x + k * 10 * s, ey = by - 50 * s;
        x.fillStyle = '#ecdcbc'; x.beginPath(); x.arc(ex, ey, 9 * s, 0, 7); x.fill();
        if (o.blink > 0 || o.hoot > .3) { x.strokeStyle = '#2a1a0e'; x.lineWidth = 2 * s; x.beginPath(); if (o.hoot > .3) x.arc(ex, ey + 2 * s, 5 * s, 3.4, 6); else { x.moveTo(ex - 6 * s, ey); x.lineTo(ex + 6 * s, ey); } x.stroke(); }
        else { var dx = st.mouse[0] - ex, dy = st.mouse[1] - ey, dl = Math.hypot(dx, dy) || 1; x.fillStyle = '#f2b84b'; x.beginPath(); x.arc(ex + dx / dl * 2.5 * s, ey + dy / dl * 2.5 * s, 6 * s, 0, 7); x.fill();
          x.fillStyle = '#120a04'; x.beginPath(); x.arc(ex + dx / dl * 3.5 * s, ey + dy / dl * 3.5 * s, 3.4 * s, 0, 7); x.fill(); x.fillStyle = '#fff'; x.beginPath(); x.arc(ex + dx / dl * 3.5 * s - 1.5 * s, ey + dy / dl * 3.5 * s - 1.5 * s, 1.2 * s, 0, 7); x.fill(); }
        x.strokeStyle = '#c9a040'; x.lineWidth = 1.6 * s; x.beginPath(); x.arc(ex, ey, 10.5 * s, 0, 7); x.stroke();   /* round reading glasses */
        x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.arc(ex - 3 * s, ey - 3 * s, 4 * s, 0, 7); x.fill(); });
      x.strokeStyle = '#c9a040'; x.lineWidth = 1.4 * s; x.beginPath(); x.moveTo(o.x - .5 * s, by - 52 * s); x.quadraticCurveTo(o.x, by - 55 * s, o.x + .5 * s, by - 52 * s); x.stroke();
      x.fillStyle = '#e0a020'; x.beginPath(); x.moveTo(o.x - 3 * s, by - 45 * s); x.lineTo(o.x + 3 * s, by - 45 * s); x.lineTo(o.x, by - 37 * s); x.fill();
      x.fillStyle = '#e0a020'; [-1, 1].forEach(function (k) { x.fillRect(o.x + k * 8 * s - 4 * s, o.y - 3 * s, 8 * s, 3 * s); });
      if (o.hoot > 0) { var tip = OWL_TIPS[o.tip % OWL_TIPS.length], al = Math.min(1, o.hoot * 2), right = o.x < W / 2; x.font = '700 ' + Math.round(17 * s) + 'px Caveat, cursive';
        var tw = x.measureText(tip).width + 24 * s, bx = right ? o.x + 22 * s : o.x - 22 * s - tw, bby = by - 112 * s; x.globalAlpha = al;
        x.fillStyle = '#f6efdf'; rr(x, bx, bby, tw, 40 * s, 12 * s); x.fill(); x.beginPath(); x.moveTo(o.x + (right ? 8 : -8) * s, bby + 40 * s); x.lineTo(o.x + (right ? 2 : -2) * s, bby + 56 * s); x.lineTo(o.x + (right ? 24 : -24) * s, bby + 40 * s); x.fill();
        x.fillStyle = '#2a1a0e'; x.textAlign = 'left'; x.fillText(tip, bx + 12 * s, bby + 26 * s); x.globalAlpha = 1; }
  }
  SCENES.owl = {
    build: function () {
      var r = R(51), o = off(), x = o[1], shW = Math.max(110 * S, Math.min(W * .17, LM + 30 * S)), floorY = H * .7;
      x.fillStyle = lg(x, 0, 0, 0, H, [[0, '#24180f'], [1, '#140c07']]); x.fillRect(0, 0, W, H);
      /* the upper gallery: shelves behind a wooden railing */
      shelf(x, 0, H * .02, W, H * .26, 2, r);
      wood(x, 0, H * .28, W, 12 * S, '#6a4a2a', '#3a2716', r);
      for (var bx = 6 * S; bx < W; bx += 22 * S) { x.fillStyle = lg(x, bx, 0, bx + 8 * S, 0, [[0, '#5a3d24'], [.5, '#8a6440'], [1, '#3a2716']]); x.fillRect(bx, H * .28 + 12 * S, 8 * S, 34 * S); }   /* balusters */
      wood(x, 0, H * .28 + 46 * S, W, 10 * S, '#5a3d24', '#2a1c10', r);
      /* the round window up in the gallery (its sky is painted every frame) */
      var rw = { x: W * .76, y: H * .15, r: Math.min(W * .06, 62 * S) };   /* up on the right, clear of the heading */
      x.fillStyle = '#3a2416'; x.beginPath(); x.arc(rw.x, rw.y, rw.r + 10 * S, 0, 7); x.fill();
      /* the main hall: one long bookcase along the back wall */
      shelf(x, 0, H * .28 + 56 * S, W, floorY - (H * .28 + 56 * S), 3, r);
      /* tall bookshelves on both sides, closest to you */
      shelf(x, 0, H * .02, shW, floorY + 30 * S - H * .02, 7, r); shelf(x, W - shW, H * .02, shW, floorY + 30 * S - H * .02, 7, r);
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(shW, 0, 6 * S, floorY); x.fillRect(W - shW - 6 * S, 0, 6 * S, floorY);
      var lx = W - shW * .7;
      x.strokeStyle = '#7a5434'; x.lineWidth = 5 * S; x.beginPath(); x.moveTo(lx, H * .02); x.lineTo(lx - 34 * S, floorY + 26 * S); x.moveTo(lx + 52 * S, H * .02); x.lineTo(lx + 18 * S, floorY + 26 * S); x.stroke();
      x.lineWidth = 4 * S; for (var ry = H * .06; ry < floorY + 20 * S; ry += 30 * S) { var f = (ry - H * .02) / (floorY + 24 * S - H * .02); x.beginPath(); x.moveTo(lx - f * 34 * S, ry); x.lineTo(lx + 52 * S - f * 34 * S, ry); x.stroke(); }   /* rolling ladder */
      wood(x, 0, floorY + 30 * S, W, H - floorY, '#4a2f1a', '#2a1a0e', r);
      x.fillStyle = '#6a1f1f'; x.beginPath(); x.moveTo(W * .42, floorY + 30 * S); x.lineTo(W * .58, floorY + 30 * S); x.lineTo(W * .72, H); x.lineTo(W * .28, H); x.fill();   /* runner rug */
      /* piles of books on the floor */
      function pile(cx, base, n, sc) { for (var i = 0; i < n; i++) { var bw = (40 + r() * 26) * S * sc, bh = (8 + r() * 5) * S * sc, c = ['#6E2F2A', '#2F4A5E', '#55602e', '#9c6f22', '#4a3a66', '#2e5a52'][Math.floor(r() * 6)];
        x.fillStyle = lg(x, 0, base - bh, 0, base, [[0, c], [1, 'rgba(0,0,0,.6)']]); x.fillRect(cx - bw / 2 + (r() - .5) * 8 * S, base - bh, bw, bh); x.fillStyle = 'rgba(232,215,180,.5)'; x.fillRect(cx + bw / 2 - 5 * S, base - bh + 2, 3 * S, bh - 4); base -= bh; } return base; }
      pile(shW + 30 * S, floorY + 40 * S, 6, .9); pile(W - shW - 30 * S, floorY + 40 * S, 5, .9); pile(W * .5, floorY + 34 * S, 3, .7);
      /* long reading tables with benches, green lamps and books */
      var tables = [], lamps = [];
      [[.27, .87], [.73, .87]].forEach(function (tb) {
        var cx = W * tb[0], ty = H * tb[1], tw = W * .3;
        wood(x, cx - tw / 2, ty + 34 * S, tw, 10 * S, '#6a4a2a', '#3a2716', r);   /* bench */
        x.fillStyle = '#2a1a0e'; x.fillRect(cx - tw / 2 + 10 * S, ty + 44 * S, 7 * S, 26 * S); x.fillRect(cx + tw / 2 - 17 * S, ty + 44 * S, 7 * S, 26 * S);
        wood(x, cx - tw / 2, ty, tw, 14 * S, '#8a5e36', '#5a3a20', r);   /* table top */
        x.fillStyle = '#2a1a0e'; x.fillRect(cx - tw / 2 + 14 * S, ty + 14 * S, 9 * S, 40 * S); x.fillRect(cx + tw / 2 - 23 * S, ty + 14 * S, 9 * S, 40 * S);
        x.fillStyle = '#efe6d2'; x.beginPath(); x.moveTo(cx - 40 * S, ty); x.quadraticCurveTo(cx - 20 * S, ty - 8 * S, cx, ty - 2 * S); x.quadraticCurveTo(cx + 20 * S, ty - 8 * S, cx + 40 * S, ty); x.lineTo(cx + 40 * S, ty + 2 * S); x.lineTo(cx - 40 * S, ty + 2 * S); x.fill();   /* an open book */
        pile(cx - tw * .32, ty, 4, .8); pile(cx + tw * .3, ty, 3, .8);
        lamps.push([cx - tw * .18, ty, .9], [cx + tw * .14, ty, .9]); tables.push([cx, ty]);
      });
      /* the owl sits on a tall pile of books at the end of the left table, in the margin beside the page */
      var owlX = Math.max(46 * S, Math.min(shW * .55, LM * .5)), owlBase = pile(owlX, floorY + 26 * S, 7, 1.05);
      var chand = [[W * .3, H * .38], [W * .7, H * .38]];
      lighting(x, [[chand[0][0], chand[0][1], 300 * S, .8], [chand[1][0], chand[1][1], 300 * S, .8], [rw.x, rw.y, 200 * S, .6], [owlX, owlBase - 40 * S, 170 * S, .8]].concat(lamps.map(function (l) { return [l[0], l[1], 170 * S, .9]; })), .55);
      /* a soft shadow behind the heading so the words read clearly over all those books */
      var hx = LM + (W * .62 - LM) / 2, hy = H * .22;
      x.save(); x.translate(hx, hy); x.scale(1, .42); x.fillStyle = rg(x, 0, 0, 0, W * .36, [[0, 'rgba(12,8,5,.72)'], [.6, 'rgba(12,8,5,.5)'], [1, 'rgba(12,8,5,0)']]); x.beginPath(); x.arc(0, 0, W * .36, 0, 7); x.fill(); x.restore();
      return { bg: o[0], rw: rw, lamps: lamps, chand: chand, stars: skyStars(r, 26), precip: rain(60, r, [rw.x - rw.r, rw.y - rw.r, rw.r * 2, rw.r * 2]),
        owl: { x: owlX, y: owlBase, blink: 0, nextBlink: 2, hoot: 0, tip: 0 }, mouse: [W / 2, H / 2], dust: motes(70, r, [W * .2, H * .3, W * .6, H * .5]) };
    },
    tick: function (st, x, t, dt) {
      var w = st.rw; x.save(); x.beginPath(); x.arc(w.x, w.y, w.r, 0, 7); x.clip();
      x.fillStyle = skyGrad(x, w.y - w.r, w.r * 2); x.fillRect(w.x - w.r, w.y - w.r, w.r * 2, w.r * 2);
      drawStars(x, st.stars, [w.x - w.r, w.y - w.r, w.r * 2, w.r * 2], t); drawMoon(x, w.x + w.r * .35, w.y - w.r * .35, 9 * S);
      drawWeather(x, st.precip, [w.x - w.r, w.y - w.r, w.r * 2, w.r * 2], dt, t, 0);
      x.strokeStyle = '#2a1a10'; x.lineWidth = 4 * S; x.beginPath(); for (var k = 0; k < 8; k++) { x.moveTo(w.x, w.y); x.lineTo(w.x + Math.cos(k * Math.PI / 4) * w.r, w.y + Math.sin(k * Math.PI / 4) * w.r); } x.stroke();
      x.beginPath(); x.arc(w.x, w.y, w.r * .35, 0, 7); x.stroke(); x.restore();
      st.chand.forEach(function (c, i) {   /* chandeliers */
        x.strokeStyle = '#120a06'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(c[0], 0); x.lineTo(c[0], c[1] - 18 * S); x.stroke();
        x.strokeStyle = '#b08a3e'; x.lineWidth = 3 * S; x.beginPath(); x.ellipse(c[0], c[1], 46 * S, 10 * S, 0, 0, Math.PI); x.stroke();
        x.globalCompositeOperation = 'lighter'; glow(x, c[0], c[1], 150 * S, WARM, .32 + Math.sin(t * 3 + i) * .02); x.globalCompositeOperation = 'source-over';
        for (var k = -2; k <= 2; k++) { var fx = c[0] + k * 22 * S, fy = c[1] + Math.cos(k / 2.5) * 8 * S; x.fillStyle = '#efe6d2'; x.fillRect(fx - 2.5 * S, fy - 12 * S, 5 * S, 12 * S); x.fillStyle = '#ffe2a0'; x.beginPath(); x.ellipse(fx, fy - 15 * S, 2.5 * S, 4.5 * S * (1 + .12 * Math.sin(t * 9 + k)), 0, 0, 7); x.fill(); }
      });
      st.lamps.forEach(function (l, i) { var s = l[2] * S, lx = l[0], ly = l[1];   /* green reading lamps */
        x.globalCompositeOperation = 'lighter'; glow(x, lx - 10 * s, ly, 130 * s, 'rgba(255,214,140,A)', .3 + Math.sin(t * 2 + i) * .02); x.globalCompositeOperation = 'source-over';
        x.fillStyle = '#b08a3e'; x.fillRect(lx - 1.5 * s, ly - 26 * s, 3 * s, 26 * s); x.fillRect(lx - 8 * s, ly - 2 * s, 16 * s, 3 * s);
        x.fillStyle = lg(x, 0, ly - 38 * s, 0, ly - 26 * s, [[0, '#3a9a60'], [1, '#1a6a40']]); x.beginPath(); x.moveTo(lx - 22 * s, ly - 26 * s); x.quadraticCurveTo(lx, ly - 44 * s, lx + 22 * s, ly - 26 * s); x.closePath(); x.fill(); x.fillStyle = '#fff0c8'; x.fillRect(lx - 18 * s, ly - 27 * s, 36 * s, 2 * s); });
      drawMotes(x, st.dust, dt, t, [W * .2, H * .3, W * .6, H * .5]);
      OWL_DRAW(st, x, t, dt);
    },
    move: function (st, px, py) { st.mouse = [px, py]; },
    hit: function (st, px, py) { var o = st.owl; return Math.abs(px - o.x) < 34 * S && py > o.y - 84 * S && py < o.y + 4 * S; },
    click: function (st, px, py) {
      if (!this.hit(st, px, py)) return;
      st.owl.hoot = 2.4; st.owl.tip++;
      var side = document.getElementById('coach-sidebar'), btn = document.getElementById('coach-toggle');   /* the owl IS the coach: open the chat */
      if (btn && side && !side.classList.contains('coach-open')) setTimeout(function () { btn.click(); }, 450);
      return true;
    },
    hover: function (st, px, py) { return this.hit(st, px, py); }
  };

  /* ═════════ STUDY BACKGROUND · RAINY NIGHT CAFÉ ═════════ */
  var CAFE_IN = {
    build: function () {
      var r = R(61), o = off(), x = o[1], floorY = H * .86, counterY = H * .62;
      var X0 = W - Math.max(RM, 250 * S), CW = W - X0;                 /* the espresso bar, in the right margin */
      var win = { x: W * .02, y: H * .24, w: Math.max(LM - W * .02 + 60 * S, W * .3), h: H * .38 };
      /* exposed brick wall above a wooden panel */
      x.fillStyle = '#4a2418'; x.fillRect(0, 0, W, floorY);
      var bh = 13 * S, bw = 34 * S;
      x.fillStyle = '#2c211b'; x.fillRect(0, 0, W, counterY + 10 * S);   /* mortar */
      var BRICK = [[112, 58, 42], [98, 50, 38], [124, 68, 48], [88, 46, 36], [106, 62, 46], [118, 74, 56]];
      for (var row = 0, y = 0; y < counterY + 10 * S; row++, y += bh) for (var bx = -(row % 2) * bw / 2 - r() * 4 * S; bx < W; ) {
        var bw2 = bw * (.9 + r() * .2), c0 = BRICK[Math.floor(r() * BRICK.length)], v = .85 + r() * .3;
        var cc = function (m) { return 'rgb(' + Math.round(c0[0] * v * m) + ',' + Math.round(c0[1] * v * m) + ',' + Math.round(c0[2] * v * m) + ')'; };
        x.fillStyle = lg(x, 0, y, 0, y + bh, [[0, cc(1.08)], [.5, cc(1)], [1, cc(.78)]]); rr(x, bx + 1.2, y + 1.2, bw2 - 2.4, bh - 2.4, 1.2 * S); x.fill();
        for (var sp = 0; sp < 7; sp++) { x.fillStyle = r() < .5 ? 'rgba(0,0,0,.22)' : 'rgba(255,220,190,.10)'; x.fillRect(bx + 2 + r() * (bw2 - 4), y + 2 + r() * (bh - 4), 1 + r() * 1.5, 1 + r() * 1.5); }
        if (r() < .12) { x.fillStyle = '#2c211b'; x.beginPath(); x.arc(bx + (r() < .5 ? 2 : bw2 - 2), y + r() * bh, 2 + r() * 3 * S, 0, 7); x.fill(); }   /* a chipped corner */
        bx += bw2; }
      for (var so = 0; so < 14; so++) { var sx = r() * W, sy2 = r() * counterY; x.fillStyle = rg(x, sx, sy2, 0, (60 + r() * 140) * S, [[0, 'rgba(20,10,6,' + (.12 + r() * .14) + ')'], [1, 'rgba(20,10,6,0)']]); x.fillRect(sx - 200 * S, sy2 - 200 * S, 400 * S, 400 * S); }   /* soot and age */
      x.fillStyle = lg(x, 0, 0, 0, counterY, [[0, 'rgba(10,6,4,.45)'], [.35, 'rgba(10,6,4,0)']]); x.fillRect(0, 0, W, counterY);
      wood(x, 0, counterY + 10 * S, W, floorY - counterY - 10 * S, '#3a2414', '#24160c', r);
      /* chequered floor */
      for (var fr = 0, fy = floorY; fy < H; fr++) { var fh = 8 * S * (1 + fr * .45), tw = 26 * S * (1 + fr * .16);   /* tiles grow toward you */
        for (var fc = 0, fx = W / 2 - Math.ceil(W / 2 / tw) * tw; fx < W; fc++, fx += tw) { var vv = .9 + r() * .2;
          x.fillStyle = (fc + fr) % 2 === 0 ? 'rgb(' + Math.round(150 * vv) + ',' + Math.round(138 * vv) + ',' + Math.round(116 * vv) + ')' : 'rgb(' + Math.round(30 * vv) + ',' + Math.round(25 * vv) + ',' + Math.round(22 * vv) + ')'; x.fillRect(fx + .6, fy + .6, tw - 1.2, fh - 1.2); }
        fy += fh; }
      x.fillStyle = lg(x, 0, floorY, 0, H, [[0, 'rgba(0,0,0,.62)'], [1, 'rgba(0,0,0,.3)']]); x.fillRect(0, floorY, W, H - floorY);
      /* the big window (the street outside is painted every frame) */
      x.fillStyle = '#120a06'; x.fillRect(win.x - 10 * S, win.y - 10 * S, win.w + 20 * S, win.h + 20 * S);
      wood(x, win.x - 18 * S, win.y + win.h + 6 * S, win.w + 36 * S, 14 * S, '#6a4a2a', '#3a2716', r);   /* sill */
      /* the café's name: a wooden sign with gold lettering, in the left margin above the window */
      var sg = { w: Math.min(Math.max(LM - 30 * S, 190 * S), 300 * S), h: 64 * S }; sg.x = Math.max(12 * S, (Math.min(LM, win.x + win.w) - sg.w) / 2); sg.y = Math.max(win.y - sg.h - 26 * S, 70);
      x.strokeStyle = '#2a1a10'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(sg.x + sg.w * .2, sg.y - 30 * S); x.lineTo(sg.x + sg.w * .2, sg.y); x.moveTo(sg.x + sg.w * .8, sg.y - 30 * S); x.lineTo(sg.x + sg.w * .8, sg.y); x.stroke();
      x.fillStyle = 'rgba(0,0,0,.4)'; rr(x, sg.x + 5 * S, sg.y + 7 * S, sg.w, sg.h, 6 * S); x.fill();
      wood(x, sg.x, sg.y, sg.w, sg.h, '#3a2416', '#1e120a', r);
      x.strokeStyle = '#c9a040'; x.lineWidth = 1.6 * S; rr(x, sg.x + 5 * S, sg.y + 5 * S, sg.w - 10 * S, sg.h - 10 * S, 4 * S); x.stroke();
      var fs = Math.min(30 * S, sg.w / 6.2); x.textBaseline = 'alphabetic';
      x.font = '800 ' + Math.round(fs) + 'px "Playfair Display", Georgia, serif'; var w1 = x.measureText('Study').width;
      x.font = 'italic 800 ' + Math.round(fs) + 'px "Playfair Display", Georgia, serif'; var w2 = x.measureText('Sync').width;
      var tx0 = sg.x + sg.w / 2 - (w1 + w2) / 2, ty0 = sg.y + sg.h * .56;
      x.shadowColor = 'rgba(0,0,0,.6)'; x.shadowBlur = 4 * S; x.textAlign = 'left';
      x.fillStyle = lg(x, 0, ty0 - fs, 0, ty0, [[0, '#ffe08a'], [.5, '#e8b04a'], [1, '#b8862a']]); x.font = '800 ' + Math.round(fs) + 'px "Playfair Display", Georgia, serif'; x.fillText('Study', tx0, ty0);
      x.fillStyle = '#f3e9d6'; x.font = 'italic 800 ' + Math.round(fs) + 'px "Playfair Display", Georgia, serif'; x.fillText('Sync', tx0 + w1, ty0);
      x.shadowBlur = 0; x.fillStyle = '#c9a040'; x.textAlign = 'center'; x.font = '700 ' + Math.round(9.5 * S) + 'px Karla, sans-serif';
      x.fillText('—  C A F É  ·  E S T .  2 0 0 3  —', sg.x + sg.w / 2, sg.y + sg.h * .84);
      [sg.x + sg.w * .2, sg.x + sg.w * .8].forEach(function (lx) { x.strokeStyle = '#8a6a3a'; x.lineWidth = 2.4 * S; x.beginPath(); x.moveTo(lx, sg.y - 30 * S); x.quadraticCurveTo(lx, sg.y - 42 * S, lx + 12 * S, sg.y - 36 * S); x.stroke(); x.fillStyle = '#b08a4e'; x.beginPath(); x.moveTo(lx + 6 * S, sg.y - 36 * S); x.lineTo(lx + 20 * S, sg.y - 36 * S); x.lineTo(lx + 16 * S, sg.y - 28 * S); x.lineTo(lx + 10 * S, sg.y - 28 * S); x.fill(); });   /* little brass sign lamps */
      /* shelves behind the counter: jars of coffee beans and mugs */
      var shelfY = [H * .33, H * .48];
      shelfY.forEach(function (sy, k) {
        wood(x, X0 + 6 * S, sy, CW - 12 * S, 8 * S, '#8a5e36', '#5a3a20', r);
        for (var px = X0 + 18 * S; px < W - (k ? 30 : 84) * S; px += (k ? 34 : 40) * S) {
          if (k === 0) {   /* glass jars of beans */
            x.fillStyle = 'rgba(200,220,230,.18)'; rr(x, px, sy - 40 * S, 26 * S, 40 * S, 4 * S); x.fill();
            x.fillStyle = '#3a1e10'; x.fillRect(px + 2 * S, sy - 26 * S, 22 * S, 24 * S);
            for (var b = 0; b < 10; b++) { x.fillStyle = r() < .5 ? '#5a3018' : '#2a140a'; x.beginPath(); x.ellipse(px + 4 * S + r() * 18 * S, sy - 24 * S + r() * 20 * S, 2.4 * S, 1.6 * S, r() * 3, 0, 7); x.fill(); }
            x.fillStyle = '#b08a4e'; x.fillRect(px - 1 * S, sy - 44 * S, 28 * S, 6 * S);
            x.fillStyle = '#d8ccb0'; x.fillRect(px + 4 * S, sy - 18 * S, 18 * S, 8 * S); x.fillStyle = 'rgba(60,40,20,.6)'; x.fillRect(px + 7 * S, sy - 15 * S, 12 * S, 1 * S);
            x.fillStyle = lg(x, px, 0, px + 26 * S, 0, [[0, 'rgba(255,255,255,0)'], [.15, 'rgba(255,255,255,.28)'], [.25, 'rgba(255,255,255,0)'], [.85, 'rgba(255,255,255,.08)'], [1, 'rgba(255,255,255,0)']]); rr(x, px, sy - 40 * S, 26 * S, 40 * S, 4 * S); x.fill();
          } else {   /* mugs */
            var mm = [['#cfc6b6', '#8a8274'], ['#8e5a42', '#4e2e20'], ['#3c4e5a', '#1e2a32'], ['#a88e5e', '#5e4a2a']][Math.floor(r() * 4)];
            x.strokeStyle = mm[1]; x.lineWidth = 3 * S; x.beginPath(); x.arc(px + 24 * S, sy - 14 * S, 6 * S, -1.3, 1.3); x.stroke();
            x.fillStyle = lg(x, px, 0, px + 24 * S, 0, [[0, mm[1]], [.3, mm[0]], [.42, 'rgba(255,248,236,.9)'], [.5, mm[0]], [1, mm[1]]]); rr(x, px, sy - 26 * S, 24 * S, 26 * S, [1.5 * S, 1.5 * S, 5 * S, 5 * S]); x.fill();
            x.fillStyle = mm[1]; x.beginPath(); x.ellipse(px + 12 * S, sy - 26 * S, 12 * S, 2 * S, 0, 0, 7); x.fill();
          }
        }
      });
      pothos(x, W - 46 * S, shelfY[0], S * 1.35, r, 7, 92 * S);   /* a trailing pothos at the end of the jar shelf */
      /* chalk menu board, with the wall clock beside it */
      var clkW = Math.min(CW * .3, 112 * S), mb = { x: X0 + 10 * S, y: H * .07, w: CW - 20 * S - clkW, h: H * .2 };
      wood(x, mb.x - 6 * S, mb.y - 6 * S, mb.w + 12 * S, mb.h + 12 * S, '#6a4a2a', '#3a2716', r);
      x.fillStyle = '#1c1f1c'; x.fillRect(mb.x, mb.y, mb.w, mb.h);
      x.fillStyle = 'rgba(240,240,230,.9)'; x.textAlign = 'center'; x.font = '700 ' + Math.round(17 * S) + 'px Caveat, Kalam, cursive'; x.fillText('~ StudySync Café ~', mb.x + mb.w / 2, mb.y + 22 * S);
      x.textAlign = 'left'; x.font = Math.round(13 * S) + 'px Kalam, Caveat, cursive';
      [['Espresso', '2.50'], ['Cappuccino', '3.80'], ['Focus latte', '4.20'], ['Exam-week mocha', '4.50']].forEach(function (m, k) { var ly = mb.y + 42 * S + k * 17 * S; if (ly > mb.y + mb.h - 4 * S) return; x.fillStyle = 'rgba(240,240,230,.85)'; x.fillText(m[0], mb.x + 12 * S, ly); x.textAlign = 'right'; x.fillStyle = '#f2c46a'; x.fillText(m[1], mb.x + mb.w - 12 * S, ly); x.textAlign = 'left'; });
      if (mb.h > 128 * S) menuDoodles(x, mb, S);
      var ck = { x: mb.x + mb.w + 6 * S + clkW / 2, y: mb.y + mb.h * .5, r: Math.min(clkW * .42, 40 * S) }; clockFace(x, ck.x, ck.y, ck.r, S);
      var front = off(), xRoom = x; x = front[1];   /* the counter and what's on it sit in front of the barista */
      /* the counter: wooden top, tiled front */
      for (var tx = X0 - 20 * S; tx < W; tx += 18 * S) for (var ty = counterY + 12 * S; ty < floorY; ty += 10 * S) { x.fillStyle = (Math.floor((ty - counterY) / (10 * S)) % 2 ? '#e9e0cc' : '#dcd0b8'); x.fillRect(tx + ((Math.floor((ty - counterY) / (10 * S)) % 2) * 9 * S), ty, 17 * S, 9 * S); }
      x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(X0 - 20 * S, counterY + 12 * S, CW + 20 * S, floorY - counterY - 12 * S);
      wood(x, X0 - 26 * S, counterY, CW + 26 * S, 14 * S, '#9a6a3e', '#5a3a20', r);
      /* grinder */
      var gx = X0 + CW * .14;
      x.fillStyle = '#1e1e22'; rr(x, gx - 14 * S, counterY - 52 * S, 28 * S, 52 * S, 4 * S); x.fill();
      x.fillStyle = 'rgba(210,225,235,.3)'; x.beginPath(); x.moveTo(gx - 16 * S, counterY - 86 * S); x.lineTo(gx + 16 * S, counterY - 86 * S); x.lineTo(gx + 8 * S, counterY - 52 * S); x.lineTo(gx - 8 * S, counterY - 52 * S); x.fill();
      x.fillStyle = '#3a1e10'; x.beginPath(); x.moveTo(gx - 13 * S, counterY - 74 * S); x.lineTo(gx + 13 * S, counterY - 74 * S); x.lineTo(gx + 8 * S, counterY - 54 * S); x.lineTo(gx - 8 * S, counterY - 54 * S); x.fill();
      /* the espresso machine: chrome body, two group heads, gauges, steam wand, cups warming on top */
      var em = { x: X0 + CW * .46, y: counterY, w: Math.min(140 * S, CW * .5), h: 80 * S };
      x.fillStyle = lg(x, em.x - em.w / 2, 0, em.x + em.w / 2, 0, [[0, '#6a6a6a'], [.2, '#e8e8e8'], [.5, '#bdbdbd'], [.8, '#f4f4f4'], [1, '#5a5a5a']]); rr(x, em.x - em.w / 2, em.y - em.h, em.w, em.h * .62, 6 * S); x.fill();
      x.fillStyle = '#b8392c'; x.fillRect(em.x - em.w / 2, em.y - em.h * .5, em.w, 6 * S);
      [-1, 1].forEach(function (k) { var gx2 = em.x + k * em.w * .22;
        x.fillStyle = '#f4ecd8'; x.beginPath(); x.arc(gx2, em.y - em.h * .72, 8 * S, 0, 7); x.fill(); x.strokeStyle = '#2a2a2a'; x.lineWidth = 1.5 * S; x.stroke();
        x.beginPath(); x.moveTo(gx2, em.y - em.h * .72); x.lineTo(gx2 + 5 * S, em.y - em.h * .76); x.stroke();   /* gauges */
        x.fillStyle = '#2a2a2a'; x.fillRect(gx2 - 9 * S, em.y - em.h * .44, 18 * S, 9 * S); x.fillRect(gx2 - 22 * S, em.y - em.h * .4, 13 * S, 4 * S);   /* group head + handle */
        x.fillStyle = '#efe6d2'; rr(x, gx2 - 8 * S, em.y - 14 * S, 16 * S, 14 * S, [1, 1, 4 * S, 4 * S]); x.fill(); });   /* espresso cups below */
      x.fillStyle = '#3a3a3a'; x.fillRect(em.x - em.w / 2 + 4 * S, em.y - 3 * S, em.w - 8 * S, 3 * S);   /* drip tray */
      x.strokeStyle = '#cfcfcf'; x.lineWidth = 3 * S; x.lineCap = 'round'; x.beginPath(); x.moveTo(em.x + em.w / 2 - 4 * S, em.y - em.h * .5); x.quadraticCurveTo(em.x + em.w / 2 + 14 * S, em.y - em.h * .3, em.x + em.w / 2 + 10 * S, em.y - 12 * S); x.stroke();   /* steam wand */
      for (var c2 = -2; c2 <= 2; c2++) { x.fillStyle = c2 % 2 ? '#efe6d2' : '#c0603a'; rr(x, em.x + c2 * 22 * S - 9 * S, em.y - em.h - 16 * S, 18 * S, 16 * S, [2, 2, 5 * S, 5 * S]); x.fill(); }   /* cups warming on top */
      /* a lit pastry case at the end of the bar (a cake under a glass dome when the bar is too short for it) */
      var pcX = em.x + em.w / 2 + 18 * S, pcW = W - 6 * S - pcX, caseL = null, cx = X0 + CW * .88;
      if (pcW >= 60 * S) { pcW = Math.min(pcW, 150 * S); pastryCase(x, pcX, counterY, pcW, 50 * S, S, r); caseL = [pcX + pcW / 2, counterY - 34 * S, 110 * S, .95]; }
      else if (cx + 30 * S < W) {
        x.fillStyle = '#d8d0c0'; x.fillRect(cx - 24 * S, counterY - 6 * S, 48 * S, 4 * S); x.fillRect(cx - 3 * S, counterY - 4 * S, 6 * S, 4 * S);
        x.fillStyle = '#6a3a20'; x.fillRect(cx - 18 * S, counterY - 26 * S, 36 * S, 20 * S); x.fillStyle = '#f4e6c8'; x.fillRect(cx - 18 * S, counterY - 18 * S, 36 * S, 3 * S); x.fillStyle = '#f4e6c8'; x.fillRect(cx - 18 * S, counterY - 28 * S, 36 * S, 4 * S);
        x.fillStyle = '#c0392b'; x.beginPath(); x.arc(cx, counterY - 32 * S, 4 * S, 0, 7); x.fill();
        x.strokeStyle = 'rgba(220,235,245,.55)'; x.lineWidth = 1.5 * S; x.beginPath(); x.moveTo(cx - 24 * S, counterY - 6 * S); x.lineTo(cx - 24 * S, counterY - 34 * S); x.quadraticCurveTo(cx, counterY - 62 * S, cx + 24 * S, counterY - 34 * S); x.lineTo(cx + 24 * S, counterY - 6 * S); x.stroke();
        x.fillStyle = 'rgba(255,255,255,.12)'; x.beginPath(); x.ellipse(cx - 10 * S, counterY - 36 * S, 5 * S, 14 * S, .3, 0, 7); x.fill();
      }
      x = xRoom;
      /* a sack of coffee beans on the floor */
      var sk = X0 - 40 * S;
      x.fillStyle = lg(x, sk - 30 * S, 0, sk + 30 * S, 0, [[0, '#8a6a40'], [.5, '#b8945e'], [1, '#6a4e2c']]); x.beginPath(); x.moveTo(sk - 30 * S, floorY + 20 * S); x.quadraticCurveTo(sk - 36 * S, floorY - 30 * S, sk - 18 * S, floorY - 50 * S); x.lineTo(sk + 18 * S, floorY - 50 * S); x.quadraticCurveTo(sk + 36 * S, floorY - 30 * S, sk + 30 * S, floorY + 20 * S); x.closePath(); x.fill();
      x.fillStyle = '#3a1e10'; x.beginPath(); x.ellipse(sk, floorY - 48 * S, 18 * S, 5 * S, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(40,24,10,.75)'; x.font = '700 ' + Math.round(9 * S) + 'px Karla, sans-serif'; x.textAlign = 'center'; x.fillText('ARABICA', sk, floorY - 14 * S);
      floorPlant(x, Math.max(26 * S, win.x + 12 * S), floorY + 14 * S, S, r);   /* a monstera in the corner by the window */
      /* the customer's bistro table (they sit in front of it, back to you; the candle and their mug go on it in the frame).
         Its own layer, so the waiter walks behind it */
      var tbl = off(); x = tbl[1];
      var radioX = Math.min(win.x + win.w - 40 * S, Math.max(60 * S, LM * .78));
      var tX = Math.max(96 * S, Math.min(W * .1, LM * .36)), tY = floorY + 20 * S - 112 * S;
      x.fillStyle = '#1a1a1a'; x.fillRect(tX - 3 * S, tY, 6 * S, floorY - tY + 20 * S); x.beginPath(); x.ellipse(tX, floorY + 20 * S, 30 * S, 6 * S, 0, 0, 7); x.fill();
      x.fillStyle = lg(x, tX - 90 * S, 0, tX + 90 * S, 0, [[0, '#5a3a20'], [.5, '#8a5e36'], [1, '#4a2e18']]); x.beginPath(); x.ellipse(tX, tY, 90 * S, 13 * S, 0, 0, 7); x.fill();
      x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(tX, tY + 4 * S, 88 * S, 11 * S, 0, 0, Math.PI); x.fill();
      x.fillStyle = '#7a2a2a'; x.save(); x.translate(tX - 48 * S, tY - 3 * S); x.rotate(-.08); x.fillRect(-16 * S, -4 * S, 32 * S, 5 * S); x.fillStyle = '#efe6d2'; x.fillRect(-14 * S, -6 * S, 28 * S, 2.5 * S); x.restore();   /* a book */
      /* your spot: laptop, latte and croissant on the window ledge, screen toward you */
      var sl = off(); x = sl[1];
      var sY = win.y + win.h + 6 * S, lapX = Math.max(win.x + 150 * S, radioX - 84 * S);
      x.fillStyle = '#2a2a30'; x.beginPath(); x.moveTo(lapX - 70 * S, sY - 1 * S); x.lineTo(lapX + 40 * S, sY - 1 * S); x.lineTo(lapX + 32 * S, sY - 9 * S); x.lineTo(lapX - 62 * S, sY - 9 * S); x.fill();
      x.fillStyle = '#1c1c22'; rr(x, lapX - 66 * S, sY - 87 * S, 102 * S, 78 * S, 5 * S); x.fill();
      x.fillStyle = 'rgba(214,222,234,.85)'; x.fillRect(lapX - 62 * S, sY - 83 * S, 94 * S, 70 * S);   /* notes open on the screen */
      x.fillStyle = 'rgba(40,50,70,.8)'; x.fillRect(lapX - 56 * S, sY - 77 * S, 40 * S, 3.2 * S);
      for (var ln = 0; ln < 11; ln++) { x.fillStyle = 'rgba(60,70,90,' + (.35 + r() * .2) + ')'; x.fillRect(lapX - 56 * S + (ln % 4 === 0 ? 0 : 4 * S), sY - 69 * S + ln * 5 * S, (36 + r() * 46) * S, 1.6 * S); }
      x.fillStyle = 'rgba(242,184,75,.45)'; x.fillRect(lapX - 52 * S, sY - 49 * S, 50 * S, 4 * S);
      var cup = [lapX - 96 * S, sY - 1 * S];
      x.fillStyle = '#e8e2d6'; x.beginPath(); x.ellipse(cup[0], cup[1], 22 * S, 5 * S, 0, 0, 7); x.fill();
      x.fillStyle = '#f0ebe0'; rr(x, cup[0] - 15 * S, cup[1] - 22 * S, 30 * S, 22 * S, [3 * S, 3 * S, 9 * S, 9 * S]); x.fill();
      x.strokeStyle = '#f0ebe0'; x.lineWidth = 3 * S; x.beginPath(); x.arc(cup[0] - 16 * S, cup[1] - 13 * S, 5 * S, Math.PI - 1.3, Math.PI + 1.3); x.stroke();
      x.fillStyle = '#c8945a'; x.beginPath(); x.ellipse(cup[0], cup[1] - 22 * S, 15 * S, 4 * S, 0, 0, 7); x.fill();
      x.fillStyle = '#f6ead8'; x.beginPath(); x.moveTo(cup[0], cup[1] - 19.5 * S); x.bezierCurveTo(cup[0] - 7 * S, cup[1] - 23 * S, cup[0] - 3 * S, cup[1] - 26 * S, cup[0], cup[1] - 23.5 * S); x.bezierCurveTo(cup[0] + 3 * S, cup[1] - 26 * S, cup[0] + 7 * S, cup[1] - 23 * S, cup[0], cup[1] - 19.5 * S); x.fill();   /* latte heart */
      var cro = lapX - 146 * S;
      if (cro - 22 * S > win.x - 14 * S) {
        x.fillStyle = '#e8e2d6'; x.beginPath(); x.ellipse(cro, sY - 1 * S, 22 * S, 5 * S, 0, 0, 7); x.fill();
        x.fillStyle = lg(x, 0, sY - 14 * S, 0, sY - 2 * S, [[0, '#e8a050'], [1, '#a8601e']]); x.beginPath(); x.moveTo(cro - 16 * S, sY - 4 * S); x.quadraticCurveTo(cro, sY - 22 * S, cro + 16 * S, sY - 4 * S); x.fill();   /* croissant */
        x.strokeStyle = 'rgba(120,60,20,.6)'; x.lineWidth = 1 * S; for (var k2 = -1; k2 <= 1; k2++) { x.beginPath(); x.moveTo(cro + k2 * 6 * S, sY - 15 * S); x.lineTo(cro + k2 * 8 * S, sY - 5 * S); x.stroke(); }
      }
      x = xRoom;
      /* Edison bulbs on long cords */
      /* Edison bulbs: low in the side margins, short cords above the page's heading in the middle */
      var bulbs = [[W * .03, H * .5], [W * .36, Math.max(70, H * .085)], [W * .5, Math.max(64, H * .078)], [W * .64, Math.max(70, H * .085)], [X0 - 22 * S, H * .4]];
      var dark = lighting(x, bulbs.map(function (b2) { return [b2[0], b2[1] + 30 * S, 230 * S, .85]; }).concat([[win.x + win.w * .5, win.y + win.h * .5, win.w * .7, .55], [em.x, em.y - 30 * S, 200 * S, .8], [tX, tY - 40 * S, 180 * S, .8], [lapX - 14 * S, sY - 40 * S, 170 * S, .85], [sg.x + sg.w / 2, sg.y + sg.h / 2, sg.w * .75, .95]].concat(caseL ? [caseL] : [])), .58);
      x.globalCompositeOperation = 'lighter'; [sg.x + sg.w * .2, sg.x + sg.w * .8].forEach(function (lx) { glow(x, lx + 13 * S, sg.y - 20 * S, 70 * S, WARM, .4); }); x.globalCompositeOperation = 'source-over';
      x.globalCompositeOperation = 'lighter'; glow(x, lapX - 14 * S, sY - 50 * S, 150 * S, 'rgba(150,180,255,A)', .16); x.globalCompositeOperation = 'source-over';
      /* shade the front layer exactly like the room */
      var fx2 = front[1]; fx2.globalCompositeOperation = 'source-atop'; fx2.drawImage(dark, 0, 0, W, H);
      fx2.fillStyle = rg(fx2, W / 2, H * .45, Math.min(W, H) * .3, Math.max(W, H) * .8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.5)']]); fx2.fillRect(0, 0, W, H); fx2.globalCompositeOperation = 'source-over';
      var sx2 = sl[1]; sx2.globalCompositeOperation = 'source-atop'; sx2.drawImage(dark, 0, 0, W, H); sx2.globalCompositeOperation = 'source-over';
      var tx2 = tbl[1]; tx2.globalCompositeOperation = 'source-atop'; tx2.drawImage(dark, 0, 0, W, H);
      tx2.fillStyle = rg(tx2, W / 2, H * .45, Math.min(W, H) * .3, Math.max(W, H) * .8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.5)']]); tx2.fillRect(0, 0, W, H); tx2.globalCompositeOperation = 'source-over';
      /* a camera finish so it reads like a photo, not a vector drawing */
      var gt = document.createElement('canvas'); gt.width = gt.height = 160; var gg = gt.getContext('2d'), gid = gg.createImageData(160, 160);
      for (var q = 0; q < gid.data.length; q += 4) { var nv = Math.random() * 255; gid.data[q] = gid.data[q + 1] = gid.data[q + 2] = nv; gid.data[q + 3] = 16; }
      gg.putImageData(gid, 0, 0); var grain = x.createPattern(gt, 'repeat');
      function finish(layer, bloom) {
        var cpy = off(); cpy[1].drawImage(layer[0], 0, 0, W, H);
        var g = layer[1]; g.save(); g.clearRect(0, 0, W, H); g.filter = 'blur(.7px)'; g.drawImage(cpy[0], 0, 0, W, H); g.filter = 'none';
        if (bloom) { g.globalCompositeOperation = 'screen'; g.globalAlpha = .45; g.filter = 'blur(' + Math.round(18 * S) + 'px) brightness(.8) contrast(2.2)'; g.drawImage(cpy[0], 0, 0, W, H); g.filter = 'none'; g.globalAlpha = 1; }
        g.globalCompositeOperation = 'source-atop';
        g.fillStyle = 'rgba(255,150,70,.07)'; g.fillRect(0, 0, W, H);   /* warm grade */
        g.fillStyle = grain; g.fillRect(0, 0, W, H);
        g.restore();
      }
      x.globalCompositeOperation = 'lighter'; bulbs.forEach(function (b3) { if (b3[1] > H * .3) { x.fillStyle = lg(x, 0, floorY, 0, H, [[0, 'rgba(255,190,110,.10)'], [1, 'rgba(255,190,110,0)']]); x.fillRect(b3[0] - 18 * S, floorY, 36 * S, H - floorY); } }); x.globalCompositeOperation = 'source-over';   /* lamps reflect in the floor */
      x.fillStyle = rg(x, W / 2, H * .45, Math.min(W, H) * .35, Math.max(W, H) * .78, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.42)']]); x.fillRect(0, 0, W, H);
      finish(o, true); finish(front, false); finish(tbl, false); finish(sl, false);
      var stars = skyStars(r, 40), bok = []; for (var bb = 0; bb < 24; bb++) bok.push([r(), .5 + r() * .45, 4 + r() * 10, ['#F2B84B', '#ff6a50', '#cfe4ff', '#ffd9a0'][bb % 4]]);
      /* where the people go: the customer at the bistro table by the window, the students' table in front of the counter */
      var custX = tX, su = S * .9, tbx = X0 + CW * .46, sfy = H * .985, stop = sfy - 125 * su;
      function student(face, o) { var px = tbx + face * -84 * su, py = sfy - 80 * su; return Object.assign({ x: px, y: py, face: face, TY: stop - 4 * su - py, act: 'work', left: 1 + Math.random() * 3, k: 0, hn: [0, 0], hf: [0, 0], look: 0, lean: 0, nod: 0 }, o); }
      var students = { x: tbx, u: su, fy: sfy, top: stop, chatT: 14 + Math.random() * 10, chatLeft: 0,
        a: student(1, { kind: 'write', anchor: 40 * su, cupL: 26 * su, acts: [['work', .5], ['think', .15], ['sip', .15], ['page', .2]], top: ['#4c6c54', '#1c2e22'], topD: ['#2e4434', '#101a14'], legs: ['#4a3c2a', '#18120a'],
          skin: SKIN_B, skinD: ['#6e4630', '#3a2214'], headO: { skin: SKIN_B, hair: ['#2c1c12', '#0a0604'], style: 'curly', glasses: true }, mug: ['#c86a3c', '#7a3a1c'] }),
        b: student(-1, { kind: 'type', anchor: 36 * su, cupL: 24 * su, acts: [['work', .55], ['read', .2], ['sip', .17], ['stretch', .08]], top: ['#5c627a', '#242838'], topD: ['#3a3e52', '#141622'], legs: ['#30364a', '#10121a'], hood: true,
          skin: SKIN_C, skinD: ['#b08668', '#6a4a34'], headO: { skin: SKIN_C, hair: ['#6a4a2a', '#2a1a0c'], style: 'beanie', hat: ['#a8442e', '#561c10'] }, mug: ['#f2ece0', '#a89e8c'] }) };
      return { bg: o[0], win: win, stars: stars, bok: bok, drops: rain(200, r, [win.x, win.y, win.w, win.h]), car: -1, nextCar: 2, bulbs: bulbs,
        em: em, pour: 0, puffs: [], cup: cup, front: front[0], dark: dark, X0: X0, CW: CW, counterY: counterY, floorY: floorY,
        barista: { x: X0 + CW * .3, to: X0 + CW * .3, face: 1, walk: 0, mv: 0, ph: 0, task: 'idle', then: 'idle', wait: 2, hn: [0, 0], hf: [0, 0], look: 0, carry: false },
        waiter: { state: 'off', next: 4, x: -999, dir: -1, wk: 0, ph: 0, v: 64, cups: 3, give: 0, giveTo: [0, 0] }, students: students, custX: custX, custCupX: custX + 36 * S, sillY: tY, tbl: tbl[0], sill: sl[0], pickupX: X0 + 4 * S, ready: 0, ck: ck, tX: tX, tY: tY,
        cust: { side: 1, stool: 68, sip: -1, next: 3, fill: 1, fresh: 25, look: 0, lookTo: 0, lookT: 6, h: [0, 0], cupIn: false },
        radio: { x: radioX, y: win.y + win.h + 6 * S }, notes: [], noteT: 0, neon: { x: win.x + Math.min(win.w * .2, LM * .4), y: win.y + win.h * .62, on: true, flick: 0 }, emCups: [em.x - em.w * .22, em.x + em.w * .22] };
    },
    tick: function (st, x, t, dt) {
      var w = st.win;
      x.save(); x.beginPath(); x.rect(w.x, w.y, w.w, w.h); x.clip();
      x.fillStyle = skyGrad(x, w.y, w.h); x.fillRect(w.x, w.y, w.w, w.h); drawStars(x, st.stars, [w.x, w.y, w.w, w.h * .3], t); drawMoon(x, w.x + w.w * .85, w.y + w.h * .12, 11 * S);
      x.filter = 'blur(' + (2 * S).toFixed(1) + 'px)';   /* the street is out of focus */
      x.fillStyle = '#0e1420'; for (var b = 0; b < 7; b++) x.fillRect(w.x + w.w * b / 7, w.y + w.h * (.22 + (b % 3) * .09), w.w / 7 - 6 * S, w.h);   /* the buildings across the street */
      for (var b2 = 0; b2 < 40; b2++) { var wx = w.x + ((b2 * 37) % 100) / 100 * w.w, wy = w.y + w.h * (.32 + ((b2 * 53) % 50) / 100); x.fillStyle = 'rgba(255,205,130,.55)'; x.fillRect(wx, wy, 4 * S, 6 * S); }
      x.fillStyle = lg(x, 0, w.y + w.h * .82, 0, w.y + w.h, [[0, 'rgba(40,40,50,0)'], [1, 'rgba(70,64,70,.8)']]); x.fillRect(w.x, w.y + w.h * .82, w.w, w.h * .18);   /* wet street */
      x.filter = 'none';
      x.filter = 'blur(6px)'; st.bok.forEach(function (k) { x.fillStyle = k[3]; x.globalAlpha = .35 + .15 * Math.sin(t + k[2]); x.beginPath(); x.arc(w.x + k[0] * w.w, w.y + k[1] * w.h, k[2] * S, 0, 7); x.fill(); }); x.globalAlpha = 1; x.filter = 'none';
      st.nextCar -= dt; if (st.nextCar <= 0 && st.car < 0) { st.car = 0; st.nextCar = 4 + Math.random() * 5; }
      if (st.car >= 0) { st.car += dt * .35; var cx2 = w.x - w.w * .2 + st.car * w.w * 1.4, cy2 = w.y + w.h * .9; x.globalCompositeOperation = 'lighter'; glow(x, cx2, cy2, 80 * S, 'rgba(255,240,200,A)', .55); glow(x, cx2 - 120 * S, cy2, 34 * S, 'rgba(255,60,40,A)', .5); x.globalCompositeOperation = 'source-over'; if (st.car > 1) st.car = -1; }
      st.walkers = st.walkers || []; st.nextWalker = (st.nextWalker == null ? 2 : st.nextWalker) - dt;   /* people passing outside */
      if (st.nextWalker <= 0) { var lr = Math.random() < .5; st.walkers.push({ x: lr ? w.x - 40 * S : w.x + w.w + 40 * S, v: (lr ? 1 : -1) * (36 + Math.random() * 24) * S, c: ['#1a1c28', '#22202a', '#2a1e1e'][Math.floor(Math.random() * 3)], sc: .55 + Math.random() * .2 }); st.nextWalker = 5 + Math.random() * 7; }
      x.filter = 'blur(2.5px)';
      st.walkers = st.walkers.filter(function (q) { q.x += q.v * dt; if (q.x < w.x - 80 * S || q.x > w.x + w.w + 80 * S) return false; passerby(x, q.x, w.y + w.h * .98, S * q.sc, t + q.sc * 7, WEATHER === 'rain', q.c); return true; });
      x.filter = 'none';
      drawWeather(x, st.drops, [w.x, w.y, w.w, w.h], dt, t, .08);
      x.fillStyle = 'rgba(10,7,14,.25)'; x.fillRect(w.x, w.y, w.w, w.h);
      x.fillStyle = lg(x, 0, w.y + w.h * .6, 0, w.y + w.h, [[0, 'rgba(200,190,180,0)'], [1, 'rgba(200,190,180,.14)']]); x.fillRect(w.x, w.y, w.w, w.h);   /* the glass fogs up near the sill */
      x.globalCompositeOperation = 'lighter'; glow(x, w.x + w.w * .7, w.y + w.h * .18, 40 * S, WARM, .18); glow(x, w.x + w.w * .3, w.y + w.h * .1, 30 * S, WARM, .12); x.globalCompositeOperation = 'source-over';   /* bulbs reflected in the glass */
      x.restore();
      x.strokeStyle = '#2a1a10'; x.lineWidth = 6 * S; x.strokeRect(w.x, w.y, w.w, w.h); x.lineWidth = 4 * S; x.beginPath(); x.moveTo(w.x + w.w / 2, w.y); x.lineTo(w.x + w.w / 2, w.y + w.h); x.moveTo(w.x, w.y + w.h * .3); x.lineTo(w.x + w.w, w.y + w.h * .3); x.stroke();
      /* neon OPEN sign */
      var n = st.neon; n.flick = Math.max(0, n.flick - dt); var lit = n.on && !(n.flick > 0 && Math.sin(t * 60) > 0) && !(Math.random() < .004);
      x.strokeStyle = '#2a1a10'; x.lineWidth = 1.2; x.beginPath(); x.moveTo(n.x - 30 * S, w.y); x.lineTo(n.x - 30 * S, n.y - 14 * S); x.moveTo(n.x + 30 * S, w.y); x.lineTo(n.x + 30 * S, n.y - 14 * S); x.stroke();
      x.fillStyle = 'rgba(20,10,10,.6)'; rr(x, n.x - 40 * S, n.y - 16 * S, 80 * S, 30 * S, 8 * S); x.fill();
      if (lit) { x.globalCompositeOperation = 'lighter'; glow(x, n.x, n.y, 80 * S, 'rgba(255,60,110,A)', .35); x.globalCompositeOperation = 'source-over'; }
      x.font = '700 ' + Math.round(17 * S) + 'px Karla, sans-serif'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillStyle = lit ? '#ffd0e0' : '#5a2a38'; x.shadowColor = '#ff3c78'; x.shadowBlur = lit ? 12 * S : 0; x.fillText('OPEN', n.x, n.y); x.shadowBlur = 0; x.textBaseline = 'alphabetic';
      /* Edison bulbs */
      st.bulbs.forEach(function (bl, i) { x.strokeStyle = '#120a06'; x.lineWidth = 1.4; x.beginPath(); x.moveTo(bl[0], 0); x.lineTo(bl[0], bl[1] - 12 * S); x.stroke();
        x.fillStyle = '#3a2a1a'; x.fillRect(bl[0] - 4 * S, bl[1] - 14 * S, 8 * S, 6 * S);
        var a = .8 + .1 * Math.sin(t * 7 + i * 2);
        x.globalCompositeOperation = 'lighter'; glow(x, bl[0], bl[1], 110 * S, WARM, .4 * a); x.globalCompositeOperation = 'source-over';
        x.fillStyle = 'rgba(255,200,120,.35)'; x.beginPath(); x.ellipse(bl[0], bl[1], 8 * S, 11 * S, 0, 0, 7); x.fill();
        x.strokeStyle = 'rgba(255,230,160,' + a + ')'; x.lineWidth = 1.4 * S; x.beginPath(); x.moveTo(bl[0] - 3 * S, bl[1] - 6 * S); for (var k = 0; k < 5; k++) x.lineTo(bl[0] - 3 * S + k * 1.5 * S, bl[1] + (k % 2 ? 3 : -1) * S); x.stroke(); });
      clockHands(x, st.ck.x, st.ck.y, st.ck.r, S, new Date());
      /* the people. First frame: snap every pose into place (also what reduced motion shows) */
      var edt = st.posed ? dt : 10; st.posed = true;
      /* the barista: wanders, wipes the counter, pulls a shot (also when you tap the machine) and leaves it at the end of the bar for the waiter */
      var B = st.barista, bu = S * .92, C = st.cust, pk = st.pickupX, lo = st.X0 + st.CW * .14, hi = st.X0 + st.CW * .66;
      if (st.pour > 0 && !B.carry && B.task !== 'pour' && B.task !== 'serve' && !(B.task === 'goto' && B.then === 'pour')) { B.task = 'goto'; B.to = st.emCups[st.pourAt || 0]; B.then = 'pour'; }
      if (B.task === 'goto') {
        var bd = B.to - B.x;
        if (Math.abs(bd) > 2 * S) { B.face = bd > 0 ? 1 : -1; var bsp = Math.min(46 * S, Math.abs(bd) * 2.4 + 10 * S); B.x += Math.sign(bd) * Math.min(Math.abs(bd), bsp * dt); B.ph += dt * bsp / (64 * bu); B.mv = 1; }
        else { B.task = B.then; B.mv = 0; B.wait = B.task === 'wipe' ? 2.5 + Math.random() * 2.5 : B.task === 'serve' ? 1.8 : 2.5 + Math.random() * 3.5; }
      } else if (B.task === 'pour') { B.face = 1; if (st.pour <= 0) { B.carry = true; B.task = 'goto'; B.to = pk + 34 * S; B.then = 'serve'; } }
      else {
        B.wait -= dt; if (B.task === 'serve') B.face = -1;
        if (B.task === 'serve' && B.carry && B.wait < .9) { B.carry = false; st.ready++; }
        if (B.wait <= 0) {
          if (C.fill < .3 && !st.ready && !st.waiter.got && Math.random() < .7) { st.pour = 2.2; st.pourAt = Math.random() < .5 ? 0 : 1; B.task = 'idle'; B.wait = 9; }   /* the window customer's cup is empty: make another */
          else if (Math.random() < .35) { B.task = 'goto'; B.to = B.x; B.then = 'wipe'; }
          else { B.task = 'goto'; B.to = lo + Math.random() * (hi - lo); B.then = 'idle'; }
        }
      }
      B.walk = ease(B.walk, B.mv, edt, 8);
      var tN, tF, blook = .15 + .12 * Math.sin(t * .4);
      if (B.mv || B.walk > .5) { var bsw = Math.sin(B.ph * Math.PI * 2); tN = B.carry ? [24 * bu, -12 * bu] : [6 * bu + bsw * 8 * bu, 40 * bu]; tF = [-2 * bu - bsw * 8 * bu, 40 * bu]; blook = B.carry ? .3 : .05; }
      else if (B.task === 'wipe') { tN = [28 * bu + Math.sin(t * 5) * 12 * bu, -3 * bu + Math.cos(t * 5) * 1.5 * bu]; tF = [12 * bu, -2 * bu]; blook = 1; }
      else if (B.task === 'pour') { tN = [14 * bu, -st.em.h * .42]; tF = [2 * bu, -16 * bu]; blook = .55; }
      else if (B.task === 'serve') { var bcl = (pk - B.x) * B.face; tN = B.carry ? [bcl, -6 * bu] : [mix(bcl, 24 * bu, .6), -3 * bu]; tF = [14 * bu, -2 * bu]; blook = .7; }
      else { tN = [24 * bu, -3 * bu]; tF = [12 * bu, -2 * bu]; }
      ease2(B.hn, tN, edt, 7); ease2(B.hf, tF, edt, 7); B.look = ease(B.look, blook, edt, 4);
      shaded(x, 'barista', B.x - 90 * bu, st.counterY - 135 * bu, 180 * bu, 200 * bu, .42, st.dark, function (g) { drawBarista(g, B.x, st.counterY, bu, t, B); sideShade(g, B.x - 60 * bu, B.x + 60 * bu, st.counterY - 135 * bu, st.counterY + 60 * bu, false); }, .5);
      x.drawImage(st.front, 0, 0, W, H);   /* the counter, grinder, machine and cake, in front of her */
      if (st.ready) { shaded(x, 'pickup', pk - 16 * S, st.counterY - 20 * S, 34 * S, 22 * S, .35, st.dark, function (g) { mug(g, pk, st.counterY, S * .95, ['#f2ece0', '#a89e8c']); }); steam(x, pk, st.counterY - 13 * S, t, S * .5, .16); }   /* waiting for the waiter */
      x.drawImage(st.sill, 0, 0, W, H);   /* your laptop and latte on the window ledge */
      steam(x, st.cup[0], st.cup[1] - 22 * S, t, S);
      /* the radio on the window sill */
      var RD = st.radio, on = anyMusic();
      shaded(x, 'radio', RD.x - 40 * S, RD.y - 50 * S, 80 * S, 58 * S, .35, st.dark, function (g) { drawRadio(g, RD.x, RD.y, S, on, t); });
      if (on && !reduce) { st.noteT -= dt; if (st.noteT <= 0) { st.noteT = 1 + Math.random(); st.notes.push({ x: RD.x - 10 * S, y: RD.y - 46 * S, a: 0, c: Math.random() < .5 ? '♪' : '♫' }); } }
      x.fillStyle = '#f2c46a'; x.textAlign = 'center'; x.font = Math.round(14 * S) + 'px Georgia, serif';
      st.notes = st.notes.filter(function (q) { q.a += dt; if (q.a > 3) return false; x.globalAlpha = Math.max(0, .75 * (1 - q.a / 3)); x.fillText(q.c, q.x + Math.sin(q.a * 2 + q.x) * 8 * S, q.y - q.a * 30 * S); return true; }); x.globalAlpha = 1;
      /* steam from the espresso machine now and then */
      var e = st.em;
      if (st.pour > 0) {   /* a shot pouring */
        st.pour -= dt; var g = st.emCups[st.pourAt || 0], k = Math.min(1, (2.2 - st.pour) * 2);
        x.strokeStyle = 'rgba(90,48,20,.9)'; x.lineWidth = 2.2 * S; x.beginPath(); x.moveTo(g - 3 * S, e.y - e.h * .4); x.lineTo(g - 3 * S, e.y - e.h * .4 + (e.h * .4 - 12 * S) * k); x.moveTo(g + 3 * S, e.y - e.h * .4); x.lineTo(g + 3 * S, e.y - e.h * .4 + (e.h * .4 - 12 * S) * k); x.stroke();
        x.fillStyle = 'rgba(160,96,40,' + Math.min(1, k) + ')'; x.beginPath(); x.ellipse(g, e.y - 13 * S, 7 * S, 2 * S, 0, 0, 7); x.fill();   /* crema */
        if (!reduce && Math.random() < dt * 14) st.puffs.push({ x: e.x + e.w / 2 + 10 * S, y: e.y - 20 * S, a: 1, r: 4 * S });
      }
      st.emCups.forEach(function (g2) { steam(x, g2, e.y - 14 * S, t * 1.2, S * .5, .14); });
      /* the waiter crosses the café with a tray now and then (behind the students' table and your table).
         When a coffee is waiting at the end of the bar he picks it up and brings it to the window customer */
      var Wt = st.waiter, wu = S * .95, wfoot = st.floorY + 20 * S;
      if (Wt.state === 'off') { Wt.next -= dt; if (st.ready) Wt.next = Math.min(Wt.next, 1.5);
        if (Wt.next <= 0) { Wt.state = 'walk'; Wt.deliver = !!st.ready; Wt.got = false; Wt.placed = false; Wt.give = 0; Wt.dir = Wt.deliver || Math.random() < .5 ? -1 : 1; Wt.x = Wt.dir < 0 ? W + 90 * S : -90 * S; Wt.wk = 1; Wt.v = 58 + Math.random() * 14; Wt.cups = 2 + Math.floor(Math.random() * 2); } }
      else {
        if (Wt.deliver && !Wt.got && Wt.x <= pk + 8 * S) { if (st.ready) { st.ready--; Wt.got = true; Wt.cups = Math.min(4, Wt.cups + 1); } else Wt.deliver = false; }
        if (Wt.deliver && Wt.got && Wt.state === 'walk' && Wt.x <= st.custCupX + 50 * S) { Wt.state = 'give'; Wt.left = 2.6; }
        if (Wt.state === 'give') { Wt.left -= dt; if (!Wt.placed && Wt.left < 1.4) { Wt.placed = true; Wt.deliver = false; Wt.got = false; Wt.cups = Math.max(0, Wt.cups - 1); C.fill = 1; C.fresh = 40; } if (Wt.left <= 0) Wt.state = 'walk'; }
        Wt.wk = ease(Wt.wk, Wt.state === 'walk' ? 1 : 0, edt, 5); Wt.give = ease(Wt.give, Wt.state === 'give' && Wt.left > .6 ? 1 : 0, edt, 4);
        Wt.giveTo = [(st.custCupX - Wt.x) * Wt.dir, st.sillY - 6 * S - wfoot];
        var wv = Wt.v * S * Wt.wk; Wt.x += Wt.dir * wv * dt; Wt.ph += dt * wv / (96 * wu);
        if (Wt.x < -110 * S || Wt.x > W + 110 * S) { Wt.state = 'off'; Wt.next = 12 + Math.random() * 14; }
        else shaded(x, 'waiter', Wt.x - 90 * wu, st.floorY + 20 * S - 310 * wu, 180 * wu, 322 * wu, .38, st.dark, function (g) { drawWaiter(g, Wt.x, st.floorY + 20 * S, wu, t, Wt); sideShade(g, Wt.x - 50 * wu, Wt.x + 50 * wu, st.floorY - 310 * wu, st.floorY + 30 * S, Wt.x > W / 2 ? false : true); }, .5);
      }
      x.drawImage(st.tbl, 0, 0, W, H);   /* the customer's table, in front of the waiter */
      candle(x, st.tX - 66 * S, st.tY + 1 * S, S, t, 1);
      /* the customer at the bistro table, back to you: sips and watches the street */
      var cs = S * .95, cX = st.custX, cupSpot = st.custCupX, sill = st.sillY;
      if (C.sip < 0) { C.next -= dt; if (C.next <= 0 && C.fill > .05) C.sip = 0; }
      else { C.sip += dt / 3.6; if (C.sip >= 1) { C.sip = -1; C.next = 5 + Math.random() * 6; C.fill = Math.max(0, C.fill - .25); } }
      C.lookT -= dt; if (C.lookT <= 0) { C.lookTo = C.lookTo ? 0 : 1; C.lookT = C.lookTo ? 2 + Math.random() * 2 : 7 + Math.random() * 8; }
      C.look = ease(C.look, C.sip >= 0 ? 0 : C.lookTo, edt, 3); C.fresh = Math.max(0, C.fresh - dt);
      var csd = C.side || -1, crest = [cX + csd * 13 * cs, sill - 3 * cs], ccup = [cupSpot - csd * 3 * cs, sill - 6 * cs], cmouth = [cX + csd * 6 * cs, sill - 70 * cs], ck = C.sip, ct = crest;
      if (ck >= 0) ct = ck < .2 ? mixP(crest, ccup, ck / .2) : ck < .38 ? mixP(ccup, cmouth, (ck - .2) / .18) : ck < .68 ? cmouth : ck < .84 ? mixP(cmouth, ccup, (ck - .68) / .16) : mixP(ccup, crest, (ck - .84) / .16);
      C.cupIn = ck >= .2 && ck < .84; ease2(C.h, ct, edt, 12);
      shaded(x, 'cust', Math.min(cupSpot - 20 * cs, cX - 60 * cs), sill - 110 * cs, Math.max(cupSpot + 20 * cs, cX + 60 * cs) - Math.min(cupSpot - 20 * cs, cX - 60 * cs), 300 * cs, .4, st.dark, function (g) {
        if (!C.cupIn) mug(g, cupSpot, sill, cs, ['#f2ece0', '#a89e8c']);
        drawCustomer(g, cX, sill, cs, t, C); sideShade(g, cX - 40 * cs, cX + 40 * cs, sill - 110 * cs, sill + 190 * cs, false); }, .5);
      if (!C.cupIn && C.fresh > 0) steam(x, cupSpot, sill - 13 * cs, t, S * .5, .16 * Math.min(1, C.fresh / 10));
      /* two students at the table in front of the counter: she writes, he types; both sip, sometimes they chat */
      var SD = st.students, su = SD.u;
      SD.chatT -= dt; if (SD.chatT <= 0) { SD.chatLeft = 4.5; SD.chatT = 24 + Math.random() * 22; }
      var chatting = SD.chatLeft > 0 ? SD.chatLeft : 0; SD.chatLeft = Math.max(0, (SD.chatLeft || 0) - dt);
      studentTick(SD.a, t, dt, edt, su, chatting); studentTick(SD.b, t + 7, dt, edt, su, chatting);
      shaded(x, 'students', SD.a.x - 40 * su, SD.top - 160 * su, SD.b.x - SD.a.x + 80 * su, H - SD.top + 160 * su, .3, st.dark, function (g) { drawStudents(g, SD, su, t); sideShade(g, SD.a.x - 40 * su, SD.b.x + 40 * su, SD.top - 160 * su, H, false); }, .45);
      candle(x, SD.x + 3 * su, SD.top - 2 * su, su, t, 4);
      [SD.a, SD.b].forEach(function (P) { if (!P.cupIn) steam(x, P.x + P.cupL * P.face, SD.top - 15 * su, t + P.face, S * .45, .12); });
      st.puffs = st.puffs.filter(function (p) { p.y -= 46 * dt; p.x += Math.sin(p.y * .05) * 16 * dt; p.r += 22 * S * dt; p.a -= dt * .7; if (p.a <= 0) return false; x.fillStyle = 'rgba(240,236,230,' + (p.a * .35) + ')'; x.beginPath(); x.arc(p.x, p.y, p.r, 0, 7); x.fill(); return true; });
    },
    hitEm: function (st, px, py) { var e = st.em; return Math.abs(px - e.x) < e.w / 2 + 14 * S && py > e.y - e.h - 18 * S && py < e.y; },
    hitNeon: function (st, px, py) { var n = st.neon; return Math.abs(px - n.x) < 42 * S && Math.abs(py - n.y) < 18 * S; },
    hitRadio: function (st, px, py) { var R2 = st.radio; return Math.abs(px - R2.x) < 36 * S && py > R2.y - 46 * S && py < R2.y + 4 * S; },
    click: function (st, px, py) {
      if (this.hitRadio(st, px, py)) { if (window.SSMixer) { if (anyMusic()) { if (SSMixer.isPlaying()) SSMixer.pause(); var a2 = document.getElementById('gmp-audio'); if (a2 && !a2.paused) a2.pause(); } else SSMixer.preset('Caf\u00e9 study'); } return true; }
      if (this.hitEm(st, px, py)) { sfx('steam'); st.pour = 2.2; st.pourAt = px < st.em.x ? 0 : 1; for (var i = 0; i < 6; i++) st.puffs.push({ x: st.em.x + st.em.w / 2 + 10 * S, y: st.em.y - 20 * S - i * 4 * S, a: 1, r: 5 * S }); return true; }
      if (this.hitNeon(st, px, py)) { sfx('buzz'); st.neon.flick = .6; setTimeout(function () { st.neon.on = !st.neon.on; }, 600); return true; }
    },
    hover: function (st, px, py) { return this.hitEm(st, px, py) || this.hitNeon(st, px, py) || this.hitRadio(st, px, py); }
  };

  /* The café drifts: every few minutes it fades to the next view (at the bar, outside on the street, the window seat,
     behind the bar, the upstairs loft). The view is remembered, and the corner button skips ahead. */
  var CAFE_DRIFT = 180, CAFE_FADE = 3, cafeBtn = null;
  function cafeCount() { return 1 + (window.SSCafeViews ? SSCafeViews.titles.length : 0); }
  function cafeTitle(i) { return i === 0 ? 'At the bar' : SSCafeViews.titles[i - 1]; }
  function cafeButton(s) {
    if (!cafeBtn) {
      cafeBtn = document.createElement('button'); cafeBtn.type = 'button'; cafeBtn.className = 'st-cafe-next'; cafeBtn.title = 'Next view of the café';
      cafeBtn.addEventListener('click', function () { if (sceneId === 'cafe' && st) SCENES.cafe.go(st, st.v + 1); });
    }
    var home = root || document.body; if (cafeBtn.parentNode !== home) home.appendChild(cafeBtn);   /* not inside .st-bg: that layer ignores the pointer */
    cafeBtn.hidden = !s || cafeCount() < 2;
    if (s) cafeBtn.innerHTML = '<span>' + cafeTitle(s.v) + '</span><b aria-hidden="true">›</b>';
  }
  SCENES.cafe = {
    build: function () {
      var n = cafeCount(), v = 0; try { v = (parseInt(localStorage.getItem('studySyncCafeView') || '0', 10) || 0) % n; } catch (e) { /* storage blocked */ }
      var blank = document.createElement('canvas'); blank.width = blank.height = 1;
      var s = { bg: blank, inner: CAFE_IN.build(), views: n > 1 ? SSCafeViews.create(W, H, DPR) : null, v: v, from: -1, fade: 0, left: CAFE_DRIFT, fb: null };
      cafeButton(s); return s;
    },
    draw: function (s, i, g, t, dt) { if (i === 0) { g.drawImage(s.inner.bg, 0, 0, W, H); CAFE_IN.tick(s.inner, g, t, dt); } else { s.views.draw(i - 1, g, t, dt);   /* the new views fill the screen: a soft dark wash keeps the page's heading readable */
      g.save(); g.translate(W / 2, H * .22); g.scale(1, .55); var rw = Math.max(W * .42, 420); g.fillStyle = rg(g, 0, 0, 0, rw, [[0, 'rgba(10,6,4,.5)'], [.6, 'rgba(10,6,4,.28)'], [1, 'rgba(10,6,4,0)']]); g.fillRect(-rw, -rw, rw * 2, rw * 2); g.restore(); } },
    go: function (s, i) {
      if (s.fade > 0 || cafeCount() < 2) return;
      s.from = s.v; s.v = i % cafeCount(); s.left = CAFE_DRIFT; s.fade = reduce ? 0 : CAFE_FADE;
      try { localStorage.setItem('studySyncCafeView', String(s.v)); } catch (e) { /* storage blocked */ }
      cafeButton(s); if (reduce) paint(performance.now(), true);
    },
    tick: function (s, x, t, dt) {
      if (!reduce && s.fade <= 0) { s.left -= dt; if (s.left <= 0) this.go(s, s.v + 1); }
      if (s.fade <= 0) { this.draw(s, s.v, x, t, dt); return; }
      s.fade = Math.max(0, s.fade - dt); var a = 1 - s.fade / CAFE_FADE; a = a * a * (3 - 2 * a);
      this.draw(s, s.from, x, t, dt);
      if (!s.fb) s.fb = off(); var fc = s.fb[0], fx = s.fb[1];
      fx.setTransform(1, 0, 0, 1, 0, 0); fx.clearRect(0, 0, fc.width, fc.height); fx.setTransform(DPR, 0, 0, DPR, 0, 0);
      this.draw(s, s.v, fx, t, dt);
      x.save(); x.setTransform(1, 0, 0, 1, 0, 0); x.globalAlpha = a; x.drawImage(fc, 0, 0); x.restore();
      if (s.fade <= 0) s.fb = null;
    },
    click: function (s, px, py) { return s.v === 0 && s.fade <= 0 && CAFE_IN.click(s.inner, px, py); },
    hover: function (s, px, py) { return s.v === 0 && s.fade <= 0 && CAFE_IN.hover(s.inner, px, py); }
  };

  /* ───────── running it ───────── */
  function wanted() { return cv.dataset.scene || (root && root.dataset.bg === 'cafe' ? 'cafe' : ''); }
  function margins() {
    var col = document.querySelector('.tool-wrap, .st-wrap'), b = col && col.getBoundingClientRect();
    LM = b ? Math.max(0, b.left + 16) : W * .12; RM = b ? Math.max(0, W - b.right + 16) : W * .12;
  }
  function build() {
    W = window.innerWidth; H = window.innerHeight; if (!W || !H) return;
    DPR = Math.min(1.5, window.devicePixelRatio || 1); S = Math.min(H / 760, W / 1150) * 1.05;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    margins(); sceneId = wanted(); st = sceneId ? SCENES[sceneId].build() : null; paint(performance.now(), true);
  }
  function paint(now, once) {
    if (!st) return;
    var dt = Math.min(.08, (now - (last || now)) / 1000), t = (now - t0) / 1000; last = now; if (reduce) { dt = 0; t = 1; }
    ctx.clearRect(0, 0, W, H); ctx.drawImage(st.bg, 0, 0, W, H); SCENES[sceneId].tick(st, ctx, t, dt);
    if (!once) loop();
  }
  function loop() { requestAnimationFrame(function (now) {
    if (!document.body.contains(cv)) { running = false; return; }   /* pages swap in place: stop when this one is gone */
    if (!running) return;
    if (document.hidden || now - lastFrame < 33) { loop(); return; }  /* about 30 frames a second */
    lastFrame = now; paint(now);
  }); }
  function sync() {
    var id = wanted(); cv.hidden = !id;
    if (cafeBtn && id !== 'cafe') cafeBtn.hidden = true;
    if (!id) { running = false; return; }
    if (id !== sceneId || !st) build();
    if (!running && !reduce) { running = true; loop(); }
  }
  /* tapping and hovering: never when the pointer is over the page's own controls */
  function onUI(el) { return !!(el && el.closest && el.closest('a,button,input,select,textarea,label,[role="dialog"],.st-card,.st-nav,.dm-panel,.dm-card,.tool-head,.coach-sidebar,.pdf-viewer-modal,.fc-ready-overlay,.fc-shuffle-overlay,#gmp-bar,#gmp-panel,#sm-pause-quote')); }
  document.addEventListener('click', function (e) {
    if (!document.body.contains(cv) || cv.hidden || !st || onUI(e.target)) return;
    var sc = SCENES[sceneId]; if (sc.click && sc.click(st, e.clientX, e.clientY) && reduce) paint(performance.now(), true);
  });
  var hovering = false;
  document.addEventListener('mousemove', function (e) {
    if (!document.body.contains(cv)) { if (hovering) { document.body.style.cursor = ''; hovering = false; } return; }
    if (cv.hidden || !st) return;
    var sc = SCENES[sceneId]; if (sc.move) sc.move(st, e.clientX, e.clientY);
    var on = !onUI(e.target) && !!(sc.hover && sc.hover(st, e.clientX, e.clientY));
    if (on !== hovering) { hovering = on; document.body.style.cursor = on ? 'pointer' : ''; }
  }, { passive: true });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (document.body.contains(cv) && !cv.hidden) build(); }, 200); });
  if (root && window.MutationObserver) new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-bg'] });
  if (window.ssReady) window.ssReady(sync); else sync();   /* wait for the page below the canvas */
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (st && document.body.contains(cv)) build(); });
})();

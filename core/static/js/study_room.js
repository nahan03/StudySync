/* The Study page's default background: a cozy study room at night, painted on a canvas.
   Weather outside changes on each visit: rain → snow → thunderstorm.
   Shows only while the Study background is "Desk lamp" (.st-root[data-bg="lamp"]). */
(function () {
  var cv = document.getElementById('st-room');
  if (!cv) return;
  var root = document.getElementById('st-root'), ctx = cv.getContext('2d');
  var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W = 0, H = 0, DPR = 1, S = 1, scene = null, running = false, last = 0, t0 = performance.now(), lastFrame = 0;

  var WEATHERS = ['rain', 'snow', 'thunder', 'clear'], weather = 'rain', rebuildT = null;
  /* what you can play with: curtains (1 open, 0 closed) and the cat */
  var room = { open: 1, target: 1, cat: 'sleep', u: 0, away: 0, wait: 0, flick: 0, nextFlick: 5, spin: 0, arm: 0, notes: [], noteT: 0 };
  try {
    var n = parseInt(localStorage.getItem('studySyncRoomWeather') || '0', 10) || 0;
    weather = WEATHERS[n % WEATHERS.length];
    localStorage.setItem('studySyncRoomWeather', String(n + 1));
  } catch (e) { /* storage unavailable: rain */ }

  function R(seed) { var s = seed % 2147483647 || 1; return function () { s = (s * 16807) % 2147483647; return (s - 1) / 2147483646; }; }
  function off() { var c = document.createElement('canvas'); c.width = Math.round(W * DPR); c.height = Math.round(H * DPR); var x = c.getContext('2d'); x.setTransform(DPR, 0, 0, DPR, 0, 0); return [c, x]; }
  function lg(x, x0, y0, x1, y1, st) { var g = x.createLinearGradient(x0, y0, x1, y1); st.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function rg(x, cx, cy, r0, r1, st) { var g = x.createRadialGradient(cx, cy, r0, cx, cy, r1); st.forEach(function (s) { g.addColorStop(s[0], s[1]); }); return g; }
  function glow(x, cx, cy, r, col, a) { x.fillStyle = rg(x, cx, cy, 0, r, [[0, col.replace('A', a)], [1, col.replace('A', 0)]]); x.fillRect(cx - r, cy - r, r * 2, r * 2); }
  function rr(x, X, Y, w, h, r) { x.beginPath(); if (x.roundRect) x.roundRect(X, Y, w, h, r); else x.rect(X, Y, w, h); }
  var WARM = 'rgba(255,207,134,A)';


  function geo() {
    var g = { win: { x: W * .045, y: H * .13, w: W * .155, h: H * .44 } };   /* in the left margin, beside the page */
    g.sill = { x: g.win.x - 14 * S, y: g.win.y + g.win.h, w: g.win.w + 28 * S, h: 14 * S };
    g.deskBack = H * .76; g.deskFront = H * .85;
    g.shelf = { x: W * .775, y: H * .1, w: W * .13, h: H * .62 };
    /* the framed note hangs on the wall beside the bookshelf (poster() draws it from this box) */
    var fw = Math.min(W * .072, 130 * S), fh = fw * 1.25, lw = fw / .7, fcx = (g.shelf.x + g.shelf.w + W) / 2;
    g.left = { x: fcx - lw / 2, y: H * .17 - 10 * S, w: lw, h: fh };
    g.lamp = { x: W * .972, y: g.deskBack + (g.deskFront - g.deskBack) * .55, dir: -1 };   /* faces left, over the books */
    return g;
  }

  /* ── outside ── */
  function treeline(x, b, r, cols, lights) {
    cols.forEach(function (col, li) {
      x.filter = 'blur(' + (2.2 - li * .8) + 'px)'; x.fillStyle = col;
      var base = b.y + b.h * (.74 + li * .1);
      for (var tx = b.x - 20; tx < b.x + b.w + 20; tx += (12 + r() * 16) * S) {
        var th = (34 + r() * 40) * S * (1 + li * .35);
        for (var k = 0; k < 3; k++) { var ky = base - th + k * th * .28; x.beginPath(); x.moveTo(tx, ky); x.lineTo(tx + th * (.24 + k * .08), ky + th * .45); x.lineTo(tx - th * (.24 + k * .08), ky + th * .45); x.fill(); }
      }
      x.fillRect(b.x, base, b.w, b.h);
    });
    if (lights) { x.filter = 'blur(6px)'; for (var i = 0; i < 7; i++) { x.fillStyle = 'rgba(255,190,110,.5)'; x.beginPath(); x.arc(b.x + r() * b.w, b.y + b.h * (.8 + r() * .12), (4 + r() * 6) * S, 0, 7); x.fill(); } }
    x.filter = 'none';
  }
  var SKY = {
    clear: function (x, b, r) {   /* a clear night: stars, the moon and a soft glow over the trees */
      x.fillStyle = lg(x, 0, b.y, 0, b.y + b.h, [[0, '#050a1a'], [.6, '#14203c'], [1, '#2a2a44']]); x.fillRect(b.x, b.y, b.w, b.h);
      for (var i = 0; i < 90; i++) { x.globalAlpha = .3 + r() * .7; x.fillStyle = '#fff'; x.beginPath(); x.arc(b.x + r() * b.w, b.y + r() * b.h * .65, r() < .12 ? 1.3 : .7, 0, 7); x.fill(); } x.globalAlpha = 1;
      x.filter = 'blur(10px)'; x.fillStyle = 'rgba(230,236,255,.4)'; x.beginPath(); x.arc(b.x + b.w * .68, b.y + b.h * .22, 22 * S, 0, 7); x.fill(); x.filter = 'none';
      x.fillStyle = '#eef0ff'; x.beginPath(); x.arc(b.x + b.w * .68, b.y + b.h * .22, 11 * S, 0, 7); x.fill();
      treeline(x, b, r, ['#16203a', '#0c1222'], true);
    },
    rain: function (x, b, r) { x.fillStyle = lg(x, 0, b.y, 0, b.y + b.h, [[0, '#0b1426'], [.6, '#1d2a48'], [1, '#43334a']]); x.fillRect(b.x, b.y, b.w, b.h); treeline(x, b, r, ['#141c30', '#0b111f'], true); },
    thunder: function (x, b, r) {
      x.fillStyle = lg(x, 0, b.y, 0, b.y + b.h, [[0, '#06080f'], [.6, '#121626'], [1, '#262234']]); x.fillRect(b.x, b.y, b.w, b.h);
      x.filter = 'blur(10px)'; x.fillStyle = 'rgba(60,64,90,.6)'; for (var c = 0; c < 6; c++) { x.beginPath(); x.ellipse(b.x + r() * b.w, b.y + b.h * (.1 + r() * .25), 70 * S, 22 * S, 0, 0, 7); x.fill(); } x.filter = 'none';
      treeline(x, b, r, ['#0e1220', '#06080f'], false);
    },
    snow: function (x, b, r) {
      x.fillStyle = lg(x, 0, b.y, 0, b.y + b.h, [[0, '#1a2440'], [.7, '#3a4a6a'], [1, '#6a6a80']]); x.fillRect(b.x, b.y, b.w, b.h);
      treeline(x, b, r, ['#2a3450', '#1c2440'], false);
      x.fillStyle = 'rgba(230,236,250,.6)'; x.fillRect(b.x, b.y + b.h * .9, b.w, b.h * .1);
      x.filter = 'none';
    }
  };

  /* ── the room ── */
  function woodFill(x, X, Y, w, h, c1, c2, r, vertical) {
    x.fillStyle = lg(x, X, Y, vertical ? X + w : X, vertical ? Y : Y + h, [[0, c1], [1, c2]]); x.fillRect(X, Y, w, h);
    x.save(); x.beginPath(); x.rect(X, Y, w, h); x.clip(); x.globalAlpha = .18;
    for (var i = 0; i < (vertical ? w : h) / 2.5; i++) { x.strokeStyle = r() < .5 ? '#000' : '#ffdcaa'; x.lineWidth = .5 + r(); x.beginPath(); var p = (vertical ? X : Y) + r() * (vertical ? w : h), a = 1 + r() * 3, len = vertical ? h : w;
      for (var k = 0; k <= len; k += 16) { var o = Math.sin(k / (50 + r() * 30) + i) * a; if (vertical) x.lineTo(p + o, Y + k); else x.lineTo(X + k, p + o); } x.stroke(); }
    x.restore(); x.globalAlpha = 1;
  }
  function wall(x, g, r) {
    x.fillStyle = lg(x, 0, 0, 0, g.deskBack, [[0, '#3b2b22'], [1, '#2b1f19']]); x.fillRect(0, 0, W, g.deskBack + 2);
    x.globalAlpha = .05; for (var i = 0; i < W; i += 30 * S) { x.fillStyle = (i / (30 * S)) % 2 < 1 ? '#000' : '#fff'; x.fillRect(i, 0, 15 * S, g.deskBack); } x.globalAlpha = 1;
  }
  function windowFrame(x, g, r) {
    var b = g.win, o = off(), ox = o[1]; ox.save(); ox.beginPath(); ox.rect(b.x, b.y, b.w, b.h); ox.clip(); SKY[weather](ox, b, r); ox.restore();
    x.save(); x.filter = 'blur(.6px)'; x.drawImage(o[0], 0, 0, W, H); x.restore();
    x.fillStyle = lg(x, b.x, b.y, b.x + b.w, b.y + b.h, [[0, 'rgba(255,255,255,.08)'], [.35, 'rgba(255,255,255,0)'], [.6, 'rgba(255,255,255,.04)'], [1, 'rgba(255,255,255,0)']]); x.fillRect(b.x, b.y, b.w, b.h);
    if (weather === 'rain' || weather === 'thunder') for (var d = 0; d < 70; d++) { var dx = b.x + r() * b.w, dy = b.y + r() * b.h, dr = (.8 + r() * 2.2) * S; x.fillStyle = 'rgba(200,220,255,.3)'; x.beginPath(); x.arc(dx, dy, dr, 0, 7); x.fill(); x.fillStyle = 'rgba(255,255,255,.5)'; x.beginPath(); x.arc(dx - dr * .3, dy - dr * .3, dr * .35, 0, 7); x.fill(); }
    var fw = 12 * S; x.lineJoin = 'round';
    x.strokeStyle = lg(x, b.x, b.y, b.x + b.w, b.y + b.h, [[0, '#5a3d24'], [1, '#3a2716']]); x.lineWidth = fw; x.strokeRect(b.x, b.y, b.w, b.h);
    x.lineWidth = 7 * S; x.beginPath(); x.moveTo(b.x + b.w / 2, b.y); x.lineTo(b.x + b.w / 2, b.y + b.h); x.moveTo(b.x, b.y + b.h * .45); x.lineTo(b.x + b.w, b.y + b.h * .45); x.stroke();
    x.strokeStyle = 'rgba(255,220,170,.18)'; x.lineWidth = 1.5; x.strokeRect(b.x - fw / 2, b.y - fw / 2, b.w + fw, b.h + fw);
    var s = g.sill; woodFill(x, s.x, s.y, s.w, s.h * .45, '#7a5534', '#5a3d24', r); woodFill(x, s.x, s.y + s.h * .45, s.w, s.h * .55, '#3a2716', '#2a1c10', r);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(s.x, s.y + s.h, s.w, 8 * S);
  }
  function curtainRod(x, g) {
    var b = g.win; x.fillStyle = '#2a1c10'; x.fillRect(b.x - 52 * S, b.y - 26 * S, b.w + 104 * S, 5 * S);
    x.fillStyle = '#4a3420'; x.beginPath(); x.arc(b.x - 52 * S, b.y - 23.5 * S, 5 * S, 0, 7); x.arc(b.x + b.w + 52 * S, b.y - 23.5 * S, 5 * S, 0, 7); x.fill();
  }
  /* open = 1 (pulled to the sides) ... 0 (closed over the window); returns their outlines for tapping */
  function drawCurtains(x, g, open) {
    var b = g.win, cw0 = 38 * S, top = b.y - 22 * S, bot = g.sill.y + 34 * S, rects = [];
    [-1, 1].forEach(function (k) {
      var wNow = cw0 + (b.w / 2 + 4 * S) * (1 - open), outer = k < 0 ? b.x - cw0 - 4 * S : b.x + b.w + cw0 + 4 * S;
      var x0 = k < 0 ? outer : outer - wNow, gath = wNow * .22 * open;
      x.save(); x.beginPath();
      if (k < 0) { x.moveTo(x0, top); x.lineTo(x0 + wNow, top); x.quadraticCurveTo(x0 + wNow * (1 - .35 * open), (top + bot) / 2, x0 + wNow - gath, bot); x.lineTo(x0, bot); }
      else { x.moveTo(x0 + wNow, top); x.lineTo(x0, top); x.quadraticCurveTo(x0 + wNow * .35 * open, (top + bot) / 2, x0 + gath, bot); x.lineTo(x0 + wNow, bot); }
      x.closePath(); x.clip();
      x.fillStyle = '#7a3b2a'; x.fillRect(x0, top, wNow, bot - top);
      var folds = Math.max(3, Math.round(wNow / (12 * S))), fw = wNow / folds;
      for (var f = 0; f < folds; f++) { x.fillStyle = lg(x, x0 + f * fw, 0, x0 + (f + 1) * fw, 0, [[0, 'rgba(0,0,0,.28)'], [.5, 'rgba(255,230,200,.12)'], [1, 'rgba(0,0,0,.28)']]); x.fillRect(x0 + f * fw, top, fw, bot - top); }
      x.fillStyle = lg(x, 0, top, 0, bot, [[0, 'rgba(255,220,180,.08)'], [1, 'rgba(0,0,0,.25)']]); x.fillRect(x0, top, wNow, bot - top);
      x.restore();
      x.fillStyle = '#b08a4e'; for (var rI = 0; rI < Math.max(3, folds); rI++) { x.beginPath(); x.arc(x0 + (rI + .5) * wNow / Math.max(3, folds), top - 2 * S, 2.6 * S, 0, 7); x.fill(); }
      rects.push([x0, top, wNow, bot - top]);
    });
    return rects;
  }
  function bookshelf(x, g, r) {
    var s = g.shelf; woodFill(x, s.x, s.y, s.w, s.h, '#3a2716', '#2a1c10', r, true);
    var n = Math.max(2, Math.round(s.h / (H * .13))), sh = s.h / n, cols = ['#7a2f2a', '#2f4a5e', '#55602e', '#8a5a2b', '#4a3a66', '#9c6f22', '#2e5a52', '#6a3040', '#c0a070'];
    for (var i = 0; i < n; i++) {
      var y = s.y + i * sh, inner = y + 6 * S, ih = sh - 16 * S;
      x.fillStyle = '#140d07'; x.fillRect(s.x + 8 * S, inner, s.w - 16 * S, ih);
      var px = s.x + 10 * S;
      while (px < s.x + s.w - 14 * S) {
        var bw = (7 + r() * 9) * S, bh = ih * (.6 + r() * .36), c = cols[Math.floor(r() * cols.length)];
        x.fillStyle = lg(x, px, 0, px + bw, 0, [[0, c], [.7, c], [1, 'rgba(0,0,0,.6)']]); x.fillRect(px, inner + ih - bh, bw, bh);
        x.fillStyle = 'rgba(255,215,150,.35)'; x.fillRect(px, inner + ih - bh * .8, bw, 1.5 * S); x.fillRect(px, inner + ih - bh * .3, bw, 1.5 * S);
        px += bw + .5;
      }
      woodFill(x, s.x, y + sh - 10 * S, s.w, 10 * S, '#5a3d24', '#3a2716', r);
    }
  }
  function desk(x, g, r) {
    x.fillStyle = lg(x, 0, g.deskBack, 0, g.deskFront, [[0, '#4a3220'], [1, '#6a4a30']]); x.fillRect(0, g.deskBack, W, g.deskFront - g.deskBack);
    x.fillStyle = 'rgba(255,220,170,.25)'; x.fillRect(0, g.deskFront - 2, W, 2);
    woodFill(x, 0, g.deskFront, W, H - g.deskFront, '#2e1f13', '#1a120b', r);
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(0, g.deskBack - 3 * S, W, 6 * S);
  }
  function shadow(x, cx, cy, rx, ry) { x.fillStyle = rg(x, cx, cy, 0, rx, [[0, 'rgba(0,0,0,.45)'], [1, 'rgba(0,0,0,0)']]); x.save(); x.translate(cx, cy); x.scale(1, ry / rx); x.translate(-cx, -cy); x.beginPath(); x.arc(cx, cy, rx, 0, 7); x.fill(); x.restore(); }
  function mug(x, cx, cy) { shadow(x, cx, cy, 34 * S, 8 * S); var w = 40 * S, h = 46 * S;
    x.fillStyle = lg(x, cx - w / 2, 0, cx + w / 2, 0, [[0, '#b35a3a'], [.45, '#d8805a'], [1, '#6a2f1f']]); rr(x, cx - w / 2, cy - h, w, h, [4, 4, 10, 10]); x.fill();
    x.strokeStyle = '#8a3f28'; x.lineWidth = 5 * S; x.beginPath(); x.arc(cx + w / 2, cy - h * .55, 11 * S, -1.2, 1.2); x.stroke();
    x.fillStyle = '#3a2214'; x.beginPath(); x.ellipse(cx, cy - h, w / 2, 5 * S, 0, 0, 7); x.fill(); return [cx, cy - h]; }
  /* a twin-bell alarm clock, drawn every frame: real time, a gold hand at the end of the running round, and it rings */
  function drawClock(x, cx, cy, s, t, ring, alarmAt) {
    var R = 25 * s, oy = -R - 9 * s, shake = ring ? Math.sin(t * 70) * .07 * ring : 0, jump = ring ? Math.abs(Math.sin(t * 35)) * 2 * s * ring : 0;
    shadow(x, cx, cy, 34 * s, 7 * s);
    x.save(); x.translate(cx, cy - jump); x.rotate(shake);
    x.strokeStyle = lg(x, -R, 0, R, 0, [[0, '#6a6a6a'], [.5, '#e8e8e8'], [1, '#5a5a5a']]); x.lineWidth = 3.2 * s; x.lineCap = 'round';
    x.beginPath(); x.moveTo(-R * .55, oy + R * .8); x.lineTo(-R * .85, 0); x.moveTo(R * .55, oy + R * .8); x.lineTo(R * .85, 0); x.stroke();
    x.fillStyle = '#d8d8d8'; [-1, 1].forEach(function (k) { x.beginPath(); x.arc(k * R * .85, 0, 2.6 * s, 0, 7); x.fill(); });
    x.strokeStyle = '#9a9a9a'; x.lineWidth = 2.4 * s; x.beginPath(); x.arc(0, oy - R * .95, R * .32, Math.PI * 1.1, Math.PI * 1.9); x.stroke();
    var hammer = ring ? Math.sin(t * 80) * R * .32 : 0;
    [-1, 1].forEach(function (k) {
      var bx = k * R * .66, by = oy - R * .92, br = R * .44, vib = ring ? Math.sin(t * 90 + k) * 1.2 * s : 0;
      x.strokeStyle = '#8a8a8a'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(k * R * .35, oy - R * .85); x.lineTo(bx * .95, by + R * .1); x.stroke();
      x.save(); x.translate(bx + vib, by); x.rotate(k * .5);
      x.fillStyle = rg(x, -br * .35, -br * .45, br * .05, br * 1.1, [[0, '#fff6d6'], [.35, '#e6be5a'], [.75, '#9a7020'], [1, '#5a3c0c']]);
      x.beginPath(); x.arc(0, 0, br, Math.PI, 0); x.lineTo(br, br * .18); x.lineTo(-br, br * .18); x.closePath(); x.fill();
      x.fillStyle = '#4a320c'; x.fillRect(-br * 1.02, br * .12, br * 2.04, br * .14);
      x.fillStyle = '#c9a040'; x.beginPath(); x.arc(0, -br, br * .14, 0, 7); x.fill();
      x.restore();
    });
    x.strokeStyle = '#7a7a7a'; x.lineWidth = 2 * s; x.beginPath(); x.moveTo(0, oy - R * .95); x.lineTo(hammer, oy - R * 1.32); x.stroke();
    x.fillStyle = '#bdbdbd'; x.beginPath(); x.arc(hammer, oy - R * 1.36, 3.2 * s, 0, 7); x.fill();
    x.fillStyle = rg(x, -R * .4, oy - R * .5, R * .1, R * 1.15, [[0, '#ff7a66'], [.45, '#c8382a'], [1, '#5a1008']]); x.beginPath(); x.arc(0, oy, R, 0, 7); x.fill();
    x.lineWidth = R * .13; x.strokeStyle = lg(x, -R, oy - R, R, oy + R, [[0, '#ffffff'], [.3, '#9a9a9a'], [.55, '#f4f4f4'], [.8, '#6a6a6a'], [1, '#d0d0d0']]); x.beginPath(); x.arc(0, oy, R * .84, 0, 7); x.stroke();
    x.fillStyle = rg(x, 0, oy, R * .1, R * .8, [[0, '#fffbf2'], [1, '#e9dcc0']]); x.beginPath(); x.arc(0, oy, R * .78, 0, 7); x.fill();
    for (var i = 0; i < 60; i++) { var a = i / 60 * 6.283, big = i % 5 === 0, r1 = R * (big ? .6 : .67), r2 = R * .73; x.strokeStyle = big ? '#2a2018' : 'rgba(42,32,24,.5)'; x.lineWidth = (big ? 1.5 : .7) * s; x.beginPath(); x.moveTo(Math.sin(a) * r1, oy - Math.cos(a) * r1); x.lineTo(Math.sin(a) * r2, oy - Math.cos(a) * r2); x.stroke(); }
    x.fillStyle = '#2a2018'; x.font = '700 ' + Math.max(6, Math.round(R * .24)) + 'px Georgia, serif'; x.textAlign = 'center'; x.textBaseline = 'middle';
    [['12', 0], ['3', 1.5708], ['6', 3.1416], ['9', 4.7124]].forEach(function (n) { x.fillText(n[0], Math.sin(n[1]) * R * .47, oy - Math.cos(n[1]) * R * .47); });
    x.textBaseline = 'alphabetic';
    var d = new Date(), hA = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * 6.283, mA = (d.getMinutes() + d.getSeconds() / 60) / 60 * 6.283, sA = (d.getSeconds() + d.getMilliseconds() / 1000) / 60 * 6.283;
    function hand(a, len, w, col, tail) { x.save(); x.translate(0, oy); x.rotate(a); x.fillStyle = col; x.beginPath(); x.moveTo(-w / 2, tail); x.lineTo(-w * .2, -len); x.lineTo(w * .2, -len); x.lineTo(w / 2, tail); x.closePath(); x.fill(); x.restore(); }
    if (alarmAt) { var ad = new Date(alarmAt); hand((ad.getHours() % 12 + ad.getMinutes() / 60) / 12 * 6.283, R * .34, 2.4 * s, '#c9a040', 0); }
    hand(hA, R * .4, 3.6 * s, '#1c1a20', 4 * s); hand(mA, R * .6, 2.6 * s, '#1c1a20', 5 * s);
    x.save(); x.translate(0, oy); x.rotate(sA); x.strokeStyle = '#c0392b'; x.lineWidth = 1 * s; x.beginPath(); x.moveTo(0, 8 * s); x.lineTo(0, -R * .66); x.stroke(); x.restore();
    x.fillStyle = '#c9a040'; x.beginPath(); x.arc(0, oy, 2.4 * s, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.22)'; x.beginPath(); x.ellipse(-R * .28, oy - R * .36, R * .34, R * .16, -.6, 0, 7); x.fill();
    x.fillStyle = 'rgba(255,255,255,.6)'; x.beginPath(); x.arc(-R * .42, oy - R * .46, 1.6 * s, 0, 7); x.fill();
    x.restore();
  }
  function clockRing(x, cx, cy, s, t, ring) {
    var R = 25 * s;
    if (ring) {
      x.save(); x.strokeStyle = 'rgba(255,214,140,1)'; x.lineWidth = 2 * s; x.lineCap = 'round';
      for (var w2 = 0; w2 < 3; w2++) { var ph = ((t * 2.2) + w2 / 3) % 1, rad = R * (1.25 + ph * 1.1); x.globalAlpha = (1 - ph) * .8 * ring;
        x.beginPath(); x.arc(cx, cy - R - 9 * s, rad, Math.PI * .85, Math.PI * 1.15); x.stroke(); x.beginPath(); x.arc(cx, cy - R - 9 * s, rad, -Math.PI * .15, Math.PI * .15); x.stroke(); }
      x.restore(); x.globalCompositeOperation = 'lighter'; glow(x, cx, cy - R, R * 3, WARM, .22 * ring); x.globalCompositeOperation = 'source-over';
    }
  }
  /* an open spiral notebook with handwriting, a highlighted line and a pencil */
  function notebook(x, cx, cy) {
    x.save(); x.translate(cx, cy); x.scale(1, .45); x.rotate(-.1);
    var pw = 100 * S, ph = 136 * S, rnd = R(17);
    shadow(x, 10 * S, 14 * S, pw * 1.25, ph * .62);
    x.fillStyle = '#2f4a5e'; rr(x, -pw - 8 * S, -ph / 2 - 6 * S, pw * 2 + 16 * S, ph + 12 * S, 4 * S); x.fill();
    for (var e = 3; e > 0; e--) { x.fillStyle = e % 2 ? '#d9cfb8' : '#e8dfca'; x.fillRect(-pw - 3 * S + e, -ph / 2 + e * 1.5, pw * 2 + 6 * S - 2 * e, ph); }
    [-1, 1].forEach(function (k) { var x0 = k < 0 ? -pw : 0; x.fillStyle = lg(x, k < 0 ? -pw : pw, 0, 0, 0, [[0, '#fbf6ea'], [.82, '#f1e8d4'], [1, '#cfc3a8']]); x.fillRect(x0, -ph / 2, pw, ph); });
    x.strokeStyle = 'rgba(90,130,190,.38)'; x.lineWidth = 1;
    for (var y = -ph / 2 + 22 * S; y < ph / 2 - 6 * S; y += 10 * S) { x.beginPath(); x.moveTo(-pw + 6 * S, y); x.lineTo(-8 * S, y); x.moveTo(8 * S, y); x.lineTo(pw - 6 * S, y); x.stroke(); }
    x.strokeStyle = 'rgba(220,90,80,.55)'; x.beginPath(); x.moveTo(-pw + 20 * S, -ph / 2); x.lineTo(-pw + 20 * S, ph / 2); x.moveTo(24 * S, -ph / 2); x.lineTo(24 * S, ph / 2); x.stroke();
    x.fillStyle = 'rgba(255,230,80,.4)'; x.fillRect(26 * S, -ph / 2 + 36 * S, 58 * S, 6 * S);
    x.strokeStyle = 'rgba(30,40,90,.8)'; x.lineWidth = 1.3; x.lineCap = 'round';
    for (var l = 0; l < 9; l++) { var yy = -ph / 2 + 20 * S + l * 10 * S, len = (46 + rnd() * 30) * S; x.beginPath(); for (var k2 = 0; k2 < len; k2 += 3 * S) x.lineTo(-pw + 24 * S + k2, yy - 2 * S + Math.sin(k2 * .9) * 1.6 * S); x.stroke(); }
    for (var l2 = 0; l2 < 5; l2++) { var yy2 = -ph / 2 + 20 * S + l2 * 10 * S, len2 = (40 + rnd() * 34) * S; x.beginPath(); for (var k3 = 0; k3 < len2; k3 += 3 * S) x.lineTo(28 * S + k3, yy2 - 2 * S + Math.sin(k3 * .8) * 1.6 * S); x.stroke(); }
    for (var c = -ph / 2 + 6 * S; c < ph / 2 - 4 * S; c += 8 * S) { x.strokeStyle = lg(x, -6 * S, 0, 6 * S, 0, [[0, '#6a6a6a'], [.5, '#f0f0f0'], [1, '#5a5a5a']]); x.lineWidth = 1.8 * S; x.beginPath(); x.ellipse(0, c, 6 * S, 2.6 * S, 0, 0, 7); x.stroke(); }
    x.save(); x.translate(50 * S, 30 * S); x.rotate(-.5);
    x.fillStyle = 'rgba(0,0,0,.25)'; x.fillRect(-58 * S, 5 * S, 116 * S, 6 * S);
    x.fillStyle = lg(x, 0, -4 * S, 0, 4 * S, [[0, '#f6c94a'], [.5, '#e0a524'], [1, '#a8761a']]); x.fillRect(-50 * S, -4 * S, 92 * S, 8 * S);
    x.fillStyle = '#b9b9b9'; x.fillRect(42 * S, -4 * S, 8 * S, 8 * S); x.fillStyle = '#e28d84'; rr(x, 50 * S, -4 * S, 8 * S, 8 * S, 2 * S); x.fill();
    x.fillStyle = '#e9cfa3'; x.beginPath(); x.moveTo(-50 * S, -4 * S); x.lineTo(-64 * S, 0); x.lineTo(-50 * S, 4 * S); x.fill();
    x.fillStyle = '#333'; x.beginPath(); x.moveTo(-60 * S, -1.2 * S); x.lineTo(-64 * S, 0); x.lineTo(-60 * S, 1.2 * S); x.fill();
    x.restore(); x.restore();
  }
  var BOOKCOLS = [['#1f3a5f', '#2f5a8f'], ['#24503a', '#3a7a56'], ['#5a1f2a', '#8a3040'], ['#4a2f5f', '#6e4a8f'], ['#6a3a14', '#a8621e'], ['#1f4a50', '#2f7078']];
  /* a stack of books lying flat on the desk; the top one is the textbook, its spine shows the subject */
  function bookStack(x, cx, baseY, title, grade) {
    var hs = 0; for (var i = 0; i < title.length; i++) hs = (hs * 31 + title.toLowerCase().charCodeAt(i)) >>> 0;
    var mine = BOOKCOLS[hs % BOOKCOLS.length];
    var books = [
      { len: 150, th: 20, ox: -4, cols: ['#3a2a1c', '#5a4028'], label: '' },
      { len: 136, th: 17, ox: 6, cols: ['#20303e', '#34495e'], label: '' },
      { len: 144, th: 28, ox: -2, cols: [mine[0], mine[1]], label: title.toUpperCase(), sub: grade }
    ];
    shadow(x, cx, baseY, 100 * S, 10 * S);
    var y = baseY;
    books.forEach(function (b) {
      var L = b.len * S, T = b.th * S, top = 9 * S, x0 = cx - L / 2 + b.ox * S, y0 = y - T;
      /* cover seen from the top, as a thin strip */
      x.fillStyle = lg(x, 0, y0 - top, 0, y0, [[0, b.cols[1]], [1, b.cols[0]]]);
      x.beginPath(); x.moveTo(x0 + 4 * S, y0 - top); x.lineTo(x0 + L + 4 * S, y0 - top); x.lineTo(x0 + L, y0); x.lineTo(x0, y0); x.closePath(); x.fill();
      /* page block at the right end */
      x.fillStyle = '#e9dfc6'; x.beginPath(); x.moveTo(x0 + L, y0 + 2 * S); x.lineTo(x0 + L + 4 * S, y0 - top + 2 * S); x.lineTo(x0 + L + 4 * S, y0 - top + T); x.lineTo(x0 + L, y0 + T - 2 * S); x.closePath(); x.fill();
      /* the spine, facing us, rounded */
      x.fillStyle = lg(x, 0, y0, 0, y0 + T, [[0, b.cols[1]], [.45, b.cols[1]], [1, b.cols[0]]]); rr(x, x0, y0, L, T, 3 * S); x.fill();
      x.fillStyle = 'rgba(255,255,255,.12)'; x.fillRect(x0 + 2 * S, y0 + 2 * S, L - 4 * S, 2 * S);
      x.fillStyle = 'rgba(232,200,130,.7)'; x.fillRect(x0 + 10 * S, y0 + 3 * S, 2 * S, T - 6 * S); x.fillRect(x0 + L - 12 * S, y0 + 3 * S, 2 * S, T - 6 * S);
      if (b.label) {
        var avail = L - 44 * S, fs = 15 * S, font = function (px) { return '700 ' + px + 'px "Special Elite", "Courier New", monospace'; };
        x.font = font(fs); while (fs > 7 * S && x.measureText(b.label).width > avail) { fs -= .5 * S; x.font = font(fs); }
        x.fillStyle = '#fff3d6'; x.textAlign = 'center'; x.textBaseline = 'middle';
        x.fillText(b.label, cx + b.ox * S, y0 + T * .44);
        x.font = '600 ' + Math.round(6 * S) + 'px Karla, sans-serif'; x.fillStyle = 'rgba(255,243,214,.7)'; x.fillText(b.sub, cx + b.ox * S, y0 + T * .82);
        x.textBaseline = 'alphabetic';
      }
      y = y0 - 1 * S;
    });
    return y - 4 * S;   /* where something can sit on top */
  }
  /* a record player: the record spins and the arm drops on while music plays */
  function musicOn() { var a = document.getElementById('gmp-audio'); return !!((window.SSMixer && window.SSMixer.isPlaying()) || (a && !a.paused)); }
  function drawVinyl(x, cx, cy, s, t, spin, arm, on) {
    var W0 = 150 * s, topH = 46 * s, frontH = 16 * s, X0 = cx - W0 / 2, topY = cy - frontH - topH;
    shadow(x, cx, cy, W0 * .62, 8 * s);
    x.fillStyle = lg(x, 0, cy - frontH, 0, cy, [[0, '#5a3a20'], [1, '#2e1d10']]); rr(x, X0, cy - frontH, W0, frontH, [0, 0, 4 * s, 4 * s]); x.fill();    /* front */
    x.fillStyle = lg(x, X0, topY, X0 + W0, cy - frontH, [[0, '#8a5e36'], [1, '#5a3a20']]); rr(x, X0, topY, W0, topH, 4 * s); x.fill();                 /* top */
    x.strokeStyle = 'rgba(255,220,170,.18)'; x.lineWidth = 1; x.beginPath(); x.moveTo(X0 + 4 * s, cy - frontH); x.lineTo(X0 + W0 - 4 * s, cy - frontH); x.stroke();
    [.12, .22].forEach(function (k) { x.fillStyle = '#c9b48a'; x.beginPath(); x.arc(X0 + W0 * k, cy - frontH / 2, 3.2 * s, 0, 7); x.fill(); });          /* knobs */
    x.fillStyle = on ? '#7dff8a' : '#5a2a20'; x.beginPath(); x.arc(X0 + W0 * .88, cy - frontH / 2, 2.2 * s, 0, 7); x.fill();                              /* power light */
    if (on) { x.globalCompositeOperation = 'lighter'; glow(x, X0 + W0 * .88, cy - frontH / 2, 10 * s, 'rgba(125,255,138,A)', .5); x.globalCompositeOperation = 'source-over'; }
    var px = cx - 16 * s, py = topY + topH / 2, rx = 52 * s, ry = 19 * s;
    x.fillStyle = '#1a1a1c'; x.beginPath(); x.ellipse(px, py + 2 * s, rx + 4 * s, ry + 2 * s, 0, 0, 7); x.fill();                                         /* platter */
    x.fillStyle = rg(x, px, py, 2, rx, [[0, '#2a2a2e'], [1, '#0c0c0e']]); x.beginPath(); x.ellipse(px, py, rx, ry, 0, 0, 7); x.fill();                   /* record */
    x.strokeStyle = 'rgba(255,255,255,.07)'; x.lineWidth = .8; for (var g2 = .45; g2 < .98; g2 += .09) { x.beginPath(); x.ellipse(px, py, rx * g2, ry * g2, 0, 0, 7); x.stroke(); }
    x.save(); x.translate(px, py); x.scale(1, ry / rx); x.rotate(spin);
    x.strokeStyle = 'rgba(255,240,210,.28)'; x.lineWidth = 3 * s; x.beginPath(); x.arc(0, 0, rx * .72, -.35, .35); x.stroke();                           /* light catching the grooves */
    x.fillStyle = '#c0392b'; x.beginPath(); x.arc(0, 0, rx * .3, 0, 7); x.fill();                                                                        /* label */
    x.fillStyle = '#f2b84b'; x.beginPath(); x.arc(0, 0, rx * .3, -.5, .5); x.lineTo(0, 0); x.fill();
    x.restore();
    x.fillStyle = '#d8d8d8'; x.beginPath(); x.ellipse(px, py, 2 * s, 1.2 * s, 0, 0, 7); x.fill();                                                        /* spindle */
    var bx = X0 + W0 - 20 * s, by = topY + 12 * s, rest = Math.PI / 2 + .12, play = Math.atan2(py - 4 * s - by, px + rx * .62 - bx), ang = rest + (play - rest) * arm, len = 64 * s;
    x.fillStyle = rg(x, bx - 2 * s, by - 2 * s, 1, 9 * s, [[0, '#f4f4f4'], [1, '#7a7a7a']]); x.beginPath(); x.arc(bx, by, 7 * s, 0, 7); x.fill();          /* arm base */
    x.strokeStyle = '#d0d0d0'; x.lineWidth = 2.6 * s; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, by); x.lineTo(bx + Math.cos(ang) * len, by + Math.sin(ang) * len * .9); x.stroke();
    x.save(); x.translate(bx + Math.cos(ang) * len, by + Math.sin(ang) * len * .9); x.rotate(ang); x.fillStyle = '#9a9a9a'; x.fillRect(-2 * s, -4 * s, 10 * s, 8 * s); x.restore();   /* headshell */
    x.fillStyle = '#2a2a2a'; x.beginPath(); x.arc(bx + 10 * s, by + 4 * s, 4 * s, 0, 7); x.fill();                                                      /* counterweight */
    return [px, py];
  }
  /* what the room reads from the Study page: the subject, and when the running round ends */
  function readState() {
    var out = { subject: '', end: 0 };
    try { var run = JSON.parse(localStorage.getItem('studySyncStudyRun') || 'null'); if (run && run.phase && run.phase !== 'done') { out.subject = run.subject || ''; out.end = run.running ? (run.endAt || 0) : 0; } } catch (e) { /* storage unavailable */ }
    if (!out.subject) { var inp = document.getElementById('st-subject'); out.subject = inp && inp.value ? inp.value.trim() : ''; }
    return out;
  }
  function gradeLabel() { try { var p = JSON.parse(localStorage.getItem('studySyncProfile') || 'null'); return p && p.grade ? 'GRADE ' + p.grade : 'TEXTBOOK'; } catch (e) { return 'TEXTBOOK'; } }
  function catHome(g) { return [g.sill.x + g.sill.w * .55, g.sill.y + 2]; }
  function catBody(x) { return rg(x, -10 * S, -12 * S, 4, 60 * S, [[0, '#56505a'], [1, '#221e26']]); }
  function catSleep(x, cx, cy, t, flick) {
    var br = 1 + .035 * Math.sin(t * 1.7), tw = flick > 0 ? Math.sin(flick * 16) * 9 * S : 0;
    x.fillStyle = 'rgba(0,0,0,.35)'; x.beginPath(); x.ellipse(cx + 6 * S, cy, 46 * S, 6 * S, 0, 0, 7); x.fill();
    x.save(); x.translate(cx, cy - 18 * S); x.scale(1, br);
    x.fillStyle = catBody(x); x.beginPath(); x.ellipse(0, 0, 44 * S, 20 * S, 0, 0, 7); x.fill();
    x.strokeStyle = 'rgba(200,215,255,.35)'; x.lineWidth = 1.5; x.beginPath(); x.ellipse(0, 0, 44 * S, 20 * S, 0, 3.6, 5.2); x.stroke();
    x.restore();
    x.save(); x.translate(cx, cy);
    x.fillStyle = catBody(x); x.beginPath(); x.ellipse(-34 * S, -22 * S, 17 * S, 14 * S, 0, 0, 7); x.fill();
    x.beginPath(); x.moveTo(-46 * S, -30 * S); x.lineTo(-44 * S, -44 * S); x.lineTo(-36 * S, -34 * S); x.moveTo(-30 * S, -34 * S); x.lineTo(-24 * S, -46 * S); x.lineTo(-20 * S, -32 * S); x.fill();
    x.strokeStyle = '#2a2430'; x.lineWidth = 9 * S; x.lineCap = 'round'; x.beginPath(); x.moveTo(40 * S, -10 * S); x.quadraticCurveTo(56 * S, 2 + tw * .3, 20 * S + tw, -2 - Math.abs(tw) * .3); x.stroke();
    x.strokeStyle = 'rgba(20,16,20,.9)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(-40 * S, -22 * S); x.lineTo(-35 * S, -21 * S); x.moveTo(-31 * S, -22 * S); x.lineTo(-26 * S, -21 * S); x.stroke();
    x.restore();
  }
  function catLeap(x, px, py, vx, vy) {
    var a = Math.atan2(vy, vx);
    x.save(); x.translate(px, py);
    if (vx < 0) x.rotate(a + Math.PI); else { x.rotate(a); x.scale(-1, 1); }   /* the head always leads */
    x.strokeStyle = '#2a2430'; x.lineCap = 'round'; x.lineWidth = 6 * S;
    x.beginPath(); x.moveTo(-28 * S, 6 * S); x.lineTo(-60 * S, 12 * S); x.moveTo(-24 * S, 8 * S); x.lineTo(-54 * S, 20 * S);   /* front legs reach */
    x.moveTo(26 * S, 6 * S); x.lineTo(56 * S, 18 * S); x.moveTo(30 * S, 4 * S); x.lineTo(62 * S, 6 * S); x.stroke();          /* back legs push */
    x.lineWidth = 8 * S; x.beginPath(); x.moveTo(44 * S, -2 * S); x.quadraticCurveTo(66 * S, -6 * S, 84 * S, -22 * S); x.stroke();   /* tail */
    x.fillStyle = catBody(x); x.beginPath(); x.ellipse(0, 0, 48 * S, 13 * S, 0, 0, 7); x.fill();
    x.beginPath(); x.arc(-48 * S, -6 * S, 13 * S, 0, 7); x.fill();
    x.beginPath(); x.moveTo(-58 * S, -12 * S); x.lineTo(-60 * S, -26 * S); x.lineTo(-50 * S, -17 * S); x.moveTo(-46 * S, -17 * S); x.lineTo(-40 * S, -28 * S); x.lineTo(-38 * S, -14 * S); x.fill();
    x.fillStyle = '#d8f07a'; x.beginPath(); x.arc(-54 * S, -7 * S, 2 * S, 0, 7); x.arc(-45 * S, -8 * S, 2 * S, 0, 7); x.fill();   /* wide awake */
    x.restore();
  }
  /* the cat's leap between the sill and the floor: u = 0 on the sill, 1 out of sight */
  function catPath(g, u) {
    var h = catHome(g), x0 = h[0], y0 = h[1] - 18 * S, x1 = -150 * S, y1 = h[1] + 30 * S, lift = 70 * S;   /* a sideways leap off the left edge */
    var px = x0 + (x1 - x0) * u, py = y0 + (y1 - y0) * u - Math.sin(u * Math.PI) * lift;
    var dx = x1 - x0, dy = (y1 - y0) - Math.cos(u * Math.PI) * Math.PI * lift;
    return [px, py, dx, dy];
  }
  /* a framed handwritten note: a new one each time the Study page opens (kept while you stay) */
  var NOTES = [['Small steps,', 'every day.'], ['Progress,', 'not perfection.'], ['You can do', 'hard things.'], ['Start where', 'you are.'],
    ['One page', 'at a time.'], ['Done is better', 'than perfect.'], ['Future you', 'says thank you.'], ['Focus on', 'this hour.'],
    ['Mistakes mean', "you're learning."], ['Slow progress', 'is still progress.'], ['Believe you', 'can, and try.'], ['Your effort', 'is adding up.'],
    ['Keep going,', "you've got this."], ['Little by little,', 'a lot.'], ['Learn it once,', 'know it forever.']];
  var noteIdx = 0;
  try { var nn = parseInt(localStorage.getItem('studySyncRoomNote') || '-1', 10); noteIdx = (isNaN(nn) ? 0 : nn + 1) % NOTES.length; localStorage.setItem('studySyncRoomNote', String(noteIdx)); }
  catch (e) { noteIdx = Math.floor(Math.random() * NOTES.length); }
  function poster(x, g, r) {
    var l = g.left, fx = l.x + l.w * .15, fy = l.y + 10 * S, fw = l.w * .7, fh = l.h || fw * 1.25, m = 7 * S, ix = fx + m, iy = fy + m, iw = fw - 2 * m, ih = fh - 2 * m;
    var note = NOTES[noteIdx];
    x.fillStyle = 'rgba(0,0,0,.35)'; x.fillRect(fx + 6, fy + 8, fw, fh);
    x.fillStyle = lg(x, fx, fy, fx + fw, fy + fh, [[0, '#6a4a2a'], [.5, '#3a2716'], [1, '#2a1c10']]); x.fillRect(fx, fy, fw, fh);
    x.fillStyle = lg(x, ix, iy, ix + iw, iy + ih, [[0, '#f8f1e0'], [1, '#ece0c4']]); x.fillRect(ix, iy, iw, ih);   /* the paper */
    x.strokeStyle = 'rgba(120,150,190,.18)'; x.lineWidth = 1;
    for (var y = iy + ih * .2; y < iy + ih - 6 * S; y += ih * .1) { x.beginPath(); x.moveTo(ix + 6 * S, y); x.lineTo(ix + iw - 6 * S, y); x.stroke(); }
    var fs = Math.round(Math.min(iw / 5.2, ih / 4.6)), font = function (px) { return '700 ' + px + 'px Caveat, "Segoe Print", cursive'; };
    x.font = font(fs);
    while (fs > 10 && note.some(function (t) { return x.measureText(t).width > iw - 16 * S; })) { fs -= 1; x.font = font(fs); }
    x.fillStyle = '#2b2440'; x.textAlign = 'center'; x.textBaseline = 'middle';
    var cx = ix + iw / 2, cy = iy + ih * .44;
    x.save(); x.translate(cx, cy); x.rotate(-.04);
    x.fillText(note[0], 0, -fs * .55); x.fillText(note[1], 0, fs * .55);
    var uw = Math.min(iw - 24 * S, x.measureText(note[1]).width);   /* a quick underline */
    x.strokeStyle = '#c0392b'; x.lineWidth = 2.2 * S; x.lineCap = 'round'; x.beginPath(); x.moveTo(-uw / 2, fs * 1.2); x.quadraticCurveTo(0, fs * 1.05, uw / 2, fs * 1.16); x.stroke();
    x.restore(); x.textBaseline = 'alphabetic';
    x.fillStyle = '#c0392b'; x.font = Math.round(fs * .55) + 'px Caveat, cursive'; x.textAlign = 'right'; x.fillText('♥', ix + iw - 10 * S, iy + ih - 10 * S);
    x.fillStyle = lg(x, fx, fy, fx + fw, fy + fh * .5, [[0, 'rgba(255,255,255,.1)'], [.5, 'rgba(255,255,255,0)']]); x.fillRect(ix, iy, iw, ih);   /* glass */
  }
  function lamp(x, g) {
    var bx = g.lamp.x, by = g.lamp.y, s = S * 1.1, dir = g.lamp.dir || 1;
    shadow(x, bx, by, 40 * s, 8 * s);
    x.save(); x.translate(bx, 0); x.scale(dir, 1); x.translate(-bx, 0);
    x.fillStyle = lg(x, bx - 30 * s, 0, bx + 30 * s, 0, [[0, '#2a2a2a'], [.5, '#4a4a4a'], [1, '#1a1a1a']]); x.beginPath(); x.ellipse(bx, by, 30 * s, 7 * s, 0, 0, 7); x.fill();
    x.strokeStyle = '#2a2a2a'; x.lineWidth = 6 * s; x.lineCap = 'round'; x.beginPath(); x.moveTo(bx, by - 4 * s); x.lineTo(bx - 10 * s, by - 96 * s); x.lineTo(bx + 52 * s, by - 156 * s); x.stroke();
    x.fillStyle = '#3a3a3a'; x.beginPath(); x.arc(bx - 10 * s, by - 96 * s, 5 * s, 0, 7); x.fill();
    x.fillStyle = lg(x, bx + 40 * s, by - 180 * s, bx + 90 * s, by - 130 * s, [[0, '#4a4a4a'], [1, '#1a1a1a']]); x.beginPath(); x.moveTo(bx + 36 * s, by - 172 * s); x.lineTo(bx + 76 * s, by - 186 * s); x.lineTo(bx + 100 * s, by - 136 * s); x.lineTo(bx + 60 * s, by - 126 * s); x.closePath(); x.fill();
    x.fillStyle = '#fff2d0'; x.beginPath(); x.ellipse(bx + 80 * s, by - 131 * s, 21 * s, 6 * s, -.25, 0, 7); x.fill();
    x.restore();
    return { bulb: [bx + dir * 80 * s, by - 128 * s], s: s, dir: dir };
  }
  function lighting(x, g, L) {
    var o = off(), d = o[1];
    d.fillStyle = 'rgba(10,7,14,' + (weather === 'thunder' ? .68 : .6) + ')'; d.fillRect(0, 0, W, H);
    d.globalCompositeOperation = 'destination-out';
    d.fillStyle = rg(d, L.bulb[0], g.deskBack + 30 * S, 0, W * .42, [[0, 'rgba(0,0,0,.95)'], [.5, 'rgba(0,0,0,.5)'], [1, 'rgba(0,0,0,0)']]); d.fillRect(0, 0, W, H);
    var b = g.win; d.fillStyle = rg(d, b.x + b.w / 2, b.y + b.h / 2, 0, b.w * .9, [[0, 'rgba(0,0,0,.8)'], [1, 'rgba(0,0,0,0)']]); d.fillRect(0, 0, W, H);
    x.drawImage(o[0], 0, 0, W, H);
    x.globalCompositeOperation = 'lighter';
    var cone = x.createLinearGradient(0, L.bulb[1], 0, g.deskFront); cone.addColorStop(0, 'rgba(255,200,120,.22)'); cone.addColorStop(1, 'rgba(255,200,120,0)');
    var dir = L.dir || 1;
    x.fillStyle = cone; x.beginPath(); x.moveTo(L.bulb[0] - 22 * dir * L.s, L.bulb[1]); x.lineTo(L.bulb[0] + 22 * dir * L.s, L.bulb[1] - 4 * L.s); x.lineTo(L.bulb[0] + 150 * dir * L.s, g.deskFront); x.lineTo(L.bulb[0] - 130 * dir * L.s, g.deskFront); x.closePath(); x.fill();
    glow(x, L.bulb[0], L.bulb[1], 70 * L.s, WARM, .55); glow(x, L.bulb[0], g.deskBack + 30 * S, 260 * S, WARM, .16);
    x.globalCompositeOperation = 'source-over';
    x.fillStyle = rg(x, W / 2, H * .45, Math.min(W, H) * .3, Math.max(W, H) * .8, [[0, 'rgba(0,0,0,0)'], [1, 'rgba(0,0,0,.55)']]); x.fillRect(0, 0, W, H);
    return o[0];   /* the room's darkness, reused to light the alarm clock */
  }

  function build() {
    W = window.innerWidth; H = window.innerHeight; if (!W || !H) return;
    DPR = Math.min(1.5, window.devicePixelRatio || 1); S = Math.min(H / 760, W / 1100) * 1.05;
    cv.width = Math.round(W * DPR); cv.height = Math.round(H * DPR); ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    var r = R(7), g = geo(), o = off(), x = o[1];
    wall(x, g, r); windowFrame(x, g, r); curtainRod(x, g); bookshelf(x, g, r);
    desk(x, g, r);
    var fl = g.left, fcx = fl.x + fl.w / 2, ftop = fl.y + 10 * S;
    x.strokeStyle = 'rgba(30,22,14,.9)'; x.lineWidth = 1.2 * S; x.beginPath(); x.moveTo(fcx - fl.w * .25, ftop + 4 * S); x.lineTo(fcx, ftop - 16 * S); x.lineTo(fcx + fl.w * .25, ftop + 4 * S); x.stroke();   /* picture wire */
    x.fillStyle = '#9a8060'; x.beginPath(); x.arc(fcx, ftop - 16 * S, 2.4 * S, 0, 7); x.fill();   /* the nail */
    poster(x, g, r);
    var L = lamp(x, g), depth = g.deskFront - g.deskBack, S0 = S, st = readState(); S = S0 * 1.05;
    var stackX = W * .875, stackTop = bookStack(x, stackX, g.deskBack + depth * .42, st.subject || 'Study notes', gradeLabel());
    notebook(x, W * .84, g.deskFront - depth * .1);
    var steam = mug(x, W * .952, g.deskFront - depth * .02);
    S = S0;
    var dark = lighting(x, g, L);
    var bulbs = []; for (var i = 0; i <= 26; i++) { var tt = i / 26; bulbs.push([W * .24 + W * .52 * tt, Math.max(66, H * .075) + Math.sin(tt * Math.PI) * 18 * S, r() * 6]); }   /* centred across the top of the room */
    var fx = [], b = g.win, count = weather === 'snow' ? 120 : weather === 'thunder' ? 230 : 160;
    for (var k = 0; k < count; k++) fx.push({ x: b.x + r() * b.w, y: b.y + r() * b.h, p: r() * 6 });
    scene = { bg: o[0], dark: dark, g: g, bulbs: bulbs, fx: fx, steam: steam, clk: [stackX - 8 * S0, stackTop + 2 * S0], subject: st.subject, alarmAt: st.end, checked: 0, vinyl: [W * .115, g.deskBack + depth * .62], S1: S0 * 1.05, flash: 0, nextFlash: 4 + Math.random() * 6, curtains: room.open, rects: [] };
    paint(performance.now(), true);
  }

  function stepRoom(dt) {
    var sp = 1.7 * dt;   /* the curtains glide */
    if (room.open < room.target) room.open = Math.min(room.target, room.open + sp); else if (room.open > room.target) room.open = Math.max(room.target, room.open - sp);
    if (room.cat === 'leave') { room.u += dt / .85; if (room.u >= 1) { room.u = 1; room.cat = 'away'; room.away = 0; } }
    else if (room.cat === 'away') { room.away += dt; if (room.target === 1 && room.open > .95 && room.away > room.wait) { room.cat = 'back'; } }
    else if (room.cat === 'back') { room.u -= dt / .9; if (room.u <= 0) { room.u = 0; room.cat = 'sleep'; } }
    else { room.nextFlick -= dt; if (room.nextFlick <= 0) { room.flick = 1; room.nextFlick = 5 + Math.random() * 7; } if (room.flick > 0) room.flick = Math.max(0, room.flick - dt * 1.3); }
  }
  function startle(wait) { if (room.cat === 'sleep' || room.cat === 'back') { room.cat = 'leave'; room.wait = wait; } }
  /* the curtains and the cat live on their own small canvas, so they can be shaded like the rest of the room */
  function drawPlayLayer(x, g, t) {
    var b = g.win, lw = Math.ceil(b.x + b.w + 90 * S), lh = Math.ceil(H);
    var pc = scene.playCanvas || (scene.playCanvas = document.createElement('canvas'));
    if (pc.width !== Math.round(lw * DPR) || pc.height !== Math.round(lh * DPR)) { pc.width = Math.round(lw * DPR); pc.height = Math.round(lh * DPR); }
    var p = pc.getContext('2d'); p.setTransform(DPR, 0, 0, DPR, 0, 0); p.clearRect(0, 0, lw, lh);
    scene.rects = drawCurtains(p, g, room.open);
    if (room.open < 1) { p.fillStyle = 'rgba(8,6,12,' + (.3 * (1 - room.open)) + ')'; scene.rects.forEach(function (rc) { p.fillRect(rc[0], rc[1], rc[2], rc[3]); }); }
    var h = catHome(g);
    if (room.cat === 'sleep') catSleep(p, h[0], h[1], t, room.flick);
    else if (room.cat !== 'away') { var cp = catPath(g, room.u), dir = room.cat === 'leave' ? 1 : -1; catLeap(p, cp[0], cp[1], cp[2] * dir, cp[3] * dir); }
    p.globalCompositeOperation = 'source-atop'; p.globalAlpha = .8; p.drawImage(scene.dark, 0, 0, W, H); p.globalAlpha = 1; p.globalCompositeOperation = 'source-over';
    x.drawImage(pc, 0, 0, lw, lh);
  }
  function paint(now, once) {
    if (!scene) return;
    var dt = Math.min(.08, (now - (last || now)) / 1000), t = (now - t0) / 1000; last = now;
    if (reduce) { dt = 0; t = 1; }
    var x = ctx, g = scene.g, b = g.win, s1 = scene.S1;
    x.clearRect(0, 0, W, H); x.drawImage(scene.bg, 0, 0, W, H);
    x.save(); x.beginPath(); x.rect(b.x + 4, b.y + 4, b.w - 8, b.h - 8); x.clip();
    if (weather === 'snow') { x.fillStyle = 'rgba(240,244,255,.8)'; scene.fx.forEach(function (d) { d.y += (24 + d.p * 6) * dt; d.x += Math.sin(t + d.p) * 10 * dt; if (d.y > b.y + b.h) { d.y = b.y - 4; d.x = b.x + Math.random() * b.w; } x.beginPath(); x.arc(d.x, d.y, 1 + d.p * .25, 0, 7); x.fill(); }); }
    else if (weather !== 'clear') { var fast = weather === 'thunder' ? 1.4 : 1; x.strokeStyle = 'rgba(190,210,255,.28)'; x.lineWidth = 1; x.beginPath();
      scene.fx.forEach(function (d) { d.y += (420 + d.p * 60) * fast * dt; d.x -= (weather === 'thunder' ? 60 : 0) * dt; if (d.y > b.y + b.h) { d.y = b.y - 20; d.x = b.x + Math.random() * b.w * 1.1; } x.moveTo(d.x, d.y); x.lineTo(d.x - (weather === 'thunder' ? 5 : 2), d.y - 16 * S); }); x.stroke(); }
    if (weather === 'thunder') {
      scene.nextFlash -= dt;
      if (scene.nextFlash <= 0) { scene.flash = 1; scene.bolt = b.x + b.w * (.2 + Math.random() * .6); scene.nextFlash = 6 + Math.random() * 9; }
      if (scene.flash > 0) {
        var f = scene.flash * (scene.flash > .7 ? 1 : .5 + .5 * Math.sin(scene.flash * 40));
        x.fillStyle = 'rgba(220,230,255,' + (.55 * f) + ')'; x.fillRect(b.x, b.y, b.w, b.h);
        if (scene.flash > .55) { x.strokeStyle = 'rgba(255,255,255,.95)'; x.lineWidth = 2.2; x.beginPath(); var bx = scene.bolt, by = b.y; x.moveTo(bx, by); for (var k = 0; k < 8; k++) { bx += (Math.random() - .5) * 26 * S; by += b.h * .08; x.lineTo(bx, by); } x.stroke(); }
      }
    }
    x.restore();
    stepRoom(dt);
    drawPlayLayer(x, g, t);
    var on = musicOn(), vs = scene.S1, vx0 = scene.vinyl[0], vy0 = scene.vinyl[1];
    room.arm += ((on ? 1 : 0) - room.arm) * Math.min(1, dt * 2.5); if (on && room.arm > .9) room.spin += dt * 3.5;   /* 33 rpm */
    var vbx = Math.floor(vx0 - 90 * vs), vby = Math.floor(vy0 - 80 * vs), vbw = Math.ceil(180 * vs), vbh = Math.ceil(92 * vs);
    var vc = scene.vinylCanvas || (scene.vinylCanvas = document.createElement('canvas'));
    if (vc.width !== Math.round(vbw * DPR)) { vc.width = Math.round(vbw * DPR); vc.height = Math.round(vbh * DPR); }
    var v2 = vc.getContext('2d'); v2.setTransform(DPR, 0, 0, DPR, 0, 0); v2.clearRect(0, 0, vbw, vbh);
    v2.save(); v2.translate(-vbx, -vby); var rec = drawVinyl(v2, vx0, vy0, vs, t, room.spin, room.arm, on); v2.restore();
    v2.globalCompositeOperation = 'source-atop'; v2.globalAlpha = .5; v2.drawImage(scene.dark, -vbx, -vby, W, H); v2.globalAlpha = 1; v2.globalCompositeOperation = 'source-over';
    x.drawImage(vc, vbx, vby, vbw, vbh);
    if (on && !reduce) { room.noteT -= dt; if (room.noteT <= 0) { room.noteT = .9 + Math.random() * .8; room.notes.push({ x: rec[0] + (Math.random() - .5) * 40 * vs, y: rec[1] - 10 * vs, a: 0, c: Math.random() < .5 ? '\u266A' : '\u266B' }); } }
    x.fillStyle = '#f2c46a'; x.textAlign = 'center'; x.font = Math.round(15 * vs) + 'px Georgia, serif';
    room.notes = room.notes.filter(function (n) { n.a += dt; if (n.a > 3) return false; x.globalAlpha = Math.max(0, .75 * (1 - n.a / 3)); x.fillText(n.c, n.x + Math.sin(n.a * 2 + n.x) * 8 * vs, n.y - n.a * 34 * vs); return true; });
    x.globalAlpha = 1;
    if (weather === 'thunder' && scene.flash > 0) { x.fillStyle = 'rgba(190,205,255,' + (.12 * scene.flash * room.open) + ')';   /* closed curtains keep the lightning out */ x.fillRect(0, 0, W, H); scene.flash = Math.max(0, scene.flash - dt * 1.6); }
    x.strokeStyle = 'rgba(20,14,10,.8)'; x.lineWidth = 1; x.beginPath(); scene.bulbs.forEach(function (p, i) { if (i) x.lineTo(p[0], p[1]); else x.moveTo(p[0], p[1]); }); x.stroke();
    x.globalCompositeOperation = 'lighter';
    scene.bulbs.forEach(function (p) { var a = .6 + .4 * Math.sin(t * 1.8 + p[2]); glow(x, p[0], p[1] + 4, 18 * S, WARM, .35 * a); x.fillStyle = 'rgba(255,225,160,' + a + ')'; x.beginPath(); x.arc(p[0], p[1] + 4, 2.4 * S, 0, 7); x.fill(); });
    x.globalCompositeOperation = 'source-over';
    var st = scene.steam; for (var k2 = 0; k2 < 3; k2++) { var ph = (t * .35 + k2 / 3) % 1; x.strokeStyle = 'rgba(255,240,220,' + (.22 * (1 - ph)) + ')'; x.lineWidth = 3 * s1; x.lineCap = 'round'; x.beginPath();
      for (var y = 0; y < 40; y += 4) x.lineTo(st[0] + (k2 - 1) * 8 * s1 + Math.sin(y * .15 + t * 2 + k2) * 5 * s1, st[1] - 6 * s1 - ph * 30 * s1 - y * s1); x.stroke(); }
    var ring = Math.max(0, Math.min(1, ((window.__ssRoomRing || 0) - Date.now()) / 400));
    var cs = scene.S1 * 1.12, cR = 25 * cs, cx0 = scene.clk[0], cy0 = scene.clk[1];
    /* draw the clock on its own small canvas, shade only the clock with the room's darkness
       (softly, so it stays readable; brighter while it rings), then place it in the room */
    var bx0 = Math.floor(cx0 - cR * 2.4), by0 = Math.floor(cy0 - cR * 3.6), bw0 = Math.ceil(cR * 4.8), bh0 = Math.ceil(cR * 3.9);
    var cc = scene.clockCanvas || (scene.clockCanvas = document.createElement('canvas'));
    if (cc.width !== Math.round(bw0 * DPR)) { cc.width = Math.round(bw0 * DPR); cc.height = Math.round(bh0 * DPR); }
    var c2 = cc.getContext('2d'); c2.setTransform(DPR, 0, 0, DPR, 0, 0); c2.clearRect(0, 0, bw0, bh0);
    c2.save(); c2.translate(-bx0, -by0); drawClock(c2, cx0, cy0, cs, reduce ? 0 : t, reduce ? 0 : ring, scene.alarmAt); c2.restore();
    c2.globalCompositeOperation = 'source-atop'; c2.globalAlpha = .55 * (1 - ring * .7); c2.drawImage(scene.dark, -bx0, -by0, W, H);
    c2.globalAlpha = 1; c2.globalCompositeOperation = 'source-over';
    x.drawImage(cc, bx0, by0, bw0, bh0);
    clockRing(x, cx0, cy0, cs, reduce ? 0 : t, reduce ? 0 : ring);
    if (now - scene.checked > 800) {   /* follow the subject and the running round */
      scene.checked = now; var st2 = readState(); scene.alarmAt = st2.end;
      if (st2.subject !== scene.subject) { scene.subject = st2.subject; clearTimeout(rebuildT); rebuildT = setTimeout(build, 350); }
    }
    if (!once) loop();
  }
  function loop() { requestAnimationFrame(function (now) {
    if (!document.body.contains(cv)) { running = false; return; }   /* left the page (pages swap in place) */
    if (!running) return;
    if (document.hidden || now - lastFrame < 33) { loop(); return; }  /* ~30 fps is plenty for rain */
    lastFrame = now; paint(now);
  }); }

  function sync() {
    var on = root && root.dataset.bg === 'lamp';
    cv.hidden = !on;
    if (on && !scene) build();
    if (on && !running && !reduce) { running = true; loop(); }
    if (!on) running = false;
  }
  if (!window.__ssRoomAlarmHooked) {   /* added once; pages swap in place */
    window.__ssRoomAlarmHooked = true;
    document.addEventListener('studysync:alarm', function (e) { var r2 = e.detail && e.detail.repeat; window.__ssRoomRing = Date.now() + (r2 === 'until' ? 6e5 : r2 === '3x' ? 10000 : 4500); });
    document.addEventListener('studysync:alarm-stop', function () { window.__ssRoomRing = 0; });
  }
  /* with reduced motion the room stays still, but the clock still keeps time */
  if (reduce) setInterval(function () { if (scene && document.body.contains(cv) && !cv.hidden) paint(performance.now(), true); }, 1000);
  function onUI(el) { return !!(el && el.closest && el.closest('a,button,input,select,textarea,label,[role="dialog"],.st-card,.st-nav,#gmp-bar,#gmp-panel,#sm-pause-quote')); }
  function hitCat(px, py) { if (!scene || room.cat !== 'sleep') return false; var h = catHome(scene.g); return px > h[0] - 62 * S && px < h[0] + 60 * S && py > h[1] - 50 * S && py < h[1] + 6 * S; }
  function hitVinyl(px, py) { if (!scene) return false; var v = scene.vinyl, vs = scene.S1; return px > v[0] - 78 * vs && px < v[0] + 78 * vs && py > v[1] - 66 * vs && py < v[1] + 4 * vs; }
  function hitCurtain(px, py) { return !!(scene && scene.rects.some(function (rc) { return px >= rc[0] && px <= rc[0] + rc[2] && py >= rc[1] && py <= rc[1] + rc[3]; })); }
  document.addEventListener('click', function (e) {
    if (!document.body.contains(cv) || cv.hidden || !scene || onUI(e.target)) return;
    if (hitVinyl(e.clientX, e.clientY)) { var pb = document.getElementById('gmp-play'); if (pb) pb.click(); return; }
    if (hitCat(e.clientX, e.clientY)) { startle(5 + Math.random() * 3); return; }
    if (hitCurtain(e.clientX, e.clientY)) {
      room.target = room.target === 1 ? 0 : 1;
      if (room.target === 0) startle(1.5 + Math.random() * 1.5); else room.wait = Math.max(room.away + 1.2, room.wait);
    }
    if (reduce) {   /* no animation: jump straight to the end */
      room.open = room.target; if (room.cat === 'leave') room.cat = 'away';
      if (room.target === 1 && room.cat === 'away') room.cat = 'sleep';
      paint(performance.now(), true);
    }
  });
  var hovering = false;
  document.addEventListener('mousemove', function (e) {
    if (!document.body.contains(cv)) { if (hovering) { document.body.style.cursor = ''; hovering = false; } return; }
    var on = !cv.hidden && !onUI(e.target) && (hitVinyl(e.clientX, e.clientY) || hitCat(e.clientX, e.clientY) || hitCurtain(e.clientX, e.clientY));
    if (on !== hovering) { hovering = on; document.body.style.cursor = on ? 'pointer' : ''; }
  }, { passive: true });
  var rt; window.addEventListener('resize', function () { clearTimeout(rt); rt = setTimeout(function () { if (document.body.contains(cv) && !cv.hidden) build(); }, 200); });
  if (root && window.MutationObserver) new MutationObserver(sync).observe(root, { attributes: true, attributeFilter: ['data-bg'] });
  sync();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { if (scene && document.body.contains(cv)) build(); });
})();

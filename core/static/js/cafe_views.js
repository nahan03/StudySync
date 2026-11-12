/* The rainy night café seen four more ways: outside on the street, from the window seat, from behind the bar,
   and from the upstairs loft. tool_scenes.js uses these for the Study background "cafe", which slowly drifts
   between them and the original view at the bar. Each view is drawn in a 1600x900 frame scaled to cover the screen. */
(function () {
  'use strict';
  var ctx, D = 1, S = 1, OX = 0, OY = 0, PW = 1, PH = 1, SC_outside, SC_window, SC_bar, SC_loft;
  function view(g) { g.setTransform(D * S, 0, 0, D * S, D * OX, D * OY); }
  function layer(fn) { var c = document.createElement('canvas'); c.width = PW; c.height = PH; var g = c.getContext('2d'); view(g); fn(g); return c; }
  function blit(c) { ctx.save(); ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.drawImage(c, 0, 0); ctx.restore(); }

  /* ── helpers ── */
  function hash(i) { var s = Math.sin(i * 127.1 + 311.7) * 43758.5453; return s - Math.floor(s); }
  function R(seed) { var s = seed % 2147483647 || 1; return function () { s = s * 16807 % 2147483647; return s / 2147483647; }; }
  function lin(g, x0, y0, x1, y1, st) { var q = g.createLinearGradient(x0, y0, x1, y1); st.forEach(function (s) { q.addColorStop(s[0], s[1]); }); return q; }
  function rad(g, x, y, r0, r1, st) { var q = g.createRadialGradient(x, y, r0, x, y, r1); st.forEach(function (s) { q.addColorStop(s[0], s[1]); }); return q; }
  function glow(g, x, y, r, col, a) { g.save(); g.globalCompositeOperation = 'lighter'; g.globalAlpha = a; g.fillStyle = rad(g, x, y, 0, r, [[0, col], [1, 'rgba(0,0,0,0)']]); g.fillRect(x - r, y - r, 2 * r, 2 * r); g.restore(); }
  function rr(g, x, y, w, h, r) { g.beginPath(); if (g.roundRect) g.roundRect(x, y, w, h, r); else g.rect(x, y, w, h); }
  function ell(g, x, y, rx, ry, col) { g.fillStyle = col; g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, 7); g.fill(); }
  function clipRect(g, r) { g.beginPath(); g.rect(r.x, r.y, r.w, r.h); g.clip(); }
  function bricks(g, x, y, w, h, o) {
    var r = R(o.seed || 7); g.save(); g.beginPath(); g.rect(x, y, w, h); g.clip(); g.fillStyle = o.mortar; g.fillRect(x, y, w, h);
    for (var row = 0, yy = y; yy < y + h; row++, yy += o.bh) for (var xx = x - (row % 2 ? o.bw / 2 : 0); xx < x + w; xx += o.bw) { g.fillStyle = o.cols[Math.floor(r() * o.cols.length)]; g.globalAlpha = .75 + r() * .25; g.fillRect(xx + 1.5, yy + 1.5, o.bw - 3, o.bh - 3); }
    g.restore();
  }
  function rain(g, t, o) {
    g.save(); g.strokeStyle = o.col || 'rgb(200,215,240)'; g.globalAlpha = o.a; g.lineWidth = o.lw || 1.2; g.lineCap = 'round'; g.beginPath();
    for (var i = 0; i < o.n; i++) { var a = hash(i + (o.seed || 0)), b = hash(i * 7.3 + 1.1 + (o.seed || 0)), v = .75 + hash(i * 3.1) * .5; var y = (b * o.h + t * o.sp * v) % o.h; var x = ((a * o.w + y * o.sl) % o.w + o.w) % o.w; g.moveTo(o.x + x, o.y + y); g.lineTo(o.x + x - o.sl * o.len * v, o.y + y - o.len * v); }
    g.stroke(); g.restore();
  }
  function steam(g, x, y, t, s, a) {
    g.save(); g.strokeStyle = 'rgb(255,248,235)'; g.lineCap = 'round';
    for (var k = 0; k < 3; k++) { var ph = (t * .35 + k / 3) % 1; g.globalAlpha = (a || .3) * Math.sin(ph * Math.PI); g.lineWidth = (3 + ph * 3) * s; g.beginPath(); var bx = x + (k - 1) * 6 * s;
      for (var j = 0; j <= 10; j++) { var yy = y - ph * 36 * s - j * 4 * s, xx = bx + Math.sin(j * .7 + t * 1.6 + k * 2) * 4 * s * (j / 10 + .3); if (j) g.lineTo(xx, yy); else g.moveTo(xx, yy); } g.stroke(); }
    g.restore();
  }
  function candle(g, x, y, t, s) {
    var f = 1 + Math.sin(t * 13) * .08 + Math.sin(t * 7.3) * .06;
    glow(g, x, y - 12 * s, 90 * s * f, 'rgba(255,170,80,1)', .45);
    g.fillStyle = 'rgba(255,230,200,.18)'; rr(g, x - 13 * s, y - 22 * s, 26 * s, 22 * s, 4 * s); g.fill(); g.strokeStyle = 'rgba(255,240,220,.35)'; g.lineWidth = 1.2 * s; g.stroke();
    g.fillStyle = '#efe4cf'; g.fillRect(x - 9 * s, y - 12 * s, 18 * s, 10 * s);
    g.fillStyle = '#ffd27a'; g.beginPath(); g.ellipse(x, y - 18 * s, 3 * s, 6.5 * s * f, Math.sin(t * 5) * .08, 0, 7); g.fill();
    g.fillStyle = '#fff6dc'; g.beginPath(); g.ellipse(x, y - 16 * s, 1.4 * s, 3 * s, 0, 0, 7); g.fill();
  }
  function neon(g, txt, x, y, col, size, on) {
    g.save(); g.font = '700 ' + size + 'px Karla, sans-serif'; g.textAlign = 'center';
    if (on > 0) { g.shadowColor = col; g.shadowBlur = size * .6; g.fillStyle = col; g.globalAlpha = on; g.fillText(txt, x, y); g.shadowBlur = 0; g.fillStyle = '#fff4f8'; g.globalAlpha = on * .7; g.fillText(txt, x, y); }
    else { g.fillStyle = 'rgba(80,40,60,.6)'; g.fillText(txt, x, y); }
    g.restore();
  }
  function strand(g, t, x0, y0, x1, y1, sag, n, seed) {
    function P(u) { return [x0 + (x1 - x0) * u, y0 + (y1 - y0) * u + Math.sin(u * Math.PI) * sag]; }
    g.save(); g.strokeStyle = 'rgba(25,18,12,.95)'; g.lineWidth = 1.6; g.beginPath();
    for (var i = 0; i <= 40; i++) { var p = P(i / 40); if (i) g.lineTo(p[0], p[1]); else g.moveTo(p[0], p[1]); } g.stroke();
    for (i = 1; i < n; i++) { p = P(i / n); var tw = .7 + .3 * Math.sin(t * 1.7 + hash(i + seed) * 20);
      g.fillStyle = '#2a2016'; g.fillRect(p[0] - 2, p[1], 4, 4); ell(g, p[0], p[1] + 9, 3.6, 5, 'rgba(255,' + Math.round(200 + 30 * tw) + ',140,1)'); glow(g, p[0], p[1] + 9, 30, 'rgba(255,190,110,1)', .4 * tw); }
    g.restore();
  }
  function pendant(g, x, cordTop, y, shade) {
    g.strokeStyle = '#140e0a'; g.lineWidth = 2; g.beginPath(); g.moveTo(x, cordTop); g.lineTo(x, y); g.stroke();
    g.fillStyle = shade || '#1f3a30'; g.beginPath(); g.moveTo(x - 8, y); g.lineTo(x + 8, y); g.lineTo(x + 26, y + 26); g.lineTo(x - 26, y + 26); g.closePath(); g.fill();
    ell(g, x, y + 27, 9, 5, '#fff0c8'); glow(g, x, y + 40, 150, 'rgba(255,190,110,1)', .55);
  }

  /* ── people ── */
  function personFront(g, x, y, s, o) {   /* seen from the front; y = where the body is cut off (a table edge) */
    var sk = o.skin || '#d9a07a', hr = o.hair || '#2a1a12';
    g.save(); g.translate(x, y); g.scale(s, s);
    g.fillStyle = o.top; g.beginPath(); g.moveTo(-36, 0); g.bezierCurveTo(-38, -34, -30, -52, -12, -56); g.lineTo(12, -56); g.bezierCurveTo(30, -52, 38, -34, 36, 0); g.closePath(); g.fill();
    g.fillStyle = 'rgba(0,0,0,.2)'; g.beginPath(); g.moveTo(10, -56); g.bezierCurveTo(30, -52, 38, -34, 36, 0); g.lineTo(20, 0); g.bezierCurveTo(24, -30, 20, -46, 10, -56); g.fill();
    if (o.apron) { g.fillStyle = o.apron; g.fillRect(-22, -38, 44, 38); g.strokeStyle = o.apron; g.lineWidth = 3; g.beginPath(); g.moveTo(-16, -38); g.lineTo(-9, -56); g.moveTo(16, -38); g.lineTo(9, -56); g.stroke(); }
    var hy = -82 + (o.bob || 0), hx = o.look || 0;
    if (o.hairStyle === 'long') ell(g, hx, hy + 8, 19, 27, hr);
    g.fillStyle = sk; g.fillRect(-6, -66, 12, 14);
    ell(g, hx, hy, 14, 17, sk);
    g.fillStyle = hr; g.beginPath(); g.ellipse(hx, hy - 6, 15.5, 12, 0, Math.PI, Math.PI * 2); g.fill();
    if (o.hairStyle === 'bun') { g.beginPath(); g.arc(hx, hy - 21, 8, 0, 7); g.fill(); }
    if (o.hairStyle === 'long') { ell(g, hx - 12, hy + 3, 4, 14, hr); ell(g, hx + 12, hy + 3, 4, 14, hr); }
    if (o.beanie) { g.fillStyle = o.beanie; g.beginPath(); g.ellipse(hx, hy - 8, 16.5, 14, 0, Math.PI, Math.PI * 2); g.fill(); g.fillRect(hx - 16.5, hy - 10, 33, 6); }
    g.fillStyle = 'rgba(30,20,15,.85)';
    if (o.eyesDown) { g.fillRect(hx - 8, hy + 1, 5, 1.6); g.fillRect(hx + 3, hy + 1, 5, 1.6); }
    else { g.beginPath(); g.arc(hx - 5, hy, 1.7, 0, 7); g.arc(hx + 5, hy, 1.7, 0, 7); g.fill(); }
    g.fillStyle = 'rgba(200,90,80,.25)'; g.beginPath(); g.arc(hx - 8, hy + 6, 3, 0, 7); g.arc(hx + 8, hy + 6, 3, 0, 7); g.fill();
    if (o.glasses) { g.strokeStyle = 'rgba(30,20,15,.85)'; g.lineWidth = 1.3; g.strokeRect(hx - 11, hy - 3, 8, 6.5); g.strokeRect(hx + 3, hy - 3, 8, 6.5); }
    g.restore();
  }
  function personSide(g, x, y, s, dir, o) {   /* seated, seen from the side; y = seat top */
    var sk = o.skin || '#d9a07a', hr = o.hair || '#2a1a12', rc = o.reach || 0, lf = o.lift || 0;
    g.save(); g.translate(x, y); g.scale(s * dir, s); g.lineCap = 'round'; g.lineJoin = 'round';
    g.strokeStyle = o.pants || '#2b2a33'; g.lineWidth = 14; g.beginPath(); g.moveTo(0, -5); g.lineTo(34, -5); g.lineTo(36, 40); g.stroke();
    g.fillStyle = o.top; g.beginPath(); g.moveTo(-13, 0); g.quadraticCurveTo(-17, -40, -7, -62); g.lineTo(12, -62); g.quadraticCurveTo(19, -30, 13, 0); g.closePath(); g.fill();
    var hy = -80 + (o.bob || 0);
    ell(g, 4, hy, 13, 15, sk); g.fillStyle = sk; g.beginPath(); g.moveTo(15, hy - 3); g.lineTo(19, hy + 3); g.lineTo(15, hy + 5); g.fill();
    g.fillStyle = hr; g.beginPath(); g.ellipse(1, hy - 5, 14, 11, -.25, Math.PI * .85, Math.PI * 2.1); g.fill(); ell(g, -4, hy, 10, 12, hr);
    if (o.long) ell(g, -6, hy + 13, 9, 17, hr);
    if (o.beanie) { g.fillStyle = o.beanie; g.beginPath(); g.ellipse(2, hy - 6, 15, 12, 0, Math.PI, Math.PI * 2); g.fill(); }
    g.strokeStyle = o.top; g.lineWidth = 10; g.beginPath(); g.moveTo(4, -54); g.lineTo(14 + rc * .4, -24 + lf * .4); g.lineTo(38 + rc, -30 + lf); g.stroke();
    ell(g, 41 + rc, -30 + lf, 4.5, 4.5, sk);
    if (o.cup) { g.fillStyle = '#f2ece0'; rr(g, 38 + rc, -42 + lf, 12, 13, 2); g.fill(); }
    g.restore();
  }
  function walker(g, x, y, s, dir, ph, o) {   /* someone walking with an umbrella; y = ground */
    g.save(); g.translate(x, y); g.scale(s * dir, s);
    var sw = Math.sin(ph) * .42; g.translate(0, -Math.abs(Math.cos(ph)) * 3); g.lineCap = 'round';
    function leg(a, c) { g.strokeStyle = c; g.lineWidth = 11; var kx = Math.sin(a) * 44, ky = -92 + Math.cos(a) * 44, fx = kx + Math.sin(a - .3) * 44, fy = ky + Math.cos(a - .3) * 44; g.beginPath(); g.moveTo(0, -92); g.lineTo(kx, ky); g.lineTo(fx, fy); g.stroke(); ell(g, fx + 5, fy + 1, 9, 4, '#0c0c10'); }
    leg(-sw, '#121219'); leg(sw, o.pants || '#22242e');
    g.fillStyle = o.coat; g.beginPath(); g.moveTo(-13, -172); g.quadraticCurveTo(-21, -130, -23, -82); g.lineTo(21, -82); g.quadraticCurveTo(18, -130, 13, -172); g.closePath(); g.fill();
    ell(g, 3, -188, 11, 12.5, o.skin || '#c99070'); ell(g, -1, -192, 12, 9, o.hair || '#1a120c');
    g.strokeStyle = o.coat; g.lineWidth = 9; g.beginPath(); g.moveTo(5, -162); g.lineTo(17, -136); g.lineTo(23, -150); g.stroke();
    g.strokeStyle = '#1a1a1a'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(23, -144); g.lineTo(14, -252); g.stroke();
    g.fillStyle = o.umb; g.beginPath(); g.moveTo(-52, -226); g.quadraticCurveTo(14, -302, 80, -226);
    for (var k = 0; k < 4; k++) { var xe = 80 - (k + 1) * 33; g.quadraticCurveTo(xe + 16.5, -238, xe, -226); } g.closePath(); g.fill();
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.moveTo(-40, -232); g.quadraticCurveTo(0, -288, 30, -270); g.quadraticCurveTo(-10, -262, -40, -232); g.fill();
    g.restore();
  }
  function headTop(g, x, y, s, o) {   /* someone far below, seen from above */
    g.save(); g.translate(x, y); g.scale(s, s);
    ell(g, 0, 7, 16, 8, o.top); ell(g, 0, -2, 7, 7.5, o.skin || '#d9a07a'); ell(g, 0, -4.5, 7.6, 6.4, o.hair);
    g.restore();
  }

  /* ════════════ 1 · OUTSIDE, LOOKING IN ════════════ */
  var WIN = { x: 250, y: 410, w: 810, h: 310 }, DG = { x: 1132, y: 432, w: 196, h: 262 };
  var ped = { x: -300, dir: 1, ph: 0, next: 2, v: 70, o: null };
  var ripples = [];
  var PEOPLE = [{ coat: '#2b3a52', umb: '#c8a23a' }, { coat: '#5a2a2a', umb: '#20242e' }, { coat: '#3a4a3a', umb: '#a8384a' }, { coat: '#433a52', umb: '#3a6a8a' }];

  function outsideCounter(g, t) {
    g.fillStyle = '#c9a77a'; g.fillRect(250, 604, 830, 8);
    g.fillStyle = lin(g, 0, 612, 0, 700, [[0, '#5a3820'], [1, '#341f12']]); g.fillRect(250, 612, 830, 90);
    g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 2; for (var x = 290; x < 1080; x += 90) { g.strokeRect(x, 624, 70, 58); }
    g.fillStyle = lin(g, 560, 0, 690, 0, [[0, '#7e858c'], [.5, '#e3e8ec'], [1, '#6d737a']]); rr(g, 560, 546, 130, 58, 6); g.fill();
    g.fillStyle = '#26262a'; g.fillRect(580, 590, 22, 12); g.fillRect(648, 590, 22, 12);
    [572, 590, 608, 650, 668].forEach(function (cx) { g.fillStyle = '#efe7da'; g.fillRect(cx, 536, 12, 10); });
    [780, 806, 832].forEach(function (cx) { g.fillStyle = '#e9e1d2'; g.fillRect(cx, 590, 16, 14); });
    g.fillStyle = 'rgba(255,240,220,.18)'; rr(g, 880, 560, 120, 44, 8); g.fill();   /* glass cake stand */
    ell(g, 940, 594, 40, 8, '#8a5a32'); ell(g, 922, 586, 12, 7, '#d9a05a'); ell(g, 952, 586, 12, 7, '#c88a48');
  }
  SC_outside = {
    title: 'Outside, looking in',
    desc: 'The rainy street at night. A warm shop window, people studying inside, the wet pavement mirroring the light. Now and then someone with an umbrella walks past.',
    build: function () {
      var L = {};
      L.back = layer(function (g) {
        g.fillStyle = lin(g, 0, 0, 0, 900, [[0, '#070a14'], [1, '#141626']]); g.fillRect(0, 0, 1600, 900);
        g.fillStyle = lin(g, 0, 400, 0, 720, [[0, '#a06c40'], [.55, '#7a4c2c'], [1, '#3e2617']]); g.fillRect(240, 400, 1120, 380);
        var r = R(11);
        [[300, 474, 330], [300, 538, 330], [1150, 470, 160], [1150, 540, 160], [1150, 610, 160]].forEach(function (sh) {
          g.fillStyle = '#4a2e1a'; g.fillRect(sh[0], sh[1], sh[2], 6);
          for (var x = sh[0] + 8; x < sh[0] + sh[2] - 16; x += 20 + r() * 10) { var h = 14 + r() * 16; g.fillStyle = ['#c9b38a', '#d8d0c0', '#8a5a3a', '#e4c27a', '#6b8a5a', '#7a3a2a'][Math.floor(r() * 6)];
            if (sh[0] > 1100 || r() < .5) { g.fillRect(x, sh[1] - h, 10 + r() * 6, h); } else { g.fillRect(x, sh[1] - 12, 16, 12); g.fillRect(x + 16, sh[1] - 9, 4, 6); } }
        });
        g.fillStyle = '#1f2420'; rr(g, 700, 474, 250, 92, 4); g.fill(); g.strokeStyle = '#6a4a2a'; g.lineWidth = 6; g.stroke();
        g.fillStyle = 'rgba(240,235,220,.85)'; g.font = '600 24px Caveat, cursive'; g.fillText('today', 720, 498);
        g.font = '600 15px Caveat, cursive'; ['latte ............ 4', 'flat white ...... 4', 'chai .............. 3.5'].forEach(function (s, i) { g.fillText(s, 790, 496 + i * 16); }); g.fillText('cocoa ............ 3', 722, 552);
        pendant(g, 440, 400, 440); pendant(g, 1030, 400, 440); pendant(g, 1230, 400, 446, '#6a2a24');
        g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(240, 690, 1120, 90);
      });
      L.front = layer(function (g) {
        bricks(g, 0, 0, 150, 900, { bw: 44, bh: 16, mortar: '#100b0a', cols: ['#3a221c', '#2e1b17', '#44281f'], seed: 3 });
        bricks(g, 1450, 0, 150, 900, { bw: 44, bh: 16, mortar: '#100b0a', cols: ['#3a221c', '#2e1b17', '#44281f'], seed: 4 });
        g.fillStyle = 'rgba(5,6,14,.55)'; g.fillRect(0, 0, 150, 900); g.fillRect(1450, 0, 150, 900);
        g.save(); g.beginPath(); g.rect(140, 0, 1320, 776); g.rect(WIN.x, WIN.y, WIN.w, WIN.h); g.rect(DG.x, DG.y, DG.w, DG.h); g.clip('evenodd');
        bricks(g, 140, 0, 1320, 776, { bw: 52, bh: 18, mortar: '#1a100d', cols: ['#5a2e22', '#4a261d', '#64352a', '#3e2019'], seed: 5 });
        g.fillStyle = 'rgba(8,8,20,.5)'; g.fillRect(140, 0, 1320, 776);
        g.fillStyle = lin(g, 0, 250, 0, 776, [[0, '#1f3d33'], [1, '#132a22']]); g.fillRect(200, 250, 1210, 526);
        glow(g, WIN.x + WIN.w / 2, WIN.y + WIN.h / 2, 520, 'rgba(255,170,90,1)', .14);
        g.strokeStyle = '#0f221b'; g.lineWidth = 4; g.strokeRect(1110, 410, 240, 366);
        g.fillStyle = '#0f221b'; g.fillRect(1110, 700, 240, 6);
        g.restore();
        /* upstairs windows */
        [[330, '#e8b878', '#a06a3a'], [705, '#2a3550', '#141a2a'], [1080, '#e2a868', '#8a552e']].forEach(function (w, i) {
          g.fillStyle = lin(g, 0, 70, 0, 210, [[0, w[1]], [1, w[2]]]); g.fillRect(w[0], 70, 190, 140);
          if (i !== 1) { g.fillStyle = 'rgba(140,40,30,.75)'; g.beginPath(); g.moveTo(w[0], 70); g.quadraticCurveTo(w[0] + 50, 120, w[0] + 26, 210); g.lineTo(w[0], 210); g.fill(); g.beginPath(); g.moveTo(w[0] + 190, 70); g.quadraticCurveTo(w[0] + 140, 120, w[0] + 164, 210); g.lineTo(w[0] + 190, 210); g.fill(); }
          if (i === 2) { g.fillStyle = '#2a1a10'; g.fillRect(w[0] + 80, 186, 30, 24); g.fillStyle = '#1e2a14'; for (var k = 0; k < 6; k++) { g.beginPath(); g.ellipse(w[0] + 95 + Math.cos(k) * 14, 176 - k * 3, 12, 6, k, 0, 7); g.fill(); } }
          g.strokeStyle = '#1a1210'; g.lineWidth = 8; g.strokeRect(w[0], 70, 190, 140); g.beginPath(); g.moveTo(w[0] + 95, 70); g.lineTo(w[0] + 95, 210); g.stroke();
          g.fillStyle = '#2a201a'; g.fillRect(w[0] - 12, 210, 214, 12);
        });
        /* the sign */
        g.fillStyle = '#10211b'; g.fillRect(330, 262, 950, 60); g.strokeStyle = '#b8903e'; g.lineWidth = 2; g.strokeRect(338, 269, 934, 46);
        g.textBaseline = 'middle'; var f1 = '800 40px "Playfair Display", serif', f2 = 'italic 800 40px "Playfair Display", serif';
        g.font = f1; var w1 = g.measureText('Study').width, w3 = g.measureText(' Café').width; g.font = f2; var w2 = g.measureText('Sync').width;
        var sx = 805 - (w1 + w2 + w3) / 2; g.font = f1; g.fillStyle = '#e8b460'; g.fillText('Study', sx, 293); g.font = f2; g.fillStyle = '#f1e6d2'; g.fillText('Sync', sx + w1, 293); g.font = f1; g.fillStyle = '#e8b460'; g.fillText(' Café', sx + w1 + w2, 293);
        g.textBaseline = 'alphabetic';
        [450, 1160].forEach(function (lx) { g.strokeStyle = '#111'; g.lineWidth = 3; g.beginPath(); g.moveTo(lx, 240); g.quadraticCurveTo(lx, 228, lx + 20, 232); g.stroke(); ell(g, lx + 24, 236, 10, 5, '#222'); glow(g, lx + 24, 270, 120, 'rgba(255,200,120,1)', .3); });
        /* glass: tint, reflections, droplets */
        [WIN, DG].forEach(function (r0) {
          g.save(); clipRect(g, r0); g.fillStyle = 'rgba(140,170,210,.05)'; g.fillRect(r0.x, r0.y, r0.w, r0.h);
          g.fillStyle = 'rgba(255,255,255,.045)'; for (var k = 0; k < 3; k++) { var bx = r0.x + 60 + k * 260; g.beginPath(); g.moveTo(bx, r0.y); g.lineTo(bx + 70, r0.y); g.lineTo(bx - 60, r0.y + r0.h); g.lineTo(bx - 130, r0.y + r0.h); g.fill(); }
          var r = R(r0.x); for (k = 0; k < r0.w * .35; k++) { var dx = r0.x + r() * r0.w, dy = r0.y + r() * r0.h, ds = .8 + r() * 2.2; g.fillStyle = 'rgba(255,255,255,' + (.08 + r() * .14) + ')'; g.beginPath(); g.arc(dx, dy, ds, 0, 7); g.fill(); }
          g.restore();
        });
        g.strokeStyle = '#14291f'; g.lineWidth = 14; g.strokeRect(WIN.x, WIN.y, WIN.w, WIN.h);
        g.fillStyle = '#14291f'; g.fillRect(WIN.x, 456, WIN.w, 10); g.fillRect(650, WIN.y, 12, WIN.h);
        g.strokeStyle = '#14291f'; g.lineWidth = 10; g.strokeRect(DG.x, DG.y, DG.w, DG.h);
        g.fillStyle = '#c99a48'; rr(g, 1140, 560, 8, 60, 4); g.fill();
        /* planter under the window */
        g.fillStyle = '#2a1a12'; g.fillRect(240, 724, 830, 52); g.fillStyle = 'rgba(255,255,255,.04)'; g.fillRect(240, 724, 830, 4);
        var rp = R(9); for (var k = 0; k < 70; k++) { var px = 250 + rp() * 810, py = 726 - rp() * 26; g.fillStyle = ['#2a4a24', '#1e3a1c', '#355a2c'][k % 3]; g.beginPath(); g.ellipse(px, py, 14, 6, rp() * 3, 0, 7); g.fill(); }
        for (k = 0; k < 16; k++) { ell(g, 270 + rp() * 780, 708 + rp() * 14, 4, 4, ['#d86a6a', '#e8c070', '#e8e0f0'][k % 3]); }
        /* awning */
        var ax0 = 236, ax1 = 1074, n = 12, bw = (ax1 - ax0) / n, ay0 = 334, ay1 = 396;
        for (var i = 0; i < n; i++) { var c = i % 2 ? '#d8c9ac' : '#7a2626', tx0 = ax0 + 14 + i * (bw - 28 / n), tx1 = tx0 + bw - 28 / n, bx0 = ax0 + i * bw, bx1 = bx0 + bw;
          g.fillStyle = c; g.beginPath(); g.moveTo(tx0, ay0); g.lineTo(tx1, ay0); g.lineTo(bx1, ay1); g.lineTo(bx0, ay1); g.closePath(); g.fill(); g.beginPath(); g.arc(bx0 + bw / 2, ay1, bw / 2, 0, Math.PI); g.fill(); }
        g.fillStyle = lin(g, 0, ay0, 0, ay1 + 20, [[0, 'rgba(0,0,0,.55)'], [1, 'rgba(0,0,0,.3)']]); g.beginPath(); g.moveTo(ax0 + 14, ay0); g.lineTo(ax1 - 14, ay0); g.lineTo(ax1, ay1); for (i = n - 1; i >= 0; i--) g.arc(ax0 + i * bw + bw / 2, ay1, bw / 2, 0, Math.PI); g.closePath(); g.fill();
        g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(250, 410, 810, 26);
        /* pavement */
        g.fillStyle = lin(g, 0, 776, 0, 900, [[0, '#191a21'], [1, '#121319']]); g.fillRect(0, 776, 1600, 124);
        g.strokeStyle = 'rgba(255,255,255,.05)'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, 822); g.lineTo(1600, 822); for (var vx = -40; vx < 1700; vx += 150) { g.moveTo(vx, 776); g.lineTo(vx - 30, 870); } g.stroke();
        g.fillStyle = '#2a2b33'; g.fillRect(0, 870, 1600, 8); g.fillStyle = '#0d0e13'; g.fillRect(0, 878, 1600, 22);
        g.save(); g.filter = 'blur(' + (10 * D * S).toFixed(1) + 'px)';
        g.fillStyle = lin(g, 0, 776, 0, 880, [[0, 'rgba(255,175,95,.38)'], [1, 'rgba(255,175,95,0)']]); g.fillRect(262, 778, 786, 100); g.fillRect(1140, 778, 180, 100);
        [440, 1030, 1230].forEach(function (px) { g.fillStyle = 'rgba(255,200,130,.35)'; g.fillRect(px - 10, 780, 20, 96); });
        g.fillStyle = 'rgba(255,190,120,.3)'; g.fillRect(64, 780, 22, 100);
        g.restore();
        [[540, 846, 130, 14], [1200, 860, 90, 10], [180, 834, 70, 8]].forEach(function (p) { ell(g, p[0], p[1], p[2], p[3], 'rgba(5,6,12,.5)'); g.strokeStyle = 'rgba(255,200,140,.12)'; g.lineWidth = 1.5; g.beginPath(); g.ellipse(p[0], p[1], p[2], p[3], 0, Math.PI * 1.1, Math.PI * 1.9); g.stroke(); });
        /* bike leaning on the planter */
        g.save(); g.translate(900, 0); g.strokeStyle = '#1a1c22'; g.lineWidth = 5; [[-70, 816], [70, 816]].forEach(function (w) { g.beginPath(); g.arc(w[0], w[1], 38, 0, 7); g.stroke(); g.lineWidth = 1; for (var a = 0; a < 6; a++) { g.beginPath(); g.moveTo(w[0], w[1]); g.lineTo(w[0] + Math.cos(a) * 36, w[1] + Math.sin(a) * 36); g.stroke(); } g.lineWidth = 5; });
        g.strokeStyle = '#2f6a5a'; g.lineWidth = 6; g.lineJoin = 'round'; g.beginPath(); g.moveTo(-70, 816); g.lineTo(-20, 760); g.lineTo(46, 760); g.lineTo(70, 816); g.moveTo(-20, 760); g.lineTo(0, 816); g.lineTo(46, 760); g.moveTo(-70, 816); g.lineTo(0, 816); g.moveTo(-24, 748); g.lineTo(-20, 760); g.moveTo(46, 760); g.lineTo(52, 738); g.stroke();
        g.fillStyle = '#16120e'; rr(g, -38, 742, 30, 8, 4); g.fill(); g.strokeStyle = '#1a1a1a'; g.lineWidth = 4; g.beginPath(); g.moveTo(40, 736); g.lineTo(66, 732); g.stroke();
        g.fillStyle = '#5a3e22'; g.fillRect(56, 740, 40, 24); g.strokeStyle = '#3a2814'; g.lineWidth = 1.5; for (var bk = 0; bk < 4; bk++) { g.beginPath(); g.moveTo(58 + bk * 10, 740); g.lineTo(58 + bk * 10, 764); g.stroke(); }
        g.restore();
        /* chalk A-board */
        g.fillStyle = '#3a2614'; g.beginPath(); g.moveTo(1370, 860); g.lineTo(1392, 728); g.lineTo(1442, 728); g.lineTo(1464, 860); g.lineTo(1452, 860); g.lineTo(1434, 742); g.lineTo(1400, 742); g.lineTo(1382, 860); g.fill();
        g.fillStyle = '#1d211e'; g.beginPath(); g.moveTo(1384, 846); g.lineTo(1400, 742); g.lineTo(1434, 742); g.lineTo(1450, 846); g.fill();
        g.fillStyle = 'rgba(240,235,220,.85)'; g.textAlign = 'center'; g.font = '600 22px Caveat, cursive'; g.fillText('study', 1417, 776); g.fillText('& sip', 1417, 800); g.font = '600 15px Caveat, cursive'; g.fillText('wifi · quiet · ♡', 1417, 830); g.textAlign = 'left';
        /* street lamp */
        g.fillStyle = '#16171c'; g.fillRect(68, 150, 12, 730); g.fillRect(60, 862, 28, 18); g.fillStyle = '#1e1f26'; g.beginPath(); g.moveTo(54, 118); g.lineTo(94, 118); g.lineTo(86, 160); g.lineTo(62, 160); g.closePath(); g.fill(); g.fillStyle = '#ffd896'; g.fillRect(64, 128, 20, 28);
      });
      return L;
    },
    tick: function (L, t, dt) {
      blit(L.back);
      ctx.save(); ctx.beginPath(); ctx.rect(WIN.x, WIN.y, WIN.w, WIN.h); ctx.rect(DG.x, DG.y, DG.w, DG.h); ctx.clip();
      var bx = 520 + Math.sin(t * .22) * 170;
      personFront(ctx, bx, 610, .62, { top: '#2c2a2e', hair: '#3a2214', hairStyle: 'bun', skin: '#e0b090', apron: '#8a6a3a', bob: Math.sin(t * 2.4) * 1.2, look: Math.sin(t * .5) * 3 });
      outsideCounter(ctx, t);
      if (Math.abs(bx - 620) < 70) steam(ctx, 625, 546, t, 1.3, .3);
      personFront(ctx, 430, 702, .95, { top: '#4a6a8a', hair: '#1c120c', glasses: 1, eyesDown: 1, bob: Math.sin(t * 2.2) * .8, skin: '#c98e6a' });
      ctx.fillStyle = '#3a3d44'; rr(ctx, 380, 640, 104, 60, 4); ctx.fill(); ell(ctx, 432, 668, 7, 7, '#e8b460'); glow(ctx, 432, 640, 70, 'rgba(160,190,255,1)', .18);
      var cyc = t % 11, sip = cyc > 7 && cyc < 9.6, k = sip ? Math.min(1, (cyc - 7) * 2, (9.6 - cyc) * 2) : 0;
      personFront(ctx, 860, 702, .95, { top: '#b8743a', hair: '#6a3a1a', hairStyle: 'long', skin: '#e8c09a', eyesDown: !sip, bob: Math.sin(t * 1.4) });
      ctx.save(); ctx.translate(850, 664 + k * 10); ctx.rotate(-.06 + k * .2); ctx.fillStyle = '#7a2a2a'; ctx.beginPath(); ctx.moveTo(-36, -22); ctx.lineTo(0, -16); ctx.lineTo(36, -22); ctx.lineTo(36, 18); ctx.lineTo(0, 24); ctx.lineTo(-36, 18); ctx.closePath(); ctx.fill(); ctx.restore();
      var mx = 912 + (872 - 912) * k, my = 694 + (626 - 694) * k;
      ctx.strokeStyle = '#b8743a'; ctx.lineWidth = 9; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(886, 660); ctx.lineTo(mx + 4, my + 4); ctx.stroke();
      ctx.fillStyle = '#efe6d6'; rr(ctx, mx - 10, my - 14, 20, 18, 3); ctx.fill(); if (!sip) steam(ctx, mx, my - 16, t, .8, .3);
      ctx.fillStyle = lin(ctx, 0, 694, 0, 724, [[0, '#7a5232'], [1, '#4a2e1a']]); ctx.fillRect(250, 696, 820, 28); ctx.fillStyle = 'rgba(255,220,170,.25)'; ctx.fillRect(250, 696, 820, 2);
      ell(ctx, 640, 694, 10, 4, '#2a4a24'); ctx.fillStyle = '#c8b090'; ctx.fillRect(632, 684, 16, 12);
      ctx.restore();
      blit(L.front);
      /* upstairs TV flicker, lamp, neon */
      ctx.save(); ctx.beginPath(); ctx.rect(705, 70, 190, 140); ctx.clip(); glow(ctx, 800, 170, 140, 'rgba(110,150,255,1)', .25 + .12 * Math.sin(t * 9) * Math.sin(t * 2.3)); ctx.restore();
      glow(ctx, 74, 142, 220, 'rgba(255,200,120,1)', .45 + Math.sin(t * 17) * .02);
      var nOn = (t % 9) > 8.6 && (t * 20 | 0) % 2 ? .2 : 1;
      neon(ctx, 'OPEN', 1230, 566, '#ff5c8a', 34, nOn); ctx.strokeStyle = 'rgba(30,30,30,.8)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(1190, 500); ctx.lineTo(1196, 536); ctx.moveTo(1270, 500); ctx.lineTo(1264, 536); ctx.stroke();
      /* drips off the awning */
      ctx.fillStyle = 'rgba(200,215,240,.6)';
      for (var i = 0; i < 12; i++) { var ph = (t * .7 + hash(i * 3.3)) % 1, dxp = 236 + (i + .5) * 69.8, dy = 432 + ph * ph * 380; if (dy < 790) { ctx.beginPath(); ctx.ellipse(dxp, dy, 1.6, 4, 0, 0, 7); ctx.fill(); } }
      /* puddle ripples */
      if (Math.random() < dt * 6) { var P = [[540, 846, 120, 12], [1200, 860, 80, 8], [180, 834, 60, 6]][Math.floor(Math.random() * 3)]; ripples.push({ x: P[0] + (Math.random() - .5) * P[2] * 1.4, y: P[1] + (Math.random() - .5) * P[3], a: 0 }); }
      ripples = ripples.filter(function (q) { q.a += dt; if (q.a > .8) return false; ctx.strokeStyle = 'rgba(220,230,255,' + (.35 * (1 - q.a / .8)) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(q.x, q.y, 4 + q.a * 22, 1 + q.a * 5, 0, 0, 7); ctx.stroke(); return true; });
      /* someone walks by */
      if (ped.x < -260 || ped.x > 1860) { ped.next -= dt; if (ped.next <= 0) { ped.dir = Math.random() < .5 ? 1 : -1; ped.x = ped.dir > 0 ? -250 : 1850; ped.v = 60 + Math.random() * 25; ped.o = PEOPLE[Math.floor(Math.random() * PEOPLE.length)]; ped.next = 6 + Math.random() * 8; } }
      else { ped.x += ped.dir * ped.v * dt; ped.ph += dt * ped.v / 22;
        ctx.save(); ctx.translate(0, 2 * 866); ctx.scale(1, -1); ctx.globalAlpha = .14; walker(ctx, ped.x, 866, .78, ped.dir, ped.ph, ped.o); ctx.restore();
        walker(ctx, ped.x, 866, .78, ped.dir, ped.ph, ped.o); }
      rain(ctx, t, { n: 260, x: 0, y: 0, w: 1600, h: 900, sp: 760, len: 16, sl: .1, a: .22, seed: 1 });
      rain(ctx, t, { n: 70, x: 0, y: 0, w: 1600, h: 900, sp: 1200, len: 30, sl: .1, a: .3, lw: 1.8, seed: 9 });
    }
  };

  /* ════════════ 2 · WINDOW SEAT, LOOKING OUT ════════════ */
  var cars = [], carNext = 1, drops = [], walkers2 = [], w2Next = 1;
  for (var di = 0; di < 22; di++) drops.push({ x: 80 + Math.random() * 1440, y: Math.random() * 600, y0: 0, r: 2.5 + Math.random() * 3.5, v: 0, stop: Math.random() * 3 });
  drops.forEach(function (d) { d.y0 = d.y; });
  var CARC = ['#14161e', '#1e1416', '#16201c', '#22201a'];
  var WRAP; var TYPE = 'The mitochondria turns glucose into ATP, step by step: glycolysis, the Krebs cycle, then the electron transport chain.';
  WRAP = (function () { var out = [], cur = ''; TYPE.split(' ').forEach(function (w) { if ((cur + ' ' + w).trim().length > 50) { out.push(cur); cur = w; } else cur = (cur + ' ' + w).trim(); }); out.push(cur); return out; })();
  SC_window = {
    title: 'Window seat',
    desc: 'You at the window counter with your laptop and a latte. Rain runs down the glass, cars and umbrellas pass on the street outside, and someone drew a heart in the fog.',
    build: function () {
      var L = {};
      var tmp = layer(function (g) {
        g.fillStyle = lin(g, 0, 0, 0, 470, [[0, '#090d1a'], [1, '#1c2134']]); g.fillRect(0, 0, 1600, 660);
        var r = R(21);
        [[0, 130, 260], [250, 60, 220], [460, 160, 300], [750, 40, 260], [1000, 110, 240], [1230, 70, 230], [1450, 150, 200]].forEach(function (b, i) {
          g.fillStyle = ['#1d1a22', '#221c1c', '#1a1e26'][i % 3]; g.fillRect(b[0], b[1], b[2], 470 - b[1]);
          for (var wy = b[1] + 22; wy < 380; wy += 38) for (var wx = b[0] + 16; wx < b[0] + b[2] - 30; wx += 34) { var l = r(); g.fillStyle = l < .33 ? '#f2c27a' : l < .43 ? '#9fb4d8' : '#111117'; g.globalAlpha = l < .43 ? .85 : 1; g.fillRect(wx, wy, 18, 24); g.globalAlpha = 1; }
        });
        [[30, '#e9a35a'], [480, '#d9c3a0'], [1020, '#e88a6a'], [1260, '#a8d0c0']].forEach(function (s) { g.fillStyle = s[1]; g.globalAlpha = .75; g.fillRect(s[0], 404, 200, 62); g.globalAlpha = 1; g.fillStyle = '#2a1a1a'; g.fillRect(s[0] - 6, 392, 212, 14); });
        neon(g, 'ramen', 1340, 262, '#ff4f9a', 44, 1);
        g.save(); g.shadowColor = '#3cff9a'; g.shadowBlur = 20; g.fillStyle = '#5affaa'; g.fillRect(318, 270, 24, 70); g.fillRect(295, 293, 70, 24); g.restore();
        g.fillStyle = lin(g, 0, 470, 0, 660, [[0, '#121420'], [1, '#1a1c26']]); g.fillRect(0, 470, 1600, 190);
        g.fillStyle = '#2a2c36'; g.fillRect(0, 466, 1600, 8);
        [[130, '#e9a35a'], [580, '#d9c3a0'], [1120, '#e88a6a'], [1360, '#a8d0c0'], [1340, '#ff4f9a'], [330, '#5affaa']].forEach(function (s) { g.fillStyle = lin(g, 0, 474, 0, 610, [[0, s[1]], [1, 'rgba(0,0,0,0)']]); g.globalAlpha = .28; g.fillRect(s[0] - 40, 474, 80, 136); g.globalAlpha = 1; });
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 3; g.setLineDash([40, 40]); g.beginPath(); g.moveTo(0, 546); g.lineTo(1600, 546); g.stroke(); g.setLineDash([]);
        g.fillStyle = '#2a2c36'; g.fillRect(0, 608, 1600, 10); g.fillStyle = '#1e1f27'; g.fillRect(0, 618, 1600, 50);
        g.fillStyle = '#121318'; g.fillRect(1004, 120, 12, 500); g.fillRect(1004, 120, 70, 8); g.fillStyle = '#ffe2a8'; g.fillRect(1060, 128, 26, 10);
        glow(g, 1072, 140, 200, 'rgba(255,210,140,1)', .5);
      });
      L.out = layer(function (g) { g.save(); g.setTransform(1, 0, 0, 1, 0, 0); g.filter = 'blur(' + (2.4 * D * S).toFixed(1) + 'px)'; g.drawImage(tmp, 0, 0); g.restore(); });
      L.drops = layer(function (g) {
        var r = R(33);
        for (var k = 0; k < 900; k++) { var x = 60 + r() * 1480, y = r() * 640, s = .6 + r() * r() * 3.2; g.fillStyle = 'rgba(255,255,255,' + (.05 + r() * .08) + ')'; g.beginPath(); g.arc(x, y, s, 0, 7); g.fill(); if (s > 1.6) { g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(x - s * .3, y - s * .35, s * .3, 0, 7); g.fill(); } }
        glow(g, 1300, 70, 120, 'rgba(255,200,130,1)', .12); glow(g, 300, 40, 90, 'rgba(255,200,130,1)', .07);
      });
      L.fog = layer(function (g) {
        g.fillStyle = lin(g, 0, 380, 0, 640, [[0, 'rgba(210,200,190,0)'], [1, 'rgba(210,200,190,.2)']]); g.fillRect(60, 380, 1480, 260);
        g.globalCompositeOperation = 'destination-out'; g.strokeStyle = '#000'; g.lineWidth = 9; g.lineCap = 'round'; g.lineJoin = 'round';
        g.beginPath(); var hx = 1300, hy = 548; g.moveTo(hx, hy + 30); g.bezierCurveTo(hx - 50, hy - 5, hx - 30, hy - 40, hx, hy - 18); g.bezierCurveTo(hx + 30, hy - 40, hx + 50, hy - 5, hx, hy + 30); g.stroke();
        g.font = '600 46px Caveat, cursive'; g.fillStyle = '#000'; g.globalAlpha = .9; g.fillText('you got this', 1180, 620);
      });
      L.frame = layer(function (g) {
        g.fillStyle = '#1c130e'; g.fillRect(0, 0, 62, 660); g.fillRect(1538, 0, 62, 660); g.fillRect(0, 0, 1600, 26);
        g.fillStyle = lin(g, 0, 0, 30, 0, [[0, '#2e2016'], [1, '#1a110b']]); g.fillRect(528, 0, 26, 660); g.fillRect(1048, 0, 26, 660);
        g.fillStyle = 'rgba(255,220,170,.08)'; g.fillRect(528, 0, 3, 660); g.fillRect(1048, 0, 3, 660);
        g.fillStyle = lin(g, 0, 640, 0, 664, [[0, '#4a3020'], [1, '#2a1a10']]); g.fillRect(0, 640, 1600, 24);
        pendant(g, 1300, 0, 46, '#2a4a3a');
        /* counter top */
        g.fillStyle = lin(g, 0, 664, 0, 900, [[0, '#5a3a22'], [1, '#8a5e38']]); g.fillRect(0, 664, 1600, 236);
        var r = R(44); g.strokeStyle = 'rgba(40,22,10,.35)'; g.lineWidth = 1.2; for (var k = 0; k < 40; k++) { var y = 670 + r() * 230; g.beginPath(); g.moveTo(0, y); g.bezierCurveTo(400, y + r() * 8 - 4, 1000, y + r() * 8 - 4, 1600, y + r() * 6 - 3); g.stroke(); }
        glow(g, 1300, 760, 400, 'rgba(255,190,110,1)', .22); g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(0, 664, 1600, 6);
        /* laptop */
        g.fillStyle = '#2a2c32'; g.beginPath(); g.moveTo(330, 900); g.lineTo(370, 806); g.lineTo(830, 806); g.lineTo(870, 900); g.fill();
        g.fillStyle = '#3a3c44'; g.beginPath(); g.moveTo(350, 900); g.lineTo(382, 818); g.lineTo(818, 818); g.lineTo(850, 900); g.fill();
        g.fillStyle = '#1e2026'; for (var ky = 0; ky < 3; ky++) for (var kx = 0; kx < 14; kx++) { var yy = 826 + ky * 22, sh = (yy - 818) / 82; g.fillRect(392 - sh * 22 + kx * (30 + sh * 3), yy, 24 + sh * 3, 16); }
        g.fillStyle = '#1a1b20'; rr(g, 372, 586, 456, 224, 10); g.fill();
        g.fillStyle = '#f3ede2'; g.fillRect(386, 600, 428, 196);
        g.fillStyle = '#e8b460'; g.fillRect(386, 600, 428, 20); g.fillStyle = '#3a2a1a'; g.font = '700 12px Karla, sans-serif'; g.fillText('Biology notes · ch. 7', 398, 614);
        g.font = '700 17px Karla, sans-serif'; g.fillStyle = '#2a2018'; g.fillText('Cell respiration', 400, 646);
        g.fillStyle = 'rgba(40,30,20,.25)'; for (k = 0; k < 4; k++) g.fillRect(400, 662 + k * 16, 300 + R(k + 5)() * 100, 6);
        glow(g, 600, 700, 300, 'rgba(200,220,255,1)', .08);
        /* latte */
        ell(g, 1010, 812, 70, 18, '#e6dccb'); ell(g, 1010, 808, 58, 13, '#d4c8b4');
        g.fillStyle = lin(g, 960, 0, 1060, 0, [[0, '#d8cdb8'], [.4, '#f6f0e4'], [1, '#c2b6a0']]); g.beginPath(); g.moveTo(962, 742); g.lineTo(1058, 742); g.lineTo(1050, 800); g.quadraticCurveTo(1010, 816, 970, 800); g.closePath(); g.fill();
        g.strokeStyle = '#e9e2d4'; g.lineWidth = 9; g.beginPath(); g.ellipse(1066, 770, 16, 18, 0, -1.2, 1.2); g.stroke();
        ell(g, 1010, 742, 48, 12, '#efe8da'); ell(g, 1010, 743, 43, 10, '#a8703a');
        g.fillStyle = '#f4ead6'; g.beginPath(); g.moveTo(1010, 750); g.bezierCurveTo(990, 742, 994, 734, 1004, 736); g.quadraticCurveTo(1010, 738, 1010, 742); g.quadraticCurveTo(1010, 738, 1016, 736); g.bezierCurveTo(1026, 734, 1030, 742, 1010, 750); g.fill();
        /* notebook + pen */
        g.save(); g.translate(1270, 800); g.rotate(-.12); g.fillStyle = '#2a3a5a'; g.fillRect(-150, -70, 300, 150); g.fillStyle = '#f2ead8'; g.fillRect(-142, -64, 140, 138); g.fillRect(2, -64, 140, 138);
        g.strokeStyle = 'rgba(80,110,160,.35)'; g.lineWidth = 1; for (k = 0; k < 8; k++) { g.beginPath(); g.moveTo(-136, -46 + k * 15); g.lineTo(-8, -46 + k * 15); g.moveTo(8, -46 + k * 15); g.lineTo(136, -46 + k * 15); g.stroke(); }
        g.fillStyle = 'rgba(40,40,60,.75)'; g.font = '600 15px Caveat, cursive'; ['ATP = energy', 'glycolysis → pyruvate', 'Krebs: 2 ATP', 'ETC: ~34 ATP!'].forEach(function (s, i) { g.fillText(s, -130, -50 + i * 15); });
        g.strokeStyle = 'rgba(40,40,60,.5)'; g.beginPath(); g.arc(70, 0, 30, 0, 7); g.stroke(); g.fillText('mito', 54, 4);
        g.fillStyle = '#c8402a'; g.save(); g.rotate(.5); g.fillRect(-20, 52, 140, 8); g.fillStyle = '#222'; g.fillRect(118, 52, 12, 8); g.restore();
        g.restore();
        /* a little plant in a jar */
        g.fillStyle = 'rgba(220,235,240,.25)'; rr(g, 150, 700, 70, 80, 10); g.fill(); g.fillStyle = '#4a3020'; g.fillRect(156, 750, 58, 26);
        for (k = 0; k < 7; k++) { g.fillStyle = k % 2 ? '#4a7a3a' : '#5e9048'; g.save(); g.translate(185, 752); g.rotate(-1.2 + k * .4); g.beginPath(); g.ellipse(0, -26, 9, 26, 0, 0, 7); g.fill(); g.restore(); }
      });
      return L;
    },
    tick: function (L, t, dt) {
      blit(L.out);
      ctx.save(); ctx.beginPath(); ctx.rect(0, 0, 1600, 660); ctx.clip(); ctx.filter = 'blur(' + (2 * D * S).toFixed(1) + 'px)';
      carNext -= dt; if (carNext <= 0) { var dir = Math.random() < .5 ? 1 : -1; cars.push({ x: dir > 0 ? -200 : 1800, dir: dir, v: 240 + Math.random() * 160, c: CARC[Math.floor(Math.random() * 4)] }); carNext = 2 + Math.random() * 4; }
      cars = cars.filter(function (c) { c.x += c.dir * c.v * dt; var y = c.dir > 0 ? 590 : 528, sc = c.dir > 0 ? 1.1 : .85;
        ctx.save(); ctx.translate(c.x, y); ctx.scale(sc, sc); ctx.fillStyle = c.c; rr(ctx, -95, -34, 190, 30, 10); ctx.fill(); rr(ctx, -54, -58, 104, 28, 12); ctx.fill(); ctx.fillStyle = 'rgba(255,220,160,.18)'; ctx.fillRect(-46, -54, 88, 20);
        ell(ctx, -60, -4, 16, 16, '#08080a'); ell(ctx, 60, -4, 16, 16, '#08080a'); ctx.restore();
        glow(ctx, c.x + c.dir * 96 * sc, y - 20 * sc, 90, 'rgba(255,240,200,1)', .75); glow(ctx, c.x - c.dir * 96 * sc, y - 20 * sc, 40, 'rgba(255,40,40,1)', .7);
        ctx.fillStyle = 'rgba(255,240,200,.12)'; ctx.fillRect(c.x + c.dir * 96 * sc - 8, y, 16, 70); ctx.fillStyle = 'rgba(255,60,60,.14)'; ctx.fillRect(c.x - c.dir * 96 * sc - 6, y, 12, 60);
        return c.x > -300 && c.x < 1900; });
      w2Next -= dt; if (w2Next <= 0) { var d2 = Math.random() < .5 ? 1 : -1, near = Math.random() < .5; walkers2.push({ x: d2 > 0 ? -120 : 1720, dir: d2, ph: 0, y: near ? 650 : 470, s: near ? .6 : .32, v: near ? 70 : 40, o: PEOPLE[Math.floor(Math.random() * 4)] }); w2Next = 3 + Math.random() * 5; }
      walkers2 = walkers2.filter(function (p) { p.x += p.dir * p.v * dt; p.ph += dt * p.v / (30 * p.s); walker(ctx, p.x, p.y, p.s, p.dir, p.ph, p.o); return p.x > -200 && p.x < 1800; });
      ctx.filter = 'none';
      rain(ctx, t, { n: 200, x: 0, y: 0, w: 1600, h: 660, sp: 600, len: 14, sl: .08, a: .16, seed: 3 });
      ctx.restore();
      blit(L.drops);
      drops.forEach(function (d) {
        if (d.stop > 0) d.stop -= dt; else { d.v = Math.min(d.v + dt * 140, 120 + d.r * 30); d.y += d.v * dt; d.x += Math.sin(d.y * .04 + d.r) * .25; if (Math.random() < dt * .5) { d.stop = .4 + Math.random() * 2; d.v = 0; } }
        if (d.y > 650) { d.x = 80 + Math.random() * 1440; d.y = -10; d.y0 = d.y; d.v = 0; d.stop = Math.random() * 2; }
        ctx.strokeStyle = 'rgba(255,255,255,.07)'; ctx.lineWidth = d.r * .8; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(d.x, Math.max(d.y0, d.y - 160)); ctx.lineTo(d.x, d.y); ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,.13)'; ctx.beginPath(); ctx.ellipse(d.x, d.y, d.r, d.r * 1.2, 0, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(255,255,255,.3)'; ctx.lineWidth = .8; ctx.stroke(); ell(ctx, d.x - d.r * .3, d.y - d.r * .4, d.r * .3, d.r * .3, 'rgba(255,255,255,.5)');
      });
      blit(L.fog);
      blit(L.frame);
      var n = Math.floor((t * 7) % (TYPE.length + 30)); ctx.fillStyle = '#2a2018'; ctx.font = '400 14px Karla, sans-serif';
      var left = Math.min(n, TYPE.length), parts = [], li = 0;
      WRAP.forEach(function (w) { if (left <= 0) return; parts.push(w.slice(0, left)); left -= w.length + 1; });
      if (!parts.length) parts = [''];
      parts.forEach(function (p, i) { ctx.fillText(p, 400, 740 + i * 18); }); li = parts.length - 1;
      var cx = 400 + ctx.measureText(parts[li]).width + 2;
      if ((t * 2 | 0) % 2) ctx.fillRect(cx, 727 + li * 18, 2, 16);
      steam(ctx, 1010, 728, t, 1.6, .35);
      candle(ctx, 880, 786, t, 1.6);
      glow(ctx, 1300, 90, 180, 'rgba(255,190,110,1)', .25);
    }
  };

  /* ════════════ 3 · BEHIND THE COUNTER ════════════ */
  var BW = [{ x: 250, y: 110, w: 470, h: 300 }, { x: 880, y: 110, w: 470, h: 300 }];
  var outside3 = [], o3Next = 1;
  SC_bar = {
    title: 'Behind the bar',
    desc: 'The barista’s view: the espresso machine pulls a shot every few seconds, a customer waits at the counter, people talk at the tables, rain on the windows.',
    build: function () {
      var L = {};
      L.back = layer(function (g) {
        bricks(g, 0, 0, 1600, 480, { bw: 56, bh: 20, mortar: '#3a2418', cols: ['#7a4630', '#6a3a28', '#84503a', '#5e3424'], seed: 12 });
        g.fillStyle = 'rgba(20,10,8,.42)'; g.fillRect(0, 0, 1600, 480);
        BW.forEach(function (w, i) {
          g.fillStyle = lin(g, 0, w.y, 0, w.y + w.h, [[0, '#0b1020'], [1, '#1c2236']]); g.fillRect(w.x, w.y, w.w, w.h);
          var r = R(50 + i); g.fillStyle = '#141824'; for (var b = 0; b < 5; b++) { var bh = 60 + r() * 120; g.fillRect(w.x + b * w.w / 5, w.y + w.h - bh - 50, w.w / 5 - 6, bh); }
          for (b = 0; b < 26; b++) { var c = ['rgba(255,200,120,', 'rgba(255,120,120,', 'rgba(160,190,255,'][b % 3]; g.fillStyle = c + (.12 + r() * .2) + ')'; g.beginPath(); g.arc(w.x + r() * w.w, w.y + r() * (w.h - 40), 6 + r() * 16, 0, 7); g.fill(); }
          g.fillStyle = '#1a1c24'; g.fillRect(w.x, w.y + w.h - 50, w.w, 50);
        });
        g.fillStyle = '#e8e0cc'; g.beginPath(); g.arc(800, 200, 36, 0, 7); g.fill(); g.strokeStyle = '#2a1a10'; g.lineWidth = 5; g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(800, 200); g.lineTo(800, 176); g.moveTo(800, 200); g.lineTo(816, 208); g.stroke();
        g.fillStyle = '#1f2420'; rr(g, 740, 270, 120, 150, 4); g.fill(); g.strokeStyle = '#6a4a2a'; g.lineWidth = 5; g.stroke();
        g.fillStyle = 'rgba(240,235,220,.85)'; g.textAlign = 'center'; g.font = '600 20px Caveat, cursive'; g.fillText('specials', 800, 298); g.font = '600 15px Caveat, cursive'; ['honey oat latte', 'cardamom bun', 'rainy day cocoa'].forEach(function (s, i) { g.fillText(s, 800, 324 + i * 22); }); g.textAlign = 'left';
        /* floor */
        g.fillStyle = '#3a2a20'; g.fillRect(0, 470, 1600, 260); var y = 480, k = 0;
        while (y < 730) { var h = 14 * Math.pow(1.22, k), tw = 40 * (1 + (y - 470) / 60); for (var x = -(k % 2) * tw; x < 1600; x += tw * 2) { g.fillStyle = '#b9a88c'; g.globalAlpha = .55; g.fillRect(x, y, tw, h); } g.globalAlpha = 1; y += h; k++; }
        g.fillStyle = lin(g, 0, 470, 0, 730, [[0, 'rgba(15,8,5,.55)'], [1, 'rgba(15,8,5,.2)']]); g.fillRect(0, 470, 1600, 260);
        g.fillStyle = '#24160e'; g.fillRect(0, 466, 1600, 12);
        pendant(g, 340, 0, 120); pendant(g, 800, 0, 100, '#6a2a24'); pendant(g, 1260, 0, 120);
        /* plants in the corners */
        [[90, 476], [1520, 476]].forEach(function (p) { g.fillStyle = '#5a3a24'; g.beginPath(); g.moveTo(p[0] - 34, p[1] - 60); g.lineTo(p[0] + 34, p[1] - 60); g.lineTo(p[0] + 26, p[1]); g.lineTo(p[0] - 26, p[1]); g.fill(); for (var l = 0; l < 9; l++) { g.fillStyle = l % 2 ? '#2e5a2a' : '#3e6e34'; g.save(); g.translate(p[0], p[1] - 60); g.rotate(-1.4 + l * .35); g.beginPath(); g.ellipse(0, -60, 16, 60, 0, 0, 7); g.fill(); g.restore(); } });
        /* tables + chairs */
        [[430, 576], [1190, 586]].forEach(function (tb) { g.fillStyle = '#1e140e'; g.fillRect(tb[0] - 4, tb[1], 8, 64); ell(g, tb[0], tb[1] + 64, 30, 6, '#1e140e'); ell(g, tb[0], tb[1], 70, 10, '#6a4428'); ell(g, tb[0], tb[1] - 2, 70, 9, '#8a5a34'); });
        [[350, 600], [510, 600], [1260, 610]].forEach(function (c) { g.strokeStyle = '#24160e'; g.lineWidth = 5; g.beginPath(); g.moveTo(c[0] - 18, c[1]); g.lineTo(c[0] - 18, c[1] + 40); g.moveTo(c[0] + 18, c[1]); g.lineTo(c[0] + 18, c[1] + 40); g.stroke(); });
        glow(g, 430, 560, 200, 'rgba(255,190,110,1)', .2); glow(g, 1190, 570, 200, 'rgba(255,190,110,1)', .2);
      });
      L.front = layer(function (g) {
        /* order tickets over the pass */
        g.fillStyle = lin(g, 0, 16, 0, 26, [[0, '#d8dde2'], [1, '#7a8086']]); g.fillRect(300, 16, 1000, 10);
        [[520, -.04, ['flat white', 'oat · x1']], [640, .03, ['2x latte', 'one decaf']], [760, -.02, ['chai', 'extra hot ♡']]].forEach(function (tk) { g.save(); g.translate(tk[0], 22); g.rotate(tk[1]); g.fillStyle = '#f6f0e0'; g.fillRect(-40, 0, 80, 92); g.fillStyle = '#3a2a1a'; g.font = '600 18px Caveat, cursive'; g.fillText(tk[2][0], -32, 30); g.fillText(tk[2][1], -32, 52); g.fillStyle = 'rgba(0,0,0,.25)'; g.fillRect(-32, 66, 50, 2); g.restore(); });
        /* counter top (marble) */
        g.fillStyle = lin(g, 0, 690, 0, 792, [[0, '#cfcac0'], [1, '#e2ddd3']]); g.fillRect(0, 690, 1600, 102);
        var r = R(77); g.strokeStyle = 'rgba(120,110,100,.25)'; g.lineWidth = 1.4; for (var k = 0; k < 14; k++) { var x = r() * 1600, y = 692 + r() * 90; g.beginPath(); g.moveTo(x, y); g.bezierCurveTo(x + 60, y + 20 * (r() - .5), x + 140, y + 30 * (r() - .5), x + 220, y + 20 * (r() - .5)); g.stroke(); }
        g.fillStyle = '#8a8478'; g.fillRect(0, 792, 1600, 14); g.fillStyle = '#24170f'; g.fillRect(0, 806, 1600, 94);
        g.fillStyle = '#3a2618'; g.fillRect(0, 852, 1600, 6);
        for (x = 640; x < 1560; x += 34) { g.fillStyle = '#ece4d6'; rr(g, x, 824, 26, 28, 3); g.fill(); }
        glow(g, 800, 760, 600, 'rgba(255,190,110,1)', .12);
        /* espresso machine */
        g.fillStyle = lin(g, 60, 0, 600, 0, [[0, '#5e1e16'], [.45, '#a8402e'], [1, '#5a1c14']]); rr(g, 60, 470, 540, 220, 12); g.fill();
        g.fillStyle = lin(g, 0, 440, 0, 472, [[0, '#eef2f4'], [1, '#868c92']]); g.fillRect(50, 444, 560, 28);
        for (x = 90; x < 580; x += 34) { g.fillStyle = '#f2ece2'; g.beginPath(); g.moveTo(x, 444); g.lineTo(x + 24, 444); g.lineTo(x + 20, 422); g.lineTo(x + 4, 422); g.fill(); }
        g.fillStyle = lin(g, 0, 470, 0, 690, [[0, 'rgba(255,255,255,.2)'], [.1, 'rgba(255,255,255,0)']]); rr(g, 60, 470, 540, 220, 12); g.fill();
        g.fillStyle = '#e8b460'; g.font = '800 26px "Playfair Display", serif'; g.textAlign = 'center'; g.fillText('StudySync', 330, 610); g.textAlign = 'left';
        [230, 430].forEach(function (gx) { g.fillStyle = '#d9dde0'; g.beginPath(); g.arc(gx, 524, 30, 0, 7); g.fill(); g.fillStyle = '#f8f4ea'; g.beginPath(); g.arc(gx, 524, 24, 0, 7); g.fill(); g.strokeStyle = '#2a2a2a'; g.lineWidth = 1.2; for (var a = 0; a < 9; a++) { var an = -2.4 + a * .6; g.beginPath(); g.moveTo(gx + Math.cos(an) * 20, 524 + Math.sin(an) * 20); g.lineTo(gx + Math.cos(an) * 23, 524 + Math.sin(an) * 23); g.stroke(); } });
        [180, 470].forEach(function (gx) { g.fillStyle = lin(g, gx - 30, 0, gx + 30, 0, [[0, '#7a8086'], [.5, '#eef2f4'], [1, '#6a7076']]); g.fillRect(gx - 30, 628, 60, 24); g.fillStyle = '#1a1a1c'; g.fillRect(gx - 26, 652, 52, 10); g.fillRect(gx - 6, 662, 4, 8); g.fillRect(gx + 2, 662, 4, 8); g.save(); g.translate(gx, 660); g.rotate(.5); g.fillStyle = '#121214'; rr(g, -8, 0, 16, 70, 7); g.fill(); g.restore(); });
        g.fillStyle = '#9aa0a6'; g.fillRect(70, 698, 520, 12); g.fillStyle = '#5a6066'; for (x = 76; x < 586; x += 10) g.fillRect(x, 700, 4, 8);
        g.strokeStyle = '#b8bec4'; g.lineWidth = 7; g.lineCap = 'round'; g.beginPath(); g.moveTo(580, 560); g.lineTo(612, 580); g.lineTo(624, 676); g.stroke();
        /* grinder */
        g.fillStyle = 'rgba(220,230,235,.3)'; g.beginPath(); g.moveTo(642, 470); g.lineTo(738, 470); g.lineTo(718, 560); g.lineTo(662, 560); g.closePath(); g.fill();
        for (k = 0; k < 60; k++) ell(g, 660 + r() * 60, 500 + r() * 56, 4, 3, '#3a2010');
        g.fillStyle = '#1e1e22'; rr(g, 650, 560, 80, 140, 8); g.fill(); g.fillStyle = '#3a3a40'; g.fillRect(676, 640, 28, 40);
        /* cups, pitcher, tip jar */
        [840, 900, 960].forEach(function (cx) { ell(g, cx, 760, 26, 6, '#e8e0d0'); g.fillStyle = '#f4eee2'; g.beginPath(); g.moveTo(cx - 18, 732); g.lineTo(cx + 18, 732); g.lineTo(cx + 14, 758); g.lineTo(cx - 14, 758); g.fill(); ell(g, cx, 732, 18, 5, '#7a4a22'); });
        g.fillStyle = lin(g, 1260, 0, 1310, 0, [[0, '#8a9096'], [.5, '#eef2f4'], [1, '#7a8086']]); g.beginPath(); g.moveTo(1262, 700); g.lineTo(1308, 700); g.lineTo(1314, 770); g.lineTo(1256, 770); g.fill(); g.beginPath(); g.moveTo(1308, 700); g.lineTo(1324, 694); g.lineTo(1310, 712); g.fill();
        g.fillStyle = 'rgba(220,235,240,.3)'; rr(g, 1410, 700, 70, 76, 8); g.fill(); g.strokeStyle = 'rgba(255,255,255,.4)'; g.lineWidth = 1.5; g.stroke();
        for (k = 0; k < 10; k++) ell(g, 1424 + r() * 42, 752 + r() * 18, 6, 2.5, k % 2 ? '#c8a048' : '#a8acb0');
        g.fillStyle = '#f2ead8'; g.fillRect(1418, 720, 54, 22); g.fillStyle = '#3a2a1a'; g.font = '600 18px Caveat, cursive'; g.fillText('tips ♡', 1424, 737);
      });
      return L;
    },
    tick: function (L, t, dt) {
      blit(L.back);
      BW.forEach(function (w, i) { ctx.save(); clipRect(ctx, w); rain(ctx, t, { n: 90, x: w.x, y: w.y, w: w.w, h: w.h, sp: 700, len: 18, sl: .1, a: .3, seed: i * 50 }); ctx.restore(); });
      o3Next -= dt; if (o3Next <= 0) { var d = Math.random() < .5 ? 1 : -1; outside3.push({ x: d > 0 ? 200 : 1400, dir: d, ph: 0, o: PEOPLE[Math.floor(Math.random() * 4)] }); o3Next = 5 + Math.random() * 6; }
      ctx.save(); ctx.beginPath(); BW.forEach(function (w) { ctx.rect(w.x, w.y, w.w, w.h); }); ctx.clip();
      outside3 = outside3.filter(function (p) { p.x += p.dir * 40 * dt; p.ph += dt * 3; ctx.globalAlpha = .7; walker(ctx, p.x, 404, .38, p.dir, p.ph, p.o); ctx.globalAlpha = 1; return p.x > 150 && p.x < 1450; });
      ctx.restore();
      BW.forEach(function (w) { ctx.strokeStyle = '#1c120c'; ctx.lineWidth = 12; ctx.strokeRect(w.x, w.y, w.w, w.h); ctx.fillStyle = '#1c120c'; ctx.fillRect(w.x + w.w / 2 - 4, w.y, 8, w.h); ctx.fillRect(w.x, w.y + 130, w.w, 8); ctx.fillStyle = '#2a1a10'; ctx.fillRect(w.x - 14, w.y + w.h, w.w + 28, 12); });
      var c1 = t % 9, s1 = c1 > 6 && c1 < 8.4, k1 = s1 ? Math.min(1, (c1 - 6) * 2, (8.4 - c1) * 2) : 0;
      personSide(ctx, 360, 604, .8, 1, { top: '#8a4a5a', hair: '#2a160c', long: 1, skin: '#e0b090', reach: -k1 * 18, lift: -k1 * 40, cup: 1, bob: Math.sin(t * 1.3) * 1.5 });
      personSide(ctx, 500, 604, .8, -1, { top: '#3a5a7a', hair: '#1a120c', skin: '#a8704a', bob: Math.sin(t * 2.6) * 1.5, reach: Math.sin(t * 1.7) * 6 });
      personSide(ctx, 1258, 614, .8, -1, { top: '#5a6a3a', hair: '#4a2a14', beanie: '#c8a23a', skin: '#e8c09a', bob: Math.sin(t * 2) });
      ctx.fillStyle = '#2a2c32'; ctx.save(); ctx.translate(1180, 584); ctx.rotate(-.12); ctx.fillRect(-36, -38, 6, 38); ctx.restore(); glow(ctx, 1170, 560, 60, 'rgba(160,190,255,1)', .2);
      personFront(ctx, 1080, 700, 1.3, { top: '#3b5b4a', hair: '#2b1a10', beanie: '#c85a3a', skin: '#b97a55', bob: Math.sin(t * 1.1) * 1.4, look: Math.sin(t * .4) * 3 });
      blit(L.front);
      var c = t % 12, pour = c > 2 && c < 7, cupIn = c > 1 && c < 10.5, fill = Math.min(1, Math.max(0, (c - 2) / 5));
      if (cupIn) { ctx.fillStyle = '#f4eee2'; ctx.beginPath(); ctx.moveTo(162, 680); ctx.lineTo(198, 680); ctx.lineTo(194, 700); ctx.lineTo(166, 700); ctx.fill(); ell(ctx, 180, 680, 18, 4.5, fill > .1 ? '#7a4a22' : '#d8d0c0'); if (fill > .1) ell(ctx, 180, 680, 13 * fill, 3 * fill, '#c8904a'); }
      if (pour) { ctx.strokeStyle = 'rgba(96,52,20,.95)'; ctx.lineWidth = 2.4; ctx.beginPath(); [176, 184].forEach(function (sx) { ctx.moveTo(sx, 670); ctx.lineTo(sx + (180 - sx) * .4 + Math.sin(t * 9) * .4, 680); }); ctx.stroke(); }
      if (cupIn && c > 2.5) steam(ctx, 180, 672, t, 1, .25);
      [230, 430].forEach(function (gx, i) { var an = -2.2 + .5 + Math.sin(t * 3 + i) * .05 + (pour && i === 0 ? .7 : 0); ctx.strokeStyle = '#c82a1a'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(gx, 524); ctx.lineTo(gx + Math.cos(an) * 19, 524 + Math.sin(an) * 19); ctx.stroke(); ell(ctx, gx, 524, 3, 3, '#222'); });
      if (c > 8 && c < 9.6) { for (var p = 0; p < 6; p++) { var a = (c - 8) / 1.6; ctx.fillStyle = 'rgba(255,250,240,' + (.25 * (1 - a)) + ')'; ctx.beginPath(); ctx.arc(624 + Math.sin(p * 2 + t) * 10 * a, 676 - a * 90 - p * 10, 10 + a * 20, 0, 7); ctx.fill(); } }
      [840, 900, 960].forEach(function (cx, i) { steam(ctx, cx, 726, t + i * 1.3, 1, .22); });
    }
  };

  /* ════════════ 4 · UPSTAIRS LOFT ════════════ */
  var ARCH = { x: 840, y: 70, w: 520, h: 400 }, SKY = [[40, 310], [440, 58], [500, 72], [92, 340]];
  function archPath(g) { g.beginPath(); g.moveTo(840, 470); g.lineTo(840, 330); g.arc(1100, 330, 260, Math.PI, 0); g.lineTo(1360, 470); g.closePath(); }
  function skyPath(g) { g.beginPath(); g.moveTo(SKY[0][0], SKY[0][1]); for (var i = 1; i < 4; i++) g.lineTo(SKY[i][0], SKY[i][1]); g.closePath(); }
  SC_loft = {
    title: 'Upstairs loft',
    desc: 'A quiet loft under a rainy skylight: bookshelf, armchair, a reading lamp and string lights, with the café floor glowing below the railing.',
    build: function () {
      var L = {};
      L.back = layer(function (g) {
        bricks(g, 560, 0, 1040, 560, { bw: 50, bh: 18, mortar: '#24160e', cols: ['#5a3022', '#4a281c', '#64382a'], seed: 31 });
        g.fillStyle = lin(g, 0, 0, 0, 560, [[0, 'rgba(10,6,8,.75)'], [1, 'rgba(10,6,8,.3)']]); g.fillRect(560, 0, 1040, 560);
        g.save(); archPath(g); g.clip(); g.fillStyle = lin(g, 0, 70, 0, 470, [[0, '#0a0e1c'], [1, '#1e2438']]); g.fillRect(840, 70, 520, 400);
        var r = R(41); g.fillStyle = '#121624'; for (var b = 0; b < 7; b++) { var bh = 80 + r() * 160; g.fillRect(840 + b * 76, 470 - bh, 70, bh); }
        for (b = 0; b < 60; b++) { g.fillStyle = r() < .6 ? 'rgba(242,194,122,.7)' : 'rgba(160,190,255,.5)'; g.fillRect(846 + r() * 500, 330 + r() * 130, 6, 8); }
        g.restore();
        /* floor below */
        g.fillStyle = '#2e2018'; g.fillRect(560, 556, 1040, 180); var y = 560, k = 0;
        while (y < 740) { var h = 8 * Math.pow(1.18, k), tw = 22 * (1 + (y - 556) / 80); for (var x = 560 - (k % 2) * tw; x < 1600; x += tw * 2) { g.fillStyle = '#a89878'; g.globalAlpha = .35; g.fillRect(x, y, tw, h); } g.globalAlpha = 1; y += h; k++; }
        g.fillStyle = 'rgba(10,6,4,.45)'; g.fillRect(560, 556, 1040, 180);
        g.fillStyle = '#1e140e'; g.fillRect(560, 550, 1040, 8);
        /* bar below */
        g.fillStyle = '#8a5a34'; g.beginPath(); g.moveTo(600, 580); g.lineTo(1000, 580); g.lineTo(1020, 606); g.lineTo(590, 606); g.fill(); g.fillStyle = '#4a2e1a'; g.fillRect(590, 606, 430, 34);
        g.fillStyle = '#b8bec4'; g.fillRect(660, 568, 60, 14); ell(g, 820, 588, 8, 4, '#eee'); ell(g, 860, 590, 8, 4, '#eee');
        [[1160, 640, 56, 16], [1420, 676, 60, 18], [1300, 596, 46, 13]].forEach(function (tb) { ell(g, tb[0], tb[1] + 6, tb[2], tb[3], 'rgba(0,0,0,.4)'); ell(g, tb[0], tb[1], tb[2], tb[3], '#7a4e2e'); ell(g, tb[0] - 10, tb[1] - 2, 6, 3, '#eee'); ell(g, tb[0] + 14, tb[1] + 1, 6, 3, '#eee'); });
        [[920, 470], [1210, 420], [1490, 460]].forEach(function (pl) { glow(g, pl[0], 650, 160, 'rgba(255,180,100,1)', .35); });
        /* pendant lamps, long cords */
        [[920, 470], [1210, 420], [1490, 460]].forEach(function (pl) { g.strokeStyle = '#120c08'; g.lineWidth = 2; g.beginPath(); g.moveTo(pl[0], 0); g.lineTo(pl[0], pl[1]); g.stroke(); g.fillStyle = '#2a4a3a'; g.beginPath(); g.ellipse(pl[0], pl[1] + 22, 34, 24, 0, Math.PI, Math.PI * 2); g.fill(); ell(g, pl[0], pl[1] + 22, 34, 6, '#ffe6b0'); g.fillStyle = lin(g, 0, pl[1] + 22, 0, 640, [[0, 'rgba(255,200,120,.16)'], [1, 'rgba(255,200,120,0)']]); g.beginPath(); g.moveTo(pl[0] - 34, pl[1] + 22); g.lineTo(pl[0] + 34, pl[1] + 22); g.lineTo(pl[0] + 120, 640); g.lineTo(pl[0] - 120, 640); g.fill(); glow(g, pl[0], pl[1] + 26, 90, 'rgba(255,200,120,1)', .5); });
        /* loft: wall, sloped ceiling, skylight */
        g.fillStyle = lin(g, 0, 0, 560, 0, [[0, '#3e3028'], [1, '#54423a']]); g.fillRect(0, 0, 590, 740);
        g.fillStyle = '#24170f'; g.beginPath(); g.moveTo(0, 0); g.lineTo(620, 0); g.lineTo(620, 30); g.lineTo(0, 420); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(0,0,0,.4)'; g.lineWidth = 2; for (k = 1; k < 9; k++) { g.beginPath(); g.moveTo(0, 420 - k * 46); g.lineTo(620 - k * 6, 30 - k * 3.4 < 0 ? 0 : 30 - k * 3.4); g.stroke(); }
        g.save(); skyPath(g); g.clip(); g.fillStyle = lin(g, 0, 58, 0, 340, [[0, '#0b1020'], [1, '#202842']]); g.fillRect(0, 0, 600, 400); for (k = 0; k < 8; k++) { g.fillStyle = 'rgba(120,130,170,.12)'; g.beginPath(); g.ellipse(80 + k * 60, 160 + Math.sin(k) * 60, 80, 24, -.55, 0, 7); g.fill(); } g.restore();
        g.fillStyle = 'rgba(120,150,220,.06)'; g.beginPath(); g.moveTo(92, 340); g.lineTo(500, 72); g.lineTo(560, 740); g.lineTo(60, 740); g.closePath(); g.fill();
        g.fillStyle = '#1a1009'; g.fillRect(586, 0, 14, 740);
      });
      L.front = layer(function (g) {
        g.strokeStyle = '#2a1a10'; g.lineWidth = 12; g.lineJoin = 'round'; skyPath(g); g.stroke(); g.lineWidth = 6; g.beginPath(); g.moveTo(240, 184); g.lineTo(296, 206); g.stroke();
        g.strokeStyle = '#1a1009'; g.lineWidth = 14; archPath(g); g.stroke(); g.lineWidth = 6; g.beginPath(); [970, 1100, 1230].forEach(function (x) { g.moveTo(x, 470); g.lineTo(x, x === 1100 ? 70 : 110); }); g.moveTo(840, 330); g.lineTo(1360, 330); g.moveTo(840, 400); g.lineTo(1360, 400); g.stroke();
        /* bookshelf */
        g.fillStyle = '#2a1a10'; g.fillRect(24, 420, 236, 300); g.fillStyle = '#1a100a'; g.fillRect(34, 430, 216, 286);
        var r = R(61); for (var sy = 0; sy < 4; sy++) { var by = 498 + sy * 72; g.fillStyle = '#3a2416'; g.fillRect(34, by, 216, 8);
          for (var x = 38; x < 244;) { var bw = 9 + r() * 10, bh = 44 + r() * 20; if (r() < .1) { g.fillStyle = '#6a4a2a'; g.save(); g.translate(x + 4, by); g.rotate(-.25); g.fillRect(0, -bh, bw, bh); g.restore(); x += bw + 14; continue; } g.fillStyle = ['#7a2a2a', '#2a4a6a', '#c8a048', '#3a5a3a', '#8a6a4a', '#5a3a5a', '#d8cbb0'][Math.floor(r() * 7)]; g.fillRect(x, by - bh, bw, bh); g.fillStyle = 'rgba(255,255,255,.15)'; g.fillRect(x + 2, by - bh + 8, bw - 4, 2); x += bw + 1; } }
        /* loft floor */
        g.fillStyle = lin(g, 0, 720, 0, 900, [[0, '#4a3020'], [1, '#6a4428']]); g.fillRect(0, 720, 1600, 180);
        g.strokeStyle = 'rgba(20,10,4,.4)'; g.lineWidth = 2; for (x = -800; x < 2400; x += 110) { g.beginPath(); g.moveTo(800 + (x - 800) * .62, 720); g.lineTo(x, 900); g.stroke(); }
        g.fillStyle = '#2a1a10'; g.fillRect(560, 716, 1040, 14);
        ell(g, 380, 812, 260, 54, '#6a2a2a'); g.strokeStyle = '#c8a048'; g.lineWidth = 3; g.beginPath(); g.ellipse(380, 812, 230, 44, 0, 0, 7); g.stroke(); g.beginPath(); g.ellipse(380, 812, 190, 34, 0, 0, 7); g.stroke();
        /* railing */
        g.fillStyle = '#2a1a10'; for (x = 610; x < 1600; x += 44) g.fillRect(x, 488, 9, 230);
        g.fillStyle = lin(g, 0, 470, 0, 492, [[0, '#7a5232'], [1, '#3a2414']]); g.fillRect(570, 472, 1030, 20); g.fillStyle = '#2a1a10'; g.fillRect(570, 704, 1030, 14);
        g.fillStyle = '#3a2416'; g.fillRect(568, 452, 26, 268); g.fillStyle = '#5a3a22'; g.fillRect(562, 444, 38, 14);
        /* armchair */
        g.fillStyle = '#8a6420'; rr(g, 300, 560, 200, 150, 30); g.fill(); g.fillStyle = '#b8862e'; rr(g, 316, 574, 168, 120, 24); g.fill();
        g.fillStyle = '#a07424'; rr(g, 286, 640, 50, 110, 18); g.fill(); rr(g, 464, 640, 50, 110, 18); g.fill(); g.fillStyle = '#c8962e'; rr(g, 330, 680, 140, 56, 14); g.fill();
        g.fillStyle = '#7a2e2e'; g.beginPath(); g.moveTo(420, 590); g.quadraticCurveTo(480, 640, 470, 740); g.lineTo(400, 740); g.quadraticCurveTo(410, 650, 380, 600); g.closePath(); g.fill();
        g.strokeStyle = 'rgba(232,200,140,.5)'; g.lineWidth = 2; for (var k = 0; k < 4; k++) { g.beginPath(); g.moveTo(392 + k * 18, 600 + k * 6); g.quadraticCurveTo(420 + k * 14, 660, 410 + k * 16, 740); g.stroke(); }
        g.fillStyle = '#1a1009'; g.fillRect(310, 750, 10, 18); g.fillRect(480, 750, 10, 18);
        g.fillStyle = '#2a3a5a'; g.save(); g.translate(360, 690); g.rotate(-.2); g.fillRect(0, 0, 50, 10); g.fillStyle = '#f2ead8'; g.fillRect(2, -4, 46, 4); g.restore();
        /* floor lamp */
        g.fillStyle = '#1a1410'; g.fillRect(526, 400, 6, 330); ell(g, 529, 732, 24, 6, '#1a1410');
        g.fillStyle = '#e8d8b0'; g.beginPath(); g.moveTo(506, 376); g.lineTo(552, 376); g.lineTo(566, 418); g.lineTo(492, 418); g.closePath(); g.fill();
        glow(g, 529, 420, 260, 'rgba(255,190,110,1)', .55);
        /* books + mug on the floor */
        [['#2a4a6a', 0], ['#c8a048', -6], ['#7a2a2a', 4]].forEach(function (bk, i) { g.fillStyle = bk[0]; g.fillRect(160 + bk[1], 770 - i * 14, 90, 14); });
        g.fillStyle = '#e8dccb'; rr(g, 190, 708, 28, 22, 4); g.fill(); g.strokeStyle = '#e8dccb'; g.lineWidth = 4; g.beginPath(); g.arc(220, 718, 7, -1.4, 1.4); g.stroke();
        g.fillStyle = '#e8dccb'; rr(g, 1330, 452, 24, 20, 4); g.fill();
      });
      return L;
    },
    tick: function (L, t, dt) {
      blit(L.back);
      ctx.save(); archPath(ctx); ctx.clip(); rain(ctx, t, { n: 120, x: 840, y: 70, w: 520, h: 400, sp: 650, len: 18, sl: .08, a: .3, seed: 4 }); ctx.restore();
      ctx.save(); skyPath(ctx); ctx.clip(); rain(ctx, t, { n: 90, x: 30, y: 50, w: 480, h: 300, sp: 300, len: 22, sl: -.7, a: .3, seed: 8 });
      for (var i = 0; i < 40; i++) { var ph = (t * .12 + hash(i)) % 1, x = 60 + hash(i * 2.1) * 420, y = 330 - (x - 40) * .63 + 20 - ph * 30; ell(ctx, x - ph * 10, y + ph * 6, 2.2, 2.2, 'rgba(255,255,255,.25)'); }
      ctx.restore();
      /* people below */
      var bx = 700 + Math.sin(t * .3) * 120;
      headTop(ctx, bx, 566, .9, { top: '#2c2a2e', hair: '#3a2214' });
      [[1130, 628, '#8a4a5a', '#2a160c'], [1190, 630, '#3a5a7a', '#6a3a1a'], [1400, 660, '#5a6a3a', '#1a120c'], [1452, 672, '#b8743a', '#3a2214'], [1290, 584, '#4a6a8a', '#c8a048']].forEach(function (p, i) { headTop(ctx, p[0] + Math.sin(t * .8 + i) * 1.5, p[1] + Math.cos(t * 1.1 + i) * 1, .85, { top: p[2], hair: p[3] }); });
      var wx = 900 + ((t * 40) % 1400), wy = 660; if (wx > 1600) wx = 1600 - (wx - 1600); if (wx > 620) headTop(ctx, wx, wy + Math.abs(Math.sin(t * 5)) * 2, .95, { top: '#e8dcc4', hair: '#2a1a10' });
      blit(L.front);
      steam(ctx, 1342, 450, t, .9, .3); steam(ctx, 204, 706, t + 1, .9, .3);
      strand(ctx, t, 0, 90, 600, 40, 60, 12, 1); strand(ctx, t, 600, 40, 1600, 120, 90, 20, 5);
    }
  };

  var LIST = [SC_outside, SC_window, SC_bar, SC_loft];
  window.SSCafeViews = {
    titles: LIST.map(function (v) { return v.title; }),
    /* one set of cached layers per screen size; draw(i, g, t, dt) paints view i onto g (a canvas the size of the screen) */
    create: function (W, H, dpr) {
      var cache = [], pw = Math.round(W * dpr), ph = Math.round(H * dpr), s = Math.max(W / 1600, H / 900);
      return { draw: function (i, g, t, dt) {
        D = dpr; S = s; OX = (W - 1600 * s) / 2; OY = (H - 900 * s) / 2; PW = pw; PH = ph; ctx = g;
        if (!cache[i]) cache[i] = LIST[i].build();
        g.save(); g.globalAlpha = 1; g.filter = 'none'; view(g); LIST[i].tick(cache[i], t, dt); g.restore();
      } };
    }
  };
})();

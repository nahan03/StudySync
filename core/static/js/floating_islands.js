/* ═══════════════════════════════════════════════════
   FLOATING ISLANDS — floating_islands.js
   Fantasy floating-islands background for daily mode.
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('dm-floating-islands');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var W, H, dpr;
  var time = 0;
  var skyPhase = 0;

  /* ── Scene objects ── */
  var mountains = [];
  var islands = [];
  var clouds = [];
  var birds = [];
  var motes = [];
  var falls = [];

  /* ── Helpers ── */
  function r(min, max) { return min + Math.random() * (max - min); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

  /* ── Resize / build ── */
  function resize() {
    dpr = window.devicePixelRatio || 1;
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    buildScene();
  }

  function buildScene() {
    mountains = [];
    islands = [];
    clouds = [];
    birds = [];
    motes = [];
    falls = [];

    // Distant mountains (background silhouette)
    for (var i = 0; i < 6; i++) {
      mountains.push({
        x: (i / 5) * W + r(-80, 80),
        h: r(60, 140),
        w: r(180, 320),
        color: 'hsla(' + r(200, 220) + ', ' + r(15, 30) + '%, ' + r(12, 18) + '%, 0.6)',
        phase: r(0, Math.PI * 2),
      });
    }

    // Far islands (small, hazy)
    for (var fi = 0; fi < 4; fi++) {
      var iso = makeIsland({
        x: r(0.05, 0.95) * W,
        yBase: r(0.18, 0.35) * H,
        w: r(80, 150),
        h: r(40, 80),
        depth: 0,
        hue: r(170, 210),
        sat: r(20, 40),
        light: r(20, 30),
        alpha: 0.35,
        treeCount: Math.floor(r(1, 3)),
        hasWaterfall: fi === 0,
        waterfallSide: 1,
      });
      islands.push(iso);
      if (iso.hasWaterfall) falls.push(iso);
    }

    // Mid islands
    for (var mi = 0; mi < 4; mi++) {
      var iso2 = makeIsland({
        x: r(0.05, 0.95) * W,
        yBase: r(0.28, 0.50) * H,
        w: r(120, 220),
        h: r(60, 120),
        depth: 1,
        hue: r(140, 180),
        sat: r(30, 50),
        light: r(22, 35),
        alpha: 0.6,
        treeCount: Math.floor(r(2, 5)),
        hasWaterfall: mi === 1 || mi === 2,
        waterfallSide: Math.random() > 0.5 ? 1 : -1,
      });
      islands.push(iso2);
      if (iso2.hasWaterfall) falls.push(iso2);
    }

    // Near islands (large, detailed)
    for (var ni = 0; ni < 2; ni++) {
      var iso3 = makeIsland({
        x: r(0.08, 0.92) * W,
        yBase: r(0.40, 0.60) * H,
        w: r(200, 320),
        h: r(100, 180),
        depth: 2,
        hue: r(120, 160),
        sat: r(40, 60),
        light: r(28, 40),
        alpha: 0.85,
        treeCount: Math.floor(r(4, 8)),
        hasWaterfall: ni === 0,
        waterfallSide: -1,
      });
      islands.push(iso3);
      if (iso3.hasWaterfall) falls.push(iso3);
    }

    // Clouds — far, mid, near layers
    for (var ci = 0; ci < 12; ci++) {
      var depth = Math.floor(r(0, 3));
      clouds.push({
        x: r(-0.2, 1.2) * W,
        y: r(0.05, 0.50) * H,
        w: r(80, 250),
        h: r(20, 50),
        speed: r(0.04, 0.12) * (1 - depth * 0.25),
        alpha: r(0.08, 0.22) * (1 - depth * 0.2),
        depth: depth,
        phase: r(0, Math.PI * 2),
      });
    }

    // Birds
    for (var bi = 0; bi < 5; bi++) {
      birds.push(makeBird());
    }

    // Magical motes
    for (var mo = 0; mo < 40; mo++) {
      motes.push({
        x: r(0, W),
        y: r(0.02, 0.70) * H,
        r: r(1.0, 2.8),
        speed: r(0.08, 0.25),
        driftX: r(-0.2, 0.2),
        driftY: r(-0.15, 0.15),
        phase: r(0, Math.PI * 2),
        phaseSpeed: r(0.008, 0.025),
        hue: r(40, 80),
        alpha: r(0.2, 0.5),
      });
    }
  }

  function makeIsland(opts) {
    // Generate surface oscillations
    var surface = [];
    var segments = 12;
    for (var i = 0; i <= segments; i++) {
      surface.push(r(-6, 6));
    }
    return {
      x: opts.x,
      yBase: opts.yBase,
      w: opts.w,
      h: opts.h,
      depth: opts.depth,
      hue: opts.hue,
      sat: opts.sat,
      light: opts.light,
      alpha: opts.alpha,
      treeCount: opts.treeCount,
      hasWaterfall: opts.hasWaterfall || false,
      waterfallSide: opts.waterfallSide || 0,
      surface: surface,
      segments: segments,
      phase: r(0, Math.PI * 2),
    };
  }

  function makeBird() {
    return {
      path: buildBirdPath(),
      t: r(0, 1),
      speed: r(0.0012, 0.0025),
      wingPhase: r(0, Math.PI * 2),
      size: r(4, 8),
    };
  }

  function buildBirdPath() {
    // A curved path from one part of the sky to another
    var x1 = r(0.05, 0.95) * W;
    var y1 = r(0.10, 0.35) * H;
    var x2 = r(0.05, 0.95) * W;
    var y2 = r(0.10, 0.35) * H;
    var cx = (x1 + x2) / 2 + r(-100, 100);
    var cy = Math.min(y1, y2) - r(20, 60);
    return { x1: x1, y1: y1, x2: x2, y2: y2, cx: cx, cy: cy };
  }

  function getBirdPos(bird) {
    var p = bird.path;
    var t = bird.t;
    var u = 1 - t;
    var x = u * u * p.x1 + 2 * u * t * p.cx + t * t * p.x2;
    var y = u * u * p.y1 + 2 * u * t * p.cy + t * t * p.y2;
    return { x: x, y: y };
  }

  /* ── Sky gradient (slowly shifts over time) ── */
  function drawSky() {
    skyPhase += 0.0003;
    var p = Math.sin(skyPhase) * 0.5 + 0.5;

    var top1 = [12, 8, 18];   // deep midnight
    var top2 = [20, 15, 30];  // slightly warmer
    var mid1 = [18, 28, 35];  // teal dark
    var mid2 = [30, 40, 35];  // muted green
    var bot1 = [50, 35, 20];  // warm amber
    var bot2 = [40, 30, 25];  // muted brown

    var topR = lerp(top1[0], top2[0], p);
    var topG = lerp(top1[1], top2[1], p);
    var topB = lerp(top1[2], top2[2], p);

    var midR = lerp(mid1[0], mid2[0], p);
    var midG = lerp(mid1[1], mid2[1], p);
    var midB = lerp(mid1[2], mid2[2], p);

    var botR = lerp(bot1[0], bot2[0], p);
    var botG = lerp(bot1[1], bot2[1], p);
    var botB = lerp(bot1[2], bot2[2], p);

    // Sun glow — warm light near upper area
    var sunX = W * (0.7 + 0.2 * Math.sin(skyPhase * 0.5));
    var sunY = H * 0.12;

    var g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, 'rgb(' + topR + ',' + topG + ',' + topB + ')');
    g.addColorStop(0.35, 'rgb(' + midR + ',' + midG + ',' + midB + ')');
    g.addColorStop(0.65, 'rgb(' + midR + ',' + midG + ',' + midB + ')');
    g.addColorStop(1, 'rgb(' + botR + ',' + botG + ',' + botB + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);

    // Sun glow
    var sg = ctx.createRadialGradient(sunX, sunY, 0, sunX, sunY, H * 0.5);
    sg.addColorStop(0, 'rgba(220,180,120,' + (0.06 + 0.03 * Math.sin(skyPhase * 0.4)) + ')');
    sg.addColorStop(0.3, 'rgba(180,140,90,0.04)');
    sg.addColorStop(1, 'rgba(180,140,90,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, 0, W, H);
  }

  /* ── Mountains ── */
  function drawMountains() {
    for (var i = 0; i < mountains.length; i++) {
      var m = mountains[i];
      var mh = m.h + 5 * Math.sin(time * 0.005 + m.phase);
      ctx.beginPath();
      ctx.moveTo(m.x - m.w / 2, H);
      ctx.lineTo(m.x - m.w / 2, H - mh * 0.3);
      ctx.quadraticCurveTo(m.x - m.w / 3, H - mh * 0.7, m.x, H - mh);
      ctx.quadraticCurveTo(m.x + m.w / 3, H - mh * 0.7, m.x + m.w / 2, H - mh * 0.3);
      ctx.lineTo(m.x + m.w / 2, H);
      ctx.closePath();
      ctx.fillStyle = m.color;
      ctx.fill();
    }
  }

  /* ── Cloud drawing ── */
  function drawClouds() {
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var px = c.x + time * c.speed;
      // Wrap around
      if (px > W + c.w) px = -c.w;
      if (px < -c.w * 2) px = W + c.w * 1.5;

      var alpha = c.alpha + 0.03 * Math.sin(time * 0.008 + c.phase);
      alpha = clamp(alpha, 0.02, 0.30);

      ctx.globalAlpha = alpha;
      ctx.fillStyle = 'rgba(180,210,225,0.8)';
      ctx.beginPath();
      // Soft cloud shape using overlapping ellipses
      var blobs = [
        { dx: -c.w * 0.3, dy: 0, rw: c.w * 0.35, rh: c.h * 0.7 },
        { dx: c.w * 0.3, dy: 0, rw: c.w * 0.35, rh: c.h * 0.7 },
        { dx: 0, dy: -c.h * 0.2, rw: c.w * 0.3, rh: c.h * 0.8 },
        { dx: -c.w * 0.15, dy: -c.h * 0.05, rw: c.w * 0.35, rh: c.h * 0.6 },
        { dx: c.w * 0.15, dy: -c.h * 0.05, rw: c.w * 0.35, rh: c.h * 0.6 },
        { dx: 0, dy: c.h * 0.1, rw: c.w * 0.4, rh: c.h * 0.5 },
      ];
      for (var j = 0; j < blobs.length; j++) {
        var b = blobs[j];
        ctx.ellipse(px + b.dx, c.y + b.dy, b.rw, b.rh, 0, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /* ── Island drawing ── */
  function drawIsland(iso) {
    var x = iso.x;
    var yBase = iso.yBase + 3 * Math.sin(time * 0.004 + iso.phase);
    var halfW = iso.w / 2;
    var depthScale = 1 + iso.depth * 0.15;

    // Build island outline
    ctx.beginPath();
    // Start at bottom-left
    var baseY = yBase + iso.h * 0.6 * depthScale;
    ctx.moveTo(x - halfW, baseY);

    // Left side — jagged rock
    var steps = 10;
    for (var i = 0; i <= steps; i++) {
      var t = i / steps;
      var lx = x - halfW + t * iso.w;
      var rockDepth = (1 - Math.abs(t - 0.5) * 2) * iso.h * 0.3 * depthScale;
      rockDepth += (iso.surface[i] || 0) * 0.5;
      var ly = baseY - rockDepth;
      ctx.lineTo(lx, ly);
    }

    // Top surface — gentle wave
    for (var si = 0; si <= iso.segments; si++) {
      var st = si / iso.segments;
      var sx = x - halfW + st * iso.w;
      var sy = yBase - iso.h * 0.35 * depthScale + (iso.surface[si] || 0) * depthScale;
      ctx.lineTo(sx, sy);
    }

    // Right side — jagged rock down
    for (var ri = steps; ri >= 0; ri--) {
      var rt = ri / steps;
      var rx = x - halfW + rt * iso.w;
      var rRock = (1 - Math.abs(rt - 0.5) * 2) * iso.h * 0.3 * depthScale;
      rRock += (iso.surface[ri] || 0) * 0.5;
      var ry = baseY - rRock;
      ctx.lineTo(rx, ry);
    }

    ctx.closePath();

    // Fill with earthy/grassy color
    var baseColor = 'hsla(' + iso.hue + ', ' + iso.sat + '%, ' + iso.light + '%, ' + iso.alpha + ')';
    ctx.fillStyle = baseColor;
    ctx.fill();

    // Slightly lighter top surface highlight
    ctx.beginPath();
    for (var hsi = 0; hsi <= iso.segments; hsi++) {
      var hst = hsi / iso.segments;
      var hsx = x - halfW + hst * iso.w;
      var hsy = yBase - iso.h * 0.35 * depthScale + (iso.surface[hsi] || 0) * depthScale;
      if (hsi === 0) ctx.moveTo(hsx, hsy);
      else ctx.lineTo(hsx, hsy);
    }
    // Connect back along a slightly lower line to create a top crust
    for (var hsi2 = iso.segments; hsi2 >= 0; hsi2--) {
      var hst2 = hsi2 / iso.segments;
      var hsx2 = x - halfW + hst2 * iso.w;
      var hsy2 = yBase - iso.h * 0.35 * depthScale + (iso.surface[hsi2] || 0) * depthScale + 8;
      ctx.lineTo(hsx2, hsy2);
    }
    ctx.closePath();
    ctx.fillStyle = 'hsla(' + (iso.hue + 20) + ', ' + (iso.sat + 10) + '%, ' + (iso.light + 15) + '%, ' + (iso.alpha * 0.5) + ')';
    ctx.fill();

    // Hanging roots/vines from bottom
    for (var vi = 0; vi < 5; vi++) {
      var vx = x - halfW * 0.6 + (vi / 4) * halfW * 1.2;
      vx += r(-8, 8);
      var vLen = r(15, 40) * depthScale;
      ctx.beginPath();
      ctx.moveTo(vx, baseY - 5);
      ctx.quadraticCurveTo(vx + r(-10, 10), baseY + vLen * 0.5, vx + r(-8, 8), baseY + vLen);
      ctx.strokeStyle = 'hsla(' + (iso.hue - 20) + ', 30%, ' + (iso.light - 10) + '%, ' + (iso.alpha * 0.3) + ')';
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }

    // Grass tufts on top surface
    for (var gi = 0; gi < iso.treeCount * 3; gi++) {
      var gx = x - halfW * 0.7 + (gi / (iso.treeCount * 3 - 1)) * halfW * 1.4;
      var gt = (gx - (x - halfW)) / iso.w;
      var giIdx = Math.floor(gt * iso.segments);
      giIdx = clamp(giIdx, 0, iso.segments);
      var gy = yBase - iso.h * 0.35 * depthScale + (iso.surface[giIdx] || 0) * depthScale;
      var gh = r(6, 14) * depthScale;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx - 2, gy - gh);
      ctx.lineTo(gx + 2, gy - gh * 0.6);
      ctx.fillStyle = 'hsla(' + (iso.hue + 40) + ', 60%, ' + (iso.light + 20) + '%, ' + (iso.alpha * 0.7) + ')';
      ctx.fill();
    }

    // Small bushes/trees on top
    for (var ti = 0; ti < iso.treeCount; ti++) {
      var tx = x - halfW * 0.6 + (ti / (iso.treeCount - 1 || 1)) * halfW * 1.2;
      var tt = (tx - (x - halfW)) / iso.w;
      var tiIdx = Math.floor(tt * iso.segments);
      tiIdx = clamp(tiIdx, 0, iso.segments);
      var ty = yBase - iso.h * 0.35 * depthScale + (iso.surface[tiIdx] || 0) * depthScale;
      var th = r(12, 28) * depthScale;
      var tw = r(10, 20) * depthScale;

      // Bush shape — cluster of circles
      ctx.fillStyle = 'hsla(' + (iso.hue + 30) + ', 50%, ' + (iso.light + 10) + '%, ' + (iso.alpha * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(tx - tw * 0.2, ty - th * 0.6, tw * 0.5, 0, Math.PI * 2);
      ctx.arc(tx + tw * 0.2, ty - th * 0.7, tw * 0.45, 0, Math.PI * 2);
      ctx.arc(tx, ty - th * 0.85, tw * 0.4, 0, Math.PI * 2);
      ctx.fill();

      // Darker shadow on bush
      ctx.fillStyle = 'hsla(' + iso.hue + ', 40%, ' + (iso.light - 5) + '%, ' + (iso.alpha * 0.4) + ')';
      ctx.beginPath();
      ctx.arc(tx - tw * 0.1, ty - th * 0.4, tw * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Waterfalls ── */
  function drawWaterfall(iso) {
    var side = iso.waterfallSide;
    var x = iso.x + side * iso.w * 0.48;
    var depthScale = 1 + iso.depth * 0.15;
    var yBase = iso.yBase + 3 * Math.sin(time * 0.004 + iso.phase);

    // Find surface height at waterfall position
    var t = (x - (iso.x - iso.w / 2)) / iso.w;
    var si = Math.floor(t * iso.segments);
    si = clamp(si, 0, iso.segments);
    var topY = yBase - iso.h * 0.35 * depthScale + (iso.surface[si] || 0) * depthScale;

    var fallLen = r(40, 90) * depthScale;
    var fallWidth = 2 + iso.depth * 1.5;

    // Main waterfall stream
    ctx.globalAlpha = 0.4 + iso.depth * 0.1;
    ctx.strokeStyle = 'rgba(160,220,240,0.5)';
    ctx.lineWidth = fallWidth;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    // Slight curve
    var cx = x + side * r(5, 15);
    ctx.quadraticCurveTo(cx, topY + fallLen * 0.5, x + side * r(10, 25), topY + fallLen);
    ctx.stroke();

    // Lighter center stream
    ctx.strokeStyle = 'rgba(200,240,255,0.35)';
    ctx.lineWidth = fallWidth * 0.4;
    ctx.beginPath();
    ctx.moveTo(x, topY);
    ctx.quadraticCurveTo(cx, topY + fallLen * 0.5, x + side * r(10, 25), topY + fallLen);
    ctx.stroke();

    // Splash at bottom
    ctx.fillStyle = 'rgba(160,220,240,0.15)';
    ctx.beginPath();
    ctx.ellipse(x + side * r(10, 25), topY + fallLen, fallWidth * 3, fallWidth * 1.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
  }

  /* ── Birds ── */
  function drawBirds() {
    for (var i = 0; i < birds.length; i++) {
      var b = birds[i];
      b.t += b.speed;
      if (b.t > 1) {
        b.t = 0;
        b.path = buildBirdPath();
        b.wingPhase = r(0, Math.PI * 2);
      }

      var pos = getBirdPos(b);
      // Wing flap
      b.wingPhase += 0.06;
      var wingAngle = Math.sin(b.wingPhase) * 0.3 + 0.3;

      ctx.save();
      ctx.translate(pos.x, pos.y);
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = 'rgba(100,80,60,0.6)';
      ctx.lineWidth = 1.2;

      // Left wing
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(-b.size * 1.2, -b.size * wingAngle);
      ctx.stroke();

      // Right wing
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(b.size * 1.2, -b.size * wingAngle);
      ctx.stroke();

      // Body
      ctx.beginPath();
      ctx.moveTo(-b.size * 0.2, 0);
      ctx.lineTo(b.size * 0.4, 0);
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.restore();
    }
  }

  /* ── Magical motes ── */
  function drawMotes() {
    for (var i = 0; i < motes.length; i++) {
      var m = motes[i];
      m.phase += m.phaseSpeed;
      m.x += m.driftX + Math.sin(time * 0.01 + m.phase * 0.7) * 0.15;
      m.y += m.driftY + Math.sin(time * 0.008 + m.phase) * 0.1;

      // Wrap around edges
      if (m.x < -10) m.x = W + 10;
      if (m.x > W + 10) m.x = -10;
      if (m.y < -10) m.y = H * 0.7 + 10;
      if (m.y > H * 0.7 + 10) m.y = -10;

      var glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(m.phase));
      var a = m.alpha * glow;

      // Glow
      var g = ctx.createRadialGradient(m.x, m.y, 0, m.x, m.y, m.r * 4);
      g.addColorStop(0, 'hsla(' + m.hue + ', 80%, 80%, ' + a + ')');
      g.addColorStop(0.3, 'hsla(' + m.hue + ', 70%, 70%, ' + (a * 0.4) + ')');
      g.addColorStop(1, 'hsla(' + m.hue + ', 60%, 60%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 4, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = 'hsla(' + m.hue + ', 90%, 92%, ' + (a * 0.8) + ')';
      ctx.beginPath();
      ctx.arc(m.x, m.y, m.r * 0.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /* ── Haze layer between depths ── */
  function drawHaze() {
    // Subtle atmospheric haze near horizon
    var gh = ctx.createLinearGradient(0, H * 0.3, 0, H * 0.7);
    gh.addColorStop(0, 'rgba(15,25,30,0)');
    gh.addColorStop(0.5, 'rgba(20,35,40,0.08)');
    gh.addColorStop(1, 'rgba(20,35,40,0)');
    ctx.fillStyle = gh;
    ctx.fillRect(0, H * 0.3, W, H * 0.4);

    // Warm sunlight haze at top
    var gs = ctx.createRadialGradient(W * 0.7, H * 0.1, 0, W * 0.7, H * 0.1, W * 0.5);
    gs.addColorStop(0, 'rgba(220,180,120,0.04)');
    gs.addColorStop(1, 'rgba(220,180,120,0)');
    ctx.fillStyle = gs;
    ctx.fillRect(0, 0, W, H * 0.3);
  }

  /* ── Draw order ── */
  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, W, H);

    drawSky();
    drawMountains();
    drawClouds();

    // Far islands
    for (var fi = 0; fi < islands.length; fi++) {
      if (islands[fi].depth === 0) {
        drawIsland(islands[fi]);
        if (islands[fi].hasWaterfall) drawWaterfall(islands[fi]);
      }
    }

    // Mid islands
    for (var mi = 0; mi < islands.length; mi++) {
      if (islands[mi].depth === 1) {
        drawIsland(islands[mi]);
        if (islands[mi].hasWaterfall) drawWaterfall(islands[mi]);
      }
    }

    // Near islands
    for (var ni = 0; ni < islands.length; ni++) {
      if (islands[ni].depth === 2) {
        drawIsland(islands[ni]);
        if (islands[ni].hasWaterfall) drawWaterfall(islands[ni]);
      }
    }

    drawHaze();
    drawBirds();
    drawMotes();

    requestAnimationFrame(draw);
  }

  /* ── Init ── */
  resize();
  window.addEventListener('resize', resize);
  draw();
})();

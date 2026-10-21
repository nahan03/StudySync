/* ═══════════════════════════════════════════════════
   BIOLUMINESCENT FOREST — bioluminescent_forest.js
   Avatar-inspired sci-fi fantasy environment.
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  var canvas = document.getElementById('bioluminescent-forest');
  if (!canvas) return;
  var ctx = canvas.getContext('2d');

  var W, H, dpr;
  var time = 0;
  var skyPhase = 0;

  var trees = [];
  var groundPlants = [];
  var mushrooms = [];
  var vines = [];
  var spores = [];
  var butterflies = [];
  var fireflies = [];
  var mistLayers = [];

  function r(min, max) { return min + Math.random() * (max - min); }

  function lerp(a, b, t) { return a + (b - a) * t; }

  function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

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
    trees = [];
    groundPlants = [];
    mushrooms = [];
    vines = [];
    spores = [];
    butterflies = [];
    fireflies = [];
    mistLayers = [];

    // ── Tall glowing trees ──
    var treeCount = 8 + Math.floor(r(0, 4));
    for (var i = 0; i < treeCount; i++) {
      var x = (i / (treeCount - 1 || 1)) * W + r(-30, 30);
      x = clamp(x, 10, W - 10);
      var trunkW = r(12, 28);
      var trunkH = r(H * 0.4, H * 0.7);
      var hue = r(190, 270); // blue to violet
      trees.push({
        x: x,
        trunkW: trunkW,
        trunkH: trunkH,
        hue: hue,
        sat: r(60, 90),
        light: r(15, 30),
        glowHue: hue + r(-20, 20),
        branchCount: Math.floor(r(2, 5)),
        glowMarkCount: Math.floor(r(3, 8)),
        phase: r(0, Math.PI * 2),
        swayPhase: r(0, Math.PI * 2),
      });
    }

    // ── Luminous ground plants ──
    for (var pi = 0; pi < 60; pi++) {
      groundPlants.push({
        x: r(0, W),
        y: H - r(5, 40),
        size: r(3, 9),
        hue: r(160, 280),
        phase: r(0, Math.PI * 2),
        type: Math.floor(r(0, 3)), // 0=grass, 1=fern, 2=flower
      });
    }

    // ── Glowing mushrooms ──
    for (var mi = 0; mi < 20; mi++) {
      mushrooms.push({
        x: r(20, W - 20),
        y: H - r(5, 30),
        stemH: r(8, 25),
        capW: r(10, 30),
        capH: r(5, 14),
        hue: r(220, 310), // violet to pink
        phase: r(0, Math.PI * 2),
      });
    }

    // ── Radiant vines ──
    for (var vi = 0; vi < 12; vi++) {
      var startTreeIdx = Math.floor(r(0, trees.length));
      var startTree = trees[startTreeIdx];
      vines.push({
        startX: startTree.x + r(-10, 10),
        startY: H - startTree.trunkH + r(20, 80),
        endX: startTree.x + r(-80, 80),
        endY: H - r(10, 50),
        hue: r(140, 220),
        phase: r(0, Math.PI * 2),
        curl: r(0.3, 0.8),
      });
    }

    // ── Floating bioluminescent spores ──
    for (var si = 0; si < 120; si++) {
      spores.push({
        x: r(0, W),
        y: r(0.02, 0.85) * H,
        r: r(0.8, 3.0),
        speedY: r(-0.08, -0.25),
        driftX: r(-0.15, 0.15),
        driftY: r(-0.05, 0.05),
        phase: r(0, Math.PI * 2),
        phaseSpeed: r(0.005, 0.02),
        hue: r(180, 300),
        alpha: r(0.15, 0.45),
      });
    }

    // ── Glowing butterflies ──
    for (var bi = 0; bi < 8; bi++) {
      butterflies.push(makeButterfly());
    }

    // ── Fireflies ──
    for (var fi = 0; fi < 25; fi++) {
      fireflies.push({
        x: r(0, W),
        y: r(0.2, 0.85) * H,
        r: r(1.5, 3.5),
        speed: r(0.2, 0.5),
        angle: r(0, Math.PI * 2),
        turnSpeed: r(-0.02, 0.02),
        phase: r(0, Math.PI * 2),
        hue: r(60, 120), // warm glow
      });
    }

    // ── Mist layers ──
    for (var mli = 0; mli < 4; mli++) {
      mistLayers.push({
        y: H * r(0.5, 0.85),
        h: r(40, 120),
        alpha: r(0.04, 0.10),
        speed: r(0.02, 0.06),
        phase: r(0, Math.PI * 2),
      });
    }
  }

  function makeButterfly() {
    return {
      x: r(0.1, 0.9) * W,
      y: r(0.15, 0.55) * H,
      targetX: r(0.1, 0.9) * W,
      targetY: r(0.15, 0.55) * H,
      speed: r(0.3, 0.8),
      wingPhase: r(0, Math.PI * 2),
      wingSpeed: r(0.06, 0.12),
      size: r(4, 9),
      hue: r(180, 300),
      waitTimer: 0,
      state: 'flying', // flying, waiting
    };
  }

  /* ── Draw functions ── */

  function drawSky() {
    skyPhase += 0.0002;
    var p = Math.sin(skyPhase) * 0.5 + 0.5;

    var topR = lerp(2, 5, p);
    var topG = lerp(1, 3, p);
    var topB = lerp(8, 14, p);

    var midR = lerp(6, 10, p);
    var midG = lerp(4, 8, p);
    var midB = lerp(20, 30, p);

    var botR = lerp(8, 12, p);
    var botG = lerp(5, 9, p);
    var botB = lerp(15, 22, p);

    var g = ctx.createLinearGradient(0, 0, 0, H * 0.7);
    g.addColorStop(0, 'rgb(' + topR + ',' + topG + ',' + topB + ')');
    g.addColorStop(0.4, 'rgb(' + midR + ',' + midG + ',' + midB + ')');
    g.addColorStop(1, 'rgb(' + botR + ',' + botG + ',' + botB + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H * 0.7);

    // Bottom is dark ground
    var gg = ctx.createLinearGradient(0, H * 0.6, 0, H);
    gg.addColorStop(0, 'rgba(2,4,8,0.7)');
    gg.addColorStop(0.5, 'rgba(1,3,6,0.9)');
    gg.addColorStop(1, 'rgba(0,1,3,1)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, H * 0.6, W, H * 0.4);

    // Aurora-like glow in sky
    var auroraX = W * (0.3 + 0.4 * Math.sin(skyPhase * 0.3));
    var auroraG = ctx.createRadialGradient(auroraX, H * 0.1, 0, auroraX, H * 0.1, H * 0.5);
    auroraG.addColorStop(0, 'rgba(30,60,120,' + (0.04 + 0.03 * Math.sin(skyPhase * 0.5)) + ')');
    auroraG.addColorStop(0.4, 'rgba(60,30,100,0.03)');
    auroraG.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = auroraG;
    ctx.fillRect(0, 0, W, H * 0.6);

    // Stars
    ctx.fillStyle = 'rgba(200,210,255,0.3)';
    var starCount = 80;
    for (var i = 0; i < starCount; i++) {
      var sx = (i * 137.5 + 50) % W;
      var sy = (i * 97.3 + 20) % (H * 0.5);
      var sr = 0.3 + (i % 3) * 0.3;
      var twinkle = 0.5 + 0.5 * Math.sin(time * 0.008 + i * 2.7);
      ctx.globalAlpha = 0.2 + 0.4 * twinkle;
      ctx.beginPath();
      ctx.arc(sx, sy, sr, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function drawBackgroundTrees() {
    // Far background tree silhouettes
    var farCount = 12;
    for (var i = 0; i < farCount; i++) {
      var fx = (i / farCount) * W + r(-20, 20);
      var fh = r(H * 0.3, H * 0.55);
      var fw = r(6, 12);
      var alpha = 0.15 + 0.1 * Math.sin(time * 0.005 + i * 1.3);
      ctx.fillStyle = 'rgba(10,15,30,' + alpha + ')';
      // Trunk
      ctx.fillRect(fx - fw / 2, H - fh, fw, fh);
      // Branches
      for (var fb = 0; fb < 3; fb++) {
        var by = H - fh * (0.3 + fb * 0.2);
        var bLen = r(15, 40);
        var bDir = fb % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(fx + bDir * 2, by);
        ctx.lineTo(fx + bDir * bLen, by - r(5, 15));
        ctx.lineWidth = r(2, 4);
        ctx.strokeStyle = 'rgba(10,15,30,' + alpha + ')';
        ctx.stroke();
      }
    }
  }

  function drawTrees() {
    for (var i = 0; i < trees.length; i++) {
      var t = trees[i];
      var sway = 3 * Math.sin(time * 0.003 + t.swayPhase);
      var x = t.x + sway;

      // Trunk
      var trunkGrad = ctx.createLinearGradient(x - t.trunkW / 2, 0, x + t.trunkW / 2, 0);
      trunkGrad.addColorStop(0, 'hsla(' + t.hue + ', ' + t.sat + '%, ' + (t.light - 5) + '%, 0.9)');
      trunkGrad.addColorStop(0.3, 'hsla(' + t.hue + ', ' + (t.sat + 10) + '%, ' + (t.light + 5) + '%, 0.95)');
      trunkGrad.addColorStop(0.7, 'hsla(' + t.hue + ', ' + (t.sat + 5) + '%, ' + (t.light + 3) + '%, 0.9)');
      trunkGrad.addColorStop(1, 'hsla(' + t.hue + ', ' + t.sat + '%, ' + (t.light - 5) + '%, 0.9)');

      var topY = H - t.trunkH;
      ctx.fillStyle = trunkGrad;
      // Tapered trunk
      ctx.beginPath();
      ctx.moveTo(x - t.trunkW / 2, H);
      ctx.lineTo(x - t.trunkW * 0.35, topY + t.trunkH * 0.1);
      ctx.lineTo(x - t.trunkW * 0.2, topY);
      ctx.lineTo(x + t.trunkW * 0.2, topY);
      ctx.lineTo(x + t.trunkW * 0.35, topY + t.trunkH * 0.1);
      ctx.lineTo(x + t.trunkW / 2, H);
      ctx.closePath();
      ctx.fill();

      // Bioluminescent trunk glow (inner core light)
      var innerGlow = ctx.createLinearGradient(x - t.trunkW * 0.15, 0, x + t.trunkW * 0.15, 0);
      innerGlow.addColorStop(0, 'hsla(' + t.glowHue + ', 90%, 60%, 0)');
      innerGlow.addColorStop(0.5, 'hsla(' + t.glowHue + ', 90%, 60%, ' + (0.08 + 0.04 * Math.sin(time * 0.006 + t.phase)) + ')');
      innerGlow.addColorStop(1, 'hsla(' + t.glowHue + ', 90%, 60%, 0)');
      ctx.fillStyle = innerGlow;
      ctx.fillRect(x - t.trunkW * 0.15, topY, t.trunkW * 0.3, t.trunkH);

      // Glowing markings on trunk
      for (var gi = 0; gi < t.glowMarkCount; gi++) {
        var my = H - t.trunkH * r(0.15, 0.9);
        var mw = r(3, 8);
        var mh = r(1, 3);
        var glowPulse = 0.5 + 0.5 * Math.sin(time * 0.008 + t.phase + gi * 1.5);
        // Rune-like vertical marks
        ctx.fillStyle = 'hsla(' + (t.glowHue + 20) + ', 90%, ' + (50 + 30 * glowPulse) + '%, ' + (0.3 + 0.4 * glowPulse) + ')';
        ctx.shadowColor = 'hsla(' + (t.glowHue + 20) + ', 90%, 70%, ' + (0.2 * glowPulse) + ')';
        ctx.shadowBlur = 6 + 8 * glowPulse;
        ctx.fillRect(x - mw / 2, my, mw, mh);
        // Smaller marks nearby
        ctx.fillStyle = 'hsla(' + (t.glowHue + 30) + ', 80%, ' + (40 + 30 * glowPulse) + '%, ' + (0.2 + 0.3 * glowPulse) + ')';
        ctx.fillRect(x - mw + r(-2, 2), my + mh + r(2, 5), mw * 0.5, mh * 0.7);
      }
      ctx.shadowBlur = 0;

      // Ambient glow around trunk
      var ambientGlow = ctx.createRadialGradient(x, H - t.trunkH * 0.5, 0, x, H - t.trunkH * 0.5, t.trunkW * 3);
      ambientGlow.addColorStop(0, 'hsla(' + t.glowHue + ', 70%, 50%, ' + (0.03 + 0.02 * Math.sin(time * 0.005 + t.phase)) + ')');
      ambientGlow.addColorStop(1, 'hsla(' + t.glowHue + ', 70%, 50%, 0)');
      ctx.fillStyle = ambientGlow;
      ctx.fillRect(x - t.trunkW * 3, topY - 20, t.trunkW * 6, t.trunkH + 40);

      // Branches with glow tips
      for (var bi = 0; bi < t.branchCount; bi++) {
        var by = H - t.trunkH * r(0.4, 0.85);
        var bLen = r(20, 50);
        var bAngle = (bi % 2 === 0 ? 1 : -1) * r(0.3, 0.8);
        var bThickness = r(2, 5);
        var endX = x + Math.cos(bAngle) * bLen * (bi % 2 === 0 ? 1 : -1);
        var endY = by - Math.sin(Math.abs(bAngle)) * bLen * 0.5;

        ctx.beginPath();
        ctx.moveTo(x, by);
        ctx.quadraticCurveTo(x + (endX - x) * 0.5, by - (by - endY) * 0.3, endX, endY);
        ctx.strokeStyle = 'hsla(' + (t.hue + 10) + ', ' + (t.sat - 10) + '%, ' + (t.light + 5) + '%, 0.7)';
        ctx.lineWidth = bThickness;
        ctx.lineCap = 'round';
        ctx.stroke();

        // Glowing branch tip
        var tipGlow = ctx.createRadialGradient(endX, endY, 0, endX, endY, 6 + 4 * Math.sin(time * 0.007 + t.phase + bi));
        tipGlow.addColorStop(0, 'hsla(' + (t.glowHue + 30) + ', 90%, 70%, 0.6)');
        tipGlow.addColorStop(0.3, 'hsla(' + (t.glowHue + 30) + ', 90%, 60%, 0.3)');
        tipGlow.addColorStop(1, 'hsla(' + (t.glowHue + 30) + ', 90%, 50%, 0)');
        ctx.fillStyle = tipGlow;
        ctx.beginPath();
        ctx.arc(endX, endY, 6 + 4 * Math.sin(time * 0.007 + t.phase + bi), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawGroundPlants() {
    for (var i = 0; i < groundPlants.length; i++) {
      var p = groundPlants[i];
      var pulse = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(time * 0.01 + p.phase));
      var alpha = 0.2 + 0.3 * pulse;

      ctx.globalAlpha = alpha;
      var hueShift = 10 * Math.sin(time * 0.005 + p.phase);

      if (p.type === 0) {
        // Glowing grass blades
        ctx.strokeStyle = 'hsla(' + (p.hue + hueShift) + ', 80%, 50%, 0.6)';
        ctx.lineWidth = 1.2;
        for (var g = 0; g < 3; g++) {
          ctx.beginPath();
          ctx.moveTo(p.x + g * 2 - 2, p.y);
          ctx.quadraticCurveTo(p.x + g * 2 + r(-3, 3), p.y - p.size * 1.2, p.x + g * 2 + r(-2, 2), p.y - p.size * 2);
          ctx.stroke();
        }
      } else if (p.type === 1) {
        // Glowing fern
        ctx.strokeStyle = 'hsla(' + (p.hue + hueShift) + ', 80%, 60%, 0.5)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + r(-8, -3), p.y - p.size * 1.5, p.x + r(-6, -1), p.y - p.size * 2.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.quadraticCurveTo(p.x + r(3, 8), p.y - p.size * 1.5, p.x + r(1, 6), p.y - p.size * 2.5);
        ctx.stroke();
        // Side leaflets
        for (var l = 0; l < 3; l++) {
          ctx.beginPath();
          ctx.moveTo(p.x + r(-4, 4), p.y - p.size * l * 0.7);
          ctx.lineTo(p.x + r(-10, -5), p.y - p.size * l * 0.7 - r(3, 6));
          ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(p.x + r(-4, 4), p.y - p.size * l * 0.7);
          ctx.lineTo(p.x + r(5, 10), p.y - p.size * l * 0.7 - r(3, 6));
          ctx.stroke();
        }
      } else {
        // Glowing flower
        var petalCount = 5;
        for (var pe = 0; pe < petalCount; pe++) {
          var angle = (pe / petalCount) * Math.PI * 2 + Math.sin(time * 0.005 + p.phase) * 0.1;
          var px = p.x + Math.cos(angle) * p.size * 0.5;
          var py = p.y - p.size * 0.8 + Math.sin(angle) * p.size * 0.3;
          ctx.fillStyle = 'hsla(' + (p.hue + hueShift + pe * 15) + ', 90%, ' + (40 + 30 * pulse) + '%, 0.5)';
          ctx.beginPath();
          ctx.ellipse(px, py, p.size * 0.25, p.size * 0.12, angle, 0, Math.PI * 2);
          ctx.fill();
        }
        // Center glow
        ctx.fillStyle = 'hsla(' + (p.hue + hueShift + 20) + ', 90%, 70%, ' + (0.3 + 0.4 * pulse) + ')';
        ctx.beginPath();
        ctx.arc(p.x, p.y - p.size * 0.7, p.size * 0.12, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.globalAlpha = 1;
  }

  function drawMushrooms() {
    for (var i = 0; i < mushrooms.length; i++) {
      var m = mushrooms[i];
      var pulse = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(time * 0.008 + m.phase));

      // Stem
      ctx.fillStyle = 'hsla(' + (m.hue + 30) + ', 50%, 20%, 0.7)';
      ctx.beginPath();
      ctx.moveTo(m.x - m.stemH * 0.08, m.y);
      ctx.lineTo(m.x + m.stemH * 0.08, m.y);
      ctx.lineTo(m.x + m.stemH * 0.05, m.y - m.stemH);
      ctx.lineTo(m.x - m.stemH * 0.05, m.y - m.stemH);
      ctx.closePath();
      ctx.fill();

      // Cap glow
      var capGlow = ctx.createRadialGradient(m.x, m.y - m.stemH - m.capH * 0.3, 0, m.x, m.y - m.stemH, m.capW * 0.6);
      capGlow.addColorStop(0, 'hsla(' + m.hue + ', 90%, ' + (40 + 40 * pulse) + '%, ' + (0.5 + 0.4 * pulse) + ')');
      capGlow.addColorStop(0.4, 'hsla(' + m.hue + ', 80%, 50%, ' + (0.3 + 0.3 * pulse) + ')');
      capGlow.addColorStop(1, 'hsla(' + m.hue + ', 70%, 30%, 0)');
      ctx.fillStyle = capGlow;

      // Cap shape
      ctx.beginPath();
      ctx.ellipse(m.x, m.y - m.stemH, m.capW * 0.5, m.capH * 0.5, 0, 0, Math.PI * 2);
      ctx.fill();

      // Cap highlight
      ctx.fillStyle = 'hsla(' + (m.hue + 20) + ', 90%, 80%, ' + (0.1 + 0.2 * pulse) + ')';
      ctx.beginPath();
      ctx.ellipse(m.x - m.capW * 0.1, m.y - m.stemH - m.capH * 0.15, m.capW * 0.2, m.capH * 0.15, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Under-cap glow (gills)
      ctx.fillStyle = 'hsla(' + (m.hue + 10) + ', 80%, 40%, ' + (0.2 * pulse) + ')';
      for (var ri = 0; ri < 5; ri++) {
        var rx = m.x - m.capW * 0.3 + (ri / 4) * m.capW * 0.6;
        ctx.beginPath();
        ctx.moveTo(rx, m.y - m.stemH + 1);
        ctx.lineTo(rx + 1, m.y - m.stemH + m.capH * 0.2);
        ctx.lineWidth = 1;
        ctx.strokeStyle = 'hsla(' + (m.hue + 10) + ', 80%, 40%, ' + (0.1 + 0.15 * pulse) + ')';
        ctx.stroke();
      }
    }
  }

  function drawVines() {
    for (var i = 0; i < vines.length; i++) {
      var v = vines[i];
      var pulse = 0.5 + 0.5 * Math.sin(time * 0.006 + v.phase);

      ctx.beginPath();
      ctx.moveTo(v.startX, v.startY);
      var cp1x = v.startX + (v.endX - v.startX) * 0.3 + Math.sin(time * 0.004 + v.phase) * 10;
      var cp1y = v.startY - (v.startY - v.endY) * 0.2 + Math.sin(time * 0.005 + v.phase + 1) * 5;
      var cp2x = v.startX + (v.endX - v.startX) * 0.7 + Math.sin(time * 0.004 + v.phase + 2) * 15;
      var cp2y = v.endY - (v.startY - v.endY) * 0.1 + Math.sin(time * 0.005 + v.phase + 1.5) * 5;
      ctx.bezierCurveTo(cp1x, cp1y, cp2x, cp2y, v.endX, v.endY);

      ctx.strokeStyle = 'hsla(' + v.hue + ', 80%, ' + (30 + 20 * pulse) + '%, ' + (0.3 + 0.2 * pulse) + ')';
      ctx.lineWidth = 1.5 + pulse;
      ctx.stroke();

      // Glow nodes along vine
      var nodeCount = 3 + Math.floor(pulse * 2);
      for (var ni = 1; ni <= nodeCount; ni++) {
        var nt = ni / (nodeCount + 1);
        var nx = (1 - nt) * (1 - nt) * v.startX + 2 * (1 - nt) * nt * cp1x + nt * nt * cp2x;
        var ny = (1 - nt) * (1 - nt) * v.startY + 2 * (1 - nt) * nt * cp1y + nt * nt * cp2y;
        var nGlow = ctx.createRadialGradient(nx, ny, 0, nx, ny, 2 + 2 * pulse);
        nGlow.addColorStop(0, 'hsla(' + (v.hue + 30) + ', 90%, 70%, ' + (0.3 + 0.4 * pulse) + ')');
        nGlow.addColorStop(1, 'hsla(' + (v.hue + 30) + ', 90%, 50%, 0)');
        ctx.fillStyle = nGlow;
        ctx.beginPath();
        ctx.arc(nx, ny, 2 + 2 * pulse, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function drawSpores() {
    for (var i = 0; i < spores.length; i++) {
      var s = spores[i];
      s.y += s.speedY * 0.03;
      s.x += s.driftX * 0.05 + Math.sin(time * 0.008 + s.phase) * 0.08;
      s.y += Math.sin(time * 0.01 + s.phase * 0.7) * 0.04;

      if (s.y < -10) {
        s.y = H * 0.85 + r(0, 20);
        s.x = r(0, W);
      }
      if (s.x < -20) s.x = W + 20;
      if (s.x > W + 20) s.x = -20;

      s.phase += s.phaseSpeed;
      var glow = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(s.phase));
      var a = s.alpha * glow;

      // Glow halo
      var g = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.r * 5);
      g.addColorStop(0, 'hsla(' + s.hue + ', 90%, ' + (60 + 30 * glow) + '%, ' + a + ')');
      g.addColorStop(0.3, 'hsla(' + s.hue + ', 80%, 50%, ' + (a * 0.3) + ')');
      g.addColorStop(1, 'hsla(' + s.hue + ', 70%, 40%, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 5, 0, Math.PI * 2);
      ctx.fill();

      // Core
      ctx.fillStyle = 'hsla(' + s.hue + ', 100%, ' + (70 + 25 * glow) + '%, ' + (a * 0.7) + ')';
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawButterflies() {
    for (var i = 0; i < butterflies.length; i++) {
      var b = butterflies[i];

      if (b.state === 'flying') {
        var dx = b.targetX - b.x;
        var dy = b.targetY - b.y;
        var dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 5) {
          b.state = 'waiting';
          b.waitTimer = 60 + Math.floor(r(0, 120));
        } else {
          var moveSpeed = b.speed * 0.03;
          b.x += (dx / dist) * moveSpeed + Math.sin(time * 0.05 + i) * 0.1;
          b.y += (dy / dist) * moveSpeed + Math.cos(time * 0.04 + i * 1.3) * 0.1;
        }
      } else {
        b.waitTimer--;
        if (b.waitTimer <= 0) {
          b.targetX = r(0.1, 0.9) * W;
          b.targetY = r(0.15, 0.55) * H;
          b.state = 'flying';
        }
      }

      b.wingPhase += b.wingSpeed;
      var wingAngle = Math.abs(Math.sin(b.wingPhase)) * 0.6;

      ctx.save();
      ctx.translate(b.x, b.y);

      // Glow aura
      var aura = ctx.createRadialGradient(0, 0, 0, 0, 0, b.size * 5);
      aura.addColorStop(0, 'hsla(' + b.hue + ', 90%, 70%, 0.08)');
      aura.addColorStop(1, 'hsla(' + b.hue + ', 90%, 50%, 0)');
      ctx.fillStyle = aura;
      ctx.beginPath();
      ctx.arc(0, 0, b.size * 5, 0, Math.PI * 2);
      ctx.fill();

      // Left wing
      ctx.fillStyle = 'hsla(' + b.hue + ', 90%, ' + (50 + 20 * wingAngle) + '%, ' + (0.4 + 0.3 * wingAngle) + ')';
      ctx.beginPath();
      ctx.ellipse(-b.size * 0.6, -b.size * wingAngle * 0.5, b.size * 0.8, b.size * 0.35 * wingAngle + 0.1, -0.3, 0, Math.PI * 2);
      ctx.fill();

      // Right wing
      ctx.beginPath();
      ctx.ellipse(b.size * 0.6, -b.size * wingAngle * 0.5, b.size * 0.8, b.size * 0.35 * wingAngle + 0.1, 0.3, 0, Math.PI * 2);
      ctx.fill();

      // Lower wings (smaller)
      ctx.fillStyle = 'hsla(' + (b.hue + 20) + ', 80%, ' + (40 + 20 * wingAngle) + '%, ' + (0.3 + 0.2 * wingAngle) + ')';
      ctx.beginPath();
      ctx.ellipse(-b.size * 0.4, b.size * 0.2, b.size * 0.5, b.size * 0.2 * wingAngle + 0.1, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(b.size * 0.4, b.size * 0.2, b.size * 0.5, b.size * 0.2 * wingAngle + 0.1, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // Body
      ctx.fillStyle = 'hsla(' + (b.hue + 40) + ', 80%, 60%, 0.7)';
      ctx.beginPath();
      ctx.ellipse(0, 0, b.size * 0.12, b.size * 0.3, 0, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }
  }

  function drawFireflies() {
    for (var i = 0; i < fireflies.length; i++) {
      var f = fireflies[i];
      f.angle += f.turnSpeed;
      f.x += Math.cos(f.angle) * f.speed * 0.04;
      f.y += Math.sin(f.angle) * f.speed * 0.04;

      if (f.x < -10) { f.x = W + 10; f.y = r(0.2, 0.85) * H; }
      if (f.x > W + 10) { f.x = -10; f.y = r(0.2, 0.85) * H; }
      if (f.y < H * 0.1) f.y = H * 0.85;
      if (f.y > H * 0.9) f.y = H * 0.2;

      f.phase += 0.015;
      var blink = 0.3 + 0.7 * (0.5 + 0.5 * Math.sin(f.phase));

      // Glow
      var fg = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r * 4);
      fg.addColorStop(0, 'hsla(' + f.hue + ', 90%, ' + (60 + 30 * blink) + '%, ' + (0.4 * blink) + ')');
      fg.addColorStop(0.3, 'hsla(' + f.hue + ', 80%, 50%, ' + (0.15 * blink) + ')');
      fg.addColorStop(1, 'hsla(' + f.hue + ', 70%, 40%, 0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 4, 0, Math.PI * 2);
      ctx.fill();

      // Bright core
      ctx.fillStyle = 'hsla(' + (f.hue + 10) + ', 100%, 80%, ' + (0.5 * blink) + ')';
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r * 0.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMist() {
    for (var i = 0; i < mistLayers.length; i++) {
      var ml = mistLayers[i];
      var x = Math.sin(time * ml.speed + ml.phase) * W * 0.1;

      var mg = ctx.createLinearGradient(0, ml.y - ml.h, 0, ml.y + ml.h);
      mg.addColorStop(0, 'rgba(20,40,60,0)');
      mg.addColorStop(0.3, 'rgba(20,40,60,' + (ml.alpha * 0.5 + 0.1 * Math.sin(time * 0.005 + ml.phase)) + ')');
      mg.addColorStop(0.6, 'rgba(30,50,80,' + (ml.alpha + 0.05 * Math.sin(time * 0.006 + ml.phase + 1)) + ')');
      mg.addColorStop(1, 'rgba(20,40,60,0)');
      ctx.fillStyle = mg;

      // Wavy mist shape
      ctx.beginPath();
      ctx.moveTo(x, ml.y);
      for (var mx = 0; mx <= W; mx += 30) {
        var my = ml.y + Math.sin(mx * 0.02 + time * ml.speed + ml.phase) * ml.h * 0.3;
        ctx.lineTo(mx + x, my);
      }
      ctx.lineTo(W + x, ml.y + ml.h);
      ctx.lineTo(x, ml.y + ml.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawLightRays() {
    // Subtle volumetric light rays from above
    var rayCount = 6;
    for (var i = 0; i < rayCount; i++) {
      var rx = W * (0.1 + 0.8 * (i / rayCount)) + Math.sin(time * 0.003 + i * 1.7) * 50;
      var rAlpha = 0.01 + 0.015 * (0.5 + 0.5 * Math.sin(time * 0.004 + i * 2.3));
      var rW = 30 + 20 * Math.sin(time * 0.005 + i * 1.1);

      ctx.fillStyle = 'rgba(100,180,255,' + rAlpha + ')';
      ctx.beginPath();
      ctx.moveTo(rx - rW, 0);
      ctx.lineTo(rx + rW, 0);
      ctx.lineTo(rx + rW * 2, H * 0.6);
      ctx.lineTo(rx - rW * 2, H * 0.6);
      ctx.closePath();
      ctx.fill();
    }
  }

  function draw() {
    time += 0.016;
    ctx.clearRect(0, 0, W, H);

    drawSky();
    drawBackgroundTrees();
    drawLightRays();
    drawMist();
    drawTrees();
    drawVines();
    drawGroundPlants();
    drawMushrooms();
    drawSpores();
    drawFireflies();
    drawButterflies();

    // Final ambient glow overlay
    var ambient = ctx.createRadialGradient(W * 0.5, H * 0.3, 0, W * 0.5, H * 0.3, W * 0.7);
    ambient.addColorStop(0, 'rgba(40,60,120,0.02)');
    ambient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, W, H);

    requestAnimationFrame(draw);
  }

  resize();
  window.addEventListener('resize', resize);
  draw();
})();

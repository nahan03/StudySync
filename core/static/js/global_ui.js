/* ═══════════════════════════════════════════════════
   GLOBAL UI — global_ui.js
   Reusable Fullscreen Focus Mode for all timers.
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  /* ── Fullscreen API helpers ────────────────────── */
  function isFullscreen() {
    return !!(document.fullscreenElement || document.webkitFullscreenElement);
  }

  function enterFullscreen() {
    var el = document.documentElement;
    var fn = el.requestFullscreen || el.webkitRequestFullscreen;
    if (fn) {
      fn.call(el).then(function () {
        document.body.classList.add('is-fullscreen');
        showControlsTemporarily();
      }).catch(function () {
        document.body.classList.add('is-fullscreen');
        showControlsTemporarily();
      });
    } else {
      document.body.classList.add('is-fullscreen');
      showControlsTemporarily();
    }
  }

  function exitFullscreen() {
    var fn = document.exitFullscreen || document.webkitExitFullscreen;
    if (fn) fn.call(document);
    document.body.classList.remove('is-fullscreen');
    document.body.classList.remove('fs-controls-visible');
  }

  function toggleFullscreen() {
    isFullscreen() ? exitFullscreen() : enterFullscreen();
  }

  /* ── Sync .is-fullscreen class with actual state ── */
  function syncFullscreen() {
    document.body.classList.toggle('is-fullscreen', isFullscreen());
    if (!isFullscreen()) {
      document.body.classList.remove('fs-controls-visible');
    } else {
      showControlsTemporarily();
    }
  }

  /* ── Auto-hide controls: show on mouse move, hide after 3s ── */
  var _fsHideTimer = null;

  function showControlsTemporarily() {
    document.body.classList.add('fs-controls-visible');
    clearTimeout(_fsHideTimer);
    _fsHideTimer = setTimeout(function () {
      document.body.classList.remove('fs-controls-visible');
    }, 3000);
  }

  document.addEventListener('mousemove', function () {
    if (document.body.classList.contains('is-fullscreen')) {
      showControlsTemporarily();
    }
  });

  /* ── Also keep controls visible while hovering over them ── */
  document.addEventListener('mouseenter', function (e) {
    if (!document.body.classList.contains('is-fullscreen')) return;
    var ctrl = e.target.closest('.em-controls, .dm-timer-actions, .cm-controls, #fs-exit-btn, #gmp-bar');
    if (ctrl) {
      document.body.classList.add('fs-controls-visible');
      clearTimeout(_fsHideTimer);
    }
  }, true);

  document.addEventListener('mouseleave', function (e) {
    if (!document.body.classList.contains('is-fullscreen')) return;
    var ctrl = e.target.closest('.em-controls, .dm-timer-actions, .cm-controls, #fs-exit-btn, #gmp-bar');
    if (ctrl) {
      _fsHideTimer = setTimeout(function () {
        document.body.classList.remove('fs-controls-visible');
      }, 1500);
    }
  }, true);

  /* ── Register fullscreen change listeners ────────── */
  if (document.readyState !== 'loading') {
    document.addEventListener('fullscreenchange', syncFullscreen);
    document.addEventListener('webkitfullscreenchange', syncFullscreen);
  } else {
    document.addEventListener('DOMContentLoaded', function () {
      document.addEventListener('fullscreenchange', syncFullscreen);
      document.addEventListener('webkitfullscreenchange', syncFullscreen);
    });
  }

  /* ── Toggle via .fs-toggle-btn clicks ──────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.fs-toggle-btn');
    if (!btn) return;
    e.preventDefault();
    toggleFullscreen();
  });

  /* ── Exit via #fs-exit-btn clicks ──────────────── */
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('#fs-exit-btn');
    if (!btn) return;
    e.preventDefault();
    exitFullscreen();
  });
})();

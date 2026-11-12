/* Desk lamp: the warm light follows the mouse; window.ssToggleLamp() switches the room light.
   The on/off state is applied in base.html's <head> so the page never flashes. */
(function () {
  var KEY = 'studySyncLampLit', root = document.documentElement;
  var el = document.getElementById('ss-lamp');
  if (!el) return;
  var raf = 0, x = 0, y = 0;
  window.addEventListener('pointermove', function (e) {
    if (e.pointerType && e.pointerType !== 'mouse') return;
    x = e.clientX; y = e.clientY;
    if (!raf) raf = requestAnimationFrame(function () {
      raf = 0; el.style.setProperty('--lx', x + 'px'); el.style.setProperty('--ly', y + 'px');
    });
  }, { passive: true });
  window.ssToggleLamp = function () {
    var on = !root.classList.contains('ss-lit');
    root.classList.toggle('ss-lit', on);
    try { localStorage.setItem(KEY, on ? '1' : '0'); } catch (e) { /* storage unavailable */ }
    return on;
  };
})();

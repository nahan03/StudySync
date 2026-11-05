/* StudySync client sync.
 *
 *  1. Adds the CSRF token to same-origin POST/PUT/PATCH/DELETE fetches.
 *  2. Study session history: server is the source of truth, mirrored into localStorage.
 *  3. Other durable data (schedule, flashcards, streak, trees, ...): the server copy
 *     is loaded into localStorage on page load, and later writes to those keys are
 *     pushed back to the server automatically (debounced).
 *
 * localStorage stays the working copy that the pages read, so they need no changes.
 */
(function () {
  const HIST_KEY = 'studySyncSessionHistory';
  const USER_KEY = 'studySyncSyncedUser';

  /* ---------- CSRF ---------- */
  function csrfToken() {
    const meta = document.querySelector('meta[name="csrf-token"]');
    if (meta && meta.content) return meta.content;
    const m = document.cookie.match(/(?:^|; )csrftoken=([^;]+)/);
    return m ? decodeURIComponent(m[1]) : '';
  }

  const nativeFetch = window.fetch.bind(window);
  window.fetch = function (input, init) {
    try {
      const req = typeof input === 'string' || input instanceof URL ? null : input;
      const method = ((init && init.method) || (req && req.method) || 'GET').toUpperCase();
      if (!['GET', 'HEAD', 'OPTIONS', 'TRACE'].includes(method)) {
        const url = new URL(req ? req.url : String(input), location.href);
        if (url.origin === location.origin) {
          init = Object.assign({}, init);
          const headers = new Headers(init.headers || (req && req.headers) || {});
          if (!headers.has('X-CSRFToken')) headers.set('X-CSRFToken', csrfToken());
          init.headers = headers;
        }
      }
    } catch (e) { /* fall through to the plain call */ }
    return nativeFetch(input, init);
  };

  function post(url, payload, extra) {
    return fetch(url, Object.assign({
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, extra || {}));
  }

  window.StudySyncAPI = {
    recordSession(entry) { return post('/api/sessions/record/', entry).catch(() => {}); },
  };

  /* ---------- load server data (logged-in pages only) ---------- */
  const dataEl = document.getElementById('server-session-history');
  if (!dataEl) return;
  let payload;
  try { payload = JSON.parse(dataEl.textContent); } catch (e) { return; }
  const username = payload.user || '';
  const serverState = payload.state || {};
  const keys = new Set(payload.keys || []);

  const store = window.localStorage;
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;
  const pending = {};
  let timer = null;

  function flush() {
    clearTimeout(timer);
    timer = null;
    const changes = Object.assign({}, pending);
    if (!Object.keys(changes).length) return;
    Object.keys(changes).forEach(k => delete pending[k]);
    post('/api/state/save/', { changes }, { keepalive: true })
      .then(r => { if (!r.ok) throw new Error(r.status); })
      .catch(() => {
        // put them back (unless something newer was queued meanwhile) and retry later
        Object.keys(changes).forEach(k => { if (!(k in pending)) pending[k] = changes[k]; });
        timer = setTimeout(flush, 15000);
      });
  }
  function queue(key, value) {
    pending[key] = value;
    clearTimeout(timer);
    timer = setTimeout(flush, 800);
  }

  try {
    const owner = store.getItem(USER_KEY);
    const foreign = owner !== null && owner !== username; // another account used this browser

    /* session history */
    let history = payload.sessions || [];
    if (foreign) {
      rawRemove.call(store, HIST_KEY);
    } else {
      const local = JSON.parse(store.getItem(HIST_KEY) || '[]');
      if (local.length > history.length) {
        const surplus = local.slice(history.length);
        post('/api/sessions/record/', { sessions: surplus }).catch(() => {});
        history = history.concat(surplus);
      }
    }
    rawSet.call(store, HIST_KEY, JSON.stringify(history));

    /* other synced keys */
    keys.forEach(k => {
      if (foreign) rawRemove.call(store, k);
      if (k in serverState) {
        rawSet.call(store, k, serverState[k]);
      } else if (!foreign) {
        const local = store.getItem(k);
        if (local !== null) queue(k, local); // first sync of existing local data
      }
    });
    rawSet.call(store, USER_KEY, username);
  } catch (e) { return; /* storage unavailable */ }

  /* push later writes to synced keys */
  Storage.prototype.setItem = function (k, v) {
    rawSet.call(this, k, v);
    if (this === store && keys.has(k)) queue(k, String(v));
  };
  Storage.prototype.removeItem = function (k) {
    rawRemove.call(this, k);
    if (this === store && keys.has(k)) queue(k, null);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
})();

/* Syncs study session history between the server (source of truth) and
   localStorage (cache read by stats/forest/home). */
(function () {
  const KEY = 'studySyncSessionHistory';
  const USER_KEY = 'studySyncSyncedUser';
  const csrf = () => (document.cookie.match(/(?:^|; )csrftoken=([^;]+)/) || [])[1] || '';

  function post(payload) {
    return fetch('/api/sessions/record/', {
      method: 'POST',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json', 'X-CSRFToken': decodeURIComponent(csrf()) },
      body: JSON.stringify(payload),
    }).catch(() => {});
  }

  window.StudySyncAPI = {
    recordSession(entry) { return post(entry); },
  };

  const dataEl = document.getElementById('server-session-history');
  if (!dataEl) return; // logged out
  let server, username;
  try {
    const payload = JSON.parse(dataEl.textContent);
    server = payload.sessions;
    username = payload.user || '';
  } catch (e) { return; }

  try {
    const owner = localStorage.getItem(USER_KEY);
    let local = JSON.parse(localStorage.getItem(KEY) || '[]');
    // One-time upload of pre-existing local history (legacy data, or this user's own).
    if ((owner === null || owner === username) && local.length > server.length) {
      const surplus = local.slice(server.length);
      post({ sessions: surplus });
      server = server.concat(surplus);
    }
    localStorage.setItem(KEY, JSON.stringify(server));
    localStorage.setItem(USER_KEY, username);
  } catch (e) { /* storage unavailable */ }
})();

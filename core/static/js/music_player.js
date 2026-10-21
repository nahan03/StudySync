/* ═══════════════════════════════════════════════════
   GLOBAL MINI MUSIC PLAYER — music_player.js v11
   ═══════════════════════════════════════════════════ */
(function () {
  'use strict';

  const bar         = document.getElementById('gmp-bar');
  const panel       = document.getElementById('gmp-panel');
  const toggle      = document.getElementById('gmp-toggle');
  const closeBtn    = document.getElementById('gmp-close');
  const nameEl      = document.getElementById('gmp-name');
  const urlInput    = document.getElementById('gmp-url-input');
  const urlPlay     = document.getElementById('gmp-url-play');
  const embedWrap   = document.getElementById('gmp-embed-wrap');
  const searchInput = document.getElementById('gmp-search-input');
  const searchBtn   = document.getElementById('gmp-search-btn');
  const searchRes   = document.getElementById('gmp-search-results');

  if (!bar) return;

  let ytPlayer = null;
  let ytTimeTracker = null;
  let _pendingResume = null;
  let _ytWasPlaying = false;

  /* ── Volume helpers ──────────────────────────────── */
  const VOLUME_KEY = 'studySyncMusicVolume';

  function loadVolume() {
    var v = parseFloat(localStorage.getItem(VOLUME_KEY));
    return isFinite(v) ? Math.max(0, Math.min(1, v)) : 0.8;
  }

  function saveVolume(v) {
    localStorage.setItem(VOLUME_KEY, String(Math.max(0, Math.min(1, v))));
  }

  /* ── Player state persistence ────────────────────── */
  const MUSIC_STATE_KEY = 'studySyncMusicState';

  function saveMusicState(extra) {
    var state = {
      url: localStorage.getItem('studySyncMusicUrl') || '',
      name: localStorage.getItem('studySyncMusicName') || '',
      time: localStorage.getItem('studySyncMusicCurrentTime') || '0',
      volume: localStorage.getItem(VOLUME_KEY) || '0.8',
      playing: _ytWasPlaying ? '1' : '0',
    };
    if (extra) Object.assign(state, extra);
    localStorage.setItem(MUSIC_STATE_KEY, JSON.stringify(state));
  }

  function getSavedMusicState() {
    try { return JSON.parse(localStorage.getItem(MUSIC_STATE_KEY)) || null; }
    catch (_) { return null; }
  }

  /* ── URL parser ─────────────────────────────────── */
  function getYoutubeId(url) {
    let m = url.match(/(?:youtube\.com\/embed\/|youtube\.com\/watch\?.*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
  }

  function toEmbedUrl(raw) {
    raw = (raw || '').trim();
    let m = raw.match(/(?:youtube\.com\/watch\?.*v=|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    if (m) return 'https://www.youtube.com/embed/' + m[1] + '?autoplay=1&enablejsapi=1&mute=1';
    m = raw.match(/youtube\.com\/playlist\?.*list=([\w-]+)/);
    if (m) return 'https://www.youtube.com/embed/videoseries?list=' + m[1] + '&autoplay=1&enablejsapi=1&mute=1';
    m = raw.match(/open\.spotify\.com\/(playlist|album|track|artist)\/([\w]+)/);
    if (m) return 'https://open.spotify.com/embed/' + m[1] + '/' + m[2] + '?utm_source=generator&theme=0&autoplay=true';
    return null;
  }

  /* ── YouTube IFrame API helpers ─────────────────── */
  function initYtPlayer(videoId, startTime, shouldPlay) {
    if (typeof YT === 'undefined' || !YT.Player) {
      var c = document.getElementById('gmp-iframe');
      if (!c) return;
      c.innerHTML = '';
      var f = document.createElement('iframe');
      f.src = 'https://www.youtube.com/embed/' + videoId + '?autoplay=1&enablejsapi=1&mute=1' + (startTime ? '&start=' + Math.floor(startTime) : '');
      f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
      f.setAttribute('allowfullscreen', '');
      f.loading = 'lazy';
      f.style.cssText = 'width:100%;height:200px;border:none;border-radius:8px;display:block';
      c.appendChild(f);
      return;
    }
    if (ytPlayer) { ytPlayer.destroy(); ytPlayer = null; }
    var c = document.getElementById('gmp-iframe');
    if (c) c.innerHTML = '';
    ytPlayer = new YT.Player('gmp-iframe', {
      videoId: videoId,
      height: 200,
      width: '100%',
      playerVars: {
        autoplay: shouldPlay ? 1 : 0,
        enablejsapi: 1,
        mute: 1,
        start: startTime ? Math.floor(startTime) : 0,
      },
      events: {
        onReady: function () {
          ytPlayer.setVolume(loadVolume() * 100);
          if (shouldPlay) ytPlayer.playVideo();
          // Unmute after a short delay — browser allows muted autoplay
          setTimeout(function () {
            try { ytPlayer.unMute(); } catch (_) {}
          }, 300);
        },
        onStateChange: function (e) {
          _ytWasPlaying = e.data === YT.PlayerState.PLAYING;
          if (e.data === YT.PlayerState.PLAYING || e.data === YT.PlayerState.PAUSED) {
            try {
              var t = ytPlayer.getCurrentTime();
              if (typeof t === 'number') localStorage.setItem('studySyncMusicCurrentTime', t.toString());
            } catch (_) {}
            saveMusicState({ playing: _ytWasPlaying ? '1' : '0' });
          }
        },
      },
    });
    if (ytTimeTracker) clearInterval(ytTimeTracker);
    ytTimeTracker = setInterval(function () {
      if (ytPlayer && ytPlayer.getCurrentTime) {
        try {
          var t = ytPlayer.getCurrentTime();
          if (typeof t === 'number') {
            localStorage.setItem('studySyncMusicCurrentTime', t.toString());
          }
        } catch (_) {}
      }
      // also sync player state
      if (ytPlayer && ytPlayer.getPlayerState) {
        try {
          _ytWasPlaying = ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
        } catch (_) {}
      }
    }, 5000);
  }

  function destroyYtPlayer() {
    if (ytTimeTracker) { clearInterval(ytTimeTracker); ytTimeTracker = null; }
    if (ytPlayer) { ytPlayer.destroy(); ytPlayer = null; }
    var c = document.getElementById('gmp-iframe');
    if (c) c.innerHTML = '';
  }

  /* ── Load and show embed ────────────────────────── */
  function loadEmbed(embedUrl, name, shouldPlay) {
    destroyYtPlayer();
    var savedState = getSavedMusicState();
    var isSameTrack = savedState && savedState.url && savedState.url === embedUrl;
    if (shouldPlay === undefined) shouldPlay = !(isSameTrack && savedState && savedState.playing === '0');
    var videoId = getYoutubeId(embedUrl);
    if (videoId) {
      var savedTime = localStorage.getItem('studySyncMusicCurrentTime');
      var startTime = 0;
      if (savedTime && isSameTrack) {
        startTime = parseFloat(savedTime) || 0;
      }
      initYtPlayer(videoId, startTime, shouldPlay);
    } else {
      var c = document.getElementById('gmp-iframe');
      if (c) {
        c.innerHTML = '';
        var f = document.createElement('iframe');
        f.src = embedUrl;
        f.allow = 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture';
        f.setAttribute('allowfullscreen', '');
        f.loading = 'lazy';
        var h = (embedUrl || '').includes('spotify') ? '152px' : '200px';
        f.style.cssText = 'width:100%;height:' + h + ';border:none;border-radius:8px;display:block';
        c.appendChild(f);
      }
    }
    embedWrap.classList.remove('hidden');
    bar.classList.add('playing');
    if (nameEl) nameEl.textContent = name || 'Study Music';
    const subEl = bar.querySelector('.gmp-sub');
    if (subEl) subEl.textContent = shouldPlay ? 'Now Playing' : 'Paused';
    localStorage.setItem('studySyncMusicUrl', embedUrl);
    localStorage.setItem('studySyncMusicName', name || 'Study Music');
    saveMusicState({ playing: shouldPlay ? '1' : '0' });
  }

  /* ── Panel open/close ───────────────────────────── */
  function openPanel() {
    panel.classList.remove('hidden');
    if (toggle) toggle.textContent = '▼';
  }

  function closePanel() {
    panel.classList.add('hidden');
    if (toggle) toggle.textContent = '▲';
    hideResults();
  }

  toggle && toggle.addEventListener('click', function (e) {
    e.stopPropagation();
    panel.classList.contains('hidden') ? openPanel() : closePanel();
  });

  closeBtn && closeBtn.addEventListener('click', closePanel);

  document.addEventListener('click', function (e) {
    if (!panel.classList.contains('hidden') &&
        !panel.contains(e.target) &&
        e.target !== toggle) {
      closePanel();
    }
  });

  /* ── Playlist section show/hide (hidden while searching) ── */
  const chipsWrap    = document.querySelector('.gmp-chips');
  const suggestLabel = chipsWrap ? chipsWrap.previousElementSibling : null;

  function hidePlaylistSection() {
    if (chipsWrap)    chipsWrap.style.display    = 'none';
    if (suggestLabel) suggestLabel.style.display = 'none';
  }
  function showPlaylistSection() {
    if (chipsWrap)    chipsWrap.style.display    = '';
    if (suggestLabel) suggestLabel.style.display = '';
  }

  /* ── Preset chips ───────────────────────────────── */
  document.querySelectorAll('.gmp-chip').forEach(function (chip) {
    chip.addEventListener('click', function () {
      document.querySelectorAll('.gmp-chip').forEach(function (c) { c.classList.remove('active'); });
      chip.classList.add('active');
      const id   = chip.dataset.spotify;
      const name = chip.dataset.name || chip.textContent.trim();
      hideResults();
      loadEmbed('https://open.spotify.com/embed/playlist/' + id + '?utm_source=generator&theme=0&autoplay=true', name);
    });
  });

  /* ── Music search ───────────────────────────────── */
  function hideResults() {
    if (searchRes) searchRes.classList.add('hidden');
  }

  /* ── iTunes preview player ─────────────────────────── */
  var _previewAudio = null;

  function playPreview(previewUrl, title) {
    if (_previewAudio) { _previewAudio.pause(); _previewAudio = null; }
    _previewAudio = new Audio(previewUrl);
    _previewAudio.volume = loadVolume();
    _previewAudio.play();
    bar.classList.add('playing');
    if (nameEl) nameEl.textContent = title || 'Preview';
    var subEl = bar.querySelector('.gmp-sub');
    if (subEl) subEl.textContent = '30s Preview';
    _previewAudio.addEventListener('ended', function () {
      bar.classList.remove('playing');
      if (subEl) subEl.textContent = 'Preview ended';
    });
  }

  function showResults(items) {
    if (!searchRes) return;
    // Only show items with a 30s preview URL
    var previewItems = items.filter(function (v) { return v.preview; });
    if (!previewItems.length) {
      searchRes.innerHTML = '<p class="gmp-no-results">No preview tracks found.</p>';
      searchRes.classList.remove('hidden');
      return;
    }
    searchRes.innerHTML = previewItems.map(function (v) {
      var thumb = v.thumb
        ? '<img class="gmp-result-thumb" src="' + escAttr(v.thumb) + '" alt="" loading="lazy" />'
        : '<div class="gmp-result-thumb gmp-thumb-ph"></div>';
      return (
        '<button class="gmp-result-item" data-title="' + escAttr(v.title) + '"'
          + ' data-preview="' + escAttr(v.preview) + '">' +
          thumb +
          '<div class="gmp-result-info">' +
            '<span class="gmp-result-title">' + escHtml(v.title) + '</span>' +
            '<span class="gmp-result-ch"><span class="gmp-src-badge gmp-src-it">30s Preview</span> ' + escHtml(v.channel) + '</span>' +
          '</div>' +
        '</button>'
      );
    }).join('');
    searchRes.classList.remove('hidden');

    searchRes.querySelectorAll('.gmp-result-item').forEach(function (btn) {
      btn.addEventListener('click', function () {
        document.querySelectorAll('.gmp-chip').forEach(function (c) { c.classList.remove('active'); });
        playPreview(btn.dataset.preview, btn.dataset.title);
        hideResults();
        showPlaylistSection();
        if (searchInput) searchInput.value = '';
      });
    });
  }

  function escAttr(s) { return String(s || '').replace(/"/g, '&quot;').replace(/'/g, '&#39;'); }
  function escHtml(s) { return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

  let searchTimeout = null;

  function doSearch() {
    const q = searchInput ? searchInput.value.trim() : '';
    if (!q) { hideResults(); return; }

    if (searchRes) {
      searchRes.innerHTML = '<p class="gmp-no-results">Searching&#8230;</p>';
      searchRes.classList.remove('hidden');
    }

    fetch('/api/music-search/?q=' + encodeURIComponent(q))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (data.no_key) {
          searchRes.innerHTML =
            '<p class="gmp-no-results gmp-no-key">Search error — please try again.</p>';
          searchRes.classList.remove('hidden');
          return;
        }
        showResults(data.results || []);
      })
      .catch(function () {
        if (searchRes) {
          searchRes.innerHTML = '<p class="gmp-no-results">Search failed — check your connection.</p>';
          searchRes.classList.remove('hidden');
        }
      });
  }

  searchBtn && searchBtn.addEventListener('click', doSearch);
  searchInput && searchInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { clearTimeout(searchTimeout); doSearch(); }
    if (e.key === 'Escape') {
      hideResults();
      showPlaylistSection();
      searchInput.value = '';
    }
  });
  searchInput && searchInput.addEventListener('focus', function () {
    if (searchInput.value.trim().length > 0) hidePlaylistSection();
  });
  // Debounced search-as-you-type
  searchInput && searchInput.addEventListener('input', function () {
    clearTimeout(searchTimeout);
    if (!searchInput.value.trim()) {
      hideResults();
      showPlaylistSection();
      return;
    }
    hidePlaylistSection();
    if (searchInput.value.trim().length < 3) { hideResults(); return; }
    searchTimeout = setTimeout(doSearch, 500);
  });

  /* ── Custom URL (paste) ─────────────────────────── */
  function playCustomUrl() {
    const url = toEmbedUrl(urlInput ? urlInput.value : '');
    if (!url) {
      if (urlInput) urlInput.style.borderColor = 'rgba(180,60,40,0.55)';
      return;
    }
    if (urlInput) urlInput.style.borderColor = '';
    document.querySelectorAll('.gmp-chip').forEach(function (c) { c.classList.remove('active'); });
    loadEmbed(url, 'Custom');
  }

  urlPlay   && urlPlay.addEventListener('click', playCustomUrl);
  urlInput  && urlInput.addEventListener('keydown', function (e) {
    if (e.key === 'Enter') playCustomUrl();
  });

  /* ── Load YouTube IFrame API ────────────────────── */
  function loadYtApi(callback) {
    if (typeof YT !== 'undefined' && YT.Player) { callback(); return; }
    if (!window._ytCallbacks) {
      window._ytCallbacks = [];
      window.onYouTubeIframeAPIReady = function () {
        (window._ytCallbacks || []).forEach(function (cb) { cb(); });
        window._ytCallbacks = [];
      };
      var tag = document.createElement('script');
      tag.src = 'https://www.youtube.com/iframe_api';
      var firstScriptTag = document.getElementsByTagName('script')[0];
      firstScriptTag.parentNode.insertBefore(tag, firstScriptTag);
      // Fallback polling if onYouTubeIframeAPIReady never fires
      var check = setInterval(function () {
        if (typeof YT !== 'undefined' && YT.Player) {
          clearInterval(check);
          clearTimeout(window._ytTimeout);
          (window._ytCallbacks || []).forEach(function (cb) { cb(); });
          window._ytCallbacks = [];
        }
      }, 200);
      window._ytTimeout = setTimeout(function () {
        clearInterval(check);
        // Fire queued callbacks even if API never loaded — they fall through to iframe.src fallback
        (window._ytCallbacks || []).forEach(function (cb) { cb(); });
        window._ytCallbacks = [];
      }, 10000);
    }
    window._ytCallbacks.push(callback);
  }

  /* ── Restore last session ───────────────────────── */
  (function restore() {
    var savedUrl  = localStorage.getItem('studySyncMusicUrl');
    var savedName = localStorage.getItem('studySyncMusicName');
    var savedState = getSavedMusicState();
    var wasPlaying = savedState && savedState.playing === '1';
    if (!savedUrl && savedState) savedUrl = savedState.url;
    if (!savedName && savedState) savedName = savedState.name;
    if (!savedUrl) return;
    // Ensure Spotify URLs have autoplay=true (for URLs saved before this feature)
    if (savedUrl.indexOf('open.spotify.com') !== -1 && savedUrl.indexOf('autoplay=') === -1) {
      savedUrl += (savedUrl.indexOf('?') === -1 ? '?' : '&') + 'autoplay=true';
      localStorage.setItem('studySyncMusicUrl', savedUrl);
    }
    openPanel();
    if (nameEl) nameEl.textContent = savedName || 'Study Music';
    if (getYoutubeId(savedUrl)) {
      loadYtApi(function () { loadEmbed(savedUrl, savedName || 'Study Music'); });
    } else {
      // Spotify — can't autoplay without user gesture
      var subEl = bar.querySelector('.gmp-sub');
      if (subEl) subEl.textContent = wasPlaying ? 'Tap to resume ▶' : 'Paused';
      bar.classList.toggle('playing', wasPlaying);
      embedWrap.classList.add('hidden');
      _pendingResume = savedUrl;
    }
    document.querySelectorAll('.gmp-chip').forEach(function (chip) {
      const id = chip.dataset.spotify;
      if (id && savedUrl.includes(id)) chip.classList.add('active');
    });
    // Restore volume
    saveVolume(loadVolume());
  })();

  /* ── Resume Spotify on user tap ─────────────────── */
  function resumeSpotify() {
    if (!_pendingResume) return;
    var url = _pendingResume;
    _pendingResume = null;
    loadEmbed(url, nameEl ? nameEl.textContent : 'Study Music');
    var subEl = bar.querySelector('.gmp-sub');
    if (subEl) subEl.textContent = 'Now Playing';
    bar.classList.add('playing');
  }
  // Listen for click on the bar to resume
  bar && bar.addEventListener('click', function (e) {
    if (_pendingResume) {
      e.stopPropagation();
      resumeSpotify();
    }
  });

  /* ── Save current time on page unload ───────────── */
  window.addEventListener('beforeunload', function () {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      try {
        var t = ytPlayer.getCurrentTime();
        if (typeof t === 'number') localStorage.setItem('studySyncMusicCurrentTime', t.toString());
      } catch (_) {}
    }
    saveMusicState();
  });

  /* ── Save state on pagehide (fires before beforeunload) ── */
  window.addEventListener('pagehide', function () {
    if (ytPlayer && ytPlayer.getCurrentTime) {
      try {
        var t = ytPlayer.getCurrentTime();
        if (typeof t === 'number') localStorage.setItem('studySyncMusicCurrentTime', t.toString());
      } catch (_) {}
    }
    saveMusicState();
  });

  /* ── Resume YouTube playback when tab becomes visible ── */
  document.addEventListener('visibilitychange', function () {
    if (document.hidden) {
      _ytWasPlaying = ytPlayer && ytPlayer.getPlayerState && ytPlayer.getPlayerState() === YT.PlayerState.PLAYING;
      if (_ytWasPlaying) {
        try {
          var t = ytPlayer.getCurrentTime();
          if (typeof t === 'number') localStorage.setItem('studySyncMusicCurrentTime', t.toString());
        } catch (_) {}
        saveMusicState({ playing: '1' });
      }
    } else if (_ytWasPlaying) {
      _ytWasPlaying = false;
      if (ytPlayer && ytPlayer.playVideo) {
        try { ytPlayer.playVideo(); } catch (_) {}
      }
    }
  });

})();

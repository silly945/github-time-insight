/**
 * GitHub Time Insight - shared helpers (classic script)
 *
 * Loaded by the content script as a plain <script>, so it must NOT use
 * ES module syntax. Everything hangs off window.GTI.
 * The service worker and dashboard use shared.mjs instead, which keeps the
 * exact same logic (the file is small enough to hand-mirror).
 *
 * No external dependencies.
 */
(function (root) {
  'use strict';

  /* ---------------------------------------------------------------- keys */

  var STORAGE_KEY = 'gti_data_v1';
  var SETTINGS_KEY = 'gti_settings_v1';

  /* ------------------------------------------------------------- timings */

  var IDLE_TIMEOUT_MS = 2 * 60 * 1000;
  var MAX_SESSION_MS = 30 * 60 * 1000;
  var HEARTBEAT_MINUTES = 1;
  var RETENTION_DAYS = 90;

  /* ---------------------------------------------------------- categories */

  var CATEGORIES = [
    { id: 'code', test: function (p) { return /\/(blob|tree|raw|commit|commits|compare|blame)(\/|$)/.test(p); } },
    { id: 'pr', test: function (p) { return /\/(pull|pulls)(\/|$)/.test(p); } },
    { id: 'issue', test: function (p) { return /\/(issues|discussions)(\/|$)/.test(p); } },
    { id: 'search', test: function (p) { return /^\/search(\/|\?|$)/.test(p); } },
    { id: 'other', test: function () { return true; } }
  ];

  var CATEGORY_LABELS = {
    code: { zh: '读代码', en: 'Reading code' },
    pr: { zh: '看 PR', en: 'Pull requests' },
    issue: { zh: '看 Issue', en: 'Issues' },
    search: { zh: '搜索', en: 'Searching' },
    other: { zh: '闲逛', en: 'Browsing' }
  };

  /* ------------------------------------------------------------- parsing */

  var RESERVED_OWNERS = [
    'about', 'account', 'apps', 'codespaces', 'collections', 'contact',
    'copilot', 'dashboard', 'events', 'explore', 'features', 'issues',
    'join', 'login', 'logout', 'marketplace', 'new', 'notifications',
    'organizations', 'pricing', 'pulls', 'search', 'security', 'settings',
    'site', 'sponsors', 'topics', 'trending', 'watching'
  ];

  function repoFromPath(pathname) {
    if (!pathname) return null;
    var parts = String(pathname).split('/').filter(Boolean);
    if (parts.length < 2) return null;
    var owner = parts[0];
    if (RESERVED_OWNERS.indexOf(owner.toLowerCase()) !== -1) return null;
    var name = parts[1].replace(/\.git$/, '');
    if (!owner || !name) return null;
    return owner + '/' + name;
  }

  function categoryForPath(pathname) {
    var p = pathname || '/';
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (CATEGORIES[i].test(p)) return CATEGORIES[i].id;
    }
    return 'other';
  }

  /* ---------------------------------------------------------------- time */

  function dayKey(ts) {
    var d = new Date(typeof ts === 'number' ? ts : Date.now());
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }

  function fmtClock(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(s / 3600);
    var m = Math.floor((s % 3600) / 60);
    var ss = s % 60;
    if (h) {
      return h + ':' + String(m).padStart(2, '0') + ':' + String(ss).padStart(2, '0');
    }
    return m + ':' + String(ss).padStart(2, '0');
  }

  root.GTI = {
    STORAGE_KEY: STORAGE_KEY,
    SETTINGS_KEY: SETTINGS_KEY,
    IDLE_TIMEOUT_MS: IDLE_TIMEOUT_MS,
    MAX_SESSION_MS: MAX_SESSION_MS,
    HEARTBEAT_MINUTES: HEARTBEAT_MINUTES,
    RETENTION_DAYS: RETENTION_DAYS,
    CATEGORIES: CATEGORIES,
    CATEGORY_LABELS: CATEGORY_LABELS,
    repoFromPath: repoFromPath,
    categoryForPath: categoryForPath,
    dayKey: dayKey,
    fmtClock: fmtClock
  };
})(typeof window !== 'undefined' ? window : globalThis);
/**
 * GitHub Time Insight - content script
 *
 * Job list:
 *  1. Decide whether the user is *actually* looking at GitHub right now
 *     (visibility + idle + focused). We only report "activity", never
 *     durations: the service worker owns the clock.
 *  2. Draw the corner widget: today's minutes, category, budget bar.
 *     Draggable, collapsible to a dot, long-press to expand.
 *  3. Watch for URL changes (GitHub is a SPA-ish page with pjax) so the
 *     repo/path we report is always fresh.
 *  4. Remember the last read position so "resume reading" works later.
 *
 * Loaded as a classic script after src/shared.js, so window.GTI exists.
 */
(function () {
  'use strict';

  var G = window.GTI;
  if (!G) return;

  var IDLE_MS = 60 * 1000;          // no pointer/key event for 60s => idle
  var PING_MS = 15 * 1000;          // report cadence while active
  var LONG_PRESS_MS = 800;          // 兜底：长按 0.8s 也能展开
  var POS_KEY = 'gti_widget_pos';
  var COLLAPSE_KEY = 'gti_widget_collapsed';

  var state = {
    lastInput: Date.now(),
    active: false,
    collapsed: false,
    hidden: false,
    lastPath: location.pathname,
    lastUrl: location.href,
    title: document.title,
    cat: null,
    repo: null,
    timer: null,
    longPress: null,
    snapshot: null,
    settings: null,
    dragging: false
  };

  /* ------------------------------------------------------------------ */
  /* environment signals                                                */
  /* ------------------------------------------------------------------ */

  function markInput() {
    state.lastInput = Date.now();
  }

  ['pointerdown', 'pointermove', 'keydown', 'wheel', 'touchstart', 'scroll']
    .forEach(function (ev) {
      // passive + capture: never interfere with GitHub's own handlers
      window.addEventListener(ev, markInput, { passive: true, capture: true });
    });

  function isIdle() {
    return Date.now() - state.lastInput > IDLE_MS;
  }

  function isVisible() {
    return document.visibilityState === 'visible';
  }

  function hasFocus() {
    return document.hasFocus();
  }

  /** The one place that answers "should we count this minute?" */
  function shouldCount() {
    return isVisible() && !isIdle();
  }

  /* ------------------------------------------------------------------ */
  /* location bookkeeping                                               */
  /* ------------------------------------------------------------------ */

  function refreshLocation() {
    var path = location.pathname;
    if (path === state.lastPath && location.href === state.lastUrl) return false;
    state.lastPath = path;
    state.lastUrl = location.href;
    state.title = document.title;
    state.repo = G.repoFromPath(path);
    state.cat = G.categoryForPath(path);
    // keep reading position in sync
    if (state.repo) {
      send({
        type: 'lastRead',
        repo: state.repo,
        path: path,
        title: document.title
      });
    }
    return true;
  }

  // GitHub uses pjax + history.pushState; patch both and also poll as a fallback.
  ['pushState', 'replaceState'].forEach(function (fn) {
    var orig = history[fn];
    if (typeof orig !== 'function') return;
    history[fn] = function () {
      var r = orig.apply(this, arguments);
      setTimeout(function () {
        if (refreshLocation()) render();
      }, 60);
      return r;
    };
  });
  window.addEventListener('popstate', function () {
    setTimeout(function () {
      if (refreshLocation()) render();
    }, 60);
  });

  /* ------------------------------------------------------------------ */
  /* messaging                                                          */
  /* ------------------------------------------------------------------ */

  function send(msg) {
    try {
      chrome.runtime.sendMessage(msg, function () {
        // Swallow "receiving end does not exist" during SW restarts.
        void chrome.runtime.lastError;
      });
    } catch (e) {
      /* extension context invalidated after reload - ignore */
    }
  }

  function reportActivity() {
    refreshLocation();
    if (!shouldCount()) return;
    send({
      type: 'activity',
      cat: state.cat,
      repo: state.repo,
      path: location.pathname,
      title: document.title
    });
  }

  /* ------------------------------------------------------------------ */
  /* widget                                                             */
  /* ------------------------------------------------------------------ */

  var el = {};

  function buildWidget() {
    var root = document.createElement('div');
    root.id = 'gti-widget';
    root.setAttribute('role', 'status');
    root.setAttribute('aria-live', 'polite');

    root.innerHTML =
      '<div class="gti-dot" title="点击展开 GitHub Time Insight"></div>' +
      '<div class="gti-card">' +
      '  <div class="gti-head">' +
      '    <span class="gti-brand">Time Insight</span>' +
      '    <button class="gti-min" title="collapse">&minus;</button>' +
      '  </div>' +
      '  <div class="gti-total"><span class="gti-num">0</span><span class="gti-unit">min</span></div>' +
      '  <div class="gti-sub"><span class="gti-cat">idle</span> &middot; <span class="gti-quality">no data</span></div>' +
      '  <div class="gti-bar"><i style="width:0%"></i></div>' +
      '  <div class="gti-foot">' +
      '    <span class="gti-budget"></span>' +
      '    <button class="gti-open" title="dashboard">&#9776;</button>' +
      '  </div>' +
      '</div>';

    (document.body || document.documentElement).appendChild(root);

    el.root = root;
    el.dot = root.querySelector('.gti-dot');
    el.card = root.querySelector('.gti-card');
    el.num = root.querySelector('.gti-num');
    el.cat = root.querySelector('.gti-cat');
    el.quality = root.querySelector('.gti-quality');
    el.barFill = root.querySelector('.gti-bar > i');
    el.budget = root.querySelector('.gti-budget');
    el.min = root.querySelector('.gti-min');
    el.open = root.querySelector('.gti-open');

    el.min.addEventListener('click', function (e) {
      e.stopPropagation();
      setCollapsed(true);
    });

    el.open.addEventListener('click', function (e) {
      e.stopPropagation();
      send({ type: 'openDashboard' });
      try {
        chrome.runtime.sendMessage({ type: 'openDashboard' });
      } catch (err) {}
      window.open(chrome.runtime.getURL('src/dashboard.html'), '_blank');
    });

    // --- dragging (pointer events, works with touch and mouse) ---
    var drag = null;

    function onDown(e) {
      var handle = e.target.closest('.gti-head, .gti-dot');
      if (!handle) return;
      if (e.target.closest('button')) return;
      drag = {
        id: e.pointerId,
        x: e.clientX,
        y: e.clientY,
        left: root.offsetLeft,
        top: root.offsetTop,
        moved: false
      };
      root.setPointerCapture && root.setPointerCapture(e.pointerId);
      // 不再 preventDefault：preventDefault 会阻断 click，
      // 导致收起后单击圆点无法展开（原 bug）。
    }

    function onMove(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (!drag.moved && Math.abs(dx) + Math.abs(dy) < 5) return;
      drag.moved = true;
      state.dragging = true;
      place(drag.left + dx, drag.top + dy);
    }

    function onUp(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var moved = drag.moved;
      drag = null;
      state.dragging = false;
      if (moved) savePos();
    }

    root.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);

    // Tap (or long-press) the dot to bring the card back.
    // 单击即可展开；同时保留长按作为兜底（部分触屏环境 click 可能被吞）。
    function expandFromDot(e) {
      if (e) {
        e.stopPropagation();
        e.preventDefault();
      }
      clearTimeout(state.longPress);
      state.longPress = null;
      setCollapsed(false);
    }

    el.dot.addEventListener('click', expandFromDot);

    el.dot.addEventListener('pointerdown', function (e) {
      clearTimeout(state.longPress);
      state.longPress = setTimeout(function () {
        setCollapsed(false);
      }, LONG_PRESS_MS);
    });
    ['pointerup', 'pointerleave', 'pointercancel'].forEach(function (ev) {
      el.dot.addEventListener(ev, function () {
        clearTimeout(state.longPress);
      });
    });

    restorePos();
  }

  function place(left, top) {
    if (!el.root) return;
    var w = el.root.offsetWidth || 150;
    var h = el.root.offsetHeight || 80;
    var maxL = Math.max(4, window.innerWidth - w - 4);
    var maxT = Math.max(4, window.innerHeight - h - 4);
    left = Math.min(Math.max(4, left), maxL);
    top = Math.min(Math.max(4, top), maxT);
    el.root.style.left = left + 'px';
    el.root.style.top = top + 'px';
    el.root.style.right = 'auto';
    el.root.style.bottom = 'auto';
  }

  function savePos() {
    if (!el.root) return;
    try {
      var o = {};
      o[POS_KEY] = { left: el.root.offsetLeft, top: el.root.offsetTop };
      chrome.storage.local.set(o);
    } catch (e) {}
  }

  function restorePos() {
    try {
      chrome.storage.local.get([POS_KEY, COLLAPSE_KEY], function (res) {
        if (res && res[POS_KEY]) place(res[POS_KEY].left, res[POS_KEY].top);
        if (res && res[COLLAPSE_KEY]) setCollapsed(true, true);
      });
    } catch (e) {}
  }

  function setCollapsed(v, silent) {
    state.collapsed = !!v;
    if (!el.root) return;
    el.root.classList.toggle('gti-collapsed', state.collapsed);
    if (!silent) {
      try {
        var o = {};
        o[COLLAPSE_KEY] = state.collapsed;
        chrome.storage.local.set(o);
      } catch (e) {}
    }
  }

  /* ------------------------------------------------------------------ */
  /* rendering                                                          */
  /* ------------------------------------------------------------------ */

  var CAT_LABEL = {
    code: 'writing code',
    pr: 'reviewing code',
    issue: 'issues',
    search: 'searching',
    other: 'browsing'
  };

  var QUALITY_LABEL = {
    exact: 'exact',
    estimated: 'estimated',
    suspect: 'suspect'
  };

  function render() {
    var s = state.snapshot;
    if (!el.root) return;

    // collapse to dot while idle so we never nag
    var idle = isIdle() || !isVisible();
    el.root.classList.toggle('gti-idle', idle);

    if (!s) {
      el.num.textContent = '0';
      el.cat.textContent = 'idle';
      el.quality.textContent = 'no data';
      el.barFill.style.width = '0%';
      return;
    }

    var minutes = s.today || 0;
    var budget = (state.settings && state.settings.dailyBudget) || 0;

    el.num.textContent = fmtShort(minutes);
    el.cat.textContent = CAT_LABEL[s.cat] || 'browsing';
    el.quality.textContent = QUALITY_LABEL[s.quality] || 'exact';

    var pct = budget > 0 ? Math.min(100, (minutes / budget) * 100) : 0;
    el.barFill.style.width = pct.toFixed(1) + '%';
    el.root.classList.toggle('gti-over', budget > 0 && minutes >= budget);
    el.root.classList.toggle('gti-warn', budget > 0 && minutes >= budget * 0.8 && minutes < budget);

    if (budget > 0) {
      el.budget.textContent = Math.round(minutes) + ' / ' + budget + ' min';
    } else {
      el.budget.textContent = 'no budget set';
    }
  }

  function fmtShort(m) {
    m = Math.round(m || 0);
    if (m < 60) return String(m);
    var h = Math.floor(m / 60);
    var r = m % 60;
    return r ? h + 'h' + r : h + 'h';
  }

  /* ------------------------------------------------------------------ */
  /* events                                                             */
  /* ------------------------------------------------------------------ */

  document.addEventListener('visibilitychange', function () {
    if (isVisible()) {
      markInput();
      reportActivity();
    } else {
      send({ type: 'leave' });
    }
    render();
  });

  window.addEventListener('focus', function () {
    markInput();
    reportActivity();
  });

  window.addEventListener('blur', function () {
    send({ type: 'leave' });
  });

  window.addEventListener('beforeunload', function () {
    send({ type: 'leave' });
  });

  window.addEventListener('resize', function () {
    if (!el.root) return;
    place(el.root.offsetLeft, el.root.offsetTop);
  });

  chrome.runtime.onMessage.addListener(function (msg) {
    if (!msg || !msg.type) return;
    if (msg.type === 'state') {
      state.snapshot = msg.state;
      if (msg.settings) state.settings = msg.settings;
      render();
    } else if (msg.type === 'settings') {
      state.settings = msg.settings;
      render();
    }
  });

  /* ------------------------------------------------------------------ */
  /* boot                                                               */
  /* ------------------------------------------------------------------ */

  function boot() {
    state.repo = G.repoFromPath(location.pathname);
    state.cat = G.categoryForPath(location.pathname);
    buildWidget();
    reportActivity();
    render();

    // Ask for the current numbers right away.
    try {
      chrome.runtime.sendMessage({ type: 'getState' }, function (res) {
        void chrome.runtime.lastError;
        if (res && res.state) {
          state.snapshot = res.state;
          state.settings = res.settings || null;
          render();
        }
      });
    } catch (e) {}

    // Report cadence. This is a *claim* to be active; the SW decides whether
    // it is credible and owns all duration math.
    state.timer = setInterval(function () {
      reportActivity();
      render();
    }, PING_MS);

    // Slow path: title changes after pjax (document.title updates late)
    setInterval(function () {
      if (document.title !== state.title) {
        state.title = document.title;
        refreshLocation();
      }
    }, 2000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
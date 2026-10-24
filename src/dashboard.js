/**
 * GitHub Time Insight - dashboard logic
 *
 * Loaded by dashboard.html as a classic script (no type=module), so the page
 * still works when the service worker is asleep. All data is read straight
 * from chrome.storage.local; the SW is never required to render.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'gti_data_v1';
  var SETTINGS_KEY = 'gti_settings_v1';
  var CATS = ['code', 'pr', 'issue', 'search', 'other'];

  var DEFAULT_SETTINGS = {
    dailyBudget: 90,
    strictVisible: true,
    showWidget: true,
    lang: '',
    weekStart: 1,
    paused: false
  };

  var state = {
    data: null,
    settings: null,
    trendRange: 7,
    lang: 'en'
  };

  /* ---------------- tiny DOM helpers ---------------- */

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(sel));
  }
  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function assign(target) {
    for (var i = 1; i < arguments.length; i++) {
      var src = arguments[i] || {};
      for (var k in src) {
        if (Object.prototype.hasOwnProperty.call(src, k)) target[k] = src[k];
      }
    }
    return target;
  }

  /* ---------------- date helpers ---------------- */

  function pad2(n) { return (n < 10 ? '0' : '') + n; }

  function dayKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function startOfDay(d) {
    var x = new Date(d.getTime());
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    x.setHours(0, 0, 0, 0);
    return x;
  }

  function round(n) { return Math.round(n || 0); }

  function fmtDur(min) {
    min = round(min);
    if (min <= 0) return state.lang === 'zh' ? '0 分钟' : '0m';
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (state.lang === 'zh') {
      if (h <= 0) return m + ' 分钟';
      return h + ' 小时' + (m ? ' ' + m + ' 分' : '');
    }
    if (h <= 0) return m + 'm';
    return h + 'h' + (m ? ' ' + m + 'm' : '');
  }

  function fmtShort(min) {
    min = round(min);
    if (min <= 0) return '0';
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (h <= 0) return m + 'm';
    if (!m) return h + 'h';
    return h + 'h' + m;
  }

  function fmtDate(d) {
    if (state.lang === 'zh') return (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日';
    var M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
      'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return M[d.getMonth()] + ' ' + d.getDate();
  }

  function relTime(ts) {
    var diff = Date.now() - (ts || 0);
    if (diff < 0) diff = 0;
    var mins = Math.floor(diff / 60000);
    var zh = state.lang === 'zh';
    if (mins < 1) return zh ? '刚刚' : 'just now';
    if (mins < 60) return zh ? mins + ' 分钟前' : mins + 'm ago';
    var hours = Math.floor(mins / 60);
    if (hours < 24) return zh ? hours + ' 小时前' : hours + 'h ago';
    var days = Math.floor(hours / 24);
    if (days < 30) return zh ? days + ' 天前' : days + 'd ago';
    return zh ? Math.floor(days / 30) + ' 个月前' : Math.floor(days / 30) + 'mo ago';
  }

  /* ---------------- bilingual strings ---------------- */

  var STR = {
    en: {
      docTitle: 'GitHub Time Insight',
      settings: 'Settings',
      refresh: 'Refresh',
      heroToday: 'Today',
      heroWeekAvg: 'Daily average (7d)',
      heroStreak: 'Day streak',
      headlineToday: 'You spent {dur} on GitHub today, mostly in {repo}.',
      headlineTodayNoRepo: 'You spent {dur} on GitHub today.',
      headlineYesterday: 'Nothing yet today. Yesterday you spent {dur}.',
      headlineQuiet: 'Nothing yet today. Yesterday was quiet too.',
      headlineNone: 'No data yet. Browse GitHub for a while and come back.',
      qualityExact: 'Every minute here was measured precisely.',
      qualityMixed: '{pct}% of this was estimated, not measured.',
      qualitySuspect: '{dur} looked suspicious and was left out.',
      qualityNone: 'Nothing measured yet.',
      secCats: 'What you did',
      secHeatmap: 'Last 12 weeks',
      secHours: 'When you work',
      secTrend: 'Trend',
      secRepos: 'Top repositories',
      secResume: 'Pick up where you left off',
      secData: 'Take your data with you',
      catCode: 'Reading code',
      catPr: 'Pull requests',
      catIssue: 'Issues',
      catSearch: 'Search',
      catOther: 'Other',
      less: 'less',
      more: 'more',
      trend7: '7 days',
      trend30: '30 days',
      trendAvg: 'avg {dur}/day',
      noRepos: 'No repositories recorded yet.',
      noResume: 'Nothing to resume - every visit so far was plain browsing.',
      exportJson: 'Export JSON',
      exportMd: 'Weekly report (.md)',
      importJson: 'Import JSON',
      exportNote: 'This file is yours. Until you asked for it, it never left this browser.',
      imported: 'Imported.',
      importFail: 'That file does not look like a Time Insight export.',
      exported: 'Saved to your downloads.',
      settingsTitle: 'Settings',
      fieldBudget: 'Daily budget (minutes)',
      fieldBudgetHint: 'The widget turns yellow at 80% and red once you pass it.',
      fieldStrict: 'Only count while the tab is visible',
      fieldWidget: 'Show the floating widget on GitHub',
      fieldLang: 'Language',
      fieldWeekStart: 'Week starts on',
      langAuto: 'Follow browser',
      weekMon: 'Monday',
      weekSun: 'Sunday',
      save: 'Save',
      saved: 'Saved.',
      clear: 'Clear all data',
      clearConfirm: 'Delete every minute you have recorded? This cannot be undone.',
      cleared: 'All data cleared.',
      pruneNote: 'Anything older than 90 days is removed automatically. Nothing is ever uploaded.',
      footer: 'Everything is stored locally in this browser. No account, no server, no tracking.',
      version: 'v1.0.0',
      emptyNoData: 'No data yet.'
    },
    zh: {
      docTitle: 'GitHub 时间洞察',
      settings: '设置',
      refresh: '刷新',
      heroToday: '今天',
      heroWeekAvg: '日均（近 7 天）',
      heroStreak: '连续天数',
      headlineToday: '今天你在 GitHub 上待了 {dur}，主要在 {repo}。',
      headlineTodayNoRepo: '今天你在 GitHub 上待了 {dur}。',
      headlineYesterday: '今天还没有开始。昨天你待了 {dur}。',
      headlineQuiet: '今天还没有开始。昨天也很安静。',
      headlineNone: '还没有数据。先去 GitHub 逛一会儿，再回来看看。',
      qualityExact: '这里的每一分钟，都是真实测出来的。',
      qualityMixed: '其中 {pct}% 是估算，不是实测。',
      qualitySuspect: '{dur} 看起来不可信，已经剔除。',
      qualityNone: '还没有测到任何时间。',
      secCats: '你都在做什么',
      secHeatmap: '最近 12 周',
      secHours: '你什么时候在',
      secTrend: '趋势',
      secRepos: '常去的仓库',
      secResume: '从这里接着读',
      secData: '把数据带走',
      catCode: '读代码',
      catPr: 'Pull Request',
      catIssue: 'Issue',
      catSearch: '搜索',
      catOther: '其他',
      less: '少',
      more: '多',
      trend7: '近 7 天',
      trend30: '近 30 天',
      trendAvg: '日均 {dur}',
      noRepos: '还没有记录到仓库。',
      noResume: '没有可以接着读的页面——目前都是普通浏览。',
      exportJson: '导出 JSON',
      exportMd: '周报（.md）',
      importJson: '导入 JSON',
      exportNote: '这个文件属于你。在你主动要它之前，它从没离开过这个浏览器。',
      imported: '已导入。',
      importFail: '这个文件看起来不是 Time Insight 的导出。',
      exported: '已保存到下载目录。',
      settingsTitle: '设置',
      fieldBudget: '每日预算（分钟）',
      fieldBudgetHint: '到 80% 挂件变黄，超了就变红。',
      fieldStrict: '只在标签页可见时计时',
      fieldWidget: '在 GitHub 上显示悬浮挂件',
      fieldLang: '语言',
      fieldWeekStart: '一周从哪天开始',
      langAuto: '跟随浏览器',
      weekMon: '周一',
      weekSun: '周日',
      save: '保存',
      saved: '已保存。',
      clear: '清空全部数据',
      clearConfirm: '要删除记录下的每一分钟吗？这一步不能撤回。',
      cleared: '数据已清空。',
      pruneNote: '超过 90 天的数据会自动删除。任何内容都不会上传。',
      footer: '所有数据都只存在这个浏览器里。不要账号，不要服务器，不做追踪。',
      version: 'v1.0.0',
      emptyNoData: '还没有数据。'
    }
  };

  function t(key, vars) {
    var pack = STR[state.lang] || STR.en;
    var s = pack[key];
    if (s == null) s = STR.en[key] != null ? STR.en[key] : key;
    if (vars) {
      s = s.replace(/\{(\w+)\}/g, function (m, name) {
        return vars[name] != null ? String(vars[name]) : m;
      });
    }
    return s;
  }

  function detectLang() {
    var want = (state.settings && state.settings.lang) || '';
    if (want === 'zh' || want === 'en') return want;
    return /^zh/i.test(navigator.language || 'en') ? 'zh' : 'en';
  }

  /* ---------------- storage ---------------- */

  function normalizeData(raw) {
    var out = { version: 1, days: {}, lastRead: [], updatedAt: 0 };
    if (!raw || typeof raw !== 'object') return out;
    if (raw.days && typeof raw.days === 'object') out.days = raw.days;
    if (Array.isArray(raw.lastRead)) out.lastRead = raw.lastRead.slice(0, 200);
    out.updatedAt = raw.updatedAt || 0;
    return out;
  }

  function load() {
    return new Promise(function (resolve) {
      chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], function (res) {
        state.data = normalizeData(res && res[STORAGE_KEY]);
        state.settings = assign({}, DEFAULT_SETTINGS, (res && res[SETTINGS_KEY]) || {});
        state.lang = detectLang();
        resolve();
      });
    });
  }

  function saveData(data) {
    var p = {};
    p[STORAGE_KEY] = data;
    chrome.storage.local.set(p);
  }

  /* ---------------- derived numbers ---------------- */

  function emptyCats() {
    return { code: 0, pr: 0, issue: 0, search: 0, other: 0 };
  }

  function dayOf(key) {
    var d = state.data && state.data.days ? state.data.days[key] : null;
    if (!d) return null;
    return {
      total: d.total || 0,
      cats: assign(emptyCats(), d.cats || {}),
      hours: Array.isArray(d.hours) && d.hours.length === 24
        ? d.hours.slice() : new Array(24).fill(0),
      repos: d.repos && typeof d.repos === 'object' ? d.repos : {},
      quality: assign({ exact: 0, estimated: 0, suspect: 0 }, d.quality || {})
    };
  }

  // Minutes of a day: prefer the hour buckets, fall back to the category sum.
  function bucketTotal(day) {
    if (!day) return 0;
    var i, sum = 0;
    for (i = 0; i < 24; i++) sum += day.hours[i] || 0;
    if (sum > 0) return sum;
    for (i = 0; i < CATS.length; i++) sum += day.cats[CATS[i]] || 0;
    return sum > 0 ? sum : (day.total || 0);
  }

  function seriesForDays(n) {
    var out = [];
    var today = startOfDay(new Date());
    for (var i = n - 1; i >= 0; i--) {
      var d = addDays(today, -i);
      var day = dayOf(dayKey(d));
      out.push({ date: d, minutes: bucketTotal(day), day: day });
    }
    return out;
  }

  function totalForDays(n) {
    var s = seriesForDays(n), sum = 0;
    for (var i = 0; i < s.length; i++) sum += s[i].minutes;
    return sum;
  }

  function activeDaysForDays(n) {
    var s = seriesForDays(n), c = 0;
    for (var i = 0; i < s.length; i++) if (s[i].minutes > 0) c++;
    return c;
  }

  function streakDays() {
    var cursor = startOfDay(new Date());
    // Start from yesterday when today is still empty, so a quiet morning
    // does not look like a broken streak.
    if (bucketTotal(dayOf(dayKey(cursor))) <= 0) cursor = addDays(cursor, -1);
    var streak = 0;
    for (var i = 0; i < 400; i++) {
      if (bucketTotal(dayOf(dayKey(cursor))) > 0) {
        streak++;
        cursor = addDays(cursor, -1);
      } else break;
    }
    return streak;
  }

  function categoryTotals(n) {
    var s = seriesForDays(n), out = emptyCats();
    for (var i = 0; i < s.length; i++) {
      var day = s[i].day;
      if (!day) continue;
      for (var c = 0; c < CATS.length; c++) out[CATS[c]] += day.cats[CATS[c]] || 0;
    }
    return out;
  }

  function topRepoOf(day) {
    if (!day) return null;
    var best = null, bestMin = 0;
    for (var name in day.repos) {
      if (!Object.prototype.hasOwnProperty.call(day.repos, name)) continue;
      var m = day.repos[name] || 0;
      if (m > bestMin) { bestMin = m; best = name; }
    }
    return best ? { name: best, minutes: bestMin } : null;
  }

  function totalQuality(n) {
    var s = seriesForDays(n);
    var out = { exact: 0, estimated: 0, suspect: 0 };
    for (var i = 0; i < s.length; i++) {
      var q = s[i].day && s[i].day.quality;
      if (!q) continue;
      out.exact += q.exact || 0;
      out.estimated += q.estimated || 0;
      out.suspect += q.suspect || 0;
    }
    return out;
  }

  function repoTotals(n) {
    var s = seriesForDays(n), map = {};
    for (var i = 0; i < s.length; i++) {
      var repos = (s[i].day && s[i].day.repos) || {};
      for (var name in repos) {
        if (!Object.prototype.hasOwnProperty.call(repos, name)) continue;
        map[name] = (map[name] || 0) + (repos[name] || 0);
      }
    }
    var list = [];
    for (var k in map) {
      if (!Object.prototype.hasOwnProperty.call(map, k)) continue;
      list.push({ name: k, minutes: map[k] });
    }
    list.sort(function (a, b) { return b.minutes - a.minutes; });
    return list;
  }

  function hasAnyData() {
    if (!state.data || !state.data.days) return false;
    for (var k in state.data.days) {
      if (!Object.prototype.hasOwnProperty.call(state.data.days, k)) continue;
      if (bucketTotal(dayOf(k)) > 0) return true;
    }
    return false;
  }

  /* ---------------- renderers ---------------- */

  var CAT_COLOR = {
    code: 'var(--accent)', pr: 'var(--purple)', issue: 'var(--blue)',
    search: 'var(--warn)', other: 'var(--fg-dim)'
  };
  var CAT_KEY = {
    code: 'catCode', pr: 'catPr', issue: 'catIssue',
    search: 'catSearch', other: 'catOther'
  };

  function setText(sel, txt) {
    var n = $(sel);
    if (n) n.textContent = txt;
  }

  function renderHero() {
    var today = startOfDay(new Date());
    var todayDay = dayOf(dayKey(today));
    var todayMin = bucketTotal(todayDay);

    var weekActive = activeDaysForDays(7);
    var weekAvg = weekActive > 0 ? totalForDays(7) / weekActive : 0;

    setText('#stat-today', fmtDur(todayMin));
    setText('#stat-week-avg', fmtDur(weekAvg));
    setText('#stat-streak', String(streakDays()));

    var headline;
    if (!hasAnyData()) {
      headline = t('headlineNone');
    } else if (todayMin > 0) {
      var top = topRepoOf(todayDay);
      headline = top
        ? t('headlineToday', { dur: fmtDur(todayMin), repo: top.name })
        : t('headlineTodayNoRepo', { dur: fmtDur(todayMin) });
    } else {
      var yMin = bucketTotal(dayOf(dayKey(addDays(today, -1))));
      headline = yMin > 0
        ? t('headlineYesterday', { dur: fmtDur(yMin) })
        : t('headlineQuiet');
    }
    setText('#headline', headline);

    // Say it plainly when a number is an estimate instead of a measurement.
    var q = totalQuality(7);
    var qTotal = q.exact + q.estimated + q.suspect;
    var qualityText;
    if (qTotal <= 0) {
      qualityText = t('qualityNone');
    } else if (q.estimated === 0 && q.suspect === 0) {
      qualityText = t('qualityExact');
    } else if (q.estimated === 0) {
      qualityText = t('qualitySuspect', { dur: fmtDur(q.suspect) });
    } else {
      var measured = q.exact + q.estimated;
      var pct = measured > 0 ? Math.round(q.estimated / measured * 100) : 0;
      qualityText = t('qualityMixed', { pct: pct });
    }
    setText('#quality-text', qualityText);
  }

  function renderCats() {
    var box = $('#cats');
    if (!box) return;
    box.textContent = '';

    var totals = categoryTotals(30), sum = 0, i;
    for (i = 0; i < CATS.length; i++) sum += totals[CATS[i]];
    if (sum <= 0) {
      box.appendChild(el('p', 'empty', t('emptyNoData')));
      return;
    }

    var order = CATS.slice().sort(function (a, b) { return totals[b] - totals[a]; });
    for (i = 0; i < order.length; i++) {
      var key = order[i], min = totals[key];
      if (min <= 0) continue;
      var pct = Math.round(min / sum * 100);

      var row = el('div', 'cat-row');
      row.appendChild(el('span', 'cat-name', t(CAT_KEY[key])));

      var track = el('div', 'track');
      var fill = el('div', 'fill');
      fill.style.width = Math.max(2, pct) + '%';
      fill.style.background = CAT_COLOR[key];
      track.appendChild(fill);
      row.appendChild(track);

      row.appendChild(el('span', 'cat-val', fmtShort(min) + ' · ' + pct + '%'));
      box.appendChild(row);
    }
  }

  function renderHeatmap() {
    var box = $('#heatmap');
    if (!box) return;
    box.textContent = '';

    var weeks = 12;
    var today = startOfDay(new Date());
    var weekStart = state.settings.weekStart === 0 ? 0 : 1;
    var offset = (today.getDay() - weekStart + 7) % 7;
    var lastCol = addDays(today, -offset);
    var firstCol = addDays(lastCol, -(weeks - 1) * 7);

    var cells = [], max = 0, i;
    for (i = 0; i < weeks * 7; i++) {
      var d = addDays(firstCol, Math.floor(i / 7) * 7 + (i % 7));
      var minutes = bucketTotal(dayOf(dayKey(d)));
      if (d.getTime() > today.getTime()) minutes = -1;
      if (minutes > max) max = minutes;
      cells.push({ date: d, minutes: minutes });
    }

    for (i = 0; i < cells.length; i++) {
      var c = cells[i];
      var node = el('div', 'cell');
      if (c.minutes < 0) {
        node.className += ' future';
      } else if (c.minutes === 0) {
        node.setAttribute('data-l', '0');
        node.title = fmtDate(c.date) + ' · 0';
      } else {
        var ratio = max > 0 ? c.minutes / max : 0;
        node.setAttribute('data-l', String(
          ratio <= 0.25 ? 1 : ratio <= 0.5 ? 2 : ratio <= 0.75 ? 3 : 4
        ));
        node.title = fmtDate(c.date) + ' · ' + fmtDur(c.minutes);
      }
      box.appendChild(node);
    }
  }

  function renderHours() {
    var box = $('#hours');
    if (!box) return;
    box.textContent = '';

    var s = seriesForDays(30);
    var buckets = new Array(24).fill(0);
    var i, h;
    for (i = 0; i < s.length; i++) {
      var day = s[i].day;
      if (!day) continue;
      for (h = 0; h < 24; h++) buckets[h] += day.hours[h] || 0;
    }

    var peak = 0;
    for (h = 0; h < 24; h++) if (buckets[h] > peak) peak = buckets[h];

    for (h = 0; h < 24; h++) {
      var bar = el('div', 'hour');
      var stem = el('div', 'stem');
      stem.style.height = (peak > 0
        ? Math.max(2, Math.round(buckets[h] / peak * 100))
        : 2) + '%';
      if (peak > 0 && buckets[h] === peak) stem.className += ' peak';
      bar.appendChild(stem);
      bar.title = pad2(h) + ':00 · ' + fmtDur(buckets[h]);
      box.appendChild(bar);
    }
  }

  function renderTrend() {
    var box = $('#trend');
    if (!box) return;
    box.textContent = '';

    var s = seriesForDays(state.trendRange);
    var max = 0, i;
    for (i = 0; i < s.length; i++) if (s[i].minutes > max) max = s[i].minutes;

    var budget = Math.max(1, Number(state.settings.dailyBudget) || 90);

    for (i = 0; i < s.length; i++) {
      var item = s[i];
      var col = el('div', 'bar');
      var stem = el('div', 'stem');
      stem.style.height = (max > 0
        ? Math.max(2, Math.round(item.minutes / max * 100))
        : 2) + '%';
      if (item.minutes > budget) stem.className += ' over';
      col.appendChild(stem);
      col.title = fmtDate(item.date) + ' · ' + fmtDur(item.minutes);
      box.appendChild(col);
    }

    var axis = $('#trend-axis');
    if (axis) {
      axis.textContent = '';
      [s[0], s[Math.floor(s.length / 2)], s[s.length - 1]].forEach(function (item) {
        if (item) axis.appendChild(el('span', '', fmtDate(item.date)));
      });
    }

    var sum = 0, active = 0;
    for (i = 0; i < s.length; i++) {
      sum += s[i].minutes;
      if (s[i].minutes > 0) active++;
    }
    setText('#trend-avg', t('trendAvg', {
      dur: fmtDur(active > 0 ? sum / active : 0)
    }));

    $$('#trend-seg button').forEach(function (btn) {
      if (Number(btn.getAttribute('data-range')) === state.trendRange) {
        btn.classList.add('on');
      } else {
        btn.classList.remove('on');
      }
    });
  }

  function renderRepos() {
    var box = $('#repos');
    if (!box) return;
    box.textContent = '';

    var list = repoTotals(30).slice(0, 10);
    if (!list.length) {
      box.appendChild(el('p', 'empty', t('noRepos')));
      return;
    }

    var max = list[0].minutes || 1;
    list.forEach(function (item, idx) {
      var row = el('div', 'repo-row');
      row.appendChild(el('span', 'repo-rank', String(idx + 1)));
      row.appendChild(el('span', 'repo-name', item.name));
      row.appendChild(el('span', 'repo-min', fmtShort(item.minutes)));

      var barRow = el('div', 'repo-bar-row');
      var bar = el('div', 'repo-bar');
      var fill = el('div', 'repo-fill');
      fill.style.width = Math.max(3, Math.round(item.minutes / max * 100)) + '%';
      bar.appendChild(fill);
      barRow.appendChild(bar);
      row.appendChild(barRow);

      box.appendChild(row);
    });
  }

  function renderResume() {
    var box = $('#resume');
    if (!box) return;
    box.textContent = '';

    var cutoff = Date.now() - 60 * 24 * 3600 * 1000;
    var items = ((state.data && state.data.lastRead) || [])
      .filter(function (x) { return x && x.ts && x.ts >= cutoff; })
      .sort(function (a, b) { return b.ts - a.ts; })
      .slice(0, 6);

    if (!items.length) {
      box.appendChild(el('p', 'empty', t('noResume')));
      return;
    }

    items.forEach(function (item) {
      var a = document.createElement('a');
      a.className = 'resume-item';
      a.href = item.url || '#';
      a.target = '_blank';
      a.rel = 'noopener';
      a.appendChild(el('span', 'resume-title',
        item.title || item.repo || item.url || ''));
      a.appendChild(el('span', 'resume-meta', item.repo
        ? item.repo + ' · ' + relTime(item.ts)
        : relTime(item.ts)));
      box.appendChild(a);
    });
  }

  function renderLabels() {
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';
    document.title = t('docTitle');

    var pairs = [
      ['#lbl-settings', 'settings'],
      ['#lbl-refresh', 'refresh'],
      ['#lbl-hero-today', 'heroToday'],
      ['#lbl-hero-week-avg', 'heroWeekAvg'],
      ['#lbl-hero-streak', 'heroStreak'],
      ['#lbl-cats', 'secCats'],
      ['#lbl-heatmap', 'secHeatmap'],
      ['#lbl-hours', 'secHours'],
      ['#lbl-trend', 'secTrend'],
      ['#lbl-repos', 'secRepos'],
      ['#lbl-resume', 'secResume'],
      ['#lbl-data', 'secData'],
      ['#lbl-less', 'less'],
      ['#lbl-more', 'more'],
      ['#lbl-trend-7', 'trend7'],
      ['#lbl-trend-30', 'trend30'],
      ['#lbl-export-json', 'exportJson'],
      ['#lbl-export-md', 'exportMd'],
      ['#lbl-import', 'importJson'],
      ['#lbl-export-note', 'exportNote'],
      ['#lbl-settings-title', 'settingsTitle'],
      ['#lbl-field-budget', 'fieldBudget'],
      ['#lbl-field-budget-hint', 'fieldBudgetHint'],
      ['#lbl-field-strict', 'fieldStrict'],
      ['#lbl-field-widget', 'fieldWidget'],
      ['#lbl-field-lang', 'fieldLang'],
      ['#lbl-field-week', 'fieldWeekStart'],
      ['#lbl-save', 'save'],
      ['#lbl-clear', 'clear'],
      ['#lbl-prune', 'pruneNote'],
      ['#lbl-footer', 'footer'],
      ['#lbl-version', 'version']
    ];

    pairs.forEach(function (pair) {
      var node = $(pair[0]);
      if (node) node.textContent = t(pair[1]);
    });

    var langSel = $('#set-lang');
    if (langSel) {
      langSel.textContent = '';
      [['', t('langAuto')], ['zh', '中文'], ['en', 'English']].forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o[0];
        opt.textContent = o[1];
        langSel.appendChild(opt);
      });
      langSel.value = state.settings.lang || '';
    }

    var weekSel = $('#set-week');
    if (weekSel) {
      weekSel.textContent = '';
      [['1', t('weekMon')], ['0', t('weekSun')]].forEach(function (o) {
        var opt = document.createElement('option');
        opt.value = o[0];
        opt.textContent = o[1];
        weekSel.appendChild(opt);
      });
      weekSel.value = String(state.settings.weekStart === 0 ? 0 : 1);
    }
  }

  function renderAll() {
    state.lang = detectLang();
    renderLabels();
    renderHero();
    renderCats();
    renderHeatmap();
    renderHours();
    renderTrend();
    renderRepos();
    renderResume();
    fillSettings();
  }

  /* ---------------- toast ---------------- */

  var toastTimer = null;
  function toast(msg) {
    var box = $('#toast');
    if (!box) return;
    box.textContent = msg;
    box.classList.add('show');
    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { box.classList.remove('show'); }, 2200);
  }

  /* ---------------- settings drawer ---------------- */

  function fillSettings() {
    var budget = $('#set-budget');
    if (budget) budget.value = String(state.settings.dailyBudget || 90);
    var strict = $('#set-strict');
    if (strict) strict.checked = !!state.settings.strictVisible;
    var widget = $('#set-widget');
    if (widget) widget.checked = !!state.settings.showWidget;
    var lang = $('#set-lang');
    if (lang) lang.value = state.settings.lang || '';
    var week = $('#set-week');
    if (week) week.value = String(state.settings.weekStart === 0 ? 0 : 1);
  }

  function openDrawer() {
    fillSettings();
    var d = $('#drawer');
    if (d) d.classList.add('open');
  }

  function closeDrawer() {
    var d = $('#drawer');
    if (d) d.classList.remove('open');
  }

  function readSettingsForm() {
    var budget = parseInt(($('#set-budget') || {}).value, 10);
    return {
      dailyBudget: isFinite(budget) && budget > 0 ? Math.min(1440, budget) : 90,
      strictVisible: !!($('#set-strict') || {}).checked,
      showWidget: !!($('#set-widget') || {}).checked,
      lang: ($('#set-lang') || {}).value || '',
      weekStart: Number(($('#set-week') || {}).value) === 0 ? 0 : 1,
      paused: !!state.settings.paused
    };
  }

  function saveSettings() {
    state.settings = readSettingsForm();
    var p = {};
    p[SETTINGS_KEY] = state.settings;
    chrome.storage.local.set(p, function () {
      // Let the service worker know so the widget picks up the change now.
      try {
        chrome.runtime.sendMessage({ type: 'setSettings', settings: state.settings });
      } catch (e) { /* SW asleep - it will read storage on next wake */ }
      toast(t('saved'));
      closeDrawer();
      renderAll();
    });
  }

  function clearData() {
    if (!confirm(t('clearConfirm'))) return;
    saveData({ version: 1, days: {}, lastRead: [], updatedAt: Date.now() });
    state.data = normalizeData(null);
    toast(t('cleared'));
    closeDrawer();
    renderAll();
  }

  /* ---------------- export / import ---------------- */

  function download(filename, text, mime) {
    var blob = new Blob([text], { type: mime || 'text/plain;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function stamp() {
    var d = new Date();
    return d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate());
  }

  function exportJson() {
    var payload = {
      app: 'github-time-insight',
      schema: 1,
      exportedAt: new Date().toISOString(),
      settings: state.settings,
      data: state.data
    };
    download('gti-' + stamp() + '.json',
      JSON.stringify(payload, null, 2), 'application/json');
    toast(t('exported'));
  }

  function buildWeeklyMarkdown() {
    var zh = state.lang === 'zh';
    var s = seriesForDays(7);
    var total = 0, active = 0, i, j;
    for (i = 0; i < s.length; i++) {
      total += s[i].minutes;
      if (s[i].minutes > 0) active++;
    }
    var avg = active > 0 ? total / active : 0;
    var cats = categoryTotals(7);
    var repos = repoTotals(7).slice(0, 5);
    var q = totalQuality(7);

    var from = fmtDate(s[0].date);
    var to = fmtDate(s[s.length - 1].date);
    var lines = [];

    lines.push(zh ? '# GitHub 时间周报' : '# GitHub Time Insight — Weekly Report');
    lines.push('');
    lines.push('`' + from + ' — ' + to + '`');
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(zh ? '## 这一周' : '## This week');
    lines.push('');
    lines.push(zh
      ? '这一周，你在 GitHub 上停留了 **' + fmtDur(total) + '**，' +
        '其中 ' + active + ' 天有记录，活跃日均 **' + fmtDur(avg) + '**。'
      : 'You spent **' + fmtDur(total) + '** on GitHub this week, ' +
        'across ' + active + ' active day(s), averaging **' + fmtDur(avg) + '** per active day.');
    lines.push('');

    lines.push(zh ? '## 时间花在哪' : '## Where the time went');
    lines.push('');
    lines.push(zh ? '| 类型 | 时长 | 占比 |' : '| Category | Time | Share |');
    lines.push('| --- | ---: | ---: |');
    var catSum = 0;
    for (i = 0; i < CATS.length; i++) catSum += cats[CATS[i]];
    for (i = 0; i < CATS.length; i++) {
      var key = CATS[i];
      if (cats[key] <= 0) continue;
      var share = catSum > 0 ? Math.round(cats[key] / catSum * 100) : 0;
      lines.push('| ' + t(CAT_KEY[key]) + ' | ' + fmtDur(cats[key]) + ' | ' + share + '% |');
    }
    lines.push('');

    if (repos.length) {
      lines.push(zh ? '## 常去的仓库' : '## Most visited repositories');
      lines.push('');
      for (i = 0; i < repos.length; i++) {
        lines.push((i + 1) + '. **' + repos[i].name + '** — ' + fmtDur(repos[i].minutes));
      }
      lines.push('');
    }

    lines.push(zh ? '## 关于这些数字' : '## About these numbers');
    lines.push('');
    if (q.exact + q.estimated + q.suspect <= 0) {
      lines.push(zh ? '这一周还没有测到任何数据。' : 'Nothing was measured this week.');
    } else if (q.estimated === 0 && q.suspect === 0) {
      lines.push(zh
        ? '上面的每一分钟都是实测。没有估算，也没有补齐。'
        : 'Every minute above was measured. Nothing was estimated or filled in.');
    } else {
      var measured = q.exact + q.estimated;
      var pct = measured > 0 ? Math.round(q.estimated / measured * 100) : 0;
      lines.push(zh
        ? '- 实测：**' + fmtDur(q.exact) + '**\n- 估算：**' + fmtDur(q.estimated) +
          '**（占 ' + pct + '%）\n- 剔除：**' + fmtDur(q.suspect) + '**（看起来不可信）'
        : '- Measured: **' + fmtDur(q.exact) + '**\n- Estimated: **' + fmtDur(q.estimated) +
          '** (' + pct + '%)\n- Discarded: **' + fmtDur(q.suspect) + '** (looked implausible)');
    }
    lines.push('');
    lines.push('---');
    lines.push('');
    lines.push(zh
      ? '> 这份周报由 GitHub Time Insight 生成。数据只存在你自己的浏览器里，从未上传。'
      : '> Generated by GitHub Time Insight. The data lives only in your own browser and was never uploaded.');
    lines.push('');
    return lines.join('\n');
  }

  function exportMarkdown() {
    download('gti-week-' + stamp() + '.md',
      buildWeeklyMarkdown(), 'text/markdown;charset=utf-8');
    toast(t('exported'));
  }

  function importJson(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var parsed = null;
      try { parsed = JSON.parse(String(reader.result)); } catch (e) { parsed = null; }
      if (!parsed || parsed.app !== 'github-time-insight' || !parsed.data) {
        toast(t('importFail'));
        return;
      }
      state.data = normalizeData(parsed.data);
      saveData(state.data);
      if (parsed.settings && typeof parsed.settings === 'object') {
        state.settings = assign({}, DEFAULT_SETTINGS, parsed.settings);
        var p = {};
        p[SETTINGS_KEY] = state.settings;
        chrome.storage.local.set(p);
      }
      toast(t('imported'));
      renderAll();
    };
    reader.onerror = function () { toast(t('importFail')); };
    reader.readAsText(file);
  }

  /* ---------------- wiring ---------------- */

  function bind() {
    var on = function (sel, ev, fn) {
      var n = $(sel);
      if (n) n.addEventListener(ev, fn);
    };

    on('#btn-refresh', 'click', function () {
      load().then(function () {
        renderAll();
        toast(state.lang === 'zh' ? '已刷新。' : 'Refreshed.');
      });
    });
    on('#btn-settings', 'click', openDrawer);
    on('#btn-close-drawer', 'click', closeDrawer);
    on('#drawer-mask', 'click', closeDrawer);
    on('#btn-save', 'click', saveSettings);
    on('#btn-clear', 'click', clearData);

    on('#btn-export-json', 'click', exportJson);
    on('#btn-export-md', 'click', exportMarkdown);
    on('#btn-import', 'click', function () {
      var f = $('#file-import');
      if (f) f.click();
    });
    on('#file-import', 'change', function (e) {
      importJson(e.target.files && e.target.files[0]);
      e.target.value = '';
    });

    $$('#trend-seg button').forEach(function (btn) {
      btn.addEventListener('click', function () {
        state.trendRange = Number(btn.getAttribute('data-range')) === 30 ? 30 : 7;
        renderTrend();
      });
    });

    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeDrawer();
    });

    // Keep the dashboard live when the SW writes new numbers.
    try {
      chrome.storage.onChanged.addListener(function (changes, area) {
        if (area !== 'local') return;
        if (changes[STORAGE_KEY]) {
          state.data = normalizeData(changes[STORAGE_KEY].newValue);
          renderHero();
          renderCats();
          renderHeatmap();
          renderHours();
          renderTrend();
          renderRepos();
          renderResume();
        }
        if (changes[SETTINGS_KEY]) {
          state.settings = assign({}, DEFAULT_SETTINGS,
            changes[SETTINGS_KEY].newValue || {});
          renderAll();
        }
      });
    } catch (e) { /* storage events unavailable - manual refresh still works */ }
  }

  load().then(function () {
    bind();
    renderAll();
  });

})();

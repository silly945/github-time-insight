/**
 * GitHub Time Insight - popup logic
 *
 * Read-only. Reads chrome.storage.local directly so the popup still works
 * when the service worker is asleep. Never writes analytics anywhere.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'gti_data_v1';
  var SETTINGS_KEY = 'gti_settings_v1';

  var STR = {
    en: {
      minToday: 'min today',
      weekTotal: '7d total',
      streak: 'day streak',
      open: 'Open dashboard',
      noData: 'Nothing yet. Open GitHub and it starts counting.',
      today: 'Today you spent {v} on GitHub.',
      yesterday: 'Nothing yet today. Yesterday: {v}.',
      quiet: 'Nothing tracked in the last 7 days.'
    },
    zh: {
      minToday: '今日（分钟）',
      weekTotal: '近 7 天',
      streak: '连续天数',
      open: '打开完整面板',
      noData: '还没有数据。打开 GitHub，它就开始算了。',
      today: '今天你在 GitHub 上花了 {v}。',
      yesterday: '今天还没有记录。昨天是 {v}。',
      quiet: '最近 7 天没有记录。'
    }
  };

  var state = {
    lang: 'en',
    data: null,
    settings: null
  };

  function $(sel) { return document.querySelector(sel); }

  function pad2(n) { return n < 10 ? '0' + n : String(n); }

  function dayKey(d) {
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }

  function addDays(d, n) {
    var x = new Date(d.getTime());
    x.setDate(x.getDate() + n);
    return x;
  }

  function fmtDur(min) {
    min = Math.round(min || 0);
    if (min < 1) return state.lang === 'zh' ? '不到 1 分钟' : 'under a minute';
    if (min < 60) return state.lang === 'zh' ? min + ' 分钟' : min + 'm';
    var h = Math.floor(min / 60);
    var m = min % 60;
    if (state.lang === 'zh') return m ? h + ' 小时 ' + m + ' 分' : h + ' 小时';
    return m ? h + 'h ' + m + 'm' : h + 'h';
  }

  function t(key, vars) {
    var table = STR[state.lang] || STR.en;
    var s = table[key] || STR.en[key] || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) {
        s = s.split('{' + k + '}').join(String(vars[k]));
      });
    }
    return s;
  }

  function detectLang() {
    var want = state.settings && state.settings.lang;
    if (want === 'zh' || want === 'en') return want;
    var nav = (navigator.language || 'en');
    return /^zh/i.test(nav) ? 'zh' : 'en';
  }

  function bucketTotal(day) {
    if (!day) return 0;
    var i;
    if (day.hours && day.hours.length) {
      var sum = 0;
      for (i = 0; i < day.hours.length; i++) sum += Number(day.hours[i]) || 0;
      if (sum > 0) return sum;
    }
    if (day.cats) {
      var s2 = 0;
      Object.keys(day.cats).forEach(function (k) {
        s2 += Number(day.cats[k]) || 0;
      });
      if (s2 > 0) return s2;
    }
    return Number(day.total) || 0;
  }

  function totalForDays(n) {
    var out = 0;
    var today = new Date();
    for (var i = 0; i < n; i++) {
      var key = dayKey(addDays(today, -i));
      out += bucketTotal(state.data.days[key]);
    }
    return out;
  }

  function streakDays() {
    var days = state.data.days || {};
    var cursor = new Date();
    if (bucketTotal(days[dayKey(cursor)]) <= 0) {
      cursor = addDays(cursor, -1);
    }
    var count = 0;
    for (var i = 0; i < 400; i++) {
      if (bucketTotal(days[dayKey(cursor)]) > 0) {
        count++;
        cursor = addDays(cursor, -1);
      } else {
        break;
      }
    }
    return count;
  }

  function render() {
    state.lang = detectLang();
    document.documentElement.lang = state.lang === 'zh' ? 'zh-CN' : 'en';

    var days = state.data.days || {};
    var todayMin = bucketTotal(days[dayKey(new Date())]);
    var yMin = bucketTotal(days[dayKey(addDays(new Date(), -1))]);

    $('#today').textContent = String(Math.round(todayMin));
    $('#today-unit').textContent = t('minToday');
    $('#week').textContent = fmtDur(totalForDays(7));
    $('#week-label').textContent = t('weekTotal');
    $('#streak').textContent = String(streakDays());
    $('#streak-label').textContent = t('streak');
    $('#open').textContent = t('open');

    var head = '';
    if (!state.data || !Object.keys(days).length) {
      head = t('noData');
    } else if (todayMin > 0) {
      head = t('today', { v: fmtDur(todayMin) });
    } else if (yMin > 0) {
      head = t('yesterday', { v: fmtDur(yMin) });
    } else {
      head = t('quiet');
    }
    $('#headline').textContent = head;
  }

  function bind() {
    var btn = $('#open');
    if (!btn) return;
    btn.addEventListener('click', function () {
      try {
        chrome.runtime.openOptionsPage();
      } catch (e) {
        chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard.html') });
      }
      window.close();
    });
  }

  function load() {
    return new Promise(function (resolve) {
      try {
        chrome.storage.local.get([STORAGE_KEY, SETTINGS_KEY], function (res) {
          state.data = (res && res[STORAGE_KEY]) || { version: 1, days: {}, lastRead: [], updatedAt: 0 };
          if (!state.data.days) state.data.days = {};
          state.settings = (res && res[SETTINGS_KEY]) || {};
          resolve();
        });
      } catch (e) {
        state.data = { version: 1, days: {}, lastRead: [], updatedAt: 0 };
        state.settings = {};
        resolve();
      }
    });
  }

  bind();
  load().then(render);
})();
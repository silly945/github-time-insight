/**
 * GitHub Time Insight - service worker
 *
 * The accuracy story, because this is the part that usually breaks:
 *
 *  - An MV3 service worker is killed after ~30s idle, so setInterval is not
 *    reliable. We use chrome.alarms at 1 minute granularity instead.
 *  - Content scripts in a backgrounded tab get throttled/frozen. So the tab
 *    keeps reporting what it *thinks* is happening, and the SW reconciles
 *    against wall-clock time. If two beats are more than 1 minute apart but
 *    less than IDLE_TIMEOUT_MS, the gap is credited as "estimated".
 *  - Gaps larger than IDLE_TIMEOUT_MS are dropped (user was gone).
 *  - Any single continuous session longer than MAX_SESSION_MS is credited as
 *    "suspect" rather than "exact" so the dashboard can be honest about it.
 *
 * Nothing leaves the device.
 */

import {
  STORAGE_KEY,
  SETTINGS_KEY,
  ALARM_HEARTBEAT,
  ALARM_BUDGET,
  ALARM_WRAPUP,
  DEFAULT_SETTINGS,
  IDLE_TIMEOUT_MS,
  MAX_SESSION_MS,
  HEARTBEAT_MINUTES,
  dayKey,
  fmtMinutes,
  uiLang,
} from './shared.mjs';

import {
  loadData,
  saveData,
  recordMinutes,
  markSession,
  setLastRead,
  prune,
  todayTotal,
} from './store.mjs';

/* ------------------------------------------------------------------ state */

/**
 * In-memory session for the active tab. Lost when the SW is killed, which is
 * fine: every beat is persisted, and a lost session just means the next beat
 * starts a new one (counted as a new session, no time is invented).
 */
let session = {
  tabId: -1,
  url: '',
  category: 'other',
  repo: null,
  startedAt: 0,
  lastBeatAt: 0,
  exactMinutes: 0,
  suspectFlagged: false,
};

/* --------------------------------------------------------------- settings */

async function getSettings() {
  const got = await chrome.storage.local.get(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(got[SETTINGS_KEY] || {}) };
}

async function saveSettings(patch) {
  const cur = await getSettings();
  const next = { ...cur, ...patch, focusModeUntil: cur.focusModeUntil };
  if ('focusModeUntil' in patch) next.focusModeUntil = patch.focusModeUntil;
  await chrome.storage.local.set({ [SETTINGS_KEY]: next });
  return next;
}

/* ------------------------------------------------------------------ alarms */

async function ensureAlarms() {
  const settings = await getSettings();

  const hb = await chrome.alarms.get(ALARM_HEARTBEAT);
  if (!hb) {
    chrome.alarms.create(ALARM_HEARTBEAT, { periodInMinutes: HEARTBEAT_MINUTES });
  }

  const budget = await chrome.alarms.get(ALARM_BUDGET);
  if (!budget) {
    chrome.alarms.create(ALARM_BUDGET, { periodInMinutes: 5 });
  }

  const wrap = await chrome.alarms.get(ALARM_WRAPUP);
  if (wrap) await chrome.alarms.clear(ALARM_WRAPUP);
  if (settings.wrapUpEnabled && /^\d{1,2}:\d{2}$/.test(settings.wrapUpTime)) {
    const [hh, mm] = settings.wrapUpTime.split(':').map(Number);
    const when = new Date();
    when.setHours(hh, mm, 0, 0);
    if (when.getTime() <= Date.now()) when.setDate(when.getDate() + 1);
    chrome.alarms.create(ALARM_WRAPUP, {
      when: when.getTime(),
      periodInMinutes: 24 * 60,
    });
  }
}

chrome.runtime.onInstalled.addListener(() => {
  (async () => {
    await ensureAlarms();
    const data = await loadData();
    await saveData(data);
  })();
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
});

/* ------------------------------------------------------------- heartbeat */

/**
 * Credit the minutes that elapsed since the last beat for the current session,
 * then reschedule. Called by the alarm.
 */
async function tick() {
  const settings = await getSettings();
  if (!settings.enabled) return;

  const now = Date.now();
  if (!session.startedAt || !session.lastBeatAt) return;

  const gapMs = now - session.lastBeatAt;
  if (gapMs <= 0) {
    session.lastBeatAt = now;
    return;
  }

  // user has been gone far too long -> end the session, credit nothing
  if (gapMs > IDLE_TIMEOUT_MS) {
    endSession('idle');
    return;
  }

  // how many whole minutes can we honestly credit?
  const minutes = Math.floor(gapMs / 60000);
  if (minutes <= 0) {
    session.lastBeatAt = now;
    return;
  }

  // exact if the beat arrived about when expected (+-10s tolerance)
  const lateness = Math.abs(gapMs - 60000);
  let quality = lateness < 10000 ? 'exact' : 'estimated';

  const runningMs = now - session.startedAt;
  if (runningMs > MAX_SESSION_MS) {
    quality = 'suspect';
    session.suspectFlagged = true;
  }

  const data = await loadData();
  for (let i = 0; i < minutes; i++) {
    const ts = session.lastBeatAt + i * 60000;
    recordMinutes(data, ts, session.category, session.repo, quality, 1);
  }
  if (prune(data)) {
    /* pruned old buckets */
  }
  if (session.repo) {
    setLastRead(data, session.repo, session.url, '', now);
  }
  await saveData(data);

  if (quality === 'exact') session.exactMinutes += minutes;
  session.lastBeatAt = now;

  broadcastState();
}

function endSession(reason) {
  session = {
    tabId: -1,
    url: '',
    category: 'other',
    repo: null,
    startedAt: 0,
    lastBeatAt: 0,
    exactMinutes: 0,
    suspectFlagged: false,
  };
  broadcastState(reason);
}

/* --------------------------------------------------------- budget checks */

async function checkBudget() {
  const settings = await getSettings();
  if (!settings.enabled || !settings.budgetAlarm) return;

  const data = await loadData();
  const total = todayTotal(data);
  const budget = settings.dailyBudgetMinutes || 0;
  if (budget <= 0) return;

  const lang = uiLang(settings.language);
  const ratio = total / budget;

  if (ratio >= 1 && !data.meta.budgetNotifiedFor) {
    data.meta.budgetNotifiedFor = dayKey();
    await saveData(data);
    notify(
      lang === 'zh' ? '今日 GitHub 时间已超预算' : 'Daily GitHub budget exceeded',
      lang === 'zh'
        ? `今天已经 ${fmtMinutes(total, lang)} 了，预算是 ${fmtMinutes(budget, lang)}。要不要收工？`
        : `You are at ${fmtMinutes(total, lang)} today, budget was ${fmtMinutes(budget, lang)}.`
    );
  } else if (ratio >= 0.8 && data.meta.budgetWarnedFor !== dayKey()) {
    data.meta.budgetWarnedFor = dayKey();
    await saveData(data);
    notify(
      lang === 'zh' ? '快到今日预算了' : 'Approaching daily budget',
      lang === 'zh'
        ? `已用 ${fmtMinutes(total, lang)} / ${fmtMinutes(budget, lang)}，还剩 ${fmtMinutes(budget - total, lang)}。`
        : `${fmtMinutes(total, lang)} of ${fmtMinutes(budget, lang)} used.`
    );
  }
}

function notify(title, message) {
  try {
    chrome.notifications.create({
      type: 'basic',
      iconUrl: chrome.runtime.getURL('icons/icon128.png'),
      title,
      message,
    });
  } catch (e) {
    // notifications permission is not declared in 1.0.0; ignore quietly
  }
}

/* ------------------------------------------------------------ wrap-up nag */

async function wrapUp() {
  const settings = await getSettings();
  if (!settings.wrapUpEnabled) return;

  const data = await loadData();
  const total = todayTotal(data);
  if (total < 10) return; // nothing worth nagging about

  const lang = uiLang(settings.language);
  notify(
    lang === 'zh' ? '该收工了' : 'Time to wrap up',
    lang === 'zh'
      ? `今天在 GitHub 上 ${fmtMinutes(total, lang)}。生成一份今日小结？`
      : `${fmtMinutes(total, lang)} on GitHub today. Want a summary?`
  );
}

/* ------------------------------------------------------------------ alarms */

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === ALARM_HEARTBEAT) tick();
  else if (alarm.name === ALARM_BUDGET) checkBudget();
  else if (alarm.name === ALARM_WRAPUP) wrapUp();
});

/* ------------------------------------------------------------- messaging */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  (async () => {
    try {
      switch (msg && msg.type) {
        /* --- content script tells us what it is looking at --- */
        case 'activity': {
          const settings = await getSettings();
          if (!settings.enabled) return sendResponse({ ok: true, paused: true });

          const now = Date.now();
          const tabId = sender.tab ? sender.tab.id : -1;
          const isSameView =
            session.tabId === tabId &&
            session.url === msg.url &&
            now - session.lastBeatAt < IDLE_TIMEOUT_MS;

          if (!isSameView) {
            // brand new session (first beat, tab switch, or url change)
            const fresh = session.startedAt === 0 || now - session.lastBeatAt >= IDLE_TIMEOUT_MS;
            session = {
              tabId,
              url: msg.url,
              category: msg.category || 'other',
              repo: msg.repo || null,
              startedAt: fresh ? now : session.startedAt,
              lastBeatAt: now,
              exactMinutes: 0,
              suspectFlagged: false,
            };
            if (fresh) {
              const data = await loadData();
              markSession(data, now);
              if (msg.repo) setLastRead(data, msg.repo, msg.url, msg.title || '', now);
              await saveData(data);
            }
          } else {
            session.lastBeatAt = now;
            session.category = msg.category || session.category;
            session.repo = msg.repo || session.repo;
          }

          const data = await loadData();
          sendResponse({
            ok: true,
            todayMinutes: todayTotal(data),
            settings: await getSettings(),
            sessionMinutes: Math.round((now - session.startedAt) / 60000),
          });
          return;
        }

        /* --- content script goes away --- */
        case 'leave': {
          const now = Date.now();
          if (session.lastBeatAt && now - session.lastBeatAt < IDLE_TIMEOUT_MS) {
            // credit the trailing partial minute
            const data = await loadData();
            recordMinutes(data, session.lastBeatAt, session.category, session.repo, 'estimated', 1);
            await saveData(data);
          }
          endSession('leave');
          sendResponse({ ok: true });
          return;
        }

        case 'getState': {
          const data = await loadData();
          const settings = await getSettings();
          sendResponse({
            ok: true,
            data,
            settings,
            todayMinutes: todayTotal(data),
            lang: uiLang(settings.language),
          });
          return;
        }

        case 'getSettings': {
          sendResponse({ ok: true, settings: await getSettings() });
          return;
        }

        case 'setSettings': {
          const merged = await saveSettings(msg.patch || {});
          if ('wrapUpTime' in (msg.patch || {}) || 'wrapUpEnabled' in (msg.patch || {})) {
            await ensureAlarms();
          }
          sendResponse({ ok: true, settings: merged });
          return;
        }

        case 'clearData': {
          await chrome.storage.local.set({
            [STORAGE_KEY]: {
              version: 1,
              days: {},
              lastRead: {},
              meta: { installedAt: Date.now(), lastPrune: dayKey() },
            },
          });
          endSession('clear');
          sendResponse({ ok: true });
          return;
        }

        case 'importData': {
          const incoming = msg.data;
          if (!incoming || typeof incoming !== 'object' || !incoming.days) {
            sendResponse({ ok: false, error: 'bad payload' });
            return;
          }
          await chrome.storage.local.set({ [STORAGE_KEY]: incoming });
          sendResponse({ ok: true });
          return;
        }

        case 'startFocus': {
          const settings = await getSettings();
          const until = Date.now() + (msg.minutes || settings.focusMinutes) * 60000;
          await saveSettings({ focusModeUntil: until });
          sendResponse({ ok: true, until });
          return;
        }

        case 'stopFocus': {
          await saveSettings({ focusModeUntil: 0 });
          sendResponse({ ok: true });
          return;
        }

        default:
          sendResponse({ ok: false, error: 'unknown message' });
      }
    } catch (err) {
      sendResponse({ ok: false, error: String(err && err.message ? err.message : err) });
    }
  })();
  return true; // keep the channel open for the async response
});

/* ------------------------------------------------------------- broadcast */

/** Push a small state snapshot to every github.com tab so the widget updates. */
async function broadcastState(reason) {
  const data = await loadData();
  const settings = await getSettings();
  const payload = {
    type: 'state',
    reason: reason || 'tick',
    todayMinutes: todayTotal(data),
    budgetMinutes: settings.dailyBudgetMinutes,
    focusModeUntil: settings.focusModeUntil,
    enabled: settings.enabled,
  };
  const tabs = await chrome.tabs.query({ url: 'https://github.com/*' });
  for (const t of tabs) {
    chrome.tabs.sendMessage(t.id, payload).catch(() => {});
  }
}

/* --------------------------------------------------------------- tab life */

chrome.tabs.onRemoved.addListener((tabId) => {
  if (session.tabId === tabId) endSession('tab-closed');
});

chrome.tabs.onActivated.addListener((info) => {
  if (session.tabId !== -1 && session.tabId !== info.tabId) {
    // the previous tab is no longer visible; the SW will not get its beat
    // anymore, so credit it now and close the session.
    (async () => {
      const now = Date.now();
      if (session.lastBeatAt && now - session.lastBeatAt < IDLE_TIMEOUT_MS) {
        const data = await loadData();
        const gap = Math.floor((now - session.lastBeatAt) / 60000);
        for (let i = 0; i < gap; i++) {
          recordMinutes(data, session.lastBeatAt + i * 60000, session.category, session.repo, 'estimated', 1);
        }
        await saveData(data);
      }
      endSession('tab-switch');
    })();
  }
});

chrome.runtime.onStartup.addListener(() => {
  ensureAlarms();
});

// make sure alarms exist as soon as the worker wakes up for any reason
ensureAlarms();
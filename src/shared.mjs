/**
 * GitHub Time Insight - shared helpers (ES module)
 *
 * Used by the service worker and the dashboard page. Mirrors src/shared.js
 * (which is the classic-script copy for content scripts). Keep them in sync.
 *
 * No external dependencies.
 */

/* ---------------------------------------------------------------- keys */

export const STORAGE_KEY = 'gti_data_v1';
export const SETTINGS_KEY = 'gti_settings_v1';

/* ------------------------------------------------------------- timings */

export const IDLE_TIMEOUT_MS = 2 * 60 * 1000;
export const MAX_SESSION_MS = 30 * 60 * 1000;
export const HEARTBEAT_MINUTES = 1;
export const RETENTION_DAYS = 90;

export const ALARM_HEARTBEAT = 'gti_heartbeat';
export const ALARM_BUDGET = 'gti_budget_check';
export const ALARM_WRAPUP = 'gti_wrapup';

/* ---------------------------------------------------------- categories */

export const CATEGORIES = [
  { id: 'code', test: (p) => /\/(blob|tree|raw|commit|commits|compare|blame)(\/|$)/.test(p) },
  { id: 'pr', test: (p) => /\/(pull|pulls)(\/|$)/.test(p) },
  { id: 'issue', test: (p) => /\/(issues|discussions)(\/|$)/.test(p) },
  { id: 'search', test: (p) => /^\/search(\/|\?|$)/.test(p) },
  { id: 'other', test: () => true },
];

export const CATEGORY_IDS = ['code', 'pr', 'issue', 'search', 'other'];

export const CATEGORY_LABELS = {
  code: { zh: '读代码', en: 'Reading code' },
  pr: { zh: '看 PR', en: 'Pull requests' },
  issue: { zh: '看 Issue', en: 'Issues' },
  search: { zh: '搜索', en: 'Searching' },
  other: { zh: '闲逛', en: 'Browsing' },
};

/* ------------------------------------------------------------- parsing */

const RESERVED_OWNERS = [
  'about', 'account', 'apps', 'codespaces', 'collections', 'contact',
  'copilot', 'dashboard', 'events', 'explore', 'features', 'issues',
  'join', 'login', 'logout', 'marketplace', 'new', 'notifications',
  'organizations', 'pricing', 'pulls', 'search', 'security', 'settings',
  'site', 'sponsors', 'topics', 'trending', 'watching',
];

/** Extract "owner/repo" from a github.com pathname, or null. */
export function repoFromPath(pathname) {
  if (!pathname) return null;
  const parts = String(pathname).split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const owner = parts[0];
  if (RESERVED_OWNERS.includes(owner.toLowerCase())) return null;
  const name = parts[1].replace(/\.git$/, '');
  if (!owner || !name) return null;
  return `${owner}/${name}`;
}

/** Classify a github.com pathname into a category id. */
export function categoryForPath(pathname) {
  const p = pathname || '/';
  for (const c of CATEGORIES) {
    if (c.test(p)) return c.id;
  }
  return 'other';
}

/* ---------------------------------------------------------------- time */

/** Local YYYY-MM-DD for a timestamp. */
export function dayKey(ts) {
  const d = new Date(typeof ts === 'number' ? ts : Date.now());
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

/** Add n days to a YYYY-MM-DD key. */
export function shiftDay(key, n) {
  const [y, m, d] = key.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return dayKey(dt.getTime());
}

/** Whole-day difference between two day keys (b - a). */
export function dayDiff(a, b) {
  const pa = a.split('-').map(Number);
  const pb = b.split('-').map(Number);
  return Math.round(
    (Date.UTC(pb[0], pb[1] - 1, pb[2]) - Date.UTC(pa[0], pa[1] - 1, pa[2])) / 86400000
  );
}

/** Minutes -> "2h 15m" / "45m" */
export function fmtMinutes(min, lang) {
  const m = Math.max(0, Math.round(min || 0));
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (lang === 'zh') {
    if (h && r) return `${h} 小时 ${r} 分`;
    if (h) return `${h} 小时`;
    return `${r} 分`;
  }
  if (h && r) return `${h}h ${r}m`;
  if (h) return `${h}h`;
  return `${r}m`;
}

/** Seconds -> mm:ss / h:mm:ss */
export function fmtClock(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  if (h) return `${h}:${String(m).padStart(2, '0')}:${String(ss).padStart(2, '0')}`;
  return `${m}:${String(ss).padStart(2, '0')}`;
}

/* ------------------------------------------------------------ settings */

export const DEFAULT_SETTINGS = {
  enabled: true,
  dailyBudgetMinutes: 180,
  budgetAlarm: true,
  focusMinutes: 45,
  focusCategory: 'code',
  wrapUpTime: '23:30',
  wrapUpEnabled: true,
  language: 'auto',
  theme: 'auto',
  widgetEnabled: true,
  widgetCollapsed: false,
  focusModeUntil: 0,
};

/** Detect UI language: 'zh' or 'en'. */
export function uiLang(setting) {
  if (setting === 'zh' || setting === 'en') return setting;
  const nav = (typeof navigator !== 'undefined' && navigator.language) || 'en';
  return /^zh/i.test(nav) ? 'zh' : 'en';
}
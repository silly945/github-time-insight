/**
 * GitHub Time Insight - data store
 *
 * All bookkeeping lives in chrome.storage.local under a single key so that
 * writes are atomic and we never half-update two structures.
 *
 * Shape of the stored object:
 * {
 *   version: 1,
 *   days: {
 *     "2026-10-25": {
 *       cats:  { code: 42, pr: 8, issue: 3, search: 1, other: 12 },   // minutes
 *       repos: { "facebook/react": 26, "vuejs/core": 9 },             // minutes
 *       hours: [0,0,0, ... 24 slots],                                 // minutes
 *       quality: { exact: 40, estimated: 20, suspect: 6 },            // minutes
 *       sessions: 12,
 *       first: 1714000000000,
 *       last:  1714010000000
 *     }
 *   },
 *   lastRead: { "owner/repo": { path: "/owner/repo/blob/main/src/x.js", title: "...", at: 1714 } },
 *   meta: { installedAt: 1714, lastPrune: "2026-10-25" }
 * }
 */

import { STORAGE_KEY, RETENTION_DAYS, dayKey, shiftDay, dayDiff, CATEGORY_IDS } from './shared.mjs';

const EMPTY_DATA = () => ({
  version: 1,
  days: {},
  lastRead: {},
  meta: { installedAt: Date.now(), lastPrune: dayKey() },
});

/** Read the whole dataset. */
export async function loadData() {
  const got = await chrome.storage.local.get(STORAGE_KEY);
  const data = got[STORAGE_KEY];
  if (!data || typeof data !== 'object' || !data.days) return EMPTY_DATA();
  // defensive defaults for forward/backward compatibility
  data.lastRead = data.lastRead || {};
  data.meta = data.meta || { installedAt: Date.now(), lastPrune: dayKey() };
  return data;
}

/** Persist the whole dataset. */
export async function saveData(data) {
  await chrome.storage.local.set({ [STORAGE_KEY]: data });
}

/** Get (creating if needed) one day bucket inside `data`. */
export function dayBucket(data, key) {
  let b = data.days[key];
  if (!b) {
    b = {
      cats: { code: 0, pr: 0, issue: 0, search: 0, other: 0 },
      repos: {},
      hours: new Array(24).fill(0),
      quality: { exact: 0, estimated: 0, suspect: 0 },
      sessions: 0,
      first: 0,
      last: 0,
    };
    data.days[key] = b;
  }
  // heal partially-shaped buckets
  for (const id of CATEGORY_IDS) if (typeof b.cats[id] !== 'number') b.cats[id] = 0;
  if (!Array.isArray(b.hours) || b.hours.length !== 24) {
    const fixed = new Array(24).fill(0);
    if (Array.isArray(b.hours)) for (let i = 0; i < 24; i++) fixed[i] = b.hours[i] || 0;
    b.hours = fixed;
  }
  b.repos = b.repos || {};
  b.quality = b.quality || { exact: 0, estimated: 0, suspect: 0 };
  return b;
}

/**
 * Record one minute of activity.
 * @param {object} data
 * @param {number} ts       timestamp of the activity
 * @param {string} category one of CATEGORY_IDS
 * @param {string|null} repo "owner/repo"
 * @param {'exact'|'estimated'|'suspect'} quality
 * @param {number} minutes  how many minutes to credit (usually 1, more after recovery)
 */
export function recordMinutes(data, ts, category, repo, quality, minutes = 1) {
  const key = dayKey(ts);
  const b = dayBucket(data, key);
  const cat = CATEGORY_IDS.includes(category) ? category : 'other';

  b.cats[cat] += minutes;
  if (repo) b.repos[repo] = (b.repos[repo] || 0) + minutes;

  const hour = new Date(ts).getHours();
  b.hours[hour] += minutes;

  const q = quality === 'estimated' || quality === 'suspect' ? quality : 'exact';
  b.quality[q] += minutes;

  if (!b.first || ts < b.first) b.first = ts;
  if (ts > b.last) b.last = ts;

  return b;
}

/** Count a new session (called when a session starts, not on every beat). */
export function markSession(data, ts) {
  dayBucket(data, dayKey(ts)).sessions += 1;
}

/** Remember what the user was reading in a repo, for "resume where you left off". */
export function setLastRead(data, repo, path, title, ts = Date.now()) {
  if (!repo) return;
  data.lastRead[repo] = { path, title: title || '', at: ts };
}

/** Drop day buckets older than the retention window, and stale lastRead entries. */
export function prune(data, now = Date.now()) {
  const today = dayKey(now);
  if (data.meta.lastPrune === today) return false;

  const cutoff = shiftDay(today, -RETENTION_DAYS);
  let changed = false;
  for (const key of Object.keys(data.days)) {
    if (dayDiff(key, cutoff) > 0) {
      delete data.days[key];
      changed = true;
    }
  }

  // forget resume points untouched for 60 days
  for (const [repo, entry] of Object.entries(data.lastRead)) {
    if (!entry || !entry.at || dayDiff(dayKey(entry.at), today) > 60) {
      delete data.lastRead[repo];
      changed = true;
    }
  }

  data.meta.lastPrune = today;
  return true;
}

/** Total minutes for one day bucket. */
export function bucketTotal(b) {
  if (!b || !b.cats) return 0;
  let sum = 0;
  for (const id of CATEGORY_IDS) sum += b.cats[id] || 0;
  return sum;
}

/** Aggregate a range of days (inclusive keys) into a summary. */
export function aggregate(data, fromKey, toKey) {
  const out = {
    total: 0,
    cats: { code: 0, pr: 0, issue: 0, search: 0, other: 0 },
    repos: {},
    hours: new Array(24).fill(0),
    quality: { exact: 0, estimated: 0, suspect: 0 },
    sessions: 0,
    activeDays: 0,
    days: {},
  };

  for (const [key, b] of Object.entries(data.days)) {
    if (dayDiff(fromKey, key) < 0 || dayDiff(key, toKey) < 0) continue;
    const t = bucketTotal(b);
    out.days[key] = t;
    if (t > 0) out.activeDays += 1;
    out.total += t;
    out.sessions += b.sessions || 0;
    for (const id of CATEGORY_IDS) out.cats[id] += b.cats[id] || 0;
    for (const [repo, m] of Object.entries(b.repos || {})) out.repos[repo] = (out.repos[repo] || 0) + m;
    for (let h = 0; h < 24; h++) out.hours[h] += (b.hours && b.hours[h]) || 0;
    for (const q of ['exact', 'estimated', 'suspect']) out.quality[q] += (b.quality && b.quality[q]) || 0;
  }
  return out;
}

/** Top N repos from an aggregate. */
export function topRepos(agg, n = 10) {
  return Object.entries(agg.repos)
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([repo, minutes]) => ({ repo, minutes }));
}

/** Busiest hour (0-23) of an aggregate, or null. */
export function peakHour(agg) {
  let best = -1;
  let bestVal = 0;
  agg.hours.forEach((v, i) => {
    if (v > bestVal) {
      bestVal = v;
      best = i;
    }
  });
  return bestVal > 0 ? best : null;
}

/** Today's total minutes. */
export function todayTotal(data, now = Date.now()) {
  const b = data.days[dayKey(now)];
  return bucketTotal(b);
}

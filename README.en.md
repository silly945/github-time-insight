# GitHub Time Insight

> Every day we spend a little life on GitHub —
> and no one ever tells us where that time went.

---

It doesn't push you, it doesn't grade you, and it never connects out.
It just sits quietly in the corner and counts your days for you.

---

## The questions it answers

- How many hours of this month did I actually spend on GitHub?
- How much of that was writing code, and how much was reading someone else's?
- Which repositories held me the longest?
- What were the last ten pages I opened?
- Did I really sit on the same page for forty minutes one afternoon?

It draws these numbers into a quiet timeline. What you open is not a
report — it is a piece of your own life.

---

## How to install

### Option 1 — Load as an unpacked extension (recommended)

1. Download this repository and unzip it anywhere.
2. Open Chrome, Edge, or Kiwi Browser and go to `chrome://extensions/`.
3. Turn on **Developer mode** in the top-right corner.
4. Click **Load unpacked** and choose the unzipped folder.
5. Done. Open GitHub — a small dot appears in the bottom-right corner.

### Option 2 — Packaged install

On the extensions page, click **Pack extension**, then drag the resulting
`.crx` file into a browser window.

---

## That small dot

Most of the time it is just a quiet dot showing today's total.
Tap it, and it unfolds into a card: today, this week, this month.
Hold it for three seconds and it folds away, quiet again.

---

## About your data, honestly

- **Everything stays in your own browser.** No server ever sees it.
- **No account.** No sign-up, no login.
- **No upload.** Not a single line leaves your device.
- **No tracking.** No beacons, no analytics, no third-party scripts.
- **GitHub only.** The permission is limited to `github.com`; it cannot see other sites.
- **It forgets.** Records older than 90 days fade away quietly.

One honest detail: when the page tells it the time, it is exact.
When the page can't, it is an estimate — and it says so.

---

## What it does not do

- It does not score you.
- It has no leaderboard and compares you with no one.
- It never tells you to try harder.
- It does not decide what counts as worthy time.
- It does not connect out. It never phones home.

---

## A little technical note

- **Manifest V3**, vanilla JavaScript, zero dependencies, under 150 KB in total.
- Permissions kept to the bone: `storage`, `tabs`, `alarms` — nothing more.
- Time is split by category: code / pull requests / issues / search / other.
- Idle detection after two minutes; a single session caps at thirty minutes;
  calibrated once a minute.
- When the tab goes to the background, or sixty seconds pass without input,
  counting stops.
- The dashboard and popup read storage directly — they never depend on the
  service worker being alive.

### How time is measured

| Constant | Value | Meaning |
|---|---|---|
| `IDLE_TIMEOUT_MS` | 2 minutes | No input for this long ends the session |
| `MAX_SESSION_MS` | 30 minutes | A single session is capped here |
| `HEARTBEAT_MINUTES` | 1 minute | How often time is flushed to storage |
| `RETENTION_DAYS` | 90 days | Records older than this are pruned |
| `PING_MS` | 15 seconds | How often the content script reports in |
| `LONG_PRESS_MS` | 3 seconds | Hold the dot this long to collapse it |

### Storage layout

```
gti_data_v      { version: 1, days: { "YYYY-MM-DD": day }, lastRead: [...], updatedAt }
gti_settings_v  user preferences
gti_widget_pos  widget position (per-tab UI state)
gti_widget_collapsed  collapsed flag
```

Each `day` looks like:

```json
{
  "total": 7200000,
  "cats": { "code": 3600000, "pr": 900000, "issue": 600000, "search": 300000, "other": 1800000 },
  "hours": [0, 0, 0, 0, 0, 0, 0, 0, 0, 120000, ...],
  "repos": { "owner/repo": 1800000 },
  "quality": { "exact": 6000000, "estimated": 1200000, "suspect": 0 }
}
```

---

## Development

No build step. No bundler. Edit a file, reload the extension.

```bash
# syntax check every script
for f in src/*.js src/*.mjs; do node --check "$f"; done

# validate the manifest
python3 -c "import json;json.load(open('manifest.json'))"
```

A GitHub Actions workflow runs both of these on every push and pull request,
plus a few extra guards (file size budget, forbidden permission names,
accidental key files).

---

## Why it exists

Because time is the most honest thing we have,
and the thing we are worst at keeping books on.

---

## License

MIT

---

<p align="center">
  <i>Counting your days, quietly.</i>
</p>
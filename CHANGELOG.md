# Changelog
## 1.0.4

### Fixed
- **The widget's dashboard button now actually opens the dashboard.** Clicking `☰` sent an `openDashboard` message that the service worker had no handler for, and the fallback `window.open()` call from a content script is silently blocked by mobile Chromium (Kiwi included), so the tap did nothing at all. The service worker now handles `openDashboard` and opens the page with `chrome.tabs.create()`, which works on every platform.
- **The collapsed dot can be tapped to expand again.** `pointerdown` used to call `setPointerCapture()` on the widget root unconditionally, which stole the `click` from the dot while collapsed. Pointer capture is now only taken on the card header (the real drag handle).
- **The dashboard no longer loads `shared.js` from outside the extension's graph.** `src/shared.js` was missing from `web_accessible_resources`, so `src/dashboard.html` and `src/popup.html` could fail to define `window.GTI` and start up broken depending on how the page was opened. It is now declared.

### Changed
- Removed the duplicated `openDashboard` send plus the dead `window.open()` fallback in `content.js`; there is now a single message and a single owner of the tab-opening logic.

## 1.0.3

### Fixed
- **Ghost day buckets are now cleaned up automatically.** Early builds derived the day key from a `0`/`NaN` timestamp, which left a `1970-01-01` bucket behind. It contained a handful of minutes that belonged to no real day, inflating all-time totals on the dashboard (today's numbers and the widget were unaffected). `loadData()` and `prune()` now drop any bucket whose key is not a plausible date (year < 2000, or malformed), and the fix is idempotent so it runs once and never touches real days.

### Changed
- Day buckets are only ever removed when their key cannot be a real date; every bucket from 2000 onwards is preserved, including ones with `first === 0`.

## 1.0.2

### Fixed
- **Clicking the widget's hamburger menu dead-ended on `ERR_BLOCKED_BY_CLIENT`.** The menu button navigates to `kiwi-extension://<id>/src/dashboard.html`, but the manifest never declared that asset. Under MV3, Chromium blocks any navigation to an extension resource that is not listed in `web_accessible_resources`, so the page rendered "This page has been blocked by Chromium" instead of opening the dashboard.

### Changed
- Declared `web_accessible_resources` covering the dashboard, the popup and the icon set for `https://github.com/*`.

## 1.0.1

### Fixed
- **The dot could not be brought back after collapsing.** Three separate causes:
  - `onDown()` called `e.preventDefault()`, which suppressed the subsequent `click` on the dot.
  - The dot had no `click` listener at all — collapsing could only be undone by holding it for 3 seconds.
  - `collapsed` was persisted to `chrome.storage`, so the folded state survived reloads.
- `dayKey()` no longer emits a bogus `1970-01-01` bucket when the timestamp is 0 / NaN.

### Changed
- A single click on the dot now expands the card. Long-press is kept as a fallback and shortened from 3000 ms to 800 ms.
- The dot now has a 2.4 s breathing animation and a centre highlight, with a `prefers-reduced-motion` fallback.
- Removed a malformed selector in `content.css` (`#gti-widget.gti-dot`, missing space) that could match the folded container.

### Docs
- README (zh + en) now matches the new interaction: a single click collapses the card; `LONG_PRESS_MS` documented as 0.8 s instead of 3 s.
### Art
- New mascot: **Clockling** — an original round-headed sprite whose body is a clock face, with a needle antenna and a time-budget ring. Four moods: happy / warn / over / sleepy. Drawn procedurally, 100% original, no third-party trademarks involved.

## 1.0.0
- First release.
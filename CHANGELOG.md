# Changelog

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
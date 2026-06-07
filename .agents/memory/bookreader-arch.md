---
name: BookReader architecture
description: Key implementation decisions for BookReader.jsx — scroll tracking, flipbook performance, mobile mode, and CSS bug history.
---

## Scroll tracking
- `.text-reader` div is the actual scrollable container (has `overflow: auto; flex: 1`)
- Attach `ref={textReaderRef}` and `onScroll={handlePlainScroll}` to `.text-reader`, NOT to `.plain-reader`
- `.plain-reader` has no overflow — putting `onScroll` there won't fire
- `handlePlainScroll` reads `e.target.scrollTop / (scrollHeight - clientHeight)` for progress
- Scroll position persisted to `localStorage` keyed as `reader-scroll-{bookId}-ch{chapterIndex}`
- Restoration uses `textReaderRef.current.scrollTop = saved` in a `setTimeout(80ms)` after chapter change

**Why:** `.plain-reader` has `max-width: 72ch` and no overflow, so scroll events only fire on its parent `.text-reader`.

## FlipPage memoization
- `FlipPage = memo(function FlipPage(...))` is defined OUTSIDE `BookReader` at module level
- This prevents all pages re-rendering when `currentPage` state changes (only the flipbook navigation state changes)
- react-pageflip accepts memo-wrapped components as children (renders to a div)

**Why:** Without memoization, every page flip causes all N pages to re-render, which is very slow for large books.

## Mobile detection
- `isMobile` is `useState` (not const) — reactive via resize listener (`passive: true`)
- `plainMode` initialized with `window.innerWidth < 768` check OR saved localStorage value
- `useEffect` on resize: `if (mobile) setPlainMode(true)` — mobile always uses scroll mode
- FlipBook has `mobileScrollSupport={false}` and `useMouseEvents` always true (flipbook only appears in desktop mode now)

**Why:** HTMLFlipBook on mobile has poor touch performance and scroll conflicts.

## Performance settings
- `flippingTime={280}` (was 400ms) — faster, snappier page flip
- `maxShadowOpacity={0.18}` (was 0.25) — cheaper shadow rendering
- `maxCharsPerPage = 2400` (was 1800) — fewer pages = fewer DOM nodes
- Auto-switch to plain mode at `paginatedText.length > 120` pages
- `.plain-reader-para` has `content-visibility: auto; contain-intrinsic-size: 0 3em` — browser skips off-screen paragraphs

## CSS bugs fixed (BookReader.css)
1. `.audio-container p { ... }` — was missing closing `}`
2. `.description-section p { }` then orphaned `font-size: 1rem; }` — merged into one-liner
3. `.archive-info p { }` had deeply nested selectors (`.control-btn.fullscreen-btn`, `.detailed-info`, `.info-detail-group`, etc.) — moved them out as top-level rules

**Why:** These bugs caused parse errors that silently broke the info-section styles and detailed-info layout.

## Progress bar
- In flip mode: `progressPercent = currentPage / paginatedText.length * 100`
- In plain/scroll mode: `progressPercent = scrollProgress` (tracked from textReaderRef scroll)
- Both are displayed in the same `reading-progress-bar-fill` component

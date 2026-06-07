---
name: Frontend design system
description: CSS tokens, dark mode implementation, and key design decisions for the PublicDomain Library redesign
---

## Design tokens (in src/styles/index.css)
All colors, shadows, and transitions live in `:root` as CSS custom properties. Dark mode overrides them in `[data-theme="dark"]`.

Key vars: `--ink`, `--ink-2`, `--ink-3`, `--bg`, `--surface`, `--surface-2`, `--gold`, `--gold-bright`, `--gold-soft`, `--border`, `--sh-card`, `--sh-hover`, `--tr`, `--tr-slow`, `--tr-spring`

Added in redesign: `--radius-sm (10px)`, `--radius-md (16px)`, `--radius-lg (22px)`, `--radius-xl (28px)`

## Dark mode
- Toggle button (🌙/☀️) in App.jsx nav actions, class `.dark-toggle`
- State: `const [darkMode, setDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)`
- Effect: `document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'`
- CSS: `[data-theme="dark"] { --ink: #ede7dc; --bg: #0e0b08; ... }`

**Why:** Applying to `<html>` via `data-theme` allows all CSS vars to cascade without JS in CSS files.

## Architecture — App.jsx vs BookStore.jsx
- `App.jsx` is the sole entry point — does NOT import `BookStore.jsx`
- `BookStore.jsx` is a standalone alternate view (imported nowhere currently)
- `BookCard`/`BookGrid` are only used within `BookStore.jsx`; `App.jsx` uses inline `category-card` and `all-book-card` classes from `App.css`

**Why:** Both components share the global design tokens but have separate layouts.

## BookCard
- No purple/glow background — uses `var(--surface)` (white/dark surface)
- `.pulse-glow { display: none }` — removed rainbow glow, replaced with `border-color: rgba(201,150,26,0.28)` on hover
- `aspect-ratio: 2/3` on image wrapper (book portrait ratio — changed from 4/5)
- Spring transition: `var(--tr-spring)` = `340ms cubic-bezier(0.175, 0.885, 0.32, 1.1)`

## Aspect ratios
- Book covers: `2 / 3` (portrait) — applies to `.book-image-wrapper`, `.category-card img`, `.all-book-card img`, `.movie-card img`
- Trailers/video: `16 / 9`

## Gold CTA buttons
`linear-gradient(135deg, #f7d06d 0%, #f3b327 100%)` with `color: #1a0e00` (dark brown, not #111 or black)
Box-shadow: `0 6px 16px rgba(243,179,39,0.2)` default, `0 10px 24px rgba(243,179,39,0.3)` on hover.

## Glassmorphism nav
`backdrop-filter: blur(24px)`, `background: rgba(8,10,16,0.56)`, `position: sticky; top: 12px`

## Skeleton loaders
CSS-only shimmer animation in index.css via `.skeleton`, `.skeleton-card`, `.skeleton-cover`, `.skeleton-line` classes.

## BookReader
- Header gradient changed from purple (`#667eea→#764ba2`) to dark charcoal (`#1a1410→#2d2218`)
- Tab active: gold gradient (`#f7d06d→#f3b327`), `color: #111`

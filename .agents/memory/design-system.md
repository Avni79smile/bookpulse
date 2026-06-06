---
name: Frontend design system
description: CSS tokens, dark mode implementation, and key design decisions for the PublicDomain Library redesign
---

## Design tokens (in src/styles/index.css)
All colors, shadows, and transitions live in `:root` as CSS custom properties. Dark mode overrides them in `[data-theme="dark"]`.

Key vars: `--ink`, `--ink-2`, `--ink-3`, `--bg`, `--surface`, `--surface-2`, `--gold`, `--gold-bright`, `--gold-soft`, `--border`, `--sh-card`, `--sh-hover`, `--tr`, `--tr-slow`, `--tr-spring`

## Dark mode
- Toggle button (🌙/☀️) in App.jsx nav actions, class `.dark-toggle`
- State: `const [darkMode, setDarkMode] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches)`
- Effect: `document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'`
- CSS: `[data-theme="dark"] { --ink: #ede7dc; --bg: #0e0b08; ... }`

**Why:** Applying to `<html>` via `data-theme` allows all CSS vars to cascade without JS in CSS files.

## BookCard
- No purple/glow background — uses `var(--surface)` (white/dark surface)
- `.pulse-glow { display: none }` — removed rainbow glow, replaced with `border-color: rgba(201,150,26,0.28)` on hover
- `aspect-ratio: 4/5` on image wrapper (no fixed height, responsive)
- Spring transition: `var(--tr-spring)` = `340ms cubic-bezier(0.175, 0.885, 0.32, 1.1)`

## BookReader
- Header gradient changed from purple (`#667eea→#764ba2`) to dark charcoal (`#1a1410→#2d2218`)
- Tab active: purple gradient → gold gradient (`#f7d06d→#f3b327`), `color: #111`
- Audio now-playing: blue/purple tones → warm cream (`#faf6ef→#fffdf9`), gold border
- `.audio-chapter-label` color: `#7c3aed` → `#c9961a`

## Skeleton loaders
CSS-only shimmer animation in index.css via `.skeleton` class — ready to use, not wired to JSX yet.

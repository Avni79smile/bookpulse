# BookPulse

BookPulse aggregates free books and audiobooks from public sources:

- Internet Archive
- LibriVox
- Project Gutenberg
- Google Books (free/publicly readable)
- Open Library (public scan only)

## Local development

Install dependencies:

`npm install`

Run frontend + backend together:

`npm run dev`

This starts:

- Vite app at `http://localhost:5173`
- API proxy server at `http://localhost:5175`

## Other scripts

- `npm run dev:client` → Vite frontend only
- `npm run server` → API server only
- `npm run build` → production build

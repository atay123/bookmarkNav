# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` defines the Chrome extension (Manifest V3).
- `newtab.html` is the new tab entry point.
- `script.js` contains the core UI logic and Chrome Bookmarks API integration.
- `style.css` is the generated Tailwind output.
- `src/input.css` is the Tailwind source file.
- `tailwind.config.js` holds Tailwind configuration.
- Assets like `icon.png` live at the repo root.

## Build, Test, and Development Commands
- `npm install`: installs Tailwind/PostCSS dependencies for building CSS.
- `npm run dev`: watches `src/input.css` and regenerates `style.css` on changes.
- `npm run build`: generates a minified `style.css` for release.
- `npm test`: currently exits with “no test specified”. Use manual checks instead.

## Coding Style & Naming Conventions
- JavaScript is plain ES6 in `script.js` (no framework).
- Use 2-space indentation in JS/HTML/CSS to match existing files.
- Prefer descriptive camelCase for variables and functions (e.g., `renderBookmarks`).
- Keep DOM hooks as `id`/`data-` attributes consistent with `newtab.html`.
- CSS is authored via Tailwind utilities; avoid editing `style.css` directly.

## Testing Guidelines
- No automated test suite is configured.
- Verify changes by loading the unpacked extension in Chrome and opening a new tab.
- Smoke checks: bookmark tree renders, drag-and-drop works, context menus open, and search filters results.

## Commit & Pull Request Guidelines
- Recent commits use short, imperative messages with prefixes like `feat:` or `Update`.
- Use concise subjects (English preferred; Chinese acceptable for localized changes).
- PRs should include a brief summary, the commands run (if any), and screenshots/GIFs for UI changes to `newtab.html` or styling.

## Security & Configuration Tips
- Preserve Manifest V3 CSP: avoid inline scripts and unsafe eval patterns.
- Keep permissions in `manifest.json` minimal and justified.

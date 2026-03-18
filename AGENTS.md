# Repository Guidelines

## Project Structure & Module Organization
- `manifest.json` defines the Chrome extension (Manifest V3).
- `newtab.html` is the new tab entry point and contains the context menu plus edit/delete modals.
- `script.js` contains the core UI logic, Chrome Bookmarks API integration, drag-and-drop behavior, theme switching, and modal interactions.
- `style.css` is the generated Tailwind output.
- `src/input.css` is the Tailwind source file.
- `tailwind.config.js` holds Tailwind configuration.
- `README.md` documents installation, features, and manual verification steps.
- Assets like `icon.png` live at the repo root.

## Build, Test, and Development Commands
- `npm install`: installs Tailwind/PostCSS dependencies for building CSS.
- `npm run dev`: watches `src/input.css` and regenerates `style.css` on changes.
- `npm run build`: generates a minified `style.css` for release.
- `node --check script.js`: quick syntax validation for the main extension script.
- `npm test`: currently exits with “no test specified”. Use manual checks instead.

## Coding Style & Naming Conventions
- JavaScript is plain ES6 in `script.js` (no framework).
- Use 2-space indentation in JS/HTML/CSS to match existing files.
- Prefer descriptive camelCase for variables and functions (e.g., `renderBookmarks`).
- Keep DOM hooks as `id`/`data-` attributes consistent with `newtab.html`.
- CSS is authored via Tailwind utilities; avoid editing `style.css` directly.
- Reuse the existing slate/indigo visual language and modal patterns already present in `newtab.html`.
- For destructive actions, prefer the existing custom confirmation modal flow over browser-native `confirm()`.

## Testing Guidelines
- No automated test suite is configured.
- Verify changes by loading the unpacked extension in Chrome and opening a new tab.
- Recommended checks: run `node --check script.js` and `npm run build` before shipping UI or logic changes.
- Smoke checks: bookmark tree renders, drag-and-drop works, context menus open, edit/save flows work, delete confirmation modals behave correctly, theme toggle cycles properly, and search filters results without stale items reappearing.

## Commit & Pull Request Guidelines
- Recent commits use short, imperative messages with prefixes like `feat:` or `docs:`.
- Use concise subjects (English preferred; Chinese acceptable for localized changes).
- PRs should include a brief summary, the commands run (if any), and screenshots/GIFs for UI changes to `newtab.html` or styling.

## Security & Configuration Tips
- Preserve Manifest V3 CSP: avoid inline scripts and unsafe eval patterns.
- Keep permissions in `manifest.json` minimal and justified.

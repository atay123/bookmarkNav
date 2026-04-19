# Bookmark Navigation Extension

[English](./README.md) | [简体中文](./README.zh-CN.md)

A Chrome extension that replaces the default New Tab page with a bookmark-first navigation dashboard. It uses a folder tree on the left and a bookmark card grid on the right, optimized for browsing, organizing, and searching your bookmarks.

## Screenshot

![BookmarkNav UI Screenshot](https://lh3.googleusercontent.com/Lk9FWL2sugDv_1XOwZCcjAfnrjGMbj7D8ZkxG7CACj571De0O4KBlVp-23v4uduakR877S1zdTTBx5ZHBOINVMc-AA=s1280-w1280-h800)

## Features

- Bookmark tree navigation: Expand/collapse multi-level folders and persist the expanded state.
- Card-based bookmark grid: Display bookmarks as cards and load site favicons automatically.
- Context menu management: Edit/delete bookmarks; create subfolders, rename, and delete folders.
- Custom delete confirmation: Built-in confirmation modal for deleting bookmarks/folders, with folder item counts.
- Drag & drop organization: Reorder bookmarks within the grid or drag them into folders in the tree.
- Folder drag & drop: Reorder folders and nest them under other folders.
- Real-time search: Filter results as you type and show the parent folder tag on result cards.
- Theme modes: Light, dark, and system themes.
- Empty state guidance: Helpful prompts when a folder has no items.

## Tech Stack

- Vanilla JavaScript
- Tailwind CSS
- Chrome Extension APIs
  - `chrome.bookmarks`
  - `chrome.runtime`
  - `chrome_url_overrides`
- Manifest V3

## Permissions

- `bookmarks`: Read/create/update/delete bookmarks and folders, including changes required by drag-and-drop.
- `favicon`: Read site favicons for bookmark cards.

## Privacy

- All bookmark data is read and processed locally in your browser.
- No bookmark data is collected or uploaded, and no remote backend is required.

## Development

1. Clone the repo:

```bash
git clone https://github.com/atay123/bookmarkNav.git
cd bookmarkNav
```

2. Install dependencies:

```bash
npm install
```

3. Watch Tailwind build in dev:

```bash
npm run dev
```

4. Build CSS for release:

```bash
npm run build
```

## Load In Chrome

1. Open `chrome://extensions/`
2. Enable `Developer mode`
3. Click `Load unpacked`
4. Select the project root folder
5. Open a new tab to see the extension

## Project Structure

```text
bookmarkNav/
├── manifest.json
├── newtab.html
├── script.js
├── style.css
├── src/
│   └── input.css
├── tailwind.config.js
├── package.json
├── package-lock.json
├── icon.png
├── README.md
└── README.zh-CN.md
```

## Interaction Notes

- Left-click a bookmark card: Open the bookmark.
- Left-click a folder: Switch the right-side view; click the arrow to expand/collapse the tree.
- Right-click a bookmark card: Edit or delete the bookmark.
- Right-click a folder: Create a subfolder, rename, or delete the folder.
- Drag a bookmark card: Reorder it or move it into a folder in the tree.
- Drag a folder: Reorder it or change nesting.

## Security

- Manifest V3 compliant.
- No inline scripts.
- All UI events are bound dynamically via JavaScript.

## Manual Check List

- Bookmark tree renders and expands correctly.
- Context menus open correctly.
- UI refreshes correctly after editing bookmarks and folders.
- Delete confirmation modals behave correctly and results stay in sync after deletion.
- Bookmark drag-and-drop ordering and cross-folder moves work.
- Search results and clearing search switch views correctly.

## Acknowledgments

Special thanks to [LINUX DO](https://linux.do/) for their support and inspiration.

## License

MIT License. See [LICENSE](./LICENSE).

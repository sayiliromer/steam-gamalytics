# Steam Gamalytics Info

Chrome/Edge extension that adds a small Gamalytic data panel to Steam store app
pages.

When you open a Steam game page, the extension reads the Steam app ID, fetches
matching data from `gamalytic.com`, and inserts the result into the Steam page.

## Features

- Shows Gamalytic data directly on `store.steampowered.com/app/...` pages.
- Links the panel title to the matching Gamalytic game page.
- Displays released-game metrics such as estimated revenue, copies sold,
  copies per review, weekly sales, average playtime, and current players.
- Displays unreleased-game metrics such as wishlists and daily wishlist gain.
- Caches fetched data locally for 24 hours to reduce repeated API requests.
- Falls back to stale cached data when fresh data cannot be loaded.
- Attempts to recover automatically when Gamalytic requires a browser check.

## Installation

This repository is an unpacked browser extension. There is no build step.

### Chrome

1. Download or clone this repository.
2. Open Chrome and go to `chrome://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder, the folder that contains `manifest.json`.
6. Open a Steam app page, for example:
   `https://store.steampowered.com/app/<app-id>/...`

### Microsoft Edge

1. Download or clone this repository.
2. Open Edge and go to `edge://extensions`.
3. Turn on **Developer mode**.
4. Click **Load unpacked**.
5. Select this repository folder, the folder that contains `manifest.json`.
6. Open a Steam app page.

## Updating

After changing files locally:

1. Go back to `chrome://extensions` or `edge://extensions`.
2. Find **Steam Gamalytics Info**.
3. Click the reload button on the extension card.
4. Refresh any open Steam store pages.

## Usage

Open any Steam store app page. The extension adds a **Gamalytics** block near the
main game information area.

If the panel says Gamalytic needs browser confirmation, click the recovery link,
complete any browser check on Gamalytic, then refresh the Steam page.

## Permissions

The extension requests:

- `activeTab` and `scripting` for extension behavior on Steam pages.
- `storage` to cache Gamalytic responses locally.
- `cookies` to inspect `gamalytic.com` browser-check cookies.
- Host access to `https://gamalytic.com/*` and
  `https://*.gamalytic.com/*` for API requests.

The content script only runs on Steam app pages matching
`*://store.steampowered.com/app/*`.

## Development

The repo contains four extension files:

- `manifest.json` - Chrome extension manifest.
- `content.js` - Injects the Steam page UI and renders Gamalytic metrics.
- `bg.js` - Fetches Gamalytic data, handles caching, cookies, and recovery.
- `styles.css` - Styles the injected Steam page panel.
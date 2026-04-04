# StarMeld

**Star Citizen Localization Merge Tool** -- combine category-specific language packs into a single `global.ini`.

[![Open StarMeld](https://img.shields.io/badge/Open_StarMeld-Launch_Web_App-2563eb?style=for-the-badge)](https://beltakoda.github.io/StarMeld/) &nbsp; [beltakoda.github.io/StarMeld](https://beltakoda.github.io/StarMeld/)

Star Citizen loads exactly one `global.ini` file. Missing keys display as raw `@key_name` strings in-game, so partial files break the UI. Community language packs like [BeltaKoda's ScCompLangPackRemix](https://github.com/BeltaKoda/ScCompLangPackRemix) (component naming), [ExoAE's ScCompLangPack](https://github.com/ExoAE/ScCompLangPack), and [MrKraken's StarStrings](https://github.com/MrKraken/StarStrings) (mission text) each ship a complete file, making it impossible to combine them without a merge tool.

**StarMeld** solves this. Pick categories from multiple packs, merge them onto a stock base, and download a complete `global.ini` -- all in your browser.

## Features

- **Pre-populated sources** -- Stock base and known language packs load directly from GitHub (no manual downloads)
- **Category-based selection** -- ~25 categories across 8 groups (Ship Components, Ordnance, Missions, UI, Locations, etc.)
- **Per-category source picker** -- Choose which pack to use for each category (e.g., BeltaKoda for components, MrKraken for missions)
- **Custom uploads** -- Import any `global.ini` file alongside the built-in sources
- **Diff detection** -- See exactly how many keys each pack modifies per category
- **Complete output** -- Merged file includes all ~87,000+ keys with UTF-8-SIG encoding
- **Client-side only** -- All processing happens in your browser, nothing is uploaded to a server

## Usage

1. Visit the [StarMeld web app](https://beltakoda.github.io/StarMeld/)
2. Stock base loads automatically from GitHub
3. Enable the language packs you want (check the boxes)
4. In the Category Selection section, pick which source to use for each category
5. Click **Merge & Download**
6. Place the downloaded `global.ini` at:
   ```
   StarCitizen\LIVE\data\Localization\english\global.ini
   ```
7. Ensure your `user.cfg` contains:
   ```
   g_language = english
   ```

## Supported Sources

| Source | Description |
|--------|-------------|
| **BeltaKoda Remix** | Ship component names with Type/Size/Grade prefixes (e.g., `M2A QuadraCell MT`) |
| **ExoAE ScCompLangPack** | Original component naming pack |
| **ExoAE Remix2** | ExoAE's alternative remix variant |
| **MrKraken StarStrings** | Mission text, blueprint pools, commodity fixes, UI overflow corrections |
| **Custom Upload** | Any `global.ini` file you want to merge |

## How It Works / Security

StarMeld is designed to be completely transparent and safe to use:

- **100% client-side** -- All processing happens in your browser using JavaScript. No server-side code, no backend, no database. Your files never leave your machine.
- **No uploads** -- Nothing you load or merge is sent anywhere. The only network requests are `fetch()` calls to `raw.githubusercontent.com` (GitHub's CDN) to download the pre-populated INI files. You can verify this yourself by opening your browser's Developer Tools (F12) and checking the Network tab.
- **No tracking** -- No cookies, no analytics, no localStorage, no session storage. StarMeld stores nothing and tracks nothing.
- **No executables** -- The output is a plain text `.ini` file. There is no installer, no binary, nothing that runs on your system.
- **Fully open source** -- Every line of code is visible in this repository. The entire application is vanilla HTML, CSS, and JavaScript with zero dependencies or build steps. What you see in the repo is exactly what runs in your browser.
- **GitHub Pages hosted** -- The site is served as static files by GitHub Pages. There is no server to compromise.

If you're security-conscious, you can also clone this repo and run it locally (`python3 -m http.server` in the repo directory) -- it works identically offline once the INI files are loaded.

## Roadmap

### Phase 1: Web App (current)
Browser-based merge tool hosted on GitHub Pages. Upload/fetch INI files, pick categories, download merged result.

### Phase 2: Desktop App (planned)
Cross-platform desktop application (Windows + Linux) with:
- Auto-detect Star Citizen installations (LIVE, PTU, EPTU, HOTFIX)
- Extract stock `global.ini` directly from `Data.p4k`
- One-click install of merged file to the correct game directory
- Persistent presets for category selections

## License

MIT

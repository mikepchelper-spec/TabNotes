<div align="center">

# TabNotes

**Contextual notes for the page, domain, workspace, or browser context you are working in.**

<p>
  <a href="README.md"><img alt="Language: English" src="https://img.shields.io/badge/Language-English-ffd84d?style=for-the-badge&labelColor=111215"></a>
  <a href="README.es.md"><img alt="Idioma: Español" src="https://img.shields.io/badge/Idioma-Espa%C3%B1ol-2f3138?style=for-the-badge&labelColor=111215"></a>
</p>

[![Chrome Web Store](https://img.shields.io/badge/Chrome%20Web%20Store-Published-ffd84d?logo=googlechrome&logoColor=111215)](https://chromewebstore.google.com/detail/tabnotes/pniapenkdphjolncppcichbahomfiffj)
[![Version](https://img.shields.io/badge/version-2.11.0-79a7ff)](./tabnotes-extension.zip)
[![Manifest](https://img.shields.io/badge/Manifest-V3-7ee0a1)](apps/extension/public/manifest.json)
[![License: MIT](https://img.shields.io/badge/License-MIT-ffffff)](LICENSE)

**Notes that know where you are.**

[Install from Chrome Web Store](https://chromewebstore.google.com/detail/tabnotes/pniapenkdphjolncppcichbahomfiffj) ·
[Product site](https://tabnotes.atlaspcsupport.com/) ·
[Privacy](https://tabnotes.atlaspcsupport.com/privacy/)

</div>

![TabNotes editor screenshot](store/assets-final-20260619/01-editor-url-note-1280x800.png)

## Current Release

| Item | Value |
|---|---|
| Public version | `2.11.0` |
| Chrome Web Store ID | `pniapenkdphjolncppcichbahomfiffj` |
| Store package | [`tabnotes-extension.zip`](./tabnotes-extension.zip) |
| Product site | `https://tabnotes.atlaspcsupport.com/` |
| Privacy policy | `https://tabnotes.atlaspcsupport.com/privacy/` |
| Terms | `https://tabnotes.atlaspcsupport.com/terms/` |
| Mobile PWA route | `/app` in `apps/web` |

## What TabNotes Does

TabNotes is a local-first Chrome extension that keeps notes attached to the browser context where they matter:

- **URL notes** for one exact page.
- **Domain notes** for an entire website or web app.
- **Workspace notes** for projects, clients, tasks, or support workflows.
- **Global notes** for an always-available scratchpad.

The extension runs in Chrome's side panel, autosaves notes locally, supports multiple notes per context, and can optionally back up your data to your private Google Drive app data folder.

## Highlights

| Area | Features |
|---|---|
| Writing | Rich text, Markdown preview, templates, checklist mode, text alignment, colors, note history |
| Organization | Workspaces, folders, tags, pinned notes, note colors, search, note graph |
| Productivity | Command palette, contextual clipping, reminders, daily digest, backup reminders |
| Privacy | Local-first storage, JSON export/restore, optional Drive appData sync, per-note encryption, PIN lock |
| Languages | English and Spanish interface support |

## Mobile PWA

The companion PWA lives in `apps/web` and exposes a mobile-first route at `/app`.
It uses the same private Google Drive `appDataFolder` file as the extension, with a v2 sync envelope that supports tombstones for deletions and conflict copies when two devices edit the same note after the last sync.

For Drive sync in the PWA, create a Google OAuth **Web application** client and set `VITE_GOOGLE_CLIENT_ID` before building or deploying the web app.
For deployment under `https://tabnotes.atlaspcsupport.com/app/`, build with `VITE_BASE_PATH=/app/` and `VITE_TABNOTES_MOBILE_ENTRY=true`.
The GitHub Pages build also writes `/app/tabnotes.config.json`, so the public web OAuth client ID can be updated without changing the application bundle.

## Screenshots

| Search and notes | Google Drive sync |
|---|---|
| ![Search and all notes](store/assets-final-20260619/02-search-and-all-notes-1280x800.png) | ![Drive sync settings](store/assets-final-20260619/03-drive-backup-settings-1280x800.png) |

| Reminders | Workspaces |
|---|---|
| ![Reminders](store/assets-final-20260619/04-reminders-1280x800.png) | ![Workspaces](store/assets-final-20260619/05-workspaces-light-mode-1280x800.png) |

## Privacy Model

TabNotes does not use a TabNotes server for your notes.

- Notes are stored locally in `chrome.storage.local` by default.
- Manual export creates a JSON file controlled by the user.
- Optional Google Drive sync uses only `https://www.googleapis.com/auth/drive.appdata`.
- Drive sync data is written to the user's private Google Drive app data folder.
- The extension does not include advertising, analytics, telemetry, or tracking SDKs.

## Manual Install From ZIP

The recommended install path is the Chrome Web Store. For local testing:

1. Download [`tabnotes-extension.zip`](./tabnotes-extension.zip).
2. Unzip it.
3. Open Chrome and go to `chrome://extensions`.
4. Enable **Developer mode**.
5. Click **Load unpacked**.
6. Select the extracted `dist` folder.

## Development

```bash
pnpm install
pnpm --filter @tabnotes/shared typecheck
pnpm --filter @tabnotes/web typecheck
pnpm --filter @tabnotes/extension typecheck
pnpm --filter @tabnotes/extension e2e
pnpm --filter @tabnotes/extension build
```

## Repository Structure

```text
apps/
  extension/       Chrome MV3 extension
  tabnotes-site/   Static public site for product, privacy, and terms
  web/             Companion web/PWA app for mobile access
packages/
  shared/          Storage, backup, crypto, markdown, and utility logic
  i18n/            English and Spanish translations
  ui/              Shared UI primitives
store/             Chrome Web Store listing text and final screenshots
```

## License

[MIT](LICENSE).

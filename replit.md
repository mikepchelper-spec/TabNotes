# TabNotes — Project Overview

## What This Is
TabNotes is a premium, local-first Chrome extension + companion web app for contextual notes per tab, URL, domain, and workspace. No account required for local use. Built as a scalable monorepo ready for a Pro/cloud-sync tier.

## Architecture

### Monorepo (pnpm workspaces)
```
apps/
  web/        — Companion web app / PWA (React + Vite, port 5000)
  extension/  — MV3 Chrome extension (React + Vite)
packages/
  shared/     — Types, storage adapters, note/workspace services, utilities
  ui/          — Shared design tokens (CSS vars) + React components
  config/     — Shared tsconfig base
```

### Key Technologies
- **Runtime**: Node.js 20, pnpm 10
- **Frontend**: React 18, TypeScript 5, Vite 5
- **State**: Zustand (web app)
- **Extension**: Manifest V3, chrome.storage.local
- **Styling**: Pure CSS custom properties (design tokens), no CSS-in-JS library
- **Storage abstraction**: `LocalStorageAdapter` (web) / `ChromeStorageAdapter` (extension)

## Running the Project

### Web app (preview in Replit)
```bash
pnpm --filter @tabnotes/web dev
# → http://localhost:5000
```
Workflow: "Start application" → `pnpm --filter @tabnotes/web dev` on port 5000.

### Extension dev build
```bash
pnpm --filter @tabnotes/extension dev  # watch mode
pnpm --filter @tabnotes/extension build  # one-shot build
```
Load `apps/extension/dist/` as an unpacked extension in `chrome://extensions`.

### All scripts
```bash
pnpm build          # build everything
pnpm build:web      # build web app only
pnpm build:extension  # build extension only
pnpm typecheck      # TS check all packages
pnpm format         # Prettier
```

## Data Model
- **Note**: id, workspaceId, scope ('url'|'domain'|'workspace'|'global'), scopeKey, title, content, createdAt, updatedAt
- **Workspace**: id, name, createdAt, updatedAt
- **Storage**: single JSON blob in localStorage (web) or chrome.storage.local (extension)

## Note Scopes
| Scope | Key | Example use |
|-------|-----|-------------|
| url | Normalized URL | Per-page research |
| domain | Hostname | Site-wide notes |
| workspace | Workspace ID | Project notes |
| global | '' | Scratchpad |

## Deployment
- **Type**: Static site (web app)
- **Build**: `pnpm --filter @tabnotes/web build`
- **Output**: `apps/web/dist/`
- Configured as static deployment in Replit

## Roadmap
- Phase 1 ✅ Foundation (monorepo, extension, web app, local-first storage, dark mode, export/import)
- Phase 2: Full-text search, markdown, side panel, tags
- Phase 3: Supabase auth + cloud sync (Pro tier)
- Phase 4: Stripe billing, upgrade flow

## Key Files
- `packages/shared/src/storage.ts` — StorageAdapter interface + LocalStorageAdapter + ChromeStorageAdapter + NotesService + WorkspacesService
- `packages/shared/src/types.ts` — All TypeScript types
- `packages/shared/src/utils.ts` — URL normalization, ID generation, relative time
- `apps/web/src/store/notes.ts` — Zustand store wrapping NotesService
- `apps/web/src/store/theme.ts` — Zustand theme store (persisted)
- `apps/extension/public/manifest.json` — MV3 manifest
- `apps/extension/src/popup/PopupApp.tsx` — Main popup UI
- `apps/extension/src/options/OptionsApp.tsx` — Options/settings page

## Environment Variables (Future Pro Features)
See `.env.example`:
- `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` — Phase 3 cloud sync
- `VITE_STRIPE_PUBLISHABLE_KEY` — Phase 4 monetization

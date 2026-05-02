# TabNotes

> Beautiful, premium, local-first contextual notes per tab, URL, domain, and workspace.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

## Vision

TabNotes is a Chrome extension (Manifest V3) that keeps contextual notes right where you need them — one click away, always in context. Start local-first with no account required. Upgrade to Pro for cloud sync across all devices.

## Repo Structure

```
tabnotes/
├── apps/
│   ├── extension/       # MV3 Chrome extension (React + TypeScript + Vite)
│   └── web/             # Companion web app / PWA (React + Vite)
├── packages/
│   ├── shared/          # Shared types, storage abstractions, utilities
│   ├── ui/              # Shared design tokens + components
│   └── config/          # Shared tsconfig base
└── README.md
```

## Local Setup

### Prerequisites
- Node.js 20+
- pnpm 9+

### Install

```bash
pnpm install
```

### Development

```bash
# Web app (dashboard) — runs on http://localhost:5000
pnpm dev

# Extension (build watch mode)
pnpm --filter @tabnotes/extension dev
```

### Build

```bash
# Build everything
pnpm build

# Build only the extension
pnpm build:extension

# Build only the web app
pnpm build:web
```

### Other scripts

```bash
pnpm lint        # ESLint across all packages
pnpm typecheck   # TypeScript check across all packages
pnpm format      # Prettier formatting
```

## Loading the Extension in Chrome

1. Run `pnpm build:extension`
2. Open Chrome → `chrome://extensions`
3. Enable **Developer mode** (top right toggle)
4. Click **Load unpacked**
5. Select the `apps/extension/dist/` folder
6. The TabNotes icon appears in your toolbar

## Data Model

### Note
```typescript
{
  id: string
  workspaceId: string | null
  scope: 'url' | 'domain' | 'workspace' | 'global'
  scopeKey: string           // normalized URL, domain, workspaceId, or ''
  title?: string
  content: string
  createdAt: number
  updatedAt: number
}
```

### Workspace
```typescript
{
  id: string
  name: string
  createdAt: number
  updatedAt: number
}
```

## Architecture

### Storage Abstraction
The `StorageAdapter` interface (`packages/shared/src/storage.ts`) allows swapping backends:
- **`LocalStorageAdapter`** — used in the web app
- **`ChromeStorageAdapter`** — used in the extension (chrome.storage.local)
- **Future: `SupabaseAdapter`** — for Pro cloud sync

### Note Scopes
| Scope | Key | Use case |
|-------|-----|----------|
| `url` | Normalized URL | Per-page research notes |
| `domain` | Hostname | Site-wide notes (docs, wikis) |
| `workspace` | Workspace ID | Project-grouped notes |
| `global` | `''` | Global scratchpad |

## Roadmap

### Phase 1 — Foundation ✅ (now)
- [x] Monorepo setup (pnpm workspaces)
- [x] MV3 extension scaffold (popup + options)
- [x] Web companion app
- [x] Shared storage abstraction
- [x] Local-first notes + scope switching
- [x] Workspaces
- [x] Export/import JSON
- [x] Dark mode
- [x] Documentation

### Phase 2 — Real MVP
- [ ] Domain/URL normalization refinement
- [ ] Full-text search
- [ ] Note tagging
- [ ] Side panel support
- [ ] Markdown preview

### Phase 3 — Pro (Sync)
- [ ] Supabase project (Auth + Postgres)
- [ ] Cloud sync engine
- [ ] Conflict resolution strategy
- [ ] Web dashboard renders synced notes

### Phase 4 — Monetization
- [ ] Stripe subscription
- [ ] Pro feature gating
- [ ] Upgrade flow in extension

## Pro / Backend Setup (Future)

Copy `.env.example` to `.env.local` and fill in:

```env
# Supabase (Phase 3)
VITE_SUPABASE_URL=
VITE_SUPABASE_ANON_KEY=

# Stripe (Phase 4)
VITE_STRIPE_PUBLISHABLE_KEY=
```

Neither Supabase nor Stripe is required for local development.

## Android Note

Chrome extensions are **not supported on Android Chrome**. The companion web app / PWA serves as the cross-device solution for Android users, with cloud sync via the Pro tier.

## License

MIT © 2026 Florin Suciu

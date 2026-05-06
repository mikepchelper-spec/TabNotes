<div align="center">

# TabNotes

**Premium local-first notes for every tab, URL, domain, and workspace.**

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-4285F4?logo=googlechrome&logoColor=white)](#)
[![MV3](https://img.shields.io/badge/Manifest-V3-2b5be8)](#)
[![Local-first](https://img.shields.io/badge/Data-Local--first-22c55e)](#)
[![No Account](https://img.shields.io/badge/Account-Not%20required-f97316)](#)

*Notes that know where you are.*

</div>

---

## ⬇️ Download

> Install TabNotes in 60 seconds — no Chrome Web Store needed.

| Version | What's new | Download |
|---|---|---|
| **v2.9.1** *(latest)* | Note-body scrolling · Visible scrollbar · Refined monochrome icons | [**⬇ Download v2.9.1**](https://github.com/mikepchelper-spec/TabNotes/releases/download/v2.9.1/tabnotes-extension-v2.9.1.zip) |
| v2.9.0 | Scroll fix · Clip-to-note button · Release generation repair | [Download v2.9.0](https://github.com/mikepchelper-spec/TabNotes/releases/download/v2.9.0/tabnotes-extension-v2.9.0.zip) |
| v2.8.9 | Full backup/restore · Backup reminders · Active format indicators | [Download v2.8.9](https://github.com/mikepchelper-spec/TabNotes/releases/download/v2.8.9/tabnotes-extension-v2.8.9.zip) |
| v2.8.5 | Formatting toggles (B/I/U/S/H/code) | [Releases page](https://github.com/mikepchelper-spec/TabNotes/releases) |
| v2.8.2 | About page · Feature docs | [Releases page](https://github.com/mikepchelper-spec/TabNotes/releases) |

**[→ All releases](https://github.com/mikepchelper-spec/TabNotes/releases)**

### How to install

1. Download the ZIP above
2. Unzip — you'll get an `apps/extension/dist/` folder inside
3. Open Chrome → `chrome://extensions`
4. Enable **Developer mode** (top-right toggle)
5. Click **Load unpacked** → select the `dist/` folder
6. Pin the TabNotes icon to your toolbar

---

## What is TabNotes?

TabNotes is a Chrome extension (Manifest V3) that keeps contextual notes right where you need them — one click away, always in context. Every note is automatically attached to its context: a URL, a domain, a workspace, or the whole browser. No logins, no servers, no tracking. Your data stays in your browser.

---

## Features

### ✍️ Editor

| Feature | Description |
|---|---|
| **WYSIWYG Rich Text** | True rich text editing — bold, italic, underline, strikethrough, inline code, and highlight render as you type |
| **Keyboard Shortcuts** | `Ctrl+B` bold · `Ctrl+I` italic · `Ctrl+U` underline |
| **Markdown Preview** | Toggle between rich edit mode and a rendered markdown view (`↓md`) |
| **Typewriter Mode** | Keeps the current line centered on screen for distraction-free writing |
| **Text Alignment** | Left, center, right, or justify any paragraph |
| **Font Size** | `A–` / `A+` controls for comfortable reading |
| **Date/Time Stamp** | Insert current date and time with `Ctrl+D` or the calendar button |

### 📂 Note Organization

| Feature | Description |
|---|---|
| **4 Scopes** | **URL** (exact page) · **Domain** (whole site) · **Workspace** (your project) · **Global** (always available) |
| **Multiple Notes per Scope** | Create as many notes as you need — navigate them with pills |
| **Workspaces** | Group notes into named projects and switch context instantly |
| **Folders** | Further organize notes within any scope |
| **Tags** | Add comma-separated tags and filter notes by them |
| **Pin Notes** | Pin important notes to the top of any list |
| **Note Colors** | Color-code note backgrounds for visual organization |

### ⚡ Productivity

| Feature | Description |
|---|---|
| **Templates** | One-click templates: Daily Log, Meeting Notes, To-Do, Daily Standup |
| **Wiki Links** | Type `[[Note name]]` to link notes together with autocomplete |
| **Command Palette** | `Ctrl+K` to instantly jump to any note, action, or view |
| **Web Clipper** | Select any text on a webpage and clip it directly into your note |
| **Writing Streak** | Daily writing habit tracker with a fire streak badge |
| **Reminders** | Set a reminder on any note and get notified at the right time |
| **Daily Digest** | Morning summary of your recent notes delivered as a notification |

### 🧠 Intelligence

| Feature | Description |
|---|---|
| **Smart Suggestions** | Related notes surface automatically as you write |
| **AI Chat (Ask)** | Ask questions about your notes in natural language — powered by Groq |
| **Note Graph** | Visual graph showing connections between your notes via wiki links and tags |

### 🔒 Data & Privacy

| Feature | Description |
|---|---|
| **Note History** | Every note is auto-versioned — restore any previous version with one click |
| **Export as Markdown** | Download any note as a clean `.md` file |
| **Export / Import JSON** | Back up all notes as JSON and restore them on any device |
| **Backup Reminders** | Configurable notifications if you haven't exported in N days |
| **Local-first** | All data lives in Chrome storage — no server, no account, no tracking |
| **Note Encryption** | Encrypt individual notes with AES-256 and a personal password |
| **Open Source** | MIT licensed — read, fork, contribute |

### 🎨 User Experience

| Feature | Description |
|---|---|
| **Dark / Light / System Theme** | Follows your OS or set it manually |
| **Companion Web App** | Full-featured notes dashboard accessible from any browser |
| **Context-aware UI** | Scope bar auto-detects your current URL and shows the right notes |
| **Feature Flags** | Turn any feature on or off from Settings |

---

## Repo Structure

```
tabnotes/
├── apps/
│   ├── extension/       # MV3 Chrome extension  (React + TypeScript + Vite)
│   └── web/             # Companion web app / PWA (React + Vite)
├── packages/
│   ├── shared/          # Shared types, storage abstractions, utilities
│   ├── ui/              # Shared design tokens + components
│   └── config/          # Shared tsconfig base
└── README.md
```

---

## Local Development

### Prerequisites

- Node.js 20+
- pnpm 10+

### Environment variables

The web app uses optional environment variables for AI features. **Never hardcode secrets in files** — set them via your platform's secrets manager (Replit Secrets, GitHub Actions secrets, etc.).

| Variable | Used by | Purpose |
|---|---|---|
| `VITE_GROQ_KEY` | `apps/web` | Groq API key for AI-powered features |

Create `apps/web/.env.local` for local development (this file is git-ignored):

```bash
VITE_GROQ_KEY=your_key_here
```

### Install

```bash
pnpm install
```

### Run

```bash
# Web app — runs on http://localhost:5000
pnpm dev

# Extension — build watch mode
pnpm --filter @tabnotes/extension dev
```

### Build

```bash
# Build everything
pnpm build

# Extension only → apps/extension/dist/
pnpm build:extension

# Web app only
pnpm build:web
```

### Load in Chrome

```bash
pnpm build:extension
# Open chrome://extensions → Load unpacked → select apps/extension/dist/
```

---

## Tech Stack

| Layer | Technology |
|---|---|
| Extension | React 18 · TypeScript 5 · Vite 5 · Chrome MV3 |
| Web App | React 18 · TypeScript 5 · Vite 5 · React Router |
| Storage | `chrome.storage.local` (extension) · `localStorage` (web) |
| AI | Groq API (user-supplied key) |
| Monorepo | pnpm workspaces |

---

## License

MIT © TabNotes contributors

---
name: testing-tabnotes-extension
description: Test TabNotes Chrome extension side panel changes end-to-end. Use when verifying editor, scrolling, icon, navigation, or side panel UI changes.
---

# TabNotes Extension Testing

## Devin Secrets Needed

- None for local extension UI testing. TabNotes is local-first and can be tested with Chrome extension storage.
- If testing AI chat features, a Groq API key may be needed in the app settings, but standard side panel/editor tests do not require it.

## Local setup

1. Install dependencies and build the extension from the repo root:
   ```bash
   corepack enable
   pnpm install --frozen-lockfile
   pnpm build
   ```
2. Load the unpacked extension from:
   ```text
   apps/extension/dist
   ```
3. In Chrome, open `chrome://extensions`, enable Developer mode, click **Load unpacked**, and select the `dist` folder.
4. Open a normal web page such as `https://example.com`. Chrome system pages are restricted and the side panel will not allow note editing there.
5. Open TabNotes from the Chrome extensions menu. The side panel should show the Note view by default.

## Recording setup

- Maximize Chrome before recording:
  ```bash
  sudo apt-get install -y wmctrl 2>/dev/null || true
  wmctrl -r :ACTIVE: -b add,maximized_vert,maximized_horz || true
  ```
- For long text paste tests, `xclip` can preload clipboard content on Linux:
  ```bash
  sudo apt-get install -y xclip 2>/dev/null || true
  python3 - <<'PY' | xclip -selection clipboard
  for i in range(1, 81):
      print(f'SCROLL-LINE-{i:03d} — TabNotes long note scrollbar test content')
  PY
  ```

## Useful runtime assertions

For note editor scrolling changes:

1. Open TabNotes side panel on `https://example.com`.
2. Paste 80 numbered lines into the note body.
3. Verify the editor shows a vertical scrollbar/thumb.
4. Scroll inside the note body and verify only the note content moves while the header, formatting toolbar, metadata row, and bottom nav remain fixed.
5. Verify `SCROLL-LINE-080` is reachable at the bottom.

For icon style changes:

1. Check the scope bar and bottom nav in the side panel.
2. Verify icons are sober monochrome symbols, not emoji-style glyphs.
3. If checking command palette items, use `Ctrl+K` from inside the side panel after focusing it.

## Validation commands

Run before opening or updating a PR:

```bash
pnpm lint
pnpm typecheck
pnpm build
```

For faster extension-only type checking:

```bash
pnpm --filter @tabnotes/extension typecheck
```

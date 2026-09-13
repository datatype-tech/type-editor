# Type Editor

A desktop Markdown editor built with Electron, React and CodeMirror 6. It renders
your Markdown in place as you type, the way Typora does: leave a line and its
syntax collapses into formatted text; put the caret back on it and the raw source
reappears for editing.

## Features

**Live preview, not a preview pane.** A CodeMirror decoration layer hides Markdown
punctuation (`#`, `**`, backticks, link targets) on every line that does not hold
the caret and styles what remains. Only visible lines are decorated, so typing
stays cheap no matter how long the document is.

**LaTeX.** `$inline$`, `$$display$$`, `\(…\)` and `\[…\]` render through KaTeX,
inline in the document. Multi-line display formulas collapse their source lines
and render as a centred block. Math inside code spans and fences is left alone.

**Tables and task lists.** GFM tables render as real tables while the caret is
outside them; step into one and the pipe syntax returns. `- [ ]` becomes a
clickable checkbox that rewrites the marker in the source.

**Export.** Save the document as a single PNG (via `html-to-image` at 2× with the
full print stylesheet) or as a real `.docx` (via `docx`), where formulas are
rasterised and embedded so Word shows them correctly.

**Auto-save, and a document that comes back.** The title bar cycles between
30 s, 1 min, 5 min and off, and only ever writes to a document that already has
a path, so it can never surprise you with a save dialog. The document you were
editing — saved or not — is restored the next time the window opens.

**Outline, focus and typewriter.** A table of contents built from the headings
in the buffer, with the section you are reading marked. Focus mode dims every
block but the one holding the caret; typewriter mode keeps the caret line in the
middle of the window.

**Rare Markdown.** `==highlight==`, `^superscript^`, `~subscript~`, footnotes
(`[^1]` with definitions collected at the end), definition lists and YAML front
matter all render in place and in the export. Raw HTML is allowed — a table, a
`<details>` or a figure — with scripts, event handlers and `javascript:` URLs
stripped before anything reaches the DOM.

**Settings.** Six colour themes (including a dark one for each family), fifteen
document faces shown in their own typeface, body size, leading, text width, side
margin and tab size, an interface language (English, 简体中文, 繁體中文, 日本語),
and both view modes. Everything is kept in IndexedDB, along with the last
document and the list of recently opened files.

**Files.** Open, save, save-as, drag-and-drop onto the window, and an
unsaved-changes guard on every destructive action including window close.

## Getting started

```bash
npm install
npm run dev
```

If your network needs the local proxy, set it for the install:

```bash
# PowerShell
$env:HTTP_PROXY="http://127.0.0.1:7890"; $env:HTTPS_PROXY="http://127.0.0.1:7890"
$env:ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/"
npm install
```

## Scripts

| Script | What it does |
| ------ | ------------ |
| `npm run dev` | Vite dev server + Electron, with hot reload |
| `npm run build` | Builds main, preload and renderer into `out/` |
| `npm run typecheck` | Type-checks the node and web projects |
| `npm test` / `npm run smoke` | End-to-end check against the production build |
| `npm run pack` | Unpacked build in `release/` |
| `npm run dist` | Installer via electron-builder |

`npm run smoke` launches the real production build in Electron and asserts that
the window mounts, that the live preview decorates headings, math, task lists and
images, and that both exporters produce valid files (it unzips the `.docx` and
checks its XML). It also fails on any renderer console error, which is what keeps
the Content-Security-Policy honest.

`scripts/screenshot.cjs` captures the running app to `tmp/` for design review:

```bash
node_modules/.bin/electron scripts/screenshot.cjs
```

## Keyboard shortcuts

| | |
| --- | --- |
| `Ctrl+N` / `Ctrl+O` | New / Open |
| `Ctrl+S` / `Ctrl+Shift+S` | Save / Save As |
| `Ctrl+Shift+A` | Cycle auto-save |
| `Ctrl+Shift+E` / `Ctrl+Shift+W` | Export PNG / Word |
| `Ctrl+F` | Find and replace |
| `Ctrl+/` | Toggle live preview and source mode |
| `Ctrl+E` | Inline code |
| `Ctrl+Shift+K` | Code block |
| `Ctrl+,` | Settings |
| `Ctrl+Shift+O` / `Ctrl+Shift+F` / `Ctrl+Shift+T` | Outline / focus mode / typewriter mode |

## Project layout

```
src/
  main/            Electron main process
    index.ts         app lifecycle
    window.ts        frameless window, platform-specific chrome
    ipc.ts           file IO, export sinks, unsaved-changes guard
    menu.ts          application menu (forwards commands to the renderer)
  preload/         contextBridge surface — the renderer's only privileged API
  renderer/
    index.html       the editor window
    dialog.html      the unsaved-changes window, which is a window of its own
    src/
      editor/        CodeMirror setup, theme, live-preview decorations, widgets
      components/    title bar, command bar, status bar, editor host, outline,
                     settings pane, find bar, dialogs
      export/        PNG and Word exporters
      lib/           markdown-it + KaTeX and the extra syntax, settings, i18n,
                     IndexedDB storage, path handling
  shared/          channel names, payload types, menu copy shared by both sides
scripts/           smoke test, screenshot helper, export harness (test-only)
```

## Design

The default theme is deliberately warm rather than the usual blue-on-grey: every
neutral is warm, rules are hairlines instead of shadows, corners are near-square,
and a single clay accent (`#b0553a`) carries interaction. The document sits on a
barely-warm paper (`#fdfcf9`) against white chrome.

That palette is one of six presets — Minimal (no hue at all), Minimal Light,
Plain Light, Plain Dark, Anthropic and Anthropic Dark — each defined as the same
set of token names in `src/renderer/src/styles/global.css`, selected with
`data-theme` on the root element. Structure (radii, motion, fonts, metrics) is
fixed and shared, and the document metrics are shared with the export, so what is
on screen is what lands in the PNG. Motion follows Fluent: three curves, a
duration ramp, and transitions on every state change.

## Security

The renderer runs sandboxed with `contextIsolation` on and no Node integration.
Raw HTML in Markdown is disabled, because the editor opens arbitrary files from
disk into a window that holds the IPC bridge. A strict CSP is injected into the
production build only — the Vite dev server needs an inline React-refresh
preamble.

## Known limitations

- Remote images are displayed but are not embedded into Word exports; only
  `data:` URLs are. Attach them as data URLs if you need them in the `.docx`.
- Ordered lists in the Word export share a single numbering instance, so several
  separate ordered lists continue one sequence instead of restarting.
- Editing a table shows its raw pipe syntax until the caret leaves it.

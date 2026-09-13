# Changelog

## 0.1.1

- **New Application Icon & Logo.** Refreshed brand identity with a clean, modern typographic design, and fixed taskbar and window titlebar icon distortion on Windows.
- **Auto Update.** Added update checker in Settings pane, background release checks against GitHub Releases (`datatype-tech/type-editor`), and auto-update prompt on window close when a new version is detected.
- **Windows Explorer Context Menu.** Added an installer option to add "Open with Type Editor" to Windows right-click context menu for all files.
- **Bracket & Quote Auto-Completion.** Added configurable symbol auto-completion in Settings (enabled by default) for `[]`, `()`, `""`, `{}`, `/* ... */`, and `?/* ... */`.
- **Newline Indentation Preservation.** Pressing Enter now preserves the indentation of the preceding line (`insertNewlineKeepIndent`).
- **Dropdown & Scroll Fix.** Fixed an issue where the Insert and Recent Files menus in the toolbar were intercepted by window dragging, making items unclickable and unscrollable.
- **Performance Enhancements.** Reduced redundant AST & regex recomputation during caret moves in live preview, eliminated forced layout reflows on mouse moves, and added component-level memoization.

## 0.1.0

The first release.

**Editing.** A document renders where it is written: Markdown punctuation is
hidden on every line that does not hold the caret, and moving the caret onto a
line brings its source back, with a short fade. Headings, emphasis, lists, task
lists, tables, quotes, code blocks with syntax highlighting, images and rules
are all drawn in place.

**Formulas.** `$inline$`, `$$display$$`, `\(…\)` and `\[…\]` render through
KaTeX; multi-line display formulas collapse their source into a centred block.
Math inside code is left alone.

**The syntax Markdown forgot.** `==highlight==`, `^superscript^`, `~subscript~`,
footnotes with their definitions collected at the end, definition lists and YAML
front matter render in the preview and survive the export.

**Raw HTML, without the scripts.** HTML is parsed into a real DOM and cleaned
there — script and style elements, every `on*` attribute and any `javascript:`
URL are removed before it reaches the page.

**Export.** A document saves as a single PNG, or as a real `.docx` with formulas
embedded as images. The exported page uses the same measurements as the preview.

**The rest of the editor.** Find and replace with case, whole-word and regular
expression options; an outline built from the headings and nested by level;
focus mode; typewriter mode; auto-save at 30 seconds, one minute, five minutes or
off; the document and the recent-file list restored on the next launch, kept in
IndexedDB.

**Settings.** Seven colour themes, seventeen document faces shown in their own
typeface, body size, leading, text width, side margin, tab size, and four
interface languages: English, 简体中文, 繁體中文, 日本語.

### Installing

Download `Type Editor-0.1.0-setup.exe` and run it, or take the portable
`Type Editor-0.1.0-x64.zip` and unpack it anywhere.

The build is not code-signed, so Windows SmartScreen shows "Windows protected
your PC" the first time. Choose **More info**, then **Run anyway** — the
installer runs, and the warning does not come back.

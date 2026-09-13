# Changelog

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

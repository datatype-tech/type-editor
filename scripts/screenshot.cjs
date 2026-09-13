'use strict'

/**
 * Captures the running app to `tmp/ui.png` so the interface can be reviewed
 * without launching it by hand. Development helper, not part of the build.
 *
 *   node_modules/.bin/electron scripts/screenshot.cjs
 */

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const TMP = path.join(ROOT, 'tmp')

const SAMPLE = [
  '# Type Editor',
  '',
  'A Markdown editor with **live preview**, LaTeX and one-click export.',
  '',
  '## Inline maths',
  '',
  'The mass–energy relation $E = mc^2$ renders as you type, and display maths',
  'gets its own centred block:',
  '',
  '$$',
  '\\int_{-\\infty}^{\\infty} e^{-x^2}\\,dx = \\sqrt{\\pi}',
  '$$',
  '',
  '## Tasks and code',
  '',
  '- [x] Live preview that hides Markdown punctuation',
  '- [x] KaTeX for `$inline$` and `$$display$$` formulas',
  '- [ ] Something still to do',
  '',
  '```ts',
  'const greeting: string = "hello"',
  '```',
  '',
  '> Move the caret onto a line to reveal its source.',
  '',
  '| Feature | Shortcut |',
  '| ------- | -------- |',
  '| Save    | Ctrl+S   |',
  '| Export  | Ctrl+Shift+E |',
  ''
].join('\n')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

app.whenReady().then(async () => {
  fs.mkdirSync(TMP, { recursive: true })

  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    show: false,
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: path.join(ROOT, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })

  await win.loadFile(path.join(ROOT, 'out/renderer/index.html'))
  await sleep(700)

  // The window never gets real focus, so the input pipeline can refuse the
  // insert; verify it landed and retry rather than capturing an empty page.
  const typed = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms))
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const content = document.querySelector('.cm-content')
      if (content) {
        content.focus()
        document.execCommand('insertText', false, ${JSON.stringify(SAMPLE)})
        await wait(250)
        if ((content.textContent || '').length > 20) return content.textContent.length
      }
      await wait(400)
    }
    return -1
  })()`)

  if (typed < 0) {
    console.error('failed to type the sample document into the editor')
    app.exit(1)
    return
  }

  await sleep(900)

  const docLength = await win.webContents.executeJavaScript(
    "(document.querySelector('.cm-content') || {}).textContent.length"
  )
  console.log(`editor text length before capture: ${docLength} (typed reported ${typed})`)

  // A hidden window keeps serving the frame it last composited, which would
  // capture an empty editor. Showing it (without stealing focus) forces a
  // repaint of everything CodeMirror has drawn.
  win.showInactive()
  await sleep(1200)
  win.webContents.invalidate()

  const image = await win.webContents.capturePage()
  const target = path.join(TMP, `ui-${Date.now()}.png`)
  fs.writeFileSync(target, image.toPNG())
  console.log(`wrote ${path.relative(ROOT, target)} (${image.getSize().width}×${image.getSize().height})`)

  win.destroy()
  app.exit(0)
})

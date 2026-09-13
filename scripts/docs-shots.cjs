'use strict'

/**
 * Captures the screenshots the README uses. Run against a production build:
 *
 *   npm run build
 *   node_modules/.bin/electron scripts/docs-shots.cjs
 *
 * Development helper, not part of the build.
 */

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const DOCS = path.join(ROOT, 'docs')

/** Starts with a blank line so the caret can rest there and leave the rest rendered. */
const SAMPLE = [
  '',
  '# Type Editor',
  '',
  'A Markdown editor that renders in place: leave a line and its syntax becomes',
  'formatted text, put the caret back and the source returns.',
  '',
  '## Formulas',
  '',
  'Inline maths such as $E = mc^2$ sits in the sentence, and display maths gets',
  'its own centred block:',
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

async function capture(win, name) {
  win.showInactive()
  await sleep(900)
  win.webContents.invalidate()
  await sleep(500)
  const image = await win.webContents.capturePage()
  const file = path.join(DOCS, name)
  fs.writeFileSync(file, image.toPNG())
  const size = image.getSize()
  console.log(`wrote ${path.relative(ROOT, file)} (${size.width}×${size.height})`)
}

app.whenReady().then(async () => {
  fs.mkdirSync(DOCS, { recursive: true })

  // The application's own main process, so the window and its menus are real.
  require(path.join(ROOT, 'out/main/index.js'))
  await sleep(2600)

  const win = BrowserWindow.getAllWindows()[0]
  win.setBounds({ x: 60, y: 40, width: 1280, height: 860 })
  const js = (code) => win.webContents.executeJavaScript(`(async () => { return (${code}) })()`)

  // Whatever the last session left is not what belongs in a screenshot.
  await js(`document.querySelector('[data-action="new"]').click()`)
  await sleep(1000)
  const dialog = BrowserWindow.getAllWindows().find((w) => w.id !== win.id)
  if (dialog) {
    await sleep(600)
    await dialog.webContents.executeJavaScript(
      `[...document.querySelectorAll('.btn')].find((b) => /Don|不/.test(b.textContent)).click(), true`
    )
    await sleep(1000)
  }

  // The window may not hold focus in a headless run, so the insert is verified
  // and retried — replacing whatever the session restored, not adding to it.
  const typed = await win.webContents.executeJavaScript(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    for (let attempt = 0; attempt < 8; attempt += 1) {
      const content = document.querySelector('.cm-content')
      if (content) {
        content.focus()
        document.execCommand('selectAll')
        document.execCommand('insertText', false, ${JSON.stringify(SAMPLE)})
        await wait(300)
        const text = content.textContent || ''
        if (text.includes('Type Editor') && !text.includes('Heading One')) return true
      }
      await wait(400)
    }
    return false
  })()`)
  console.log('document replaced:', typed)

  // The caret is left on the sample's blank last line; scrolling to the top
  // shows the whole document without any line falling back to its source.
  await js(`(async () => {
    const wait = (ms) => new Promise((r) => setTimeout(r, ms))
    for (let attempt = 0; attempt < 6; attempt += 1) {
      const scroller = document.querySelector('.cm-scroller')
      if (scroller) {
        scroller.scrollTop = 0
        await wait(200)
        if (scroller.scrollTop < 4) return true
      }
      await wait(300)
    }
    return false
  })()`)
  await sleep(700)

  await capture(win, 'screenshot.png')

  // The settings pane, which is where the themes and typography live.
  await js(`document.querySelector('[data-action="settings"]').click()`)
  await sleep(1000)
  await capture(win, 'settings.png')

  app.exit(0)
})

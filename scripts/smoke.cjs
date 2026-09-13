'use strict'

/**
 * End-to-end smoke test. Runs the real production build in Electron and checks
 * that the window mounts, the live preview actually decorates the buffer, and
 * both exporters produce valid files.
 *
 *   npm run smoke
 */

const { app, BrowserWindow, ipcMain } = require('electron')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const ROOT = path.join(__dirname, '..')
const TMP = path.join(ROOT, 'tmp')

const failures = []
const diagnostics = []

// Without this, destroying the first window quits the app before the export
// harness window can be created.
app.on('window-all-closed', () => {})

// The test drives a renderer without the app's main process behind it, so the
// one dialog the renderer can ask for is answered here. Anything else it calls
// would be a genuine failure.
ipcMain.handle('dialog:confirm-discard', () => 'cancel')

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

function check(name, ok, detail) {
  console.log(`${ok ? '  ok  ' : ' FAIL '} ${name}${ok || !detail ? '' : `\n         ${detail}`}`)
  if (!ok) failures.push(name)
}

function attachDiagnostics(win) {
  win.webContents.on('console-message', (...args) => {
    const first = args[0]
    const entry =
      first && typeof first === 'object' && 'message' in first
        ? { level: first.level, message: first.message }
        : { level: args[1], message: args[2] }

    const isError = entry.level === 'error' || entry.level === 3
    const isWarning = entry.level === 'warning' || entry.level === 2
    if (isError || isWarning) diagnostics.push(entry)
    console.log(`         [renderer:${entry.level}] ${entry.message}`)
  })

  for (const event of ['preload-error', 'render-process-gone', 'did-fail-load']) {
    win.webContents.on(event, (...args) => {
      const detail = args
        .slice(1)
        .map((value) => (value && value.message ? value.message : String(value)))
        .join(' ')
      diagnostics.push({ level: 'error', message: `${event}: ${detail}` })
      console.log(`         [${event}] ${detail}`)
    })
  }
}

const SAMPLE = [
  '# Heading One',
  '',
  'Some **bold** text and $E = mc^2$ inline math.',
  '',
  '$$',
  '\\int_0^1 x^2 \\, dx',
  '$$',
  '',
  '- [ ] todo item',
  '- [x] done item',
  '- a plain bullet',
  '',
  '```ts',
  'const answer: number = 42',
  '```',
  '',
  '![pixel](data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7)',
  '',
  'Trailing paragraph.'
].join('\n')

async function testApplicationWindow() {
  console.log('\n— application window —')

  const win = new BrowserWindow({
    show: false,
    width: 1200,
    height: 900,
    webPreferences: {
      preload: path.join(ROOT, 'out/preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true
    }
  })
  attachDiagnostics(win)

  await win.loadFile(path.join(ROOT, 'out/renderer/index.html'))
  await sleep(700)

  const mounted = await win.webContents.executeJavaScript(`(() => {
    const q = (selector) => document.querySelector(selector)
    return {
      csp: !!q('meta[http-equiv="Content-Security-Policy"]'),
      app: !!q('.app'),
      document: (q('.doc-title__name') || {}).textContent || null,
      titlebar: !!q('.titlebar'),
      toolbar: !!q('.toolbar'),
      statusbar: !!q('.statusbar'),
      editor: !!q('.cm-editor'),
      modeSwitch: !!q('.modeswitch__underline'),
      modeOptions: document.querySelectorAll('.modeswitch__option').length,
      windowButtons: document.querySelectorAll('.win-btn').length,
      logo: !!q('.brand svg rect'),
      theme: document.documentElement.dataset.theme,
      pane: !!q('.settings-pane')
    }
  })()`)

  check('production build carries a CSP meta tag', mounted.csp)
  check('React mounted the app shell with the logo mark', mounted.app && mounted.logo)
  check('title bar, command bar and status bar rendered', mounted.titlebar && mounted.toolbar && mounted.statusbar)
  check('CodeMirror mounted', mounted.editor)
  check(
    'live/source switch rendered with its sliding indicator',
    mounted.modeSwitch && mounted.modeOptions === 2,
    `${mounted.modeOptions} options`
  )
  check('custom window controls rendered', mounted.windowButtons === 3, `found ${mounted.windowButtons}`)
  check('the title bar names the document', Boolean(mounted.document), String(mounted.document))
  check(
    'a theme preset is applied',
    ['type', 'minimal', 'minimal-light', 'plain-light', 'plain-dark', 'anthropic', 'anthropic-dark'].includes(
      mounted.theme
    ),
    String(mounted.theme)
  )
  check('settings pane rendered', mounted.pane)

  // Type the sample document through the browser input pipeline, replacing
  // whatever the last run left in the session.
  await win.webContents.executeJavaScript(`(() => {
    const content = document.querySelector('.cm-content')
    content.focus()
    document.execCommand('selectAll')
    document.execCommand('insertText', false, ${JSON.stringify(SAMPLE)})
    return true
  })()`)
  await sleep(600)

  const view = await win.webContents.executeJavaScript(`(() => {
    const q = (selector) => document.querySelector(selector)
    const heading = q('.cm-md-h1')
    const content = q('.cm-content')
    return {
      documentText: content ? content.textContent : '',
      headingText: heading ? heading.textContent : null,
      katex: document.querySelectorAll('.katex').length,
      displayMath: document.querySelectorAll('.katex-display').length,
      collapsedLines: document.querySelectorAll('.cm-md-collapsed').length,
      tasks: document.querySelectorAll('.cm-md-task').length,
      checkedTasks: document.querySelectorAll('.cm-md-task.is-checked').length,
      strong: document.querySelectorAll('.cm-md-strong').length,
      image: !!q('.cm-md-image img'),
      inlineCodeMark: document.querySelectorAll('.cm-md-code').length,
      bullets: document.querySelectorAll('.cm-md-bullet').length,
      statusWords: (q('.statusbar__item:last-child') || {}).textContent || null
    }
  })()`)

  check('buffer received the typed text', view.documentText.includes('Heading One'))
  check(
    'heading rendered with its "#" punctuation hidden',
    view.headingText === 'Heading One',
    `heading line reads ${JSON.stringify(view.headingText)}`
  )
  check('KaTeX rendered inline and display math', view.katex >= 2, `${view.katex} katex nodes`)
  check('display math produced a centred block', view.displayMath >= 1, `${view.displayMath} display nodes`)
  check(
    'multi-line math collapsed its source lines',
    view.collapsedLines >= 1,
    `${view.collapsedLines} collapsed lines`
  )
  check('GFM task checkboxes rendered', view.tasks === 2, `${view.tasks} checkboxes`)
  check('checked task reflects its source', view.checkedTasks === 1, `${view.checkedTasks} checked`)
  check('bold span styled', view.strong >= 1, `${view.strong} strong spans`)
  check('data-URL image rendered inline', view.image)
  check('list bullets rendered as bullets', view.bullets >= 1, `${view.bullets} bullets`)

  // --- code blocks ---
  const code = await win.webContents.executeJavaScript(`(() => {
    const q = (selector) => document.querySelector(selector)
    const header = q('.cm-md-fence__name')
    const codeLine = [...document.querySelectorAll('.cm-line')].find((line) =>
      line.textContent.includes('const answer')
    )
    return {
      headerText: header ? header.textContent : null,
      head: document.querySelectorAll('.cm-md-codehead').length,
      copy: !!q('.cm-md-fence__copy'),
      keyword: codeLine ? !!codeLine.querySelector('[class*="ͼ"]') : false,
      keywordColour: codeLine
        ? getComputedStyle(codeLine.querySelector('[class*="ͼ"]') || codeLine).color
        : null
    }
  })()`)

  check('fenced code grew a header with its language', code.headerText === 'ts', String(code.headerText))
  check('code header line styled', code.head === 1, `${code.head} headers`)
  check('code block offers a copy button', code.copy)
  check(
    'code inside the fence is syntax highlighted',
    code.keyword && code.keywordColour && code.keywordColour !== 'rgb(26, 24, 20)',
    `colour ${code.keywordColour}`
  )

  // --- outline ---
  await win.webContents.executeJavaScript(
    `document.querySelector('[data-action="outline"]').click(), true`
  )
  await sleep(400)

  const outline = await win.webContents.executeJavaScript(`(() => ({
    open: document.querySelector('.outline-pane').classList.contains('is-open'),
    items: [...document.querySelectorAll('.outline-item')].map((item) => item.textContent),
    shifted: document.querySelector('.app').classList.contains('is-outline-open')
  }))()`)

  check('the outline lists the document headings', outline.open && outline.items[0] === 'Heading One', JSON.stringify(outline.items))
  check('the document moves aside for the outline', outline.shifted)

  await win.webContents.executeJavaScript(
    `document.querySelector('.outline-pane .iconbtn').click(), true`
  )
  await sleep(300)

  // --- find and replace ---
  await win.webContents.executeJavaScript(`(() => {
    const find = [...document.querySelectorAll('.toolbar .cmd')].find((button) =>
      /Find|查找|尋找|検索/.test(button.textContent)
    )
    find.click()
    return true
  })()`)
  await sleep(250)

  const found = await win.webContents.executeJavaScript(`(() => {
    const input = document.querySelector('.searchbar__field input')
    if (!input) return { open: false }
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set
    setter.call(input, 'Heading')
    input.dispatchEvent(new Event('input', { bubbles: true }))
    return { open: true, hasReplace: !!document.querySelector('.searchbar__row + .searchbar__row') }
  })()`)

  await sleep(250)

  const matches = await win.webContents.executeJavaScript(`(() => ({
    highlights: document.querySelectorAll('.cm-searchMatch').length,
    status: (document.querySelector('.searchbar__count') || {}).textContent || ''
  }))()`)

  check('the find bar opens from the command bar', found.open)
  check('find highlights matches in the document', matches.highlights >= 1, `${matches.highlights} matches`)
  check('find reports the match count', /1 of 1/.test(matches.status), JSON.stringify(matches.status))

  await win.webContents.executeJavaScript(`(() => {
    document.querySelectorAll('.searchbar .iconbtn')[2].click()
    return true
  })()`)
  await sleep(200)

  // --- insert dropdown and scroll ---
  await win.webContents.executeJavaScript(`(() => {
    const insertBtn = [...document.querySelectorAll('.toolbar .cmd')].find((button) =>
      /Insert|插入/.test(button.textContent)
    )
    if (insertBtn) insertBtn.click()
    return true
  })()`)
  await sleep(250)

  const insertMenu = await win.webContents.executeJavaScript(`(() => {
    const menu = document.querySelector('.dropdown .menu')
    const scroll = menu ? menu.querySelector('.menu__scroll') : null
    const items = scroll ? scroll.querySelectorAll('.menu__item') : []
    const initialTop = scroll ? scroll.scrollTop : 0
    if (scroll) {
      scroll.scrollTop = 50
    }
    const scrolledTop = scroll ? scroll.scrollTop : 0
    return {
      open: !!menu,
      menuNoDrag: menu ? getComputedStyle(menu).webkitAppRegion === 'no-drag' : false,
      scrollNoDrag: scroll ? getComputedStyle(scroll).webkitAppRegion === 'no-drag' : false,
      scrollable: scroll ? scroll.scrollHeight > scroll.clientHeight && scrolledTop > 0 : false,
      itemCount: items.length
    }
  })()`)

  check('insert dropdown opens from toolbar', insertMenu.open)
  check('insert menu is non-draggable (clickable & interactive)', insertMenu.menuNoDrag && insertMenu.scrollNoDrag)
  check('insert language list is scrollable', insertMenu.scrollable, `${insertMenu.itemCount} items`)

  // Click an item in the scrollable language list
  await win.webContents.executeJavaScript(`(() => {
    const pyItem = [...document.querySelectorAll('.menu__scroll .menu__item')].find((btn) =>
      btn.textContent.includes('python')
    )
    if (pyItem) pyItem.click()
    return true
  })()`)
  await sleep(300)

  const inserted = await win.webContents.executeJavaScript(`(() => {
    const content = document.querySelector('.cm-content')
    const menu = document.querySelector('.dropdown .menu')
    return {
      menuClosed: !menu,
      hasPythonFence: content ? content.textContent.includes('\`\`\`python') || content.textContent.includes('python') : false
    }
  })()`)

  check('clicking language in insert list works and closes dropdown', inserted.menuClosed && inserted.hasPythonFence)

  // --- settings ---
  await win.webContents.executeJavaScript(
    `document.querySelector('[data-action="settings"]').click(), true`
  )
  await sleep(300)

  const opened = await win.webContents.executeJavaScript(`(() => {
    const pane = document.querySelector('.settings-pane')
    const cards = [...document.querySelectorAll('.theme-card')]
    const dark = cards.find((card) => card.textContent.includes('Plain Dark'))
    dark.click()
    return { paneOpen: pane.classList.contains('is-open'), cards: cards.length }
  })()`)
  await sleep(300)

  const themed = await win.webContents.executeJavaScript(`(async () => {
    const db = await new Promise((resolve, reject) => {
      const request = indexedDB.open('type-editor', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const stored = await new Promise((resolve) => {
      const request = db.transaction('state').objectStore('state').get('settings')
      request.onsuccess = () => resolve(request.result)
    })
    return {
      theme: document.documentElement.dataset.theme,
      stored: stored ? stored.theme : null,
      ink: getComputedStyle(document.documentElement).getPropertyValue('--ink').trim(),
      paper: getComputedStyle(document.documentElement).getPropertyValue('--paper').trim()
    }
  })()`)

  check('the settings pane opens from the toolbar', opened.paneOpen)
  check('settings offers every preset', opened.cards === 7, `${opened.cards} presets`)
  check('choosing a theme applies it', themed.theme === 'plain-dark', String(themed.theme))
  check('the dark preset repaints the shell', themed.ink === '#e8e8e8', themed.ink)
  check('the dark preset repaints the paper', themed.paper === '#1a1a1a', themed.paper)
  check('settings survive a restart', themed.stored === 'plain-dark', String(themed.stored))

  await win.webContents.executeJavaScript(`(() => {
    const back = [...document.querySelectorAll('.theme-card')].find((card) =>
      card.textContent.includes('Type Style')
    )
    back.click()
    return true
  })()`)
  await sleep(200)

  // --- settings update card and bracket toggle ---
  const updateUi = await win.webContents.executeJavaScript(`(() => {
    const checkBtn = document.querySelector('[data-action="check-update"]')
    const versionEl = document.querySelector('.update-card__version')
    const toggles = [...document.querySelectorAll('.settings-pane .toggle__label')].map(e => e.textContent)
    return {
      hasCheckBtn: !!checkBtn,
      versionText: versionEl ? versionEl.textContent : '',
      hasBracketToggle: toggles.some(t => t.includes('Bracket') || t.includes('补全') || t.includes('補齊'))
    }
  })()`)

  check('settings contains update section with current version', updateUi.hasCheckBtn && updateUi.versionText.includes('0.1.1'), updateUi.versionText)
  check('settings contains symbol completion toggle', updateUi.hasBracketToggle)

  await win.webContents.executeJavaScript(`(() => {
    document.querySelector('[data-action="settings"]').click()
    return true
  })()`)
  await sleep(300)

  check(
    'no renderer errors or warnings',
    diagnostics.length === 0,
    diagnostics.map((entry) => entry.message).join('\n         ')
  )

  win.destroy()
}

async function testExports() {
  console.log('\n— exports —')

  const win = new BrowserWindow({ show: false, width: 1100, height: 900 })
  attachDiagnostics(win)
  await win.loadFile(path.join(TMP, 'harness', 'index.html'))
  await sleep(500)

  const ready = await win.webContents.executeJavaScript('Boolean(window.harness && window.harness.ready)')
  check('export harness loaded', ready)
  if (!ready) {
    win.destroy()
    return
  }

  const document_ = [
    '# Exported Title',
    '',
    'Body text with **bold**, *italic* and `code`.',
    '',
    '$$',
    '\\frac{a}{b} = \\sqrt{c}',
    '$$',
    '',
    '- first bullet',
    '- second bullet',
    '',
    '1. ordered one',
    '2. ordered two',
    '',
    '| Left | Right |',
    '| ---- | ----- |',
    '| a    | b     |',
    '',
    '> A quoted line.',
    '',
    '---',
    ''
  ].join('\n')

  const png = await win.webContents.executeJavaScript(
    `window.harness.png(${JSON.stringify(document_)})`
  )
  const docx = await win.webContents.executeJavaScript(
    `window.harness.docx(${JSON.stringify(document_)}, 'smoke')`
  )

  // --- PNG ---
  const pngPath = path.join(TMP, 'export-smoke.png')
  const pngBytes = Buffer.from(png.base64, 'base64')
  fs.writeFileSync(pngPath, pngBytes)

  const signature = pngBytes.subarray(0, 8).toString('hex')
  const width = pngBytes.readUInt32BE(16)
  const height = pngBytes.readUInt32BE(20)

  check('PNG signature is valid', signature === '89504e470d0a1a0a', signature)
  check('PNG has a plausible page width', width > 800 && width <= 2000, `${width}px`)
  check('PNG covers the whole document', height > 900, `${height}px`)
  console.log(`         wrote ${path.relative(ROOT, pngPath)} (${width}×${height})`)

  // --- DOCX ---
  const docxPath = path.join(TMP, 'export-smoke.docx')
  fs.writeFileSync(docxPath, Buffer.from(docx.base64, 'base64'))
  check('DOCX is a zip package', docx.length > 5000, `${docx.length} bytes`)

  const docxHeader = fs.readFileSync(docxPath).subarray(0, 4)
  check(
    'DOCX has a zip local-file header',
    docxHeader.subarray(0, 2).toString() === 'PK',
    docxHeader.toString('hex')
  )

  // Expand-Archive only accepts a .zip extension, so expand a copy.
  const docxZipPath = path.join(TMP, 'export-smoke.zip')
  fs.copyFileSync(docxPath, docxZipPath)

  const extractDir = path.join(TMP, 'docx-extracted')
  fs.rmSync(extractDir, { recursive: true, force: true })
  try {
    execFileSync(
      'powershell.exe',
      [
        '-NoProfile',
        '-NonInteractive',
        '-Command',
        `Expand-Archive -LiteralPath '${docxZipPath}' -DestinationPath '${extractDir}' -Force`
      ],
      { stdio: 'pipe' }
    )
  } catch (error) {
    check('DOCX unzips as an OOXML package', false, String(error.message).slice(0, 300))
    win.destroy()
    return
  }

  check('DOCX unzips as an OOXML package', true)

  const documentXml = fs.readFileSync(path.join(extractDir, 'word', 'document.xml'), 'utf8')
  const mediaDir = path.join(extractDir, 'word', 'media')
  const media = fs.existsSync(mediaDir) ? fs.readdirSync(mediaDir) : []

  check('DOCX contains the heading text', documentXml.includes('Exported Title'))
  check('DOCX contains list content', documentXml.includes('first bullet'))
  check('DOCX contains the table', documentXml.includes('<w:tbl>'))
  check('DOCX contains the blockquote', documentXml.includes('A quoted line'))
  check('DOCX embedded the formula as an image', media.length >= 1, `${media.length} media files`)
  console.log(`         wrote ${path.relative(ROOT, docxPath)} (${docx.length} bytes, ${media.length} media)`)

  win.destroy()
}

app.whenReady().then(async () => {
  fs.mkdirSync(TMP, { recursive: true })

  try {
    await testApplicationWindow()
    await testExports()
  } catch (error) {
    failures.push(`unhandled: ${error && error.stack ? error.stack : error}`)
    console.error(error)
  }

  console.log(`\n${failures.length === 0 ? 'All checks passed.' : `${failures.length} check(s) failed:`}`)
  for (const failure of failures) console.log(`  - ${failure}`)

  app.exit(failures.length === 0 ? 0 : 1)
})

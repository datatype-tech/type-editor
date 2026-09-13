'use strict'

/**
 * Draws the application icon and writes it where electron-builder looks for it.
 *
 *   node_modules/.bin/electron scripts/make-icon.cjs
 *
 * The icon is the mark on a tile of its own colour: at 16px a thin mark on a
 * transparent ground turns to mush, and a tile is what a taskbar expects.
 * Development helper — the output is committed, not generated during a build.
 */

const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

// Captures must be one pixel per pixel, whatever the display's scaling is set
// to, or an icon "16px" frame comes out 24px on a 150% screen.
app.commandLine.appendSwitch('force-device-scale-factor', '1')

const ROOT = path.join(__dirname, '..')
const BUILD = path.join(ROOT, 'build')

/** Sizes Windows asks for. 256 is what the installer and Explorer use. */
const SIZES = [16, 24, 32, 48, 64, 128, 256]

const ACCENT = '#b0553a'

/** The mark, from the same coordinates `lib/logo.ts` draws in the interface. */
const BARS = [
  [2.8, 3.2, 3.2, 17.6],
  [9.2, 4.6, 12.2, 3.2],
  [9.2, 10.4, 9.2, 3.2],
  [9.2, 16.2, 6.2, 3.2]
]

/**
 * The icon in a 256-unit square, sized to whatever the page is: one drawing,
 * scaled by the window rather than redrawn per size.
 */
function svg() {
  const scale = (256 * 0.6) / 24
  const offset = (256 - 24 * scale) / 2
  const bars = BARS.map(
    ([x, y, width, height]) =>
      `<rect x="${x}" y="${y}" width="${width}" height="${height}" rx="1.6"/>`
  ).join('')

  return `<svg xmlns="http://www.w3.org/2000/svg" width="100%" height="100%" viewBox="0 0 256 256">
  <rect width="256" height="256" rx="56" fill="${ACCENT}"/>
  <g transform="translate(${offset.toFixed(2)},${offset.toFixed(2)}) scale(${scale.toFixed(4)})" fill="#ffffff">${bars}</g>
</svg>`
}

function page() {
  return `<!doctype html><meta charset="utf-8">
<style>html,body{margin:0;padding:0;background:transparent;overflow:hidden}svg{display:block}</style>
${svg()}`
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One window, resized per frame: a fresh window per size aborts its own load. */
async function openCanvas() {
  const window = new BrowserWindow({
    width: 256,
    height: 256,
    useContentSize: true,
    show: false,
    frame: false,
    transparent: true,
    resizable: false
  })
  await window.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(page())}`)
  await sleep(400)
  return window
}

async function render(window, size) {
  window.setContentSize(size, size)
  await sleep(120)
  window.webContents.invalidate()
  await sleep(120)
  const image = await window.webContents.capturePage()
  return image.toPNG()
}

/** Packs PNG frames into an .ico. Windows has accepted PNG entries since Vista. */
function ico(frames) {
  const header = Buffer.alloc(6)
  header.writeUInt16LE(0, 0)
  header.writeUInt16LE(1, 2)
  header.writeUInt16LE(frames.length, 4)

  const entries = Buffer.alloc(16 * frames.length)
  let offset = header.length + entries.length

  frames.forEach((frame, index) => {
    const at = index * 16
    // 256 is written as 0: the field is one byte.
    entries.writeUInt8(frame.size >= 256 ? 0 : frame.size, at)
    entries.writeUInt8(frame.size >= 256 ? 0 : frame.size, at + 1)
    entries.writeUInt8(0, at + 2)
    entries.writeUInt8(0, at + 3)
    entries.writeUInt16LE(1, at + 4)
    entries.writeUInt16LE(32, at + 6)
    entries.writeUInt32LE(frame.png.length, at + 8)
    entries.writeUInt32LE(offset, at + 12)
    offset += frame.png.length
  })

  return Buffer.concat([header, entries, ...frames.map((frame) => frame.png)])
}

app.whenReady().then(async () => {
  fs.mkdirSync(BUILD, { recursive: true })

  const window = await openCanvas()
  const frames = []
  for (const size of SIZES) {
    frames.push({ size, png: await render(window, size) })
    console.log(`  rendered ${size}×${size}`)
  }

  const icon = ico(frames)
  const icoPath = path.join(BUILD, 'icon.ico')
  fs.writeFileSync(icoPath, icon)
  console.log(`wrote ${path.relative(ROOT, icoPath)} (${icon.length} bytes, ${SIZES.length} sizes)`)

  // Other platforms, and the source everyone can look at.
  const large = await render(window, 1024)
  fs.writeFileSync(path.join(BUILD, 'icon.png'), large)
  console.log(`wrote ${path.relative(ROOT, path.join(BUILD, 'icon.png'))}`)
  fs.writeFileSync(path.join(BUILD, 'icon.svg'), svg())
  console.log(`wrote ${path.relative(ROOT, path.join(BUILD, 'icon.svg'))}`)

  window.destroy()
  app.exit(0)
})

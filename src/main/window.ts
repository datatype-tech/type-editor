import { BrowserWindow, shell } from 'electron'
import { join } from 'node:path'
import { IPC } from '../shared/ipc'

/**
 * The window is frameless everywhere: macOS keeps its native traffic lights via
 * `hiddenInset`, while Windows and Linux get the custom title bar the renderer
 * draws. The renderer therefore owns the whole top edge of the app.
 */
function frameOptions(): Electron.BrowserWindowConstructorOptions {
  if (process.platform === 'darwin') {
    return { titleBarStyle: 'hiddenInset', trafficLightPosition: { x: 18, y: 18 } }
  }
  return { frame: false }
}

export function createMainWindow(): BrowserWindow {
  const iconPath =
    process.platform === 'win32'
      ? join(__dirname, '../../build/icon.ico')
      : join(__dirname, '../../build/icon.png')

  const window = new BrowserWindow({
    width: 1180,
    height: 820,
    minWidth: 620,
    minHeight: 420,
    show: false,
    icon: iconPath,
    backgroundColor: '#ffffff',
    ...frameOptions(),
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      spellcheck: false
    }
  })

  window.once('ready-to-show', () => window.show())

  const publishMaximized = (): void => {
    if (!window.isDestroyed()) {
      window.webContents.send(IPC.windowMaximizeChanged, window.isMaximized())
    }
  }
  window.on('maximize', publishMaximized)
  window.on('unmaximize', publishMaximized)

  // Keep every outbound link in the user's real browser.
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) void shell.openExternal(url)
    return { action: 'deny' }
  })

  const devServer = process.env['ELECTRON_RENDERER_URL']
  if (devServer) {
    void window.loadURL(devServer)
  } else {
    void window.loadFile(join(__dirname, '../renderer/index.html'))
  }

  return window
}

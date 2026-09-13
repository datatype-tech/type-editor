import { app, BrowserWindow } from 'electron'
import { attachCloseGuard, registerIpc } from './ipc'
import { buildAppMenu } from './menu'
import { updater } from './updater'
import { createMainWindow } from './window'

let mainWindow: BrowserWindow | null = null

const getWindow = (): BrowserWindow | null => mainWindow

function openWindow(): void {
  mainWindow = createMainWindow()
  attachCloseGuard(getWindow)
  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Silently check for updates shortly after launch so close-time prompt is ready if needed
  setTimeout(() => {
    void updater.checkForUpdates(true)
  }, 4000)
}

void app.whenReady().then(() => {
  // The menu is rebuilt whenever the renderer switches the interface language.
  registerIpc(getWindow, () => buildAppMenu(getWindow))
  buildAppMenu(getWindow)
  openWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) openWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

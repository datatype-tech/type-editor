import { Menu, type BrowserWindow, type MenuItemConstructorOptions } from 'electron'
import { IPC, type MenuCommand } from '../shared/ipc'
import { mainStrings } from '../shared/strings'
import { currentLocale } from './ipc'

/**
 * The application menu forwards every document command to the renderer, which
 * owns the buffer and the tab strip. Nothing here touches the document
 * directly. It is rebuilt whenever the interface language changes.
 */
export function buildAppMenu(getWindow: () => BrowserWindow | null): void {
  const t = mainStrings(currentLocale())

  const dispatch = (command: MenuCommand) => (): void => {
    const window = getWindow()
    if (window && !window.isDestroyed()) window.webContents.send(IPC.menuCommand, command)
  }

  const isMac = process.platform === 'darwin'

  const template: MenuItemConstructorOptions[] = [
    ...(isMac ? [{ role: 'appMenu' as const }] : []),
    {
      label: t('menu.file'),
      submenu: [
        { label: t('menu.new'), accelerator: 'CmdOrCtrl+N', click: dispatch('new') },
        { label: t('menu.open'), accelerator: 'CmdOrCtrl+O', click: dispatch('open') },
        { type: 'separator' },
        { label: t('menu.save'), accelerator: 'CmdOrCtrl+S', click: dispatch('save') },
        { label: t('menu.saveAs'), accelerator: 'CmdOrCtrl+Shift+S', click: dispatch('save-as') },
        {
          label: t('menu.autoSave'),
          accelerator: 'CmdOrCtrl+Shift+A',
          click: dispatch('toggle-autosave')
        },
        { type: 'separator' },
        { label: t('menu.exportPng'), accelerator: 'CmdOrCtrl+Shift+E', click: dispatch('export-png') },
        { label: t('menu.exportDocx'), accelerator: 'CmdOrCtrl+Shift+W', click: dispatch('export-docx') },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: t('menu.edit'),
      submenu: [
        { role: 'undo' },
        { role: 'redo' },
        { type: 'separator' },
        { role: 'cut' },
        { role: 'copy' },
        { role: 'paste' },
        { role: 'selectAll' },
        { type: 'separator' },
        { label: t('menu.find'), accelerator: 'CmdOrCtrl+F', click: dispatch('find') },
        { type: 'separator' },
        { label: t('menu.settings'), accelerator: 'CmdOrCtrl+,', click: dispatch('settings') }
      ]
    },
    {
      label: t('menu.format'),
      submenu: [
        {
          label: t('menu.inlineCode'),
          accelerator: 'CmdOrCtrl+E',
          click: dispatch('insert-inline-code')
        },
        {
          label: t('menu.codeBlock'),
          accelerator: 'CmdOrCtrl+Shift+K',
          click: dispatch('insert-code-block')
        }
      ]
    },
    {
      label: t('menu.view'),
      submenu: [
        { label: t('menu.home'), accelerator: 'CmdOrCtrl+Shift+H', click: dispatch('home') },
        {
          label: t('menu.sourceMode'),
          accelerator: 'CmdOrCtrl+/',
          click: dispatch('toggle-source')
        },
        // No accelerator: Ctrl+Tab is claimed in the renderer, where the tab
        // strip lives.
        { label: t('menu.outline'), accelerator: 'CmdOrCtrl+Shift+O', click: dispatch('toggle-outline') },
        { label: t('menu.focus'), accelerator: 'CmdOrCtrl+Shift+F', click: dispatch('toggle-focus') },
        { label: t('menu.typewriter'), accelerator: 'CmdOrCtrl+Shift+T', click: dispatch('toggle-typewriter') },
        { type: 'separator' },
        { role: 'toggleDevTools' },
        { type: 'separator' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    },
    {
      label: t('menu.window'),
      submenu: [
        { role: 'minimize' },
        { role: 'zoom' },
        ...(isMac ? [{ type: 'separator' as const }, { role: 'front' as const }] : [])
      ]
    },
    {
      role: 'help',
      submenu: [
        { label: t('menu.about'), click: dispatch('about') }
      ]
    }
  ]

  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

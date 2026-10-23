const { app, BrowserWindow, dialog, ipcMain, shell } = require('electron')
const { join } = require('node:path')
const { stat } = require('node:fs/promises')
const { isAbsolute, normalize } = require('node:path')

const url = process.env.GROK_WEB_URL || 'http://127.0.0.1:5173/'
const icon = process.env.GROK_WEB_ICON || join(__dirname, '..', 'public', 'grok-icon.ico')
const appId = 'com.grokbuild.web.desktop.v3'

if (process.platform === 'win32') app.setAppUserModelId(appId)

function isAppUrl(target) {
  try {
    const parsed = new URL(target)
    const allowed = new URL(url)
    return parsed.origin === allowed.origin
  } catch {
    return false
  }
}

ipcMain.handle('pick-folder', async (event, start) => {
  const sender = event.senderFrame?.url || event.sender.getURL()
  if (!isAppUrl(sender)) throw new Error('不允许的调用来源')
  const options = {
    title: '选择项目文件夹',
    properties: ['openDirectory', 'createDirectory'],
  }
  if (typeof start === 'string' && start.trim()) options.defaultPath = start.trim()
  const win = BrowserWindow.fromWebContents(event.sender)
  const result = win
    ? await dialog.showOpenDialog(win, options)
    : await dialog.showOpenDialog(options)
  if (result.canceled || result.filePaths.length === 0) return null
  return result.filePaths[0]
})

ipcMain.handle('reveal-file', async (event, path) => {
  if (event.senderFrame !== event.sender.mainFrame || !isAppUrl(event.senderFrame.url)) {
    throw new Error('不允许的调用来源')
  }
  if (typeof path !== 'string' || !isAbsolute(path) || path.includes('\0')) {
    throw new Error('需要有效的本地绝对路径')
  }
  const target = normalize(path)
  await stat(target)
  // Run in the foreground desktop process, not the background HTTP server.
  shell.showItemInFolder(target)
})

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 840,
    minWidth: 880,
    minHeight: 560,
    title: 'Grok Build',
    backgroundColor: '#000000',
    autoHideMenuBar: true,
    icon: icon || undefined,
    webPreferences: {
      preload: join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      plugins: true,
    },
  })
  win.setMenuBarVisibility(false)
  if (process.platform === 'win32') {
    // The taskbar identity must not inherit the bundled electron.exe icon.
    // Keep the AUMID stable: Windows caches taskbar icons by this identity.
    win.setAppDetails({ appId, appIconPath: icon, appIconIndex: 0 })
  }

  win.webContents.setWindowOpenHandler(({ url: target }) => {
    if (isAppUrl(target)) return { action: 'allow' }
    void shell.openExternal(target)
    return { action: 'deny' }
  })

  win.webContents.on('will-navigate', (event, target) => {
    if (isAppUrl(target)) return
    event.preventDefault()
    void shell.openExternal(target)
  })

  void win.loadURL(url)
}

app.whenReady().then(createWindow)

app.on('window-all-closed', () => {
  app.quit()
})

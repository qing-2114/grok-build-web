const { app, BrowserWindow, shell } = require('electron')

const url = process.env.GROK_WEB_URL || 'http://127.0.0.1:5173/'
const icon = process.env.GROK_WEB_ICON || ''

function isAppUrl(target) {
  try {
    const parsed = new URL(target)
    const allowed = new URL(url)
    return parsed.origin === allowed.origin
  } catch {
    return false
  }
}

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
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })
  win.setMenuBarVisibility(false)

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

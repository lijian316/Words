const { app, BrowserWindow, shell } = require('electron/main')
const serve = require('electron-serve')
const path = require('path')

app.whenReady().then(() => {
  const isDev = !app.isPackaged

  const loadURL = serve({
    directory: isDev
      ? path.join(__dirname, '../nuxt/.output/public')
      : path.join(process.resourcesPath, 'web'),
  })

  function createWindow() {
    const win = new BrowserWindow({
      width: 1400,
      height: 900,
      minWidth: 900,
      minHeight: 600,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
      },
      autoHideMenuBar: true,
      title: 'TypeWords',
    })

    if (isDev) {
      win.loadURL('http://localhost:5567')
      win.webContents.openDevTools()
    } else {
      loadURL(win)
    }

    // 外部链接在默认浏览器中打开
    win.webContents.setWindowOpenHandler(({ url }) => {
      shell.openExternal(url)
      return { action: 'deny' }
    })
  }

  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

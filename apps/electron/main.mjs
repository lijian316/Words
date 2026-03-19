import { app, BrowserWindow, shell } from 'electron/main'
import { createServer } from 'node:http'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'

const isDev = !app.isPackaged

function getMimeType(ext) {
  const map = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml',
    '.ico': 'image/x-icon',
    '.woff2': 'font/woff2',
    '.woff': 'font/woff',
    '.ttf': 'font/ttf',
    '.mp3': 'audio/mpeg',
  }
  return map[ext] || 'application/octet-stream'
}

async function startStaticServer(rootDir) {
  const server = createServer(async (req, res) => {
    let urlPath = req.url.split('?')[0]
    if (urlPath === '/') urlPath = '/index.html'

    let filePath = path.join(rootDir, urlPath)

    try {
      await stat(filePath)
    } catch {
      // 文件不存在时返回 index.html（SPA fallback）
      filePath = path.join(rootDir, 'index.html')
    }

    // 如果是目录，尝试 index.html
    try {
      const s = await stat(filePath)
      if (s.isDirectory()) filePath = path.join(filePath, 'index.html')
    } catch {
      filePath = path.join(rootDir, 'index.html')
    }

    try {
      const content = await readFile(filePath)
      const ext = path.extname(filePath)
      res.writeHead(200, { 'Content-Type': getMimeType(ext) })
      res.end(content)
    } catch {
      res.writeHead(404)
      res.end('Not found')
    }
  })

  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      resolve(server.address().port)
    })
  })
}

app.whenReady().then(async () => {
  let appUrl

  if (isDev) {
    appUrl = 'http://localhost:5567'
  } else {
    const webDir = path.join(process.resourcesPath, 'web')
    const port = await startStaticServer(webDir)
    appUrl = `http://127.0.0.1:${port}`
  }

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

    win.loadURL(appUrl)

    if (isDev) {
      win.webContents.openDevTools()
    }

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

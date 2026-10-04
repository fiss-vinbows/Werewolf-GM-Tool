// PC用デスクトップアプリ（Electron）の起動処理。
// ビルド済みの dist/ を独自スキーム app:// で配信する。オリジンが固定されるため、
// localStorage（ゲームの自動保存・参加者名簿）がアプリを閉じても保持される。
const { app, BrowserWindow, Menu, protocol, net, shell } = require('electron')
const path = require('node:path')
const { pathToFileURL } = require('node:url')

const DIST = path.join(__dirname, '..', 'dist')

protocol.registerSchemesAsPrivileged([{ scheme: 'app', privileges: { standard: true, secure: true, supportFetchAPI: true } }])

// 二重起動すると同じ保存データを2つの窓で書き換えてしまうため、1つに限定する。
if (!app.requestSingleInstanceLock()) app.quit()

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 900,
    title: '人狼GM記録ツール',
    icon: path.join(DIST, 'pwa-512x512.png'),
    webPreferences: { contextIsolation: true, sandbox: true },
  })
  // 外部リンクは既定のブラウザで開く。
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.loadURL(process.env.ELECTRON_DEV_URL || 'app://local/index.html')
  return win
}

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(() => {
  protocol.handle('app', (request) => {
    const { pathname } = new URL(request.url)
    const file = path.normalize(path.join(DIST, decodeURIComponent(pathname)))
    // dist/ の外へのアクセスは拒否する。
    if (!file.startsWith(DIST)) return new Response('Not Found', { status: 404 })
    return net.fetch(pathToFileURL(file).toString())
  })
  Menu.setApplicationMenu(
    Menu.buildFromTemplate([
      {
        label: '表示',
        submenu: [
          { role: 'reload', label: '再読み込み' },
          { role: 'togglefullscreen', label: '全画面' },
          { type: 'separator' },
          { role: 'resetZoom', label: '拡大率をリセット' },
          { role: 'zoomIn', label: '拡大' },
          { role: 'zoomOut', label: '縮小' },
          { type: 'separator' },
          { role: 'toggleDevTools', label: '開発者ツール' },
        ],
      },
    ]),
  )
  createWindow()
})

app.on('window-all-closed', () => app.quit())

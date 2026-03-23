import { app, BrowserWindow, ipcMain, dialog, protocol, shell, screen } from 'electron'
import path from 'path'
import fs from 'fs'
import { PtyService } from './services/pty.service'
import { GitService } from './services/git.service'
import { FileService } from './services/file.service'
import { WorkspaceService } from './services/workspace.service'
import { BrowserService } from './services/browser.service'
import { ExtensionService } from './services/extension.service'
import { ExtensionHostService } from './services/extension-host.service'
import {
  initAppLogger,
  forScope,
  writeFromRenderer,
  getRecentLogs,
  clearRingBuffer,
  getLogFilePath,
  subscribeLog,
  type LogLevel,
} from './logging/app-logger'
import { Scopes } from './logging/scopes'

const protoLog = forScope(Scopes.mainExtensionProtocol)
const rpcLog = forScope(Scopes.mainExtensionRpc)
const bridgeLog = forScope(Scopes.mainExtensionBridge)

let mainWindow: BrowserWindow | null = null
const ptyService = new PtyService()
const gitService = new GitService()
const fileService = new FileService()
const workspaceService = new WorkspaceService()
const browserService = new BrowserService()
const extensionService = new ExtensionService()
const extensionHostService = new ExtensionHostService()

const THEME_CHROME_FILENAME = 'theme-chrome.json'
const WINDOW_STATE_FILENAME = 'window-state.json'

const DEFAULT_WINDOW_WIDTH = 1400
const DEFAULT_WINDOW_HEIGHT = 900
const WINDOW_MIN_WIDTH = 800
const WINDOW_MIN_HEIGHT = 600

interface PersistedWindowState {
  x: number
  y: number
  width: number
  height: number
  isMaximized: boolean
}

function readPersistedWindowState(): PersistedWindowState | null {
  try {
    const fp = path.join(app.getPath('userData'), WINDOW_STATE_FILENAME)
    if (!fs.existsSync(fp)) return null
    const j = JSON.parse(fs.readFileSync(fp, 'utf-8')) as Partial<PersistedWindowState>
    const width = Number(j.width)
    const height = Number(j.height)
    const x = Number(j.x)
    const y = Number(j.y)
    if (![width, height, x, y].every((n) => Number.isFinite(n))) return null
    if (width < WINDOW_MIN_WIDTH || height < WINDOW_MIN_HEIGHT) return null
    return {
      x,
      y,
      width,
      height,
      isMaximized: Boolean(j.isMaximized),
    }
  } catch {
    return null
  }
}

function windowStateIntersectsDisplay(rect: Electron.Rectangle): boolean {
  return screen.getAllDisplays().some((d) => {
    const wa = d.workArea
    const right = rect.x + rect.width
    const bottom = rect.y + rect.height
    return right > wa.x && rect.x < wa.x + wa.width && bottom > wa.y && rect.y < wa.y + wa.height
  })
}

function writePersistedWindowState(win: BrowserWindow) {
  try {
    const isMaximized = win.isMaximized()
    const b = win.getNormalBounds()
    const state: PersistedWindowState = {
      x: b.x,
      y: b.y,
      width: Math.max(WINDOW_MIN_WIDTH, b.width),
      height: Math.max(WINDOW_MIN_HEIGHT, b.height),
      isMaximized,
    }
    const fp = path.join(app.getPath('userData'), WINDOW_STATE_FILENAME)
    fs.writeFileSync(fp, JSON.stringify(state), 'utf-8')
  } catch {
    /* ignore */
  }
}

function readThemeChromeBackground(): string {
  try {
    const fp = path.join(app.getPath('userData'), THEME_CHROME_FILENAME)
    if (!fs.existsSync(fp)) return '#1e1e2e'
    const raw = fs.readFileSync(fp, 'utf-8')
    const j = JSON.parse(raw) as { backgroundColor?: string }
    const c = j.backgroundColor
    if (typeof c === 'string' && /^#[0-9a-fA-F]{6}$/.test(c.trim())) {
      return c.trim()
    }
  } catch {
    /* ignore */
  }
  return '#1e1e2e'
}

function resolveAppIconPath(): string | undefined {
  const fromPublic = path.join(__dirname, '../public/orbis-icon.png')
  const fromDist = path.join(__dirname, '../dist/orbis-icon.png')
  if (fs.existsSync(fromPublic)) return fromPublic
  if (fs.existsSync(fromDist)) return fromDist
  return undefined
}

function createWindow() {
  const saved = readPersistedWindowState()
  const useSaved = !!(saved && windowStateIntersectsDisplay(saved))
  const rect = useSaved
    ? saved!
    : {
        x: undefined as number | undefined,
        y: undefined as number | undefined,
        width: DEFAULT_WINDOW_WIDTH,
        height: DEFAULT_WINDOW_HEIGHT,
        isMaximized: false,
      }

  const appIcon = resolveAppIconPath()

  mainWindow = new BrowserWindow({
    x: rect.x,
    y: rect.y,
    width: rect.width,
    height: rect.height,
    minWidth: WINDOW_MIN_WIDTH,
    minHeight: WINDOW_MIN_HEIGHT,
    frame: false,
    // macOS: inset traffic lights so they do not overlap custom UI; Windows keeps hidden chrome.
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'hidden',
    backgroundColor: readThemeChromeBackground(),
    ...(appIcon ? { icon: appIcon } : {}),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  })

  if (useSaved && saved!.isMaximized) {
    mainWindow.maximize()
  }

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

  const broadcastMaximized = () => {
    if (!mainWindow) return
    mainWindow.webContents.send('window:maximize-changed', mainWindow.isMaximized())
  }
  mainWindow.on('maximize', broadcastMaximized)
  mainWindow.on('unmaximize', broadcastMaximized)
  mainWindow.webContents.on('did-finish-load', broadcastMaximized)

  mainWindow.on('close', () => {
    if (mainWindow) writePersistedWindowState(mainWindow)
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

protocol.registerSchemesAsPrivileged([
  {
    scheme: 'vscode-webview-resource',
    privileges: {
      standard: true,
      secure: true,
      supportFetchAPI: true,
      corsEnabled: true,
      bypassCSP: false,
    },
  },
])

app.whenReady().then(() => {
  initAppLogger()
  ptyService.primeShellEnv()

  protocol.handle('vscode-webview-resource', async (request) => {
    const parsed = new URL(request.url)
    let filePath = decodeURIComponent(parsed.pathname)
    if (process.platform === 'win32') {
      if (parsed.hostname) {
        filePath = parsed.hostname.toUpperCase() + ':' + filePath
      } else if (filePath.startsWith('/')) {
        filePath = filePath.slice(1)
      }
    }

    const mimeTypes: Record<string, string> = {
      '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
      '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
      '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.svg': 'image/svg+xml',
      '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf',
      '.ico': 'image/x-icon', '.webp': 'image/webp', '.mp3': 'audio/mpeg',
      '.wav': 'audio/wav', '.mp4': 'video/mp4', '.webm': 'video/webm',
    }
    const ext = path.extname(filePath).toLowerCase()
    const contentType = mimeTypes[ext] || 'application/octet-stream'

    const fileExists = fs.existsSync(filePath)
    protoLog.debug(
      `${fileExists ? 'resolve_ok' : 'missing'} ${contentType}`,
      filePath,
    )

    try {
      const data = fs.readFileSync(filePath)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' },
      })
    } catch (err: any) {
      protoLog.error('read_failed', `${filePath} — ${err.message}`)
      return new Response('Not Found', { status: 404 })
    }
  })

  createWindow()
  registerIpcHandlers()
})

app.on('window-all-closed', async () => {
  ptyService.disposeAll()
  await extensionHostService.stop()
  app.quit()
})

app.on('activate', () => {
  if (mainWindow === null) createWindow()
})

function registerIpcHandlers() {
  const validLevels = new Set<LogLevel>(['debug', 'info', 'warn', 'error'])

  ipcMain.handle('app-log:getRecent', () => getRecentLogs())
  ipcMain.handle('app-log:clearBuffer', () => {
    clearRingBuffer()
    return true
  })
  ipcMain.handle('app-log:revealLogFile', () => {
    const fp = getLogFilePath()
    if (!fp) return false
    shell.showItemInFolder(fp)
    return true
  })
  ipcMain.on('app-log:write', (_e, payload: unknown) => {
    if (!payload || typeof payload !== 'object') return
    const p = payload as Record<string, unknown>
    const level = p.level
    const scope = p.scope
    const message = p.message
    const detailRaw = p.detail
    if (typeof level !== 'string' || !validLevels.has(level as LogLevel)) return
    if (typeof scope !== 'string' || typeof message !== 'string') return
    if (scope.length > 512 || message.length > 20_000) return
    let detail: string | undefined
    if (detailRaw !== undefined) {
      if (typeof detailRaw !== 'string' || detailRaw.length > 40_000) return
      detail = detailRaw
    }
    writeFromRenderer(level as LogLevel, scope, message, detail)
  })

  subscribeLog((entry) => {
    mainWindow?.webContents.send('app-log:entry', entry)
  })

  // Window controls
  ipcMain.handle('window:isMaximized', () => Boolean(mainWindow?.isMaximized()))
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.handle('window:syncChromeBackground', (_e, hex: unknown) => {
    if (typeof hex !== 'string') return
    const trimmed = hex.trim()
    if (!/^#[0-9a-fA-F]{6}$/.test(trimmed)) return
    try {
      const fp = path.join(app.getPath('userData'), THEME_CHROME_FILENAME)
      fs.writeFileSync(fp, JSON.stringify({ backgroundColor: trimmed }), 'utf-8')
    } catch {
      /* ignore */
    }
    mainWindow?.setBackgroundColor(trimmed)
  })

  // PTY
  ipcMain.handle(
    'pty:create',
    async (_e, { cols, rows, cwd }: { cols: number; rows: number; cwd: string }) => {
      return await ptyService.create(cols, rows, cwd)
    },
  )
  ipcMain.on('pty:write', (_e, { id, data }: { id: string; data: string }) => {
    ptyService.write(id, data)
  })
  ipcMain.on('pty:resize', (_e, { id, cols, rows }: { id: string; cols: number; rows: number }) => {
    ptyService.resize(id, cols, rows)
  })
  ipcMain.on('pty:dispose', (_e, { id }: { id: string }) => {
    ptyService.dispose(id)
  })
  ptyService.onData((id, data) => {
    mainWindow?.webContents.send('pty:data', { id, data })
  })

  // File system
  ipcMain.handle('fs:readDir', (_e, dirPath: string) => fileService.readDir(dirPath))
  ipcMain.handle('fs:readFile', (_e, filePath: string) => fileService.readFile(filePath))
  ipcMain.handle('fs:writeFile', (_e, { filePath, content }: { filePath: string; content: string }) => {
    return fileService.writeFile(filePath, content)
  })
  ipcMain.handle('fs:createFile', (_e, filePath: string) => fileService.createFile(filePath))
  ipcMain.handle('fs:createDir', (_e, dirPath: string) => fileService.createDir(dirPath))
  ipcMain.handle('fs:deletePath', (_e, targetPath: string) => fileService.deletePath(targetPath))
  ipcMain.handle('fs:renamePath', (_e, { oldPath, newPath }: { oldPath: string; newPath: string }) => {
    return fileService.renamePath(oldPath, newPath)
  })
  ipcMain.handle('fs:stat', (_e, filePath: string) => fileService.stat(filePath))
  ipcMain.handle('fs:exists', (_e, filePath: string) => fileService.exists(filePath))
  ipcMain.handle('fs:watch', (_e, dirPath: string) => {
    fileService.startWatch(dirPath, (_eventType, _filename) => {
      mainWindow?.webContents.send('fs:changed', { dirPath })
    })
    return true
  })
  ipcMain.handle('fs:unwatch', (_e, dirPath: string) => {
    fileService.stopWatch(dirPath)
    return true
  })

  // Git — all return plain serializable objects
  ipcMain.handle('git:isRepo', (_e, cwd: string) => gitService.isGitRepo(cwd))
  ipcMain.handle('git:init', (_e, cwd: string) => gitService.init(cwd))
  ipcMain.handle('git:status', (_e, cwd: string) => gitService.status(cwd))
  ipcMain.handle('git:stage', (_e, { cwd, files }: { cwd: string; files: string[] }) => {
    return gitService.stage(cwd, files)
  })
  ipcMain.handle('git:unstage', (_e, { cwd, files }: { cwd: string; files: string[] }) => {
    return gitService.unstage(cwd, files)
  })
  ipcMain.handle('git:commit', (_e, { cwd, message }: { cwd: string; message: string }) => {
    return gitService.commit(cwd, message)
  })
  ipcMain.handle('git:log', (_e, { cwd, maxCount }: { cwd: string; maxCount?: number }) => {
    return gitService.log(cwd, maxCount)
  })
  ipcMain.handle('git:diff', (_e, { cwd, file }: { cwd: string; file?: string }) => {
    return gitService.diff(cwd, file)
  })
  ipcMain.handle('git:getRemoteOriginInfo', (_e, cwd: string) => gitService.getRemoteOriginInfo(cwd))

  ipcMain.handle('shell:openExternal', (_e, url: string) => shell.openExternal(url))

  // Workspace persistence
  ipcMain.handle('workspace:loadAll', () => workspaceService.loadAll())
  ipcMain.handle('workspace:loadSession', () => workspaceService.loadSession())
  ipcMain.handle('workspace:saveSession', (_e, data: any) =>
    workspaceService.saveSession(data),
  )
  ipcMain.handle('workspace:loadById', (_e, id: string) => workspaceService.loadById(id))
  ipcMain.handle('workspace:listSummaries', () => workspaceService.listSummaries())
  ipcMain.handle('workspace:save', (_e, data: any) => workspaceService.save(data))
  ipcMain.handle('workspace:delete', (_e, id: string) => workspaceService.delete(id))

  // Dialog
  ipcMain.handle('dialog:openDirectory', async () => {
    const result = await dialog.showOpenDialog(mainWindow!, {
      properties: ['openDirectory'],
    })
    return result.canceled ? null : result.filePaths[0]
  })

  // Browser
  ipcMain.handle('browser:detectProfiles', () => browserService.detectProfiles())
  ipcMain.handle('browser:importProfile', (_e, profilePath: string) => {
    return browserService.importProfile(profilePath)
  })
  ipcMain.handle('browser:importBookmarks', (_e, profilePath: string) => {
    return browserService.importBookmarks(profilePath)
  })
  ipcMain.handle('browser:clearData', () => {
    browserService.clearBrowsingData()
    return true
  })

  // Extensions — marketplace & management
  ipcMain.handle('ext:search', (_e, query: string) => extensionService.search(query))
  ipcMain.handle('ext:details', (_e, { publisher, name }: { publisher: string; name: string }) => {
    return extensionService.getDetails(publisher, name)
  })
  ipcMain.handle('ext:install', (_e, { publisher, name }: { publisher: string; name: string }) => {
    return extensionService.install(publisher, name)
  })
  ipcMain.handle('ext:uninstall', (_e, extId: string) => extensionService.uninstall(extId))
  ipcMain.handle('ext:listInstalled', () => extensionService.listInstalled())
  ipcMain.handle('ext:toggle', (_e, { extId, enabled }: { extId: string; enabled: boolean }) => {
    return extensionService.toggleExtension(extId, enabled)
  })
  ipcMain.handle('ext:getThemes', () => extensionService.getThemes())
  ipcMain.handle('ext:loadTheme', (_e, themePath: string) => extensionService.loadThemeFile(themePath))

  // Extension host
  ipcMain.handle('exthost:start', async (_e, { workspaceFolders }: { workspaceFolders: string[] }) => {
    rpcLog.info('exthost_start', JSON.stringify({ workspaceFolders }))
    const extensions = await extensionService.listInstalled()
    rpcLog.info(
      'installed_extensions',
      extensions.map((e) => `${e.id} (${e.enabled ? 'on' : 'off'})`).join(', '),
    )
    try {
      await extensionHostService.start(extensions, workspaceFolders)
      rpcLog.info('exthost_started', 'ok')
      return { ok: true }
    } catch (err: any) {
      rpcLog.error('exthost_start_failed', err.message)
      throw err
    }
  })
  ipcMain.handle('exthost:stop', () => extensionHostService.stop())
  ipcMain.handle('exthost:activate', async (_e, extensionId: string) => {
    rpcLog.info('activate', extensionId)
    try {
      const result = await extensionHostService.activateExtension(extensionId)
      rpcLog.info('activated', extensionId)
      return result
    } catch (err: any) {
      rpcLog.error('activate_failed', `${extensionId}: ${err.message}`)
      throw err
    }
  })
  ipcMain.handle('exthost:executeCommand', (_e, { command, args }: { command: string; args: any[] }) => {
    return extensionHostService.executeCommand(command, ...args)
  })
  ipcMain.handle('exthost:status', () => extensionHostService.getStatus())
  ipcMain.handle('exthost:getExtensionPanels', async () => {
    rpcLog.debug('get_extension_panels', `host_running=${extensionHostService.isRunning}`)
    try {
      const panels = await extensionHostService.getRegisteredExtensionPanels()
      rpcLog.info('extension_panels', panels.map((v) => v.viewId).join(', ') || '(none)')
      return panels
    } catch (err: any) {
      rpcLog.error('get_extension_panels_failed', err.message)
      throw err
    }
  })
  ipcMain.handle('exthost:resolveView', async (_e, viewId: string) => {
    rpcLog.debug('resolve_view', viewId)
    try {
      const result = await extensionHostService.resolveWebviewView(viewId)
      rpcLog.info('view_resolved', `${viewId} ${result?.html?.length || 0} bytes`)
      return result
    } catch (err: any) {
      rpcLog.error('resolve_view_failed', `${viewId}: ${err.message}`)
      throw err
    }
  })
  ipcMain.handle('exthost:webviewMessage', (_e, { viewId, message }: { viewId: string; message: any }) => {
    return extensionHostService.sendWebviewMessage(viewId, message)
  })

  // Forward extension host messages to renderer
  extensionHostService.onMessage((method, params) => {
    if (!mainWindow) return
    switch (method) {
      case 'statusBar.update':
        mainWindow.webContents.send('ext:statusBarUpdate', params)
        break
      case 'statusBar.remove':
        mainWindow.webContents.send('ext:statusBarRemove', params.id)
        break
      case 'statusBar.message':
        mainWindow.webContents.send('ext:statusBarMessage', params.text)
        break
      case 'window.showMessage':
        bridgeLog.info('show_message', `${params.level}: ${params.message}`)
        mainWindow.webContents.send('ext:showMessage', params)
        break
      case 'extension.activated':
        bridgeLog.info('extension_activated', String(params.extensionId || params.name || ''))
        mainWindow.webContents.send('ext:activated', params)
        break
      case 'extension.activationFailed':
        bridgeLog.error('activation_failed', `${params.extensionId} — ${params.error}`)
        mainWindow.webContents.send('ext:activationFailed', params)
        break
      case 'extension.error':
        bridgeLog.error('extension_error', String(params.message || ''))
        mainWindow.webContents.send('ext:error', params)
        break
      case 'webview.htmlUpdate':
        bridgeLog.debug('webview_html', `${params.viewId} ${params.html?.length || 0} bytes`)
        mainWindow.webContents.send('ext:webviewHtml', params)
        break
      case 'webview.postMessage':
        mainWindow.webContents.send('ext:webviewMessage', params)
        break
      case 'window.webviewViewRegistered':
        bridgeLog.info('view_registered', String(params.viewId || ''))
        mainWindow.webContents.send('ext:viewRegistered', params)
        break
      case 'window.webviewPanelCreated':
        bridgeLog.info('webview_panel', `${params.title} (${params.viewType})`)
        mainWindow.webContents.send('ext:webviewPanelCreated', params)
        break
      case 'commands.registered':
        break
      default:
        bridgeLog.debug('rpc', `${method} ${JSON.stringify(params).slice(0, 200)}`)
        break
    }
  })
}

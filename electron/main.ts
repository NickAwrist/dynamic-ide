import { app, BrowserWindow, ipcMain, dialog, protocol } from 'electron'
import path from 'path'
import fs from 'fs'
import { PtyService } from './services/pty.service'
import { GitService } from './services/git.service'
import { FileService } from './services/file.service'
import { WorkspaceService } from './services/workspace.service'
import { BrowserService } from './services/browser.service'
import { ExtensionService } from './services/extension.service'
import { ExtensionHostService } from './services/extension-host.service'

let mainWindow: BrowserWindow | null = null
const ptyService = new PtyService()
const gitService = new GitService()
const fileService = new FileService()
const workspaceService = new WorkspaceService()
const browserService = new BrowserService()
const extensionService = new ExtensionService()
const extensionHostService = new ExtensionHostService()

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    frame: false,
    titleBarStyle: 'hidden',
    backgroundColor: '#1e1e2e',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      webviewTag: true,
    },
  })

  if (process.env.VITE_DEV_SERVER_URL) {
    mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }

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
    console.log(`[EXT-RES] ${fileExists ? '✓' : '✗'} ${contentType} ${filePath}`)

    try {
      const data = fs.readFileSync(filePath)
      return new Response(data, {
        status: 200,
        headers: { 'Content-Type': contentType, 'Access-Control-Allow-Origin': '*' },
      })
    } catch (err: any) {
      console.error(`[EXT-RES] ✗ FAILED to read: ${filePath} — ${err.message}`)
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
  // Window controls
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) mainWindow.unmaximize()
    else mainWindow?.maximize()
  })
  ipcMain.on('window:close', () => mainWindow?.close())

  // PTY
  ipcMain.handle('pty:create', (_e, { cols, rows, cwd }: { cols: number; rows: number; cwd: string }) => {
    return ptyService.create(cols, rows, cwd)
  })
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

  // Workspace persistence
  ipcMain.handle('workspace:loadAll', () => workspaceService.loadAll())
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
    console.log('[EXT] ▶ Starting extension host...', { workspaceFolders })
    const extensions = await extensionService.listInstalled()
    console.log(`[EXT] Found ${extensions.length} installed extensions:`, extensions.map(e => `${e.id} (${e.enabled ? 'ON' : 'OFF'})`).join(', '))
    try {
      await extensionHostService.start(extensions, workspaceFolders)
      console.log('[EXT] ✓ Extension host started successfully')
      return { ok: true }
    } catch (err: any) {
      console.error('[EXT] ✗ Extension host start FAILED:', err.message)
      throw err
    }
  })
  ipcMain.handle('exthost:stop', () => extensionHostService.stop())
  ipcMain.handle('exthost:activate', async (_e, extensionId: string) => {
    console.log(`[EXT] ▶ Activating extension: ${extensionId}`)
    try {
      const result = await extensionHostService.activateExtension(extensionId)
      console.log(`[EXT] ✓ Extension activated: ${extensionId}`)
      return result
    } catch (err: any) {
      console.error(`[EXT] ✗ Activation failed for ${extensionId}:`, err.message)
      throw err
    }
  })
  ipcMain.handle('exthost:executeCommand', (_e, { command, args }: { command: string; args: any[] }) => {
    return extensionHostService.executeCommand(command, ...args)
  })
  ipcMain.handle('exthost:status', () => extensionHostService.getStatus())
  ipcMain.handle('exthost:getViews', async () => {
    console.log(`[EXT] Querying registered views (host running: ${extensionHostService.isRunning})`)
    try {
      const views = await extensionHostService.getRegisteredViews()
      console.log(`[EXT] ✓ Found ${views.length} views:`, views.map(v => v.viewId).join(', '))
      return views
    } catch (err: any) {
      console.error(`[EXT] ✗ getViews failed:`, err.message)
      throw err
    }
  })
  ipcMain.handle('exthost:resolveView', async (_e, viewId: string) => {
    console.log(`[EXT] ▶ Resolving webview: ${viewId}`)
    try {
      const result = await extensionHostService.resolveWebviewView(viewId)
      console.log(`[EXT] ✓ View resolved: ${viewId} (${result?.html?.length || 0} bytes HTML)`)
      return result
    } catch (err: any) {
      console.error(`[EXT] ✗ resolveView failed for ${viewId}:`, err.message)
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
        console.log(`[EXT-MSG] showMessage (${params.level}): ${params.message}`)
        mainWindow.webContents.send('ext:showMessage', params)
        break
      case 'extension.activated':
        console.log(`[EXT-MSG] ✓ Extension activated: ${params.extensionId || params.name}`)
        mainWindow.webContents.send('ext:activated', params)
        break
      case 'extension.activationFailed':
        console.error(`[EXT-MSG] ✗ Activation failed: ${params.extensionId} — ${params.error}`)
        mainWindow.webContents.send('ext:activationFailed', params)
        break
      case 'extension.error':
        console.error(`[EXT-MSG] ✗ Extension error: ${params.message}`)
        mainWindow.webContents.send('ext:error', params)
        break
      case 'webview.htmlUpdate':
        console.log(`[EXT-MSG] Webview HTML update for ${params.viewId} (${params.html?.length || 0} bytes)`)
        mainWindow.webContents.send('ext:webviewHtml', params)
        break
      case 'webview.postMessage':
        mainWindow.webContents.send('ext:webviewMessage', params)
        break
      case 'window.webviewViewRegistered':
        console.log(`[EXT-MSG] ✓ View provider registered: ${params.viewId}`)
        mainWindow.webContents.send('ext:viewRegistered', params)
        break
      case 'window.webviewPanelCreated':
        console.log(`[EXT-MSG] Webview panel created: ${params.title} (${params.viewType})`)
        mainWindow.webContents.send('ext:webviewPanelCreated', params)
        break
      case 'commands.registered':
        break
      default:
        console.log(`[EXT-MSG] ${method}`, JSON.stringify(params).slice(0, 100))
        break
    }
  })
}

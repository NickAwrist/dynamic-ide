import { app, BrowserWindow, ipcMain, dialog } from 'electron'
import path from 'path'
import { PtyService } from './services/pty.service'
import { GitService } from './services/git.service'
import { FileService } from './services/file.service'
import { WorkspaceService } from './services/workspace.service'
import { BrowserService } from './services/browser.service'

let mainWindow: BrowserWindow | null = null
const ptyService = new PtyService()
const gitService = new GitService()
const fileService = new FileService()
const workspaceService = new WorkspaceService()
const browserService = new BrowserService()

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

app.whenReady().then(() => {
  createWindow()
  registerIpcHandlers()
})

app.on('window-all-closed', () => {
  ptyService.disposeAll()
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
}

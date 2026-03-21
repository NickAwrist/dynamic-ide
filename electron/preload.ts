import { contextBridge, ipcRenderer } from 'electron'

const api = {
  // Window controls
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    maximize: () => ipcRenderer.send('window:maximize'),
    close: () => ipcRenderer.send('window:close'),
  },

  // PTY terminal
  pty: {
    create: (opts: { cols: number; rows: number; cwd: string }) =>
      ipcRenderer.invoke('pty:create', opts),
    write: (id: string, data: string) =>
      ipcRenderer.send('pty:write', { id, data }),
    resize: (id: string, cols: number, rows: number) =>
      ipcRenderer.send('pty:resize', { id, cols, rows }),
    dispose: (id: string) =>
      ipcRenderer.send('pty:dispose', { id }),
    onData: (callback: (id: string, data: string) => void) => {
      const handler = (_e: any, { id, data }: { id: string; data: string }) => callback(id, data)
      ipcRenderer.on('pty:data', handler)
      return () => ipcRenderer.removeListener('pty:data', handler)
    },
  },

  // File system
  fs: {
    readDir: (dirPath: string) => ipcRenderer.invoke('fs:readDir', dirPath),
    readFile: (filePath: string) => ipcRenderer.invoke('fs:readFile', filePath),
    writeFile: (filePath: string, content: string) =>
      ipcRenderer.invoke('fs:writeFile', { filePath, content }),
    createFile: (filePath: string) => ipcRenderer.invoke('fs:createFile', filePath),
    createDir: (dirPath: string) => ipcRenderer.invoke('fs:createDir', dirPath),
    deletePath: (targetPath: string) => ipcRenderer.invoke('fs:deletePath', targetPath),
    renamePath: (oldPath: string, newPath: string) =>
      ipcRenderer.invoke('fs:renamePath', { oldPath, newPath }),
    stat: (filePath: string) => ipcRenderer.invoke('fs:stat', filePath),
    exists: (filePath: string) => ipcRenderer.invoke('fs:exists', filePath),
    watch: (dirPath: string) => ipcRenderer.invoke('fs:watch', dirPath),
    unwatch: (dirPath: string) => ipcRenderer.invoke('fs:unwatch', dirPath),
    onChanged: (callback: (dirPath: string) => void) => {
      const handler = (_e: any, { dirPath }: { dirPath: string }) => callback(dirPath)
      ipcRenderer.on('fs:changed', handler)
      return () => ipcRenderer.removeListener('fs:changed', handler)
    },
  },

  // Git
  git: {
    isRepo: (cwd: string) => ipcRenderer.invoke('git:isRepo', cwd),
    init: (cwd: string) => ipcRenderer.invoke('git:init', cwd),
    status: (cwd: string) => ipcRenderer.invoke('git:status', cwd),
    stage: (cwd: string, files: string[]) =>
      ipcRenderer.invoke('git:stage', { cwd, files }),
    unstage: (cwd: string, files: string[]) =>
      ipcRenderer.invoke('git:unstage', { cwd, files }),
    commit: (cwd: string, message: string) =>
      ipcRenderer.invoke('git:commit', { cwd, message }),
    log: (cwd: string, maxCount?: number) =>
      ipcRenderer.invoke('git:log', { cwd, maxCount }),
    diff: (cwd: string, file?: string) =>
      ipcRenderer.invoke('git:diff', { cwd, file }),
  },

  // Workspace persistence
  workspace: {
    loadAll: () => ipcRenderer.invoke('workspace:loadAll'),
    save: (data: any) => ipcRenderer.invoke('workspace:save', data),
    delete: (id: string) => ipcRenderer.invoke('workspace:delete', id),
  },

  // Dialog
  dialog: {
    openDirectory: () => ipcRenderer.invoke('dialog:openDirectory'),
  },

  // Browser
  browser: {
    detectProfiles: () => ipcRenderer.invoke('browser:detectProfiles'),
    importProfile: (profilePath: string) =>
      ipcRenderer.invoke('browser:importProfile', profilePath),
    importBookmarks: (profilePath: string) =>
      ipcRenderer.invoke('browser:importBookmarks', profilePath),
    clearData: () => ipcRenderer.invoke('browser:clearData'),
  },

  // Extensions
  extensions: {
    search: (query: string) => ipcRenderer.invoke('ext:search', query),
    getDetails: (publisher: string, name: string) =>
      ipcRenderer.invoke('ext:details', { publisher, name }),
    install: (publisher: string, name: string) =>
      ipcRenderer.invoke('ext:install', { publisher, name }),
    uninstall: (extId: string) => ipcRenderer.invoke('ext:uninstall', extId),
    listInstalled: () => ipcRenderer.invoke('ext:listInstalled'),
    toggle: (extId: string, enabled: boolean) =>
      ipcRenderer.invoke('ext:toggle', { extId, enabled }),
    getThemes: () => ipcRenderer.invoke('ext:getThemes'),
    loadTheme: (themePath: string) => ipcRenderer.invoke('ext:loadTheme', themePath),
    startHost: (workspaceFolders: string[]) =>
      ipcRenderer.invoke('exthost:start', { workspaceFolders }),
    stopHost: () => ipcRenderer.invoke('exthost:stop'),
    activateExtension: (extensionId: string) =>
      ipcRenderer.invoke('exthost:activate', extensionId),
    executeCommand: (command: string, ...args: any[]) =>
      ipcRenderer.invoke('exthost:executeCommand', { command, args }),
    getHostStatus: () => ipcRenderer.invoke('exthost:status') as Promise<{
      running: boolean
      error: string | null
      stderr: string[]
    }>,
    getRegisteredViews: () => ipcRenderer.invoke('exthost:getViews') as Promise<Array<{ viewId: string; type: string }>>,
    resolveWebviewView: (viewId: string) => ipcRenderer.invoke('exthost:resolveView', viewId) as Promise<{ html: string } | null>,
    sendWebviewMessage: (viewId: string, message: any) =>
      ipcRenderer.invoke('exthost:webviewMessage', { viewId, message }),

    onStatusBarUpdate: (callback: (item: any) => void) => {
      const handler = (_e: any, item: any) => callback(item)
      ipcRenderer.on('ext:statusBarUpdate', handler)
      return () => ipcRenderer.removeListener('ext:statusBarUpdate', handler)
    },
    onStatusBarRemove: (callback: (id: string) => void) => {
      const handler = (_e: any, id: string) => callback(id)
      ipcRenderer.on('ext:statusBarRemove', handler)
      return () => ipcRenderer.removeListener('ext:statusBarRemove', handler)
    },
    onStatusBarMessage: (callback: (text: string) => void) => {
      const handler = (_e: any, text: string) => callback(text)
      ipcRenderer.on('ext:statusBarMessage', handler)
      return () => ipcRenderer.removeListener('ext:statusBarMessage', handler)
    },
    onShowMessage: (callback: (data: { level: string; message: string }) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:showMessage', handler)
      return () => ipcRenderer.removeListener('ext:showMessage', handler)
    },
    onActivated: (callback: (data: any) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:activated', handler)
      return () => ipcRenderer.removeListener('ext:activated', handler)
    },
    onError: (callback: (data: any) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:error', handler)
      return () => ipcRenderer.removeListener('ext:error', handler)
    },
    onWebviewHtml: (callback: (data: { viewId: string; html: string }) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:webviewHtml', handler)
      return () => ipcRenderer.removeListener('ext:webviewHtml', handler)
    },
    onWebviewMessage: (callback: (data: { viewId: string; message: any }) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:webviewMessage', handler)
      return () => ipcRenderer.removeListener('ext:webviewMessage', handler)
    },
    onViewRegistered: (callback: (data: { viewId: string }) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:viewRegistered', handler)
      return () => ipcRenderer.removeListener('ext:viewRegistered', handler)
    },
    onWebviewPanelCreated: (callback: (data: { panelId: string; viewType: string; title: string }) => void) => {
      const handler = (_e: any, data: any) => callback(data)
      ipcRenderer.on('ext:webviewPanelCreated', handler)
      return () => ipcRenderer.removeListener('ext:webviewPanelCreated', handler)
    },
  },
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api

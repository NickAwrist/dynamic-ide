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
}

contextBridge.exposeInMainWorld('electronAPI', api)

export type ElectronAPI = typeof api

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

export interface BrowserProfile {
  browser: string
  profileName: string
  profilePath: string
}

export interface BookmarkNode {
  name: string
  url?: string
  children?: BookmarkNode[]
}

export interface ElectronAPI {
  window: {
    minimize: () => void
    maximize: () => void
    close: () => void
  }
  pty: {
    create: (opts: { cols: number; rows: number; cwd: string }) => Promise<string>
    write: (id: string, data: string) => void
    resize: (id: string, cols: number, rows: number) => void
    dispose: (id: string) => void
    onData: (callback: (id: string, data: string) => void) => () => void
  }
  fs: {
    readDir: (dirPath: string) => Promise<DirEntry[]>
    readFile: (filePath: string) => Promise<string>
    writeFile: (filePath: string, content: string) => Promise<void>
    createFile: (filePath: string) => Promise<void>
    createDir: (dirPath: string) => Promise<void>
    deletePath: (targetPath: string) => Promise<void>
    renamePath: (oldPath: string, newPath: string) => Promise<void>
    stat: (filePath: string) => Promise<{ isDirectory: boolean; size: number }>
    exists: (filePath: string) => Promise<boolean>
    watch: (dirPath: string) => Promise<boolean>
    unwatch: (dirPath: string) => Promise<boolean>
    onChanged: (callback: (dirPath: string) => void) => () => void
  }
  git: {
    isRepo: (cwd: string) => Promise<boolean>
    init: (cwd: string) => Promise<void>
    status: (cwd: string) => Promise<any>
    stage: (cwd: string, files: string[]) => Promise<void>
    unstage: (cwd: string, files: string[]) => Promise<void>
    commit: (cwd: string, message: string) => Promise<any>
    log: (cwd: string, maxCount?: number) => Promise<any>
    diff: (cwd: string, file?: string) => Promise<string>
  }
  workspace: {
    loadAll: () => Promise<any[]>
    save: (data: any) => Promise<void>
    delete: (id: string) => Promise<void>
  }
  dialog: {
    openDirectory: () => Promise<string | null>
  }
  browser: {
    detectProfiles: () => Promise<BrowserProfile[]>
    importProfile: (profilePath: string) => Promise<{
      success: boolean
      message: string
      bookmarks?: BookmarkNode[]
    }>
    importBookmarks: (profilePath: string) => Promise<{
      bookmarks: BookmarkNode[]
    }>
    clearData: () => Promise<boolean>
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

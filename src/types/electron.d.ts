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

export interface MarketplaceExtension {
  name: string
  namespace: string
  displayName?: string
  description?: string
  version: string
  iconUrl?: string
  downloadUrl?: string
  downloadCount?: number
  averageRating?: number
  categories?: string[]
}

export interface InstalledExtension {
  id: string
  manifest: {
    name: string
    displayName?: string
    description?: string
    version: string
    publisher: string
    icon?: string
    categories?: string[]
    contributes?: {
      themes?: Array<{ label: string; uiTheme: string; path: string }>
      commands?: Array<{ command: string; title: string }>
      [key: string]: any
    }
    [key: string]: any
  }
  extensionPath: string
  enabled: boolean
}

export interface SearchResult {
  extensions: MarketplaceExtension[]
  totalSize: number
  offset: number
}

export interface ThemeInfo {
  extensionId: string
  label: string
  uiTheme: string
  themePath: string
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
  extensions: {
    search: (query: string) => Promise<SearchResult>
    getDetails: (publisher: string, name: string) => Promise<any>
    install: (publisher: string, name: string) => Promise<InstalledExtension>
    uninstall: (extId: string) => Promise<void>
    listInstalled: () => Promise<InstalledExtension[]>
    toggle: (extId: string, enabled: boolean) => Promise<void>
    getThemes: () => Promise<ThemeInfo[]>
    loadTheme: (themePath: string) => Promise<any>
    startHost: (workspaceFolders: string[]) => Promise<{ ok: boolean }>
    stopHost: () => Promise<void>
    activateExtension: (extensionId: string) => Promise<void>
    executeCommand: (command: string, ...args: any[]) => Promise<any>
    getHostStatus: () => Promise<{ running: boolean; error: string | null; stderr: string[] }>
    getRegisteredViews: () => Promise<Array<{ viewId: string; type: string }>>
    resolveWebviewView: (viewId: string) => Promise<{ html: string } | null>
    sendWebviewMessage: (viewId: string, message: any) => Promise<void>
    onStatusBarUpdate: (callback: (item: any) => void) => () => void
    onStatusBarRemove: (callback: (id: string) => void) => () => void
    onStatusBarMessage: (callback: (text: string) => void) => () => void
    onShowMessage: (callback: (data: { level: string; message: string }) => void) => () => void
    onActivated: (callback: (data: any) => void) => () => void
    onError: (callback: (data: any) => void) => () => void
    onWebviewHtml: (callback: (data: { viewId: string; html: string }) => void) => () => void
    onWebviewMessage: (callback: (data: { viewId: string; message: any }) => void) => () => void
    onViewRegistered: (callback: (data: { viewId: string }) => void) => () => void
    onWebviewPanelCreated: (callback: (data: { panelId: string; viewType: string; title: string }) => void) => () => void
  }
}

declare global {
  interface Window {
    electronAPI: ElectronAPI
  }
}

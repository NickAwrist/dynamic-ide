import { app, session } from 'electron'
import path from 'path'
import fs from 'fs'

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

interface BrowserConfig {
  name: string
  basePath: string
}

const PROFILE_DATA_FILES = [
  'Cookies',
  'Cookies-journal',
  'Login Data',
  'Login Data-journal',
  'Web Data',
  'Web Data-journal',
  'Favicons',
  'Favicons-journal',
]

const PROFILE_DATA_DIRS = [
  'Local Storage',
  'Session Storage',
  'IndexedDB',
]

function getBrowserConfigs(): BrowserConfig[] {
  if (process.platform === 'win32') {
    const local = process.env.LOCALAPPDATA || ''
    return [
      { name: 'Google Chrome', basePath: path.join(local, 'Google', 'Chrome', 'User Data') },
      { name: 'Microsoft Edge', basePath: path.join(local, 'Microsoft', 'Edge', 'User Data') },
      { name: 'Brave', basePath: path.join(local, 'BraveSoftware', 'Brave-Browser', 'User Data') },
      { name: 'Vivaldi', basePath: path.join(local, 'Vivaldi', 'User Data') },
    ]
  }
  if (process.platform === 'darwin') {
    const home = process.env.HOME || ''
    return [
      { name: 'Google Chrome', basePath: path.join(home, 'Library', 'Application Support', 'Google', 'Chrome') },
      { name: 'Microsoft Edge', basePath: path.join(home, 'Library', 'Application Support', 'Microsoft Edge') },
      { name: 'Brave', basePath: path.join(home, 'Library', 'Application Support', 'BraveSoftware', 'Brave-Browser') },
    ]
  }
  // Linux
  const home = process.env.HOME || ''
  return [
    { name: 'Google Chrome', basePath: path.join(home, '.config', 'google-chrome') },
    { name: 'Microsoft Edge', basePath: path.join(home, '.config', 'microsoft-edge') },
    { name: 'Brave', basePath: path.join(home, '.config', 'BraveSoftware', 'Brave-Browser') },
    { name: 'Chromium', basePath: path.join(home, '.config', 'chromium') },
  ]
}

export class BrowserService {
  private partitionPath: string

  constructor() {
    this.partitionPath = path.join(app.getPath('userData'), 'Partitions', 'browser')
  }

  detectProfiles(): BrowserProfile[] {
    const profiles: BrowserProfile[] = []

    for (const browser of getBrowserConfigs()) {
      if (!fs.existsSync(browser.basePath)) continue

      const defaultPath = path.join(browser.basePath, 'Default')
      if (fs.existsSync(defaultPath)) {
        profiles.push({ browser: browser.name, profileName: 'Default', profilePath: defaultPath })
      }

      try {
        const entries = fs.readdirSync(browser.basePath, { withFileTypes: true })
        for (const entry of entries) {
          if (entry.isDirectory() && /^Profile \d+$/.test(entry.name)) {
            profiles.push({
              browser: browser.name,
              profileName: entry.name,
              profilePath: path.join(browser.basePath, entry.name),
            })
          }
        }
      } catch { /* permission denied */ }
    }

    return profiles
  }

  async importProfile(
    sourceProfilePath: string,
  ): Promise<{ success: boolean; message: string; bookmarks?: BookmarkNode[] }> {
    try {
      fs.mkdirSync(this.partitionPath, { recursive: true })

      let copiedFiles = 0
      let copiedDirs = 0

      for (const file of PROFILE_DATA_FILES) {
        const src = path.join(sourceProfilePath, file)
        const dest = path.join(this.partitionPath, file)
        try {
          if (fs.existsSync(src)) {
            fs.copyFileSync(src, dest)
            copiedFiles++
          }
        } catch { /* file may be locked by source browser */ }
      }

      for (const dir of PROFILE_DATA_DIRS) {
        const src = path.join(sourceProfilePath, dir)
        const dest = path.join(this.partitionPath, dir)
        try {
          if (fs.existsSync(src)) {
            this.copyDirSync(src, dest)
            copiedDirs++
          }
        } catch { /* directory may be locked */ }
      }

      const bookmarks = this.readBookmarks(sourceProfilePath)

      const ses = session.fromPartition('persist:browser')
      await ses.clearCache()

      return {
        success: true,
        message: `Imported ${copiedFiles} data files and ${copiedDirs} storage directories. Close and reopen this panel to load imported sessions.`,
        bookmarks,
      }
    } catch (err: any) {
      return { success: false, message: err.message || 'Import failed' }
    }
  }

  importBookmarks(sourceProfilePath: string): { bookmarks: BookmarkNode[] } {
    return { bookmarks: this.readBookmarks(sourceProfilePath) }
  }

  clearBrowsingData(): void {
    const ses = session.fromPartition('persist:browser')
    ses.clearStorageData()
    ses.clearCache()
  }

  private readBookmarks(profilePath: string): BookmarkNode[] {
    const bookmarksFile = path.join(profilePath, 'Bookmarks')
    if (!fs.existsSync(bookmarksFile)) return []

    try {
      const data = JSON.parse(fs.readFileSync(bookmarksFile, 'utf-8'))
      const roots = data.roots || {}
      const result: BookmarkNode[] = []

      for (const key of Object.keys(roots)) {
        const root = roots[key]
        if (root && root.children) {
          result.push(this.parseBookmarkNode(root))
        }
      }

      return result
    } catch {
      return []
    }
  }

  private parseBookmarkNode(node: any): BookmarkNode {
    if (node.type === 'url') {
      return { name: node.name, url: node.url }
    }
    return {
      name: node.name,
      children: (node.children || []).map((c: any) => this.parseBookmarkNode(c)),
    }
  }

  private copyDirSync(src: string, dest: string): void {
    fs.mkdirSync(dest, { recursive: true })
    const entries = fs.readdirSync(src, { withFileTypes: true })

    for (const entry of entries) {
      const srcPath = path.join(src, entry.name)
      const destPath = path.join(dest, entry.name)
      if (entry.isDirectory()) {
        this.copyDirSync(srcPath, destPath)
      } else {
        try {
          fs.copyFileSync(srcPath, destPath)
        } catch { /* skip locked files */ }
      }
    }
  }
}

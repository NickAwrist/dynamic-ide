import fs from 'fs/promises'
import path from 'path'

export interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

const IGNORED = new Set([
  'node_modules', '.git', '.next', 'dist', 'dist-electron',
  '.cache', '__pycache__', '.DS_Store', 'thumbs.db',
])

export class FileService {
  private watchers = new Map<string, { ac: AbortController }>()

  async readDir(dirPath: string): Promise<DirEntry[]> {
    const entries = await fs.readdir(dirPath, { withFileTypes: true })
    return entries
      .filter((e) => !IGNORED.has(e.name) && !e.name.startsWith('.'))
      .map((e) => ({
        name: e.name,
        path: path.join(dirPath, e.name),
        isDirectory: e.isDirectory(),
      }))
      .sort((a, b) => {
        if (a.isDirectory !== b.isDirectory) return a.isDirectory ? -1 : 1
        return a.name.localeCompare(b.name)
      })
  }

  async readFile(filePath: string): Promise<string> {
    return await fs.readFile(filePath, 'utf-8')
  }

  async writeFile(filePath: string, content: string): Promise<void> {
    await fs.writeFile(filePath, content, 'utf-8')
  }

  async createFile(filePath: string): Promise<void> {
    await fs.writeFile(filePath, '', 'utf-8')
  }

  async createDir(dirPath: string): Promise<void> {
    await fs.mkdir(dirPath, { recursive: true })
  }

  async deletePath(targetPath: string): Promise<void> {
    const stat = await fs.stat(targetPath)
    if (stat.isDirectory()) {
      await fs.rm(targetPath, { recursive: true, force: true })
    } else {
      await fs.unlink(targetPath)
    }
  }

  async renamePath(oldPath: string, newPath: string): Promise<void> {
    await fs.rename(oldPath, newPath)
  }

  async stat(filePath: string): Promise<{ isDirectory: boolean; size: number }> {
    const s = await fs.stat(filePath)
    return { isDirectory: s.isDirectory(), size: s.size }
  }

  async exists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  startWatch(dirPath: string, callback: (eventType: string, filename: string | null) => void): string {
    const id = dirPath
    this.stopWatch(id)

    const ac = new AbortController()
    const doWatch = async () => {
      try {
        const watcher = fs.watch(dirPath, { recursive: true, signal: ac.signal })
        for await (const event of watcher) {
          callback(event.eventType, event.filename)
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('Watch error:', err)
        }
      }
    }
    doWatch()
    this.watchers.set(id, { ac })
    return id
  }

  stopWatch(id: string) {
    const w = this.watchers.get(id)
    if (w) {
      w.ac.abort()
      this.watchers.delete(id)
    }
  }

  stopAllWatches() {
    this.watchers.forEach((w) => w.ac.abort())
    this.watchers.clear()
  }
}

import fs from 'fs/promises'
import path from 'path'
import { app } from 'electron'

export class WorkspaceService {
  private get dir(): string {
    return path.join(app.getPath('userData'), 'workspaces')
  }

  private async ensureDir() {
    await fs.mkdir(this.dir, { recursive: true })
  }

  async loadAll(): Promise<any[]> {
    await this.ensureDir()
    const files = await fs.readdir(this.dir)
    const workspaces: any[] = []
    for (const file of files) {
      if (!file.endsWith('.json')) continue
      try {
        const raw = await fs.readFile(path.join(this.dir, file), 'utf-8')
        workspaces.push(JSON.parse(raw))
      } catch {
        // skip corrupt files
      }
    }
    return workspaces
  }

  async save(data: { id: string; [key: string]: any }): Promise<void> {
    await this.ensureDir()
    const filePath = path.join(this.dir, `${data.id}.json`)
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf-8')
  }

  async delete(id: string): Promise<void> {
    try {
      await fs.unlink(path.join(this.dir, `${id}.json`))
    } catch {
      // file may not exist
    }
  }
}

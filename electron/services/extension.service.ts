import fs from 'fs/promises'
import fsSync from 'fs'
import path from 'path'
import https from 'https'
import http from 'http'
import { app } from 'electron'
import AdmZip from 'adm-zip'
import { parse as parseJsonc } from 'jsonc-parser'

const OPENVSX_API = 'https://open-vsx.org/api'

export interface ExtensionManifest {
  name: string
  displayName?: string
  description?: string
  version: string
  publisher: string
  engines?: { vscode?: string }
  main?: string
  browser?: string
  icon?: string
  categories?: string[]
  activationEvents?: string[]
  contributes?: {
    commands?: Array<{ command: string; title: string; category?: string }>
    themes?: Array<{ label: string; uiTheme: string; path: string }>
    iconThemes?: Array<{ id: string; label: string; path: string }>
    languages?: Array<{ id: string; extensions?: string[]; aliases?: string[] }>
    [key: string]: any
  }
  [key: string]: any
}

export interface InstalledExtension {
  id: string
  manifest: ExtensionManifest
  extensionPath: string
  enabled: boolean
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
  timestamp?: string
}

export interface SearchResult {
  extensions: MarketplaceExtension[]
  totalSize: number
  offset: number
}

export class ExtensionService {
  private get extensionsDir(): string {
    return path.join(app.getPath('userData'), 'extensions')
  }

  private get stateFile(): string {
    return path.join(app.getPath('userData'), 'extension-state.json')
  }

  private async ensureDir() {
    await fs.mkdir(this.extensionsDir, { recursive: true })
  }

  private httpGet(url: string): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      const protocol = url.startsWith('https') ? https : http
      protocol.get(url, { headers: { 'Accept': 'application/json' } }, (res) => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          this.httpGet(res.headers.location).then(resolve, reject)
          return
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} from ${url}`))
          return
        }
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk))
        res.on('end', () => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    })
  }

  private async httpGetJson<T>(url: string): Promise<T> {
    const buf = await this.httpGet(url)
    return JSON.parse(buf.toString('utf-8'))
  }

  async search(query: string, offset = 0, size = 20): Promise<SearchResult> {
    const params = new URLSearchParams({
      query,
      offset: String(offset),
      size: String(size),
      sortBy: 'relevance',
      sortOrder: 'desc',
    })

    const data = await this.httpGetJson<any>(`${OPENVSX_API}/-/search?${params}`)

    return {
      extensions: (data.extensions || []).map((ext: any) => ({
        name: ext.name,
        namespace: ext.namespace,
        displayName: ext.displayName || ext.name,
        description: ext.description,
        version: ext.version,
        iconUrl: ext.files?.icon,
        downloadUrl: ext.files?.download,
        downloadCount: ext.downloadCount,
        averageRating: ext.averageRating,
        categories: ext.categories,
        timestamp: ext.timestamp,
      })),
      totalSize: data.totalSize || 0,
      offset: data.offset || 0,
    }
  }

  async getDetails(publisher: string, name: string): Promise<any> {
    return this.httpGetJson(`${OPENVSX_API}/${publisher}/${name}`)
  }

  async install(publisher: string, name: string, version?: string): Promise<InstalledExtension> {
    await this.ensureDir()

    const versionPath = version ? `/${version}` : ''
    const meta = await this.httpGetJson<any>(
      `${OPENVSX_API}/${publisher}/${name}${versionPath}`
    )

    const downloadUrl = meta.files?.download
    if (!downloadUrl) throw new Error('No download URL found for extension')

    const vsixBuffer = await this.httpGet(downloadUrl)

    const extId = `${publisher}.${name}-${meta.version}`
    const extDir = path.join(this.extensionsDir, extId)

    await fs.rm(extDir, { recursive: true, force: true })
    await fs.mkdir(extDir, { recursive: true })

    const zip = new AdmZip(vsixBuffer)
    const entries = zip.getEntries()

    for (const entry of entries) {
      if (entry.isDirectory) continue
      const entryName = entry.entryName

      let targetPath: string
      if (entryName.startsWith('extension/')) {
        targetPath = path.join(extDir, entryName.slice('extension/'.length))
      } else {
        targetPath = path.join(extDir, entryName)
      }

      await fs.mkdir(path.dirname(targetPath), { recursive: true })
      await fs.writeFile(targetPath, entry.getData())
    }

    const manifest = await this.readManifest(extDir)
    if (!manifest) throw new Error('Extension has no valid package.json')

    await this.setExtensionEnabled(extId, true)

    return {
      id: extId,
      manifest,
      extensionPath: extDir,
      enabled: true,
    }
  }

  async uninstall(extId: string): Promise<void> {
    const extDir = path.join(this.extensionsDir, extId)
    await fs.rm(extDir, { recursive: true, force: true })

    const state = await this.loadState()
    delete state[extId]
    await this.saveState(state)
  }

  async listInstalled(): Promise<InstalledExtension[]> {
    await this.ensureDir()
    const state = await this.loadState()
    const dirs = await fs.readdir(this.extensionsDir)
    const extensions: InstalledExtension[] = []

    for (const dir of dirs) {
      const extDir = path.join(this.extensionsDir, dir)
      const stat = await fs.stat(extDir)
      if (!stat.isDirectory()) continue

      const manifest = await this.readManifest(extDir)
      if (!manifest) continue

      extensions.push({
        id: dir,
        manifest,
        extensionPath: extDir,
        enabled: state[dir]?.enabled !== false,
      })
    }

    return extensions
  }

  async getThemes(): Promise<Array<{
    extensionId: string
    label: string
    uiTheme: string
    themePath: string
  }>> {
    const extensions = await this.listInstalled()
    const themes: Array<{
      extensionId: string
      label: string
      uiTheme: string
      themePath: string
    }> = []

    for (const ext of extensions) {
      if (!ext.enabled || !ext.manifest.contributes?.themes) continue
      for (const theme of ext.manifest.contributes.themes) {
        themes.push({
          extensionId: ext.id,
          label: theme.label,
          uiTheme: theme.uiTheme,
          themePath: path.join(ext.extensionPath, theme.path),
        })
      }
    }

    return themes
  }

  async loadThemeFile(themePath: string): Promise<any> {
    const raw = await fs.readFile(themePath, 'utf-8')
    return parseJsonc(raw)
  }

  private async readManifest(extDir: string): Promise<ExtensionManifest | null> {
    try {
      const pkgPath = path.join(extDir, 'package.json')
      const raw = await fs.readFile(pkgPath, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return null
    }
  }

  private async loadState(): Promise<Record<string, { enabled: boolean }>> {
    try {
      const raw = await fs.readFile(this.stateFile, 'utf-8')
      return JSON.parse(raw)
    } catch {
      return {}
    }
  }

  private async saveState(state: Record<string, { enabled: boolean }>): Promise<void> {
    await fs.writeFile(this.stateFile, JSON.stringify(state, null, 2), 'utf-8')
  }

  private async setExtensionEnabled(extId: string, enabled: boolean): Promise<void> {
    const state = await this.loadState()
    state[extId] = { enabled }
    await this.saveState(state)
  }

  async toggleExtension(extId: string, enabled: boolean): Promise<void> {
    await this.setExtensionEnabled(extId, enabled)
  }
}

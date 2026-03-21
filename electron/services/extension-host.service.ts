import { ChildProcess, fork } from 'child_process'
import path from 'path'
import fs from 'fs'
import { app } from 'electron'
import type { InstalledExtension } from './extension.service'

interface RpcMessage {
  id?: number
  method: string
  params?: any
}

type MessageHandler = (method: string, params: any) => void

export class ExtensionHostService {
  private process: ChildProcess | null = null
  private messageId = 0
  private pendingRequests = new Map<number, { resolve: (v: any) => void; reject: (e: Error) => void }>()
  private messageHandlers: MessageHandler[] = []
  private extensions: InstalledExtension[] = []
  private stderrBuffer: string[] = []
  private _lastError: string | null = null
  private _starting: Promise<void> | null = null

  get isRunning(): boolean {
    return this.process !== null && !this.process.killed
  }

  get lastError(): string | null {
    return this._lastError
  }

  get recentStderr(): string[] {
    return this.stderrBuffer.slice(-20)
  }

  onMessage(handler: MessageHandler): () => void {
    this.messageHandlers.push(handler)
    return () => {
      const idx = this.messageHandlers.indexOf(handler)
      if (idx >= 0) this.messageHandlers.splice(idx, 1)
    }
  }

  async start(extensions: InstalledExtension[], workspaceFolders: string[]): Promise<void> {
    if (this._starting) {
      return this._starting
    }

    if (this.isRunning) {
      await this.stop()
    }

    this.extensions = extensions
    this.stderrBuffer = []
    this._lastError = null

    const bootstrapScript = path.join(__dirname, 'extension-host', 'bootstrap.js')
    const hostScript = path.join(__dirname, 'extension-host', 'host-process.js')

    if (!fs.existsSync(bootstrapScript)) {
      throw new Error(`Extension host bootstrap not found at: ${bootstrapScript}`)
    }
    if (!fs.existsSync(hostScript)) {
      throw new Error(`Extension host script not found at: ${hostScript}`)
    }

    const p = new Promise<void>((resolve, reject) => {
      let settled = false
      const fail = (msg: string) => {
        if (settled) return
        settled = true
        this._lastError = msg
        reject(new Error(msg))
      }

      let child: ChildProcess
      try {
        child = fork(bootstrapScript, [], {
          stdio: ['pipe', 'pipe', 'pipe', 'ipc'],
          env: {
            ...process.env,
            ELECTRON_RUN_AS_NODE: '1',
            DYNAMIC_IDE_EXT_HOST: '1',
          },
          execArgv: [],
        })
      } catch (err: any) {
        fail(`Failed to fork extension host: ${err.message}`)
        return
      }

      this.process = child

      child.on('message', (msg: any) => {
        if (msg.method === 'host.ready' && !settled) {
          const initPayload = {
            extensionsDir: path.join(app.getPath('userData'), 'extensions'),
            extensions: extensions
              .filter((e) => e.enabled)
              .map((e) => ({
                id: e.id,
                extensionPath: e.extensionPath,
                manifest: e.manifest,
              })),
            workspaceFolders,
          }

          this.sendRequest('initialize', initPayload)
            .then(() => {
              if (!settled) {
                settled = true
                resolve()
              }
            })
            .catch((err) => fail(`Initialize failed: ${err.message}`))

          return
        }

        this.handleMessage(msg)
      })

      child.on('exit', (code, signal) => {
        const stderr = this.stderrBuffer.join('')
        const detail = stderr
          ? `\nStderr output:\n${stderr.slice(-1000)}`
          : ''
        console.error(`Extension host exited (code=${code}, signal=${signal})${detail}`)
        if (this.process === child) {
          this.process = null
          for (const [, pending] of this.pendingRequests) {
            pending.reject(new Error('Extension host terminated'))
          }
          this.pendingRequests.clear()
        }
        fail(`Extension host process exited (code=${code}, signal=${signal}).${detail}`)
      })

      child.on('error', (err) => {
        console.error('Extension host spawn error:', err)
        fail(`Failed to start extension host process: ${err.message}`)
      })

      child.stderr?.on('data', (data) => {
        const text = data.toString()
        this.stderrBuffer.push(text)
        if (this.stderrBuffer.length > 50) this.stderrBuffer.shift()
        console.error('[ext-host stderr]', text)
      })

      child.stdout?.on('data', (data) => {
        console.log('[ext-host stdout]', data.toString())
      })

      setTimeout(() => {
        fail('Extension host did not start within 15 seconds')
      }, 15000)
    })

    this._starting = p.finally(() => { this._starting = null })
    return this._starting
  }

  async stop(): Promise<void> {
    if (!this.process) return
    try {
      await this.sendRequest('shutdown', {})
    } catch { /* ignore */ }

    if (this.process) {
      this.process.kill()
      this.process = null
    }
    this.pendingRequests.clear()
  }

  async activateExtension(extensionId: string): Promise<void> {
    await this.sendRequest('activateExtension', { extensionId })
  }

  async executeCommand(command: string, ...args: any[]): Promise<any> {
    return this.sendRequest('executeCommand', { command, args })
  }

  async getRegisteredCommands(): Promise<string[]> {
    return this.sendRequest('getRegisteredCommands', {})
  }

  async getRegisteredViews(): Promise<Array<{ viewId: string; type: string }>> {
    return this.sendRequest('getRegisteredViews', {})
  }

  async resolveWebviewView(viewId: string): Promise<{ html: string } | null> {
    return this.sendRequest('resolveWebviewView', { viewId })
  }

  async sendWebviewMessage(viewId: string, message: any): Promise<void> {
    await this.sendRequest('webviewMessage', { viewId, message })
  }

  getStatus(): { running: boolean; error: string | null; stderr: string[] } {
    return {
      running: this.isRunning,
      error: this._lastError,
      stderr: this.recentStderr,
    }
  }

  private sendRequest(method: string, params: any): Promise<any> {
    return new Promise((resolve, reject) => {
      if (!this.process) {
        reject(new Error('Extension host not running'))
        return
      }

      const id = ++this.messageId
      this.pendingRequests.set(id, { resolve, reject })

      const msg: RpcMessage = { id, method, params }
      this.process.send(msg)

      setTimeout(() => {
        if (this.pendingRequests.has(id)) {
          this.pendingRequests.delete(id)
          reject(new Error(`Request '${method}' timed out after 30s`))
        }
      }, 30000)
    })
  }

  private handleMessage(msg: any) {
    if (msg.id !== undefined && (msg.result !== undefined || msg.error !== undefined)) {
      const pending = this.pendingRequests.get(msg.id)
      if (pending) {
        this.pendingRequests.delete(msg.id)
        if (msg.error) pending.reject(new Error(msg.error))
        else pending.resolve(msg.result)
      }
      return
    }

    if (msg.method) {
      for (const handler of this.messageHandlers) {
        handler(msg.method, msg.params)
      }
    }
  }

  sendNotification(method: string, params: any): void {
    if (!this.process) return
    this.process.send({ method, params } as RpcMessage)
  }
}

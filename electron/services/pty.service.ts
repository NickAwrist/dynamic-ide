import * as pty from 'node-pty'
import { v4 } from './utils'

type DataCallback = (id: string, data: string) => void

export class PtyService {
  private processes = new Map<string, pty.IPty>()
  private dataCallbacks: DataCallback[] = []

  create(cols: number, rows: number, cwd: string): string {
    const id = v4()
    const shell = process.platform === 'win32' ? 'powershell.exe' : process.env.SHELL || '/bin/bash'

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env: process.env as Record<string, string>,
    })

    proc.onData((data) => {
      this.dataCallbacks.forEach((cb) => cb(id, data))
    })

    proc.onExit(() => {
      this.processes.delete(id)
    })

    this.processes.set(id, proc)
    return id
  }

  write(id: string, data: string) {
    this.processes.get(id)?.write(data)
  }

  resize(id: string, cols: number, rows: number) {
    try {
      this.processes.get(id)?.resize(cols, rows)
    } catch {
      // resize can throw if process exited
    }
  }

  dispose(id: string) {
    const proc = this.processes.get(id)
    if (proc) {
      proc.kill()
      this.processes.delete(id)
    }
  }

  disposeAll() {
    this.processes.forEach((proc) => proc.kill())
    this.processes.clear()
  }

  onData(callback: DataCallback) {
    this.dataCallbacks.push(callback)
  }
}

import { execFile } from 'child_process'
import * as pty from 'node-pty'
import { forScope } from '../logging/app-logger'
import { Scopes } from '../logging/scopes'
import { v4 } from './utils'

type DataCallback = (id: string, data: string) => void

const log = forScope(Scopes.mainPty)
const SHELL_ENV_TIMEOUT_MS = 8_000
const SHELL_ENV_MAX_BUFFER = 4 * 1024 * 1024

function toStringEnv(source: NodeJS.ProcessEnv | Record<string, string>): Record<string, string> {
  const env: Record<string, string> = {}
  for (const [key, value] of Object.entries(source)) {
    if (typeof value === 'string') {
      env[key] = value
    }
  }
  return env
}

function formatErrorDetail(error: unknown, stderr?: Buffer | string): string {
  const parts: string[] = []
  if (error instanceof Error) {
    parts.push(error.message)
  } else if (error != null) {
    parts.push(String(error))
  }
  if (stderr) {
    const text = (Buffer.isBuffer(stderr) ? stderr.toString('utf8') : stderr)
      .replace(/\0/g, ' ')
      .trim()
    if (text) {
      parts.push(text.slice(0, 400))
    }
  }
  return parts.join(' | ')
}

export class PtyService {
  private processes = new Map<string, pty.IPty>()
  private dataCallbacks: DataCallback[] = []
  private shellEnvPromise: Promise<Record<string, string>> | null = null

  primeShellEnv() {
    if (process.platform !== 'darwin') return
    void this.getSpawnEnv()
  }

  async create(cols: number, rows: number, cwd: string): Promise<string> {
    const id = v4()
    const env = await this.getSpawnEnv()
    const shell =
      process.platform === 'win32' ? 'powershell.exe' : env.SHELL || process.env.SHELL || '/bin/bash'

    const proc = pty.spawn(shell, [], {
      name: 'xterm-256color',
      cols,
      rows,
      cwd,
      env,
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

  private async getSpawnEnv(): Promise<Record<string, string>> {
    const baseEnv = this.getBaseEnv()
    if (process.platform !== 'darwin') return baseEnv

    if (!this.shellEnvPromise) {
      this.shellEnvPromise = this.resolveDarwinShellEnv(baseEnv).catch((error) => {
        log.warn('shell_env_bootstrap_failed', formatErrorDetail(error))
        return baseEnv
      })
    }

    return this.shellEnvPromise
  }

  private getBaseEnv(): Record<string, string> {
    const env = toStringEnv(process.env)
    if (!env.TERM) env.TERM = 'xterm-256color'
    if (!env.SHELL && process.platform !== 'win32') {
      env.SHELL = '/bin/zsh'
    }
    return env
  }

  private async resolveDarwinShellEnv(
    baseEnv: Record<string, string>,
  ): Promise<Record<string, string>> {
    const shellPath = baseEnv.SHELL || '/bin/zsh'
    const marker = `__ORBIS_SHELL_ENV_${v4()}__`
    const startMarker = `${marker}_START`
    const endMarker = `${marker}_END`
    const script =
      `printf '%s\\0' '${startMarker}'; /usr/bin/env -0; printf '\\0%s\\0' '${endMarker}'`
    const attempts = [
      ['-i', '-l', '-c', script],
      ['-l', '-c', script],
    ]

    log.debug('shell_env_bootstrap_start', shellPath)

    let lastError: Error | null = null

    for (const args of attempts) {
      try {
        const stdout = await this.captureShellEnvDump(shellPath, args, baseEnv)
        const resolvedEnv = this.parseShellEnvDump(stdout, startMarker, endMarker)
        const mergedEnv = { ...baseEnv, ...resolvedEnv }

        log.info('shell_env_bootstrap_ready', `${shellPath} ${args.slice(0, -1).join(' ')}`)
        if (mergedEnv.PATH) {
          log.debug('shell_env_bootstrap_path', mergedEnv.PATH)
        }
        return mergedEnv
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error))
        log.debug(
          'shell_env_bootstrap_attempt_failed',
          `${shellPath} ${args.slice(0, -1).join(' ')} | ${lastError.message}`,
        )
      }
    }

    throw lastError ?? new Error('Failed to resolve shell environment')
  }

  private captureShellEnvDump(
    shellPath: string,
    args: string[],
    env: Record<string, string>,
  ): Promise<Buffer> {
    return new Promise((resolve, reject) => {
      execFile(
        shellPath,
        args,
        {
          env,
          encoding: 'buffer',
          timeout: SHELL_ENV_TIMEOUT_MS,
          maxBuffer: SHELL_ENV_MAX_BUFFER,
        },
        (error, stdout, stderr) => {
          if (error) {
            reject(new Error(formatErrorDetail(error, stderr)))
            return
          }
          if (!Buffer.isBuffer(stdout)) {
            reject(new Error('Shell env bootstrap did not return a buffer'))
            return
          }
          resolve(stdout)
        },
      )
    })
  }

  private parseShellEnvDump(
    stdout: Buffer,
    startMarker: string,
    endMarker: string,
  ): Record<string, string> {
    const startToken = Buffer.from(`${startMarker}\0`, 'utf8')
    const endToken = Buffer.from(`\0${endMarker}\0`, 'utf8')
    const startIndex = stdout.indexOf(startToken)
    if (startIndex === -1) {
      throw new Error('Shell env bootstrap output did not include start marker')
    }

    const payloadStart = startIndex + startToken.length
    const endIndex = stdout.indexOf(endToken, payloadStart)
    if (endIndex === -1) {
      throw new Error('Shell env bootstrap output did not include end marker')
    }

    const payload = stdout.subarray(payloadStart, endIndex)
    const env: Record<string, string> = {}
    for (const entry of payload.toString('utf8').split('\0')) {
      if (!entry) continue
      const sep = entry.indexOf('=')
      if (sep <= 0) continue
      env[entry.slice(0, sep)] = entry.slice(sep + 1)
    }

    if (Object.keys(env).length === 0) {
      throw new Error('Shell env bootstrap produced an empty environment')
    }

    return env
  }
}

import { useEffect, useRef, useState } from 'react'
import { FitAddon } from '@xterm/addon-fit'
import { WebglAddon } from '@xterm/addon-webgl'
import { WebLinksAddon } from '@xterm/addon-web-links'
import type { IDisposable } from '@xterm/xterm'
import { Terminal } from '@xterm/xterm'
import '@xterm/xterm/css/xterm.css'
import { PanelState, WorkspaceState } from '../stores/workspace.store'
import { createUiLogger, Scopes } from '../lib/logger'
import { requestOpenUrl } from '../lib/request-open-url'

const log = createUiLogger(Scopes.uiPanelTerminal)

const LOCAL_URL_RE = /https?:\/\/(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[^\s"'<>]*)?/gi

const HINT_SCAN_BUFFER_MAX = 12000

/** Strip SGR ANSI so URLs split from styling still match as one string. */
function stripSgrAnsi(s: string): string {
  return s.replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, '')
}

/** Vite / modern terminals embed link targets in OSC 8 hyperlinks. */
function localUrlsFromOsc8(raw: string): string[] {
  const out: string[] = []
  const re = /\x1b\]8;;([^\x07\x1b]+?)(?:\x1b\\|\x07)/g
  let m: RegExpExecArray | null
  while ((m = re.exec(raw)) !== null) {
    const u = m[1].trim()
    if (/^https?:\/\/(localhost|127\.0\.0\.1)/i.test(u)) out.push(u.split(/[\s"'<>]/)[0] || u)
  }
  return out
}

function collectLocalUrlCandidates(rawChunk: string, rollingPlain: string): string[] {
  const osc = localUrlsFromOsc8(rawChunk)
  const fromText = rollingPlain.match(LOCAL_URL_RE) || []
  return [...osc, ...fromText]
}

/** Prefer URLs that include an explicit port; otherwise last candidate wins. */
function pickBestLocalUrl(candidates: string[]): string | null {
  if (!candidates.length) return null
  const withPort = candidates.filter((u) => /:\/\/(localhost|127\.0\.0\.1):\d+/i.test(u))
  const pool = withPort.length ? withPort : candidates
  return pool[pool.length - 1] ?? null
}

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

interface TerminalInstance {
  terminal: Terminal
  fitAddon: FitAddon
  webLinksAddon: WebLinksAddon
  ptyId: string | null
  hostEl: HTMLDivElement
  initialized: boolean
  cleanupPtyListener: (() => void) | null
  fitDebounce: ReturnType<typeof setTimeout> | null
  fitRaf: number | null
  ptyDataDisposable: IDisposable | null
  ptyResizeDisposable: IDisposable | null
}

const terminalInstances = new Map<string, TerminalInstance>()

/**
 * Read the current theme colors from CSS custom properties set by the theme engine.
 */
function getTerminalThemeFromCSS(): Record<string, string> {
  const root = document.documentElement
  const get = (v: string, fallback: string) =>
    root.style.getPropertyValue(v).trim() || fallback

  return {
    background:          get('--terminal-bg',    get('--bg-primary', '#1e1e2e')),
    foreground:          get('--terminal-fg',    get('--text-primary', '#cdd6f4')),
    cursor:              get('--accent',         '#89b4fa'),
    selectionBackground: get('--selection-bg',   '#45475a'),
    black:               get('--ansi-black',     '#45475a'),
    red:                 get('--ansi-red',       '#f38ba8'),
    green:               get('--ansi-green',     '#a6e3a1'),
    yellow:              get('--ansi-yellow',    '#f9e2af'),
    blue:                get('--ansi-blue',      '#89b4fa'),
    magenta:             get('--ansi-magenta',   '#cba6f7'),
    cyan:                get('--ansi-cyan',      '#94e2d5'),
    white:               get('--ansi-white',     '#bac2de'),
    brightBlack:         get('--ansi-bright-black',   '#585b70'),
    brightRed:           get('--ansi-bright-red',     '#f38ba8'),
    brightGreen:         get('--ansi-bright-green',   '#a6e3a1'),
    brightYellow:        get('--ansi-bright-yellow',  '#f9e2af'),
    brightBlue:          get('--ansi-bright-blue',    '#89b4fa'),
    brightMagenta:       get('--ansi-bright-magenta', '#f5c2e7'),
    brightCyan:          get('--ansi-bright-cyan',    '#94e2d5'),
    brightWhite:         get('--ansi-bright-white',   '#a6adc8'),
  }
}

const MIN_FIT_PX = 16

/** Fit after layout; skip when hidden or too small (avoids bad cols/rows and glitches). */
function scheduleFit(inst: TerminalInstance, sizeEl: HTMLElement) {
  if (inst.fitRaf != null) cancelAnimationFrame(inst.fitRaf)
  inst.fitRaf = requestAnimationFrame(() => {
    inst.fitRaf = null
    const { width, height } = sizeEl.getBoundingClientRect()
    if (width < MIN_FIT_PX || height < MIN_FIT_PX) return
    try {
      inst.fitAddon.fit()
      inst.terminal.refresh(0, inst.terminal.rows - 1)
    } catch {
      /* proposeDimensions can fail while not measurable */
    }
  })
}

function debouncedFit(inst: TerminalInstance, sizeEl: HTMLElement) {
  if (inst.fitDebounce) clearTimeout(inst.fitDebounce)
  inst.fitDebounce = setTimeout(() => {
    inst.fitDebounce = null
    scheduleFit(inst, sizeEl)
  }, 48)
}

function getOrCreateInstance(key: string): TerminalInstance {
  let inst = terminalInstances.get(key)
  if (inst) return inst

  const terminal = new Terminal({
    theme: getTerminalThemeFromCSS(),
    fontSize: 13,
    fontFamily: "'Cascadia Code', 'Fira Code', 'Consolas', monospace",
    cursorBlink: true,
    allowProposedApi: true,
  })

  const fitAddon = new FitAddon()
  terminal.loadAddon(fitAddon)

  const webLinksAddon = new WebLinksAddon((e, uri) => {
    e.preventDefault()
    requestOpenUrl(uri)
  })
  terminal.loadAddon(webLinksAddon)

  const hostEl = document.createElement('div')
  hostEl.style.width = '100%'
  hostEl.style.height = '100%'
  hostEl.style.overflow = 'hidden'

  inst = {
    terminal,
    fitAddon,
    webLinksAddon,
    ptyId: null,
    hostEl,
    initialized: false,
    cleanupPtyListener: null,
    fitDebounce: null,
    fitRaf: null,
    ptyDataDisposable: null,
    ptyResizeDisposable: null,
  }
  terminalInstances.set(key, inst)
  return inst
}

export function TerminalPanel({ panel, workspace }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hintDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const hintScanBufferRef = useRef('')
  const previousDetectedUrlRef = useRef<string | null>(null)
  const [localUrlHint, setLocalUrlHint] = useState<string | null>(null)
  const [hintDismissed, setHintDismissed] = useState(false)
  const instanceKey = `${workspace.id}:${panel.id}`

  useEffect(() => {
    setHintDismissed(false)
    setLocalUrlHint(null)
    hintScanBufferRef.current = ''
    previousDetectedUrlRef.current = null
    if (hintDebounceRef.current) {
      clearTimeout(hintDebounceRef.current)
      hintDebounceRef.current = null
    }
  }, [instanceKey])

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const inst = getOrCreateInstance(instanceKey)
    container.appendChild(inst.hostEl)

    if (!inst.initialized) {
      inst.terminal.open(inst.hostEl)
      try {
        inst.terminal.loadAddon(new WebglAddon())
      } catch {
        /* WebGL unavailable — keep default canvas/DOM renderer */
      }
      inst.initialized = true
    }

    // Initial fit after layout settles
    const raf = requestAnimationFrame(() => {
      setTimeout(() => debouncedFit(inst, container), 50)
    })

    return () => {
      cancelAnimationFrame(raf)
      if (inst.fitRaf != null) {
        cancelAnimationFrame(inst.fitRaf)
        inst.fitRaf = null
      }
      if (inst.fitDebounce) {
        clearTimeout(inst.fitDebounce)
        inst.fitDebounce = null
      }
      if (inst.hostEl.parentElement === container) {
        container.removeChild(inst.hostEl)
      }
      try {
        inst.webLinksAddon.dispose()
      } catch {
        /* ignore */
      }
      try {
        inst.terminal.dispose()
      } catch {
        /* ignore */
      }
      terminalInstances.delete(instanceKey)
    }
  }, [instanceKey])

  // Listen for theme changes and update the xterm theme
  useEffect(() => {
    const handler = () => {
      const inst = terminalInstances.get(instanceKey)
      if (!inst) return
      // Small delay to let CSS variables settle first
      requestAnimationFrame(() => {
        inst.terminal.options.theme = getTerminalThemeFromCSS()
      })
    }
    window.addEventListener('ide-theme-change', handler)
    return () => window.removeEventListener('ide-theme-change', handler)
  }, [instanceKey])

  // Connect to PTY (only once per instance)
  useEffect(() => {
    const inst = terminalInstances.get(instanceKey)
    if (!inst || !inst.initialized || inst.ptyId) return

    let cancelled = false

    const connectPty = async () => {
      try {
        const ptyId = await window.electronAPI.pty.create({
          cols: inst.terminal.cols || 80,
          rows: inst.terminal.rows || 24,
          cwd: workspace.rootPath,
        })

        if (cancelled) return
        inst.ptyId = ptyId
        hintScanBufferRef.current = ''

        let isReady = false
        inst.cleanupPtyListener = window.electronAPI.pty.onData((id, data) => {
          if (id === ptyId) {
            inst.terminal.write(data)

            const plain = stripSgrAnsi(data).replace(/\r/g, '')
            hintScanBufferRef.current = (hintScanBufferRef.current + plain).slice(-HINT_SCAN_BUFFER_MAX)
            const candidates = collectLocalUrlCandidates(data, hintScanBufferRef.current)
            const u = pickBestLocalUrl(candidates)
            if (u) {
              if (hintDebounceRef.current) clearTimeout(hintDebounceRef.current)
              hintDebounceRef.current = setTimeout(() => {
                if (previousDetectedUrlRef.current !== u) {
                  previousDetectedUrlRef.current = u
                  setHintDismissed(false)
                }
                setLocalUrlHint(u)
              }, 450)
            }

            // Execute the initial command shortly after the terminal emits its first bytes (shell init)
            if (!isReady && panel.componentState?.command) {
              isReady = true;
              let cmd = panel.componentState!.command;
              setTimeout(() => {
                window.electronAPI.pty.write(ptyId, cmd + '\r')
              }, 200)
            }
          }
        })

        inst.ptyDataDisposable?.dispose()
        inst.ptyResizeDisposable?.dispose()
        inst.ptyDataDisposable = inst.terminal.onData((data) => {
          window.electronAPI.pty.write(ptyId, data)
        })
        inst.ptyResizeDisposable = inst.terminal.onResize(({ cols, rows }) => {
          window.electronAPI.pty.resize(ptyId, cols, rows)
        })
      } catch (err) {
        log.error('pty_create_failed', err instanceof Error ? err.message : String(err))
      }
    }

    connectPty()
    return () => {
      cancelled = true
      if (hintDebounceRef.current) {
        clearTimeout(hintDebounceRef.current)
        hintDebounceRef.current = null
      }
      const inst = terminalInstances.get(instanceKey)
      if (!inst) return
      inst.ptyDataDisposable?.dispose()
      inst.ptyDataDisposable = null
      inst.ptyResizeDisposable?.dispose()
      inst.ptyResizeDisposable = null
      if (inst.cleanupPtyListener) {
        inst.cleanupPtyListener()
        inst.cleanupPtyListener = null
      }
      if (inst.ptyId) {
        window.electronAPI.pty.dispose(inst.ptyId)
        inst.ptyId = null
      }
    }
  }, [instanceKey, workspace.rootPath])

  // Refit on container resize / visibility (debounced so drags don't spam)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const inst = terminalInstances.get(instanceKey)
    if (!inst) return

    const onWin = () => debouncedFit(inst, container)
    window.addEventListener('resize', onWin)

    const ro = new ResizeObserver(() => debouncedFit(inst, container))
    ro.observe(container)

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting && e.intersectionRatio > 0)) {
          debouncedFit(inst, container)
        }
      },
      { threshold: [0, 0.01, 1] },
    )
    io.observe(container)

    return () => {
      window.removeEventListener('resize', onWin)
      ro.disconnect()
      io.disconnect()
    }
  }, [instanceKey])

  return (
    <div className="terminal-panel-stack" style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {localUrlHint && !hintDismissed && (
        <div className="terminal-panel__url-hint">
          <span className="terminal-panel__url-hint-text" title={localUrlHint}>
            Local: {localUrlHint.length > 56 ? `${localUrlHint.slice(0, 54)}…` : localUrlHint}
          </span>
          <button type="button" className="terminal-panel__url-hint-btn" onClick={() => requestOpenUrl(localUrlHint)}>
            Open link…
          </button>
          <button
            type="button"
            className="terminal-panel__url-hint-dismiss"
            onClick={() => {
              previousDetectedUrlRef.current = null
              setHintDismissed(true)
            }}
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
      )}
      <div
        ref={containerRef}
        className="terminal-panel"
        style={{ width: '100%', height: '100%', flex: 1, minHeight: 0 }}
      />
    </div>
  )
}


import { useEffect, useRef } from 'react'
import { Terminal } from '@xterm/xterm'
import { FitAddon } from '@xterm/addon-fit'
import '@xterm/xterm/css/xterm.css'
import { PanelState, WorkspaceState } from '../stores/workspace.store'

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

interface TerminalInstance {
  terminal: Terminal
  fitAddon: FitAddon
  ptyId: string | null
  hostEl: HTMLDivElement
  initialized: boolean
  cleanupPtyListener: (() => void) | null
  fitDebounce: ReturnType<typeof setTimeout> | null
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

function debouncedFit(inst: TerminalInstance) {
  if (inst.fitDebounce) clearTimeout(inst.fitDebounce)
  inst.fitDebounce = setTimeout(() => {
    try {
      inst.fitAddon.fit()
    } catch { /* ignore if not visible */ }
    inst.fitDebounce = null
  }, 80)
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

  const hostEl = document.createElement('div')
  hostEl.style.width = '100%'
  hostEl.style.height = '100%'
  hostEl.style.overflow = 'hidden'

  inst = {
    terminal, fitAddon, ptyId: null, hostEl,
    initialized: false, cleanupPtyListener: null, fitDebounce: null,
  }
  terminalInstances.set(key, inst)
  return inst
}

export function TerminalPanel({ panel, workspace }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const instanceKey = `${workspace.id}:${panel.id}`

  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    const inst = getOrCreateInstance(instanceKey)
    container.appendChild(inst.hostEl)

    if (!inst.initialized) {
      inst.terminal.open(inst.hostEl)
      inst.initialized = true
    }

    // Initial fit after layout settles
    const raf = requestAnimationFrame(() => {
      setTimeout(() => debouncedFit(inst), 50)
    })

    return () => {
      cancelAnimationFrame(raf)
      if (inst.hostEl.parentElement === container) {
        container.removeChild(inst.hostEl)
      }
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

        let isReady = false
        inst.cleanupPtyListener = window.electronAPI.pty.onData((id, data) => {
          if (id === ptyId) {
            inst.terminal.write(data)
            
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

        inst.terminal.onData((data) => {
          window.electronAPI.pty.write(ptyId, data)
        })

        inst.terminal.onResize(({ cols, rows }) => {
          window.electronAPI.pty.resize(ptyId, cols, rows)
        })
      } catch (err) {
        console.error('Failed to create PTY:', err)
      }
    }

    connectPty()
    return () => { cancelled = true }
  }, [instanceKey, workspace.rootPath])

  // Refit on container resize (debounced so drags don't spam)
  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const inst = terminalInstances.get(instanceKey)
    if (!inst) return

    const ro = new ResizeObserver(() => debouncedFit(inst))
    ro.observe(container)
    return () => ro.disconnect()
  }, [instanceKey])

  return (
    <div
      ref={containerRef}
      className="terminal-panel"
      style={{ width: '100%', height: '100%' }}
    />
  )
}


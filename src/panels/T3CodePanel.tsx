import { useState, useEffect, useRef } from 'react'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'
import { createUiLogger, Scopes } from '../lib/logger'

const log = createUiLogger(Scopes.uiPanelT3)

function readEditorBackgroundHex(): string {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--bg-primary').trim()
  return v || '#1e1e2e'
}

/** Poll until TCP accepts HTTP on this port (npx/t3 can take minutes on first run). Uses no-cors so CORS headers are not required. */
async function waitForLocalServer(
  port: number,
  opts: { intervalMs?: number; maxWaitMs?: number; isCancelled?: () => boolean } = {},
): Promise<boolean> {
  const intervalMs = opts.intervalMs ?? 400
  const maxWaitMs = opts.maxWaitMs ?? 180_000
  const baseUrl = `http://127.0.0.1:${port}/`
  const started = Date.now()
  while (Date.now() - started < maxWaitMs) {
    if (opts.isCancelled?.()) return false
    try {
      await fetch(baseUrl, { method: 'GET', mode: 'no-cors', cache: 'no-store' })
      return true
    } catch {
      /* connection refused or network error */
    }
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  return false
}

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

export function T3CodePanel({ panel, workspace }: Props) {
  const [url, setUrl] = useState<string | null>(null)
  const [logs, setLogs] = useState<string[]>([])
  const [isStarting, setIsStarting] = useState(true) // assume starting until we verify
  const [startTimedOut, setStartTimedOut] = useState(false)

  const ptyIdRef = useRef<string | null>(null)
  const webviewRef = useRef<any>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const failLoadRetriesRef = useRef(0)
  const updatePanel = useIDEStore((s) => s.updatePanel)

  useEffect(() => {
    let isMounted = true

    const startServer = async () => {
      setStartTimedOut(false)
      try {
        const ptyId = await window.electronAPI.pty.create({
          cols: 100,
          rows: 30,
          cwd: workspace.rootPath,
        })

        if (!isMounted) {
          window.electronAPI.pty.dispose(ptyId)
          return () => {}
        }

        ptyIdRef.current = ptyId

        const cleanup = window.electronAPI.pty.onData((id, data) => {
          if (id !== ptyId) return

          setLogs((prev) => {
            const newLogs = [...prev, data]
            return newLogs.slice(-40) // Keep recent logs
          })
        })

        const port = Math.floor(Math.random() * 1000) + 6000
        const serverUrl = `http://127.0.0.1:${port}`

        await new Promise((r) => setTimeout(r, 400))
        if (!isMounted) {
          cleanup()
          window.electronAPI.pty.dispose(ptyId)
          return () => {}
        }

        // VITE_DEV_SERVER_URL leaks from the IDE dev script and can redirect T3 to the IDE UI; strip it.
        const nodeCmd = `node -e "const cp = require('child_process'); delete process.env.VITE_DEV_SERVER_URL; process.env.PORT='${port}'; process.env.T3CODE_PORT='${port}'; process.env.T3CODE_NO_BROWSER='1'; cp.spawnSync('npx', ['-y', 't3', '--no-browser'], {stdio: 'inherit', env: process.env, shell: true})"`
        window.electronAPI.pty.write(ptyId, nodeCmd + '\r')

        const ready = await waitForLocalServer(port, { isCancelled: () => !isMounted })
        if (!isMounted) {
          cleanup()
          window.electronAPI.pty.dispose(ptyId)
          return () => {}
        }

        if (!ready) {
          setStartTimedOut(true)
          setIsStarting(false)
          return () => {
            cleanup()
            window.electronAPI.pty.dispose(ptyId)
          }
        }

        setUrl(serverUrl)
        setIsStarting(false)
        updatePanel(panel.id, {
          componentState: { ...panel.componentState, url: serverUrl },
        })

        return () => {
          cleanup()
          window.electronAPI.pty.dispose(ptyId)
        }
      } catch (err) {
        log.error('t3_pty_start_failed', err instanceof Error ? err.message : String(err))
        setIsStarting(false)
        setStartTimedOut(true)
        return () => {}
      }
    }

    const teardownPromise = startServer()

    return () => {
      isMounted = false
      teardownPromise.then(cleanupFn => cleanupFn())
    }
  }, [workspace.rootPath]) // deliberately ignore other deps to avoid restarting server on panel update

  useEffect(() => {
    if (!url || !containerRef.current || webviewRef.current) return

    failLoadRetriesRef.current = 0

    const wv = document.createElement('webview') as any
    wv.setAttribute('partition', `persist:t3-${panel.id}`)
    wv.setAttribute('src', url)
    wv.setAttribute('allowpopups', '')
    wv.style.width = '100%'
    wv.style.height = '100%'
    wv.style.border = 'none'
    wv.style.display = 'flex'
    wv.style.flex = '1'
    wv.style.backgroundColor = readEditorBackgroundHex()

    const onThemeChange = () => {
      wv.style.backgroundColor = readEditorBackgroundHex()
    }
    window.addEventListener('ide-theme-change', onThemeChange)

    const onFailLoad = (e: { errorCode?: number; isMainFrame?: boolean; validatedURL?: string }) => {
      if (e.isMainFrame === false) return
      const code = e.errorCode
      // -102 ERR_CONNECTION_REFUSED, -105 ERR_NAME_NOT_RESOLVED, -106 ERR_CONNECTION_ABORTED
      const retryable = code === -102 || code === -105 || code === -106
      if (!retryable || failLoadRetriesRef.current >= 10) return
      failLoadRetriesRef.current += 1
      const delay = Math.min(400 * failLoadRetriesRef.current, 5000)
      setTimeout(() => {
        try {
          if (webviewRef.current === wv && url) {
            wv.loadURL(url)
          }
        } catch {
          /* ignore */
        }
      }, delay)
    }

    const onFinishLoad = () => {
      failLoadRetriesRef.current = 0
    }

    wv.addEventListener('did-fail-load', onFailLoad as any)
    wv.addEventListener('did-finish-load', onFinishLoad)

    containerRef.current.appendChild(wv)
    webviewRef.current = wv

    return () => {
      window.removeEventListener('ide-theme-change', onThemeChange)
      wv.removeEventListener('did-fail-load', onFailLoad as any)
      wv.removeEventListener('did-finish-load', onFinishLoad)
      if (wv.parentElement) {
        wv.parentElement.removeChild(wv)
      }
      webviewRef.current = null
    }
  }, [url, panel.id])

  useEffect(() => {
    const handleReload = (e: any) => {
      if (e.detail?.id === panel.id) {
        webviewRef.current?.reload()
      }
    }
    window.addEventListener('reload-t3-panel', handleReload)
    return () => window.removeEventListener('reload-t3-panel', handleReload)
  }, [panel.id])

  if (startTimedOut && !url) {
    return (
      <div className="t3-code-panel">
        <h3 className="t3-code-panel__title">T3 Code did not become ready in time</h3>
        <p className="t3-code-panel__lead">
          Check the log below, then use the panel reload action or restart the workspace.
        </p>
        <div className="t3-code-panel__log">{logs.join('')}</div>
      </div>
    )
  }

  if (isStarting || !url) {
    return (
      <div className="t3-code-panel">
        <h3 className="t3-code-panel__title">Starting T3 Code Server...</h3>
        <p className="t3-code-panel__lead">
          Waiting for the server to accept connections (first run can take several minutes).
        </p>
        <div className="t3-code-panel__log">{logs.join('')}</div>
      </div>
    )
  }

  return (
    <div className="t3-code-panel__frame">
      <div ref={containerRef} style={{ flex: 1, display: 'flex' }} />
    </div>
  )
}

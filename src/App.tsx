import { useEffect } from 'react'
import { useIDEStore } from './stores/workspace.store'
import { Canvas } from './components/Canvas'
import { TitleBar } from './components/TitleBar'
import { StatusBar } from './components/StatusBar'
import { ExtensionsModal } from './components/ExtensionsModal'
import { LogViewerModal } from './components/LogViewerModal'
import { OpenUrlModal } from './components/OpenUrlModal'
import { installGlobalLinkCapture } from './lib/request-open-url'
import { initializeDefaultTheme } from './utils/theme-engine'
import { handleGlobalKeydown } from './lib/global-hotkeys'

export default function App() {
  const loadFromDisk = useIDEStore((s) => s.loadFromDisk)
  const isExtensionsOpen = useIDEStore((s) => s.isExtensionsOpen)
  const logViewerOpen = useIDEStore((s) => s.isLogViewerOpen)
  const setLogViewerOpen = useIDEStore((s) => s.setLogViewerOpen)
  const activeWs = useIDEStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  )

  useEffect(() => {
    loadFromDisk()
  }, [loadFromDisk])

  useEffect(() => installGlobalLinkCapture(), [])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => handleGlobalKeydown(e)
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [])

  // Initialize theme system — applies saved VSX theme or bundled default
  useEffect(() => {
    initializeDefaultTheme()
  }, [])

  // Expose active workspace root for extension host startup
  useEffect(() => {
    ;(window as any).__activeWorkspaceRoot = activeWs?.rootPath || null
  }, [activeWs?.rootPath])

  // Auto-start extension host when workspace loads, if extensions are installed
  useEffect(() => {
    if (!activeWs?.rootPath) return
    let cancelled = false

    const boot = async () => {
      try {
        const installed = await window.electronAPI.extensions.listInstalled()
        if (cancelled || installed.length === 0) return
        await window.electronAPI.extensions.startHost([activeWs.rootPath])
      } catch {
        // Extension host start is best-effort on boot
      }
    }
    boot()

    return () => { cancelled = true }
  }, [activeWs?.rootPath])

  // Listen for extension show-message events (from host → renderer)
  useEffect(() => {
    const cleanup = window.electronAPI.extensions.onShowMessage(
      (data: { level: string; message: string }) => {
        // Simple notification overlay — could be made fancier later
        const el = document.createElement('div')
        el.className = `ext-notification ext-notification--${data.level}`
        el.textContent = data.message
        document.body.appendChild(el)
        setTimeout(() => el.remove(), 5000)
      },
    )
    return cleanup
  }, [])

  return (
    <div className="app">
      <TitleBar showAddComponentMenu={!!activeWs} />
      <div className="app__canvas">
        <Canvas />
      </div>
      <StatusBar />
      {isExtensionsOpen && <ExtensionsModal />}
      <LogViewerModal open={logViewerOpen} onClose={() => setLogViewerOpen(false)} />
      <OpenUrlModal />
    </div>
  )
}

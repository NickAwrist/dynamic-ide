import { useEffect } from 'react'
import { useIDEStore } from './stores/workspace.store'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { Canvas } from './components/Canvas'
import { AddComponentMenu } from './components/AddComponentMenu'
import { StatusBar } from './components/StatusBar'
import { ExtensionsModal } from './components/ExtensionsModal'
import { initializeDefaultTheme } from './utils/theme-engine'

export default function App() {
  const loadFromDisk = useIDEStore((s) => s.loadFromDisk)
  const isExtensionsOpen = useIDEStore((s) => s.isExtensionsOpen)
  const activeWs = useIDEStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  )

  useEffect(() => {
    loadFromDisk()
  }, [loadFromDisk])

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
      <div className="titlebar">
        <div className="titlebar__drag-region" />
        <div className="titlebar__left">
          <span className="titlebar__brand">Dynamic IDE</span>
        </div>
        <div className="titlebar__center">
          <WorkspaceSwitcher />
        </div>
        <div className="titlebar__right">
          {activeWs && <AddComponentMenu />}
          <div className="titlebar__controls">
            <button
              className="titlebar__btn"
              onClick={() => window.electronAPI.window.minimize()}
            >
              ─
            </button>
            <button
              className="titlebar__btn"
              onClick={() => window.electronAPI.window.maximize()}
            >
              □
            </button>
            <button
              className="titlebar__btn titlebar__btn--close"
              onClick={() => window.electronAPI.window.close()}
            >
              ×
            </button>
          </div>
        </div>
      </div>
      <div className="app__canvas">
        <Canvas />
      </div>
      <StatusBar />
      {isExtensionsOpen && <ExtensionsModal />}
    </div>
  )
}

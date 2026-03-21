import { useEffect } from 'react'
import { useIDEStore } from './stores/workspace.store'
import { WorkspaceSwitcher } from './components/WorkspaceSwitcher'
import { Canvas } from './components/Canvas'
import { AddComponentMenu } from './components/AddComponentMenu'

export default function App() {
  const loadFromDisk = useIDEStore((s) => s.loadFromDisk)
  const activeWs = useIDEStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  )

  useEffect(() => {
    loadFromDisk()
  }, [loadFromDisk])

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
    </div>
  )
}

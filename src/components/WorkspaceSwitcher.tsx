import { useCallback, useEffect, useState } from 'react'
import { useIDEStore } from '../stores/workspace.store'

export function WorkspaceSwitcher() {
  const workspaces = useIDEStore((s) => s.workspaces)
  const activeId = useIDEStore((s) => s.activeWorkspaceId)
  const setActive = useIDEStore((s) => s.setActiveWorkspace)
  const addWorkspace = useIDEStore((s) => s.addWorkspace)
  const removeWorkspace = useIDEStore((s) => s.removeWorkspace)
  const [showNew, setShowNew] = useState(false)
  const [newName, setNewName] = useState('')

  const handleNew = useCallback(async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return
    const name = newName.trim() || dir.split(/[\\/]/).pop() || 'Untitled'
    addWorkspace(name, dir)
    setNewName('')
    setShowNew(false)
  }, [newName, addWorkspace])

  // Ctrl+1..9 to switch workspaces, Ctrl+Tab to cycle
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && !e.shiftKey && !e.altKey) {
        const num = parseInt(e.key)
        if (num >= 1 && num <= 9 && num <= workspaces.length) {
          e.preventDefault()
          setActive(workspaces[num - 1].id)
          return
        }
        if (e.key === 'Tab' && workspaces.length > 1) {
          e.preventDefault()
          const idx = workspaces.findIndex((w) => w.id === activeId)
          const next = (idx + 1) % workspaces.length
          setActive(workspaces[next].id)
        }
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [workspaces, activeId, setActive])

  return (
    <div className="workspace-switcher">
      <div className="workspace-switcher__tabs">
        {workspaces.map((ws, idx) => (
          <div
            key={ws.id}
            className={`workspace-switcher__tab ${ws.id === activeId ? 'workspace-switcher__tab--active' : ''}`}
            onClick={() => setActive(ws.id)}
            title={ws.rootPath}
          >
            <span className="workspace-switcher__tab-index">{idx + 1}</span>
            <span className="workspace-switcher__tab-name">{ws.name}</span>
            <button
              className="workspace-switcher__tab-close"
              onClick={(e) => {
                e.stopPropagation()
                removeWorkspace(ws.id)
              }}
              title="Close workspace"
            >
              ×
            </button>
          </div>
        ))}
        {showNew ? (
          <div className="workspace-switcher__new-form">
            <input
              className="workspace-switcher__new-input"
              placeholder="Name (optional)"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleNew()
                if (e.key === 'Escape') setShowNew(false)
              }}
              autoFocus
            />
            <button className="workspace-switcher__new-browse" onClick={handleNew}>
              Browse...
            </button>
            <button
              className="workspace-switcher__new-cancel"
              onClick={() => setShowNew(false)}
            >
              ×
            </button>
          </div>
        ) : (
          <button
            className="workspace-switcher__add"
            onClick={() => setShowNew(true)}
            title="New workspace"
          >
            +
          </button>
        )}
      </div>
    </div>
  )
}

import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { useIDEStore, type WorkspaceState } from '../stores/workspace.store'
import { WorkspaceManagerModal } from './WorkspaceManagerModal'
import { IconClose } from './ui/ChromeIcons'

type TabRow =
  | { kind: 'live'; ws: WorkspaceState }
  | { kind: 'ghost'; ws: WorkspaceState }

function mergeTabs(
  workspaces: WorkspaceState[],
  leaving: { ws: WorkspaceState; insertIndex: number } | null,
): TabRow[] {
  if (!leaving) return workspaces.map((ws) => ({ kind: 'live' as const, ws }))
  const { ws: ghost, insertIndex } = leaving
  const out: TabRow[] = []
  for (let i = 0; i < insertIndex; i++) {
    if (workspaces[i]) out.push({ kind: 'live', ws: workspaces[i] })
  }
  out.push({ kind: 'ghost', ws: ghost })
  for (let i = insertIndex; i < workspaces.length; i++) {
    out.push({ kind: 'live', ws: workspaces[i] })
  }
  return out
}

export function WorkspaceSwitcher() {
  const workspaces = useIDEStore((s) => s.workspaces)
  const activeId = useIDEStore((s) => s.activeWorkspaceId)
  const setActive = useIDEStore((s) => s.setActiveWorkspace)
  const closeWorkspace = useIDEStore((s) => s.closeWorkspace)
  const deleteWorkspacePermanently = useIDEStore((s) => s.deleteWorkspacePermanently)
  const [modalOpen, setModalOpen] = useState(false)

  const prevWorkspacesRef = useRef<WorkspaceState[]>([])
  const exitQueueRef = useRef<{ ws: WorkspaceState; insertIndex: number }[]>([])
  const [leaving, setLeaving] = useState<{ ws: WorkspaceState; insertIndex: number } | null>(null)

  useEffect(() => {
    const prev = prevWorkspacesRef.current
    const nextIds = new Set(workspaces.map((w) => w.id))
    const removed = prev.filter((w) => !nextIds.has(w.id))
    for (const w of removed) {
      exitQueueRef.current.push({ ws: w, insertIndex: prev.indexOf(w) })
    }
    if (removed.length) {
      setLeaving((cur) => cur ?? exitQueueRef.current.shift() ?? null)
    }
    prevWorkspacesRef.current = workspaces
  }, [workspaces])

  const handleExitAnimationEnd = useCallback(() => {
    setLeaving(exitQueueRef.current.shift() ?? null)
  }, [])

  useEffect(() => {
    if (!leaving) return
    if (!window.matchMedia('(prefers-reduced-motion: reduce)').matches) return
    const t = window.setTimeout(() => handleExitAnimationEnd(), 1)
    return () => clearTimeout(t)
  }, [leaving, handleExitAnimationEnd])

  const handleTabContextMenu = useCallback(
    (e: MouseEvent, id: string) => {
      e.preventDefault()
      if (
        window.confirm(
          'Delete this workspace permanently? Saved layout on disk will be removed.',
        )
      ) {
        void deleteWorkspacePermanently(id)
      }
    },
    [deleteWorkspacePermanently],
  )

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

  const rows = mergeTabs(workspaces, leaving)

  return (
    <div className="workspace-switcher">
      <WorkspaceManagerModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <div className="workspace-switcher__tabs">
        {rows.map((row, idx) => {
          const ws = row.ws
          const isGhost = row.kind === 'ghost'
          const isActive = !isGhost && ws.id === activeId
          return (
            <div
              key={isGhost ? `ghost-${ws.id}` : ws.id}
              className={`workspace-switcher__tab ${isActive ? 'workspace-switcher__tab--active' : ''} ${isGhost ? 'workspace-switcher__tab--exiting' : ''}`}
              onClick={isGhost ? undefined : () => setActive(ws.id)}
              onContextMenu={isGhost ? undefined : (e) => handleTabContextMenu(e, ws.id)}
              title={
                isGhost
                  ? undefined
                  : `${ws.rootPath}\nRight-click: delete permanently`
              }
              onAnimationEnd={
                isGhost
                  ? (e) => {
                      if (e.animationName === 'workspace-tab-exit') handleExitAnimationEnd()
                    }
                  : undefined
              }
            >
              <span className="workspace-switcher__tab-index">{idx + 1}</span>
              <span className="workspace-switcher__tab-name">{ws.name}</span>
              {!isGhost && (
                <button
                  className="workspace-switcher__tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    void closeWorkspace(ws.id)
                  }}
                  title="Close workspace (keeps saved state)"
                  aria-label="Close workspace"
                >
                  <IconClose size="xs" />
                </button>
              )}
            </div>
          )
        })}
        <button
          className="workspace-switcher__add"
          onClick={() => setModalOpen(true)}
          title="New or open workspace"
        >
          +
        </button>
      </div>
    </div>
  )
}

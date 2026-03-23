import { useCallback, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { IconClose } from '../ui/ChromeIcons'
import { useIDEStore } from '../../stores/workspace.store'
import { CreateWorkspaceSection } from './CreateWorkspaceSection'
import { WorkspaceActionMenuPortal } from './WorkspaceActionMenuPortal'
import { WorkspaceListRow } from './WorkspaceListRow'
import { useWorkspaceMenuPosition } from './useWorkspaceMenuPosition'

interface Props {
  open: boolean
  onClose: () => void
}

export function WorkspaceManagerModal({ open, onClose }: Props) {
  const workspaces = useIDEStore((s) => s.workspaces)
  const activeWorkspaceId = useIDEStore((s) => s.activeWorkspaceId)
  const addWorkspace = useIDEStore((s) => s.addWorkspace)
  const openWorkspace = useIDEStore((s) => s.openWorkspace)
  const setActiveWorkspace = useIDEStore((s) => s.setActiveWorkspace)
  const deleteWorkspacePermanently = useIDEStore((s) => s.deleteWorkspacePermanently)
  const renameWorkspace = useIDEStore((s) => s.renameWorkspace)

  const [newName, setNewName] = useState('')
  const [rootPath, setRootPath] = useState<string | null>(null)
  const [summaries, setSummaries] = useState<
    Array<{ id: string; name: string; rootPath: string }>
  >([])
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null)
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')

  const menuTriggerRef = useRef<HTMLButtonElement | null>(null)
  const menuPopoverRef = useRef<HTMLDivElement | null>(null)
  const menuPos = useWorkspaceMenuPosition(menuOpenId, menuTriggerRef, menuPopoverRef)

  const openIds = new Set(workspaces.map((w) => w.id))

  const refreshSummaries = useCallback(async () => {
    try {
      const list = await window.electronAPI.workspace.listSummaries()
      setSummaries(list)
    } catch {
      setSummaries([])
    }
  }, [])

  useEffect(() => {
    if (!open) return
    refreshSummaries()
  }, [open, refreshSummaries])

  useEffect(() => {
    if (!open) {
      setMenuOpenId(null)
      menuTriggerRef.current = null
    }
  }, [open])

  useEffect(() => {
    if (!menuOpenId) return
    const onDown = (e: MouseEvent) => {
      const el = e.target as HTMLElement
      if (el.closest('.workspace-modal__row-menu')) return
      if (el.closest('.workspace-modal__menu-popover')) return
      setMenuOpenId(null)
      menuTriggerRef.current = null
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [menuOpenId])

  const closed = summaries.filter((s) => !openIds.has(s.id))

  const handleCreate = () => {
    if (!rootPath) return
    const name = newName.trim() || rootPath.split(/[\\/]/).pop() || 'Untitled'
    addWorkspace(name, rootPath)
    setNewName('')
    setRootPath(null)
    void refreshSummaries()
    onClose()
  }

  const handleBrowse = async () => {
    const dir = await window.electronAPI.dialog.openDirectory()
    if (!dir) return
    setRootPath(dir)
    setNewName((prev) => {
      if (prev.trim()) return prev
      return dir.split(/[\\/]/).filter(Boolean).pop() || ''
    })
  }

  const startRename = (id: string, currentName: string) => {
    setMenuOpenId(null)
    menuTriggerRef.current = null
    setRenamingId(id)
    setRenameDraft(currentName)
  }

  const cancelRename = () => {
    setRenamingId(null)
    setRenameDraft('')
  }

  const commitRename = async () => {
    if (!renamingId) return
    const id = renamingId
    const draft = renameDraft
    setRenamingId(null)
    setRenameDraft('')
    await renameWorkspace(id, draft)
    void refreshSummaries()
  }

  const handleDelete = async (id: string) => {
    if (
      !window.confirm(
        'Delete this workspace permanently? Saved layout on disk will be removed.',
      )
    ) {
      return
    }
    setMenuOpenId(null)
    menuTriggerRef.current = null
    await deleteWorkspacePermanently(id)
    void refreshSummaries()
  }

  const handleOpenClosed = async (id: string) => {
    await openWorkspace(id)
    void refreshSummaries()
  }

  const toggleMenu = (id: string, e: ReactMouseEvent<HTMLButtonElement>) => {
    e.stopPropagation()
    const btn = e.currentTarget
    if (menuOpenId === id) {
      setMenuOpenId(null)
      menuTriggerRef.current = null
    } else {
      menuTriggerRef.current = btn
      setMenuOpenId(id)
    }
  }

  const openWs = menuOpenId ? workspaces.find((w) => w.id === menuOpenId) : undefined
  const closedWs = menuOpenId ? summaries.find((s) => s.id === menuOpenId) : undefined

  if (!open) return null

  return (
    <div className="ext-modal-overlay" onClick={onClose}>
      <WorkspaceActionMenuPortal
        menuOpenId={menuOpenId}
        renamingId={renamingId}
        menuPos={menuPos}
        menuPopoverRef={menuPopoverRef}
        openWs={openWs}
        closedWs={closedWs}
        onStartRename={startRename}
        onDelete={handleDelete}
      />
      <div className="workspace-modal" onClick={(e) => e.stopPropagation()}>
        <div className="workspace-modal__header">
          <h2 className="workspace-modal__title">Workspaces</h2>
          <button type="button" className="workspace-modal__close" onClick={onClose} aria-label="Close">
            <IconClose size="lg" />
          </button>
        </div>
        <div className="workspace-modal__body">
          <section className="workspace-modal__section">
            <h3 className="workspace-modal__section-title">Open now</h3>
            {workspaces.length === 0 ? (
              <p className="workspace-modal__empty">No workspace is open.</p>
            ) : (
              <ul className="workspace-modal__list">
                {workspaces.map((ws) => (
                  <WorkspaceListRow
                    key={ws.id}
                    variant="open"
                    name={ws.name}
                    rootPath={ws.rootPath}
                    isRenaming={renamingId === ws.id}
                    renameDraft={renameDraft}
                    menuOpen={menuOpenId === ws.id}
                    isActiveWorkspace={ws.id === activeWorkspaceId}
                    mainTitle="Switch to this workspace"
                    onRenameDraftChange={setRenameDraft}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onMainClick={() => setActiveWorkspace(ws.id)}
                    onToggleMenu={(e) => toggleMenu(ws.id, e)}
                  />
                ))}
              </ul>
            )}
          </section>

          <section className="workspace-modal__section">
            <h3 className="workspace-modal__section-title">Saved workspaces</h3>
            {closed.length === 0 ? (
              <p className="workspace-modal__empty">No saved workspaces yet.</p>
            ) : (
              <ul className="workspace-modal__list">
                {closed.map((s) => (
                  <WorkspaceListRow
                    key={s.id}
                    variant="closed"
                    name={s.name}
                    rootPath={s.rootPath}
                    isRenaming={renamingId === s.id}
                    renameDraft={renameDraft}
                    menuOpen={menuOpenId === s.id}
                    mainTitle="Open this workspace"
                    onRenameDraftChange={setRenameDraft}
                    onCommitRename={commitRename}
                    onCancelRename={cancelRename}
                    onMainClick={() => void handleOpenClosed(s.id)}
                    onToggleMenu={(e) => toggleMenu(s.id, e)}
                  />
                ))}
              </ul>
            )}
          </section>

          <CreateWorkspaceSection
            newName={newName}
            rootPath={rootPath}
            onNewNameChange={setNewName}
            onBrowse={handleBrowse}
            onCreate={handleCreate}
          />
        </div>
      </div>
    </div>
  )
}

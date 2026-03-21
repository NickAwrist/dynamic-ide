import { useState, useRef, useEffect, useCallback } from 'react'
import { PanelType, useIDEStore } from '../stores/workspace.store'

const COMPONENT_OPTIONS: { type: PanelType; label: string; desc: string }[] = [
  { type: 'editor', label: 'Code Editor', desc: 'Edit files with syntax highlighting' },
  { type: 'terminal', label: 'Terminal', desc: 'Full terminal emulator' },
  { type: 'file-explorer', label: 'File Explorer', desc: 'Browse project files' },
  { type: 'git', label: 'Git', desc: 'Stage, commit, and view history' },
  { type: 'browser', label: 'Browser', desc: 'Embedded web browser with profile import' },
  { type: 'extensions', label: 'Extensions', desc: 'Browse and install VS Code extensions' },
  { type: 'extension-view', label: 'Extension View', desc: 'Open a view provided by an extension' },
]

export function AddComponentMenu() {
  const [open, setOpen] = useState(false)
  const [extViews, setExtViews] = useState<Array<{ viewId: string; type: string }>>([])
  const [showViewPicker, setShowViewPicker] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const addPanel = useIDEStore((s) => s.addPanel)
  const activeWs = useIDEStore((s) => s.activeWorkspaceId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
        setShowViewPicker(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  const loadViews = useCallback(async () => {
    try {
      const views = await window.electronAPI.extensions.getRegisteredViews()
      setExtViews(views)
    } catch {
      setExtViews([])
    }
  }, [])

  const handleOptionClick = useCallback((type: PanelType) => {
    if (type === 'extension-view') {
      loadViews()
      setShowViewPicker(true)
      return
    }
    addPanel(type)
    setOpen(false)
  }, [addPanel, loadViews])

  const handleViewSelect = useCallback((viewId: string) => {
    addPanel('extension-view', { viewId, title: viewId })
    setOpen(false)
    setShowViewPicker(false)
  }, [addPanel])

  if (!activeWs) return null

  return (
    <div className="add-menu" ref={menuRef}>
      <button className="add-menu__trigger" onClick={() => setOpen(!open)}>
        +
      </button>
      {open && !showViewPicker && (
        <div className="add-menu__dropdown">
          {COMPONENT_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className="add-menu__item"
              onClick={() => handleOptionClick(opt.type)}
            >
              <span className="add-menu__item-label">{opt.label}</span>
              <span className="add-menu__item-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
      {open && showViewPicker && (
        <div className="add-menu__dropdown">
          <button className="add-menu__item add-menu__item--back" onClick={() => setShowViewPicker(false)}>
            <span className="add-menu__item-label">← Back</span>
          </button>
          {extViews.length === 0 && (
            <div className="add-menu__item add-menu__item--empty">
              <span className="add-menu__item-desc">
                No views available. Start the host and activate extensions first.
              </span>
            </div>
          )}
          {extViews.map((v) => (
            <button
              key={v.viewId}
              className="add-menu__item"
              onClick={() => handleViewSelect(v.viewId)}
            >
              <span className="add-menu__item-label">{v.viewId}</span>
              <span className="add-menu__item-desc">{v.type}</span>
            </button>
          ))}
          <button
            className="add-menu__item"
            onClick={() => {
              addPanel('extension-view')
              setOpen(false)
              setShowViewPicker(false)
            }}
          >
            <span className="add-menu__item-label">Open Empty (pick later)</span>
            <span className="add-menu__item-desc">Choose the view after panel opens</span>
          </button>
        </div>
      )}
    </div>
  )
}

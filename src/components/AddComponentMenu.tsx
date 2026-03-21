import { useState, useRef, useEffect } from 'react'
import { PanelType, useIDEStore } from '../stores/workspace.store'

const COMPONENT_OPTIONS: { type: PanelType; label: string; desc: string }[] = [
  { type: 'editor', label: 'Code Editor', desc: 'Edit files with syntax highlighting' },
  { type: 'terminal', label: 'Terminal', desc: 'Full terminal emulator' },
  { type: 'file-explorer', label: 'File Explorer', desc: 'Browse project files' },
  { type: 'git', label: 'Git', desc: 'Stage, commit, and view history' },
  { type: 'browser', label: 'Browser', desc: 'Embedded web browser with profile import' },
]

export function AddComponentMenu() {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const addPanel = useIDEStore((s) => s.addPanel)
  const activeWs = useIDEStore((s) => s.activeWorkspaceId)

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [])

  if (!activeWs) return null

  return (
    <div className="add-menu" ref={menuRef}>
      <button className="add-menu__trigger" onClick={() => setOpen(!open)}>
        +
      </button>
      {open && (
        <div className="add-menu__dropdown">
          {COMPONENT_OPTIONS.map((opt) => (
            <button
              key={opt.type}
              className="add-menu__item"
              onClick={() => {
                addPanel(opt.type)
                setOpen(false)
              }}
            >
              <span className="add-menu__item-label">{opt.label}</span>
              <span className="add-menu__item-desc">{opt.desc}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

import { useState, useRef, useEffect, useCallback, ReactNode } from 'react'
import { PanelType, useIDEStore } from '../stores/workspace.store'

const COMPONENT_OPTIONS: { type: PanelType | 'extensions'; label: string; desc: string; icon?: ReactNode; state?: any }[] = [
  { type: 'editor', label: 'Code Editor', desc: 'Edit files with syntax highlighting' },
  { type: 'terminal', label: 'Shell', desc: 'Full terminal emulator', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg> },
  { type: 'terminal', label: 'Claude Code', desc: 'Run Anthropic Claude Code', icon: <img src="/icons/claude.png" width="16" height="16" alt="Claude" />, state: { command: 'claude' } },
  { type: 'terminal', label: 'Gemini CLI', desc: 'Run Google Gemini', icon: <img src="/icons/gemini.png" width="16" height="16" alt="Gemini" />, state: { command: 'gemini' } },
  { type: 'terminal', label: 'Codex', desc: 'Run OpenAI Codex', icon: <img src="/icons/codex.png" width="16" height="16" alt="Codex" />, state: { command: 'codex' } },
  { type: 'file-explorer', label: 'File Explorer', desc: 'Browse project files' },
  { type: 'git', label: 'Git', desc: 'Stage, commit, and view history' },
  { type: 'browser', label: 'Browser', desc: 'Embedded web browser with profile import' },
  { type: 'extensions', label: 'Extensions', desc: 'Browse and install VS Code extensions', icon: <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg> },
  { type: 'extension-view', label: 'Extension View', desc: 'Open a view provided by an extension' },
]

export function AddComponentMenu() {
  const [open, setOpen] = useState(false)
  const [extViews, setExtViews] = useState<Array<{ viewId: string; type: string }>>([])
  const [showViewPicker, setShowViewPicker] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const addPanel = useIDEStore((s) => s.addPanel)
  const activeWs = useIDEStore((s) => s.activeWorkspaceId)
  const setExtensionsOpen = useIDEStore((s) => s.setExtensionsOpen)

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

  const handleOptionClick = useCallback((opt: typeof COMPONENT_OPTIONS[0]) => {
    if (opt.type === 'extensions') {
      setExtensionsOpen(true)
      setOpen(false)
      return
    }
    if (opt.type === 'extension-view') {
      loadViews()
      setShowViewPicker(true)
      return
    }
    addPanel(opt.type as PanelType, opt.state)
    setOpen(false)
  }, [addPanel, loadViews, setExtensionsOpen])

  const handleViewSelect = useCallback((viewId: string) => {
    addPanel('extension-view', { viewId, title: viewId })
    setOpen(false)
    setShowViewPicker(false)
  }, [addPanel])

  if (!activeWs) return null

  return (
    <div className="add-menu" ref={menuRef}>
      <button className="add-menu__trigger" style={{ width: 'auto', padding: '0 8px', gap: '4px' }} onClick={() => setOpen(!open)}>
        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
        <span style={{ fontSize: '11px', fontWeight: 600 }}>Add View</span>
      </button>
      {open && !showViewPicker && (
        <div className="add-menu__dropdown">
          {COMPONENT_OPTIONS.map((opt) => (
            <button
              key={opt.label}
              className="add-menu__item"
              onClick={() => handleOptionClick(opt)}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                {opt.icon && <span style={{ display: 'flex', color: 'var(--accent, #89b4fa)' }}>{opt.icon}</span>}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start' }}>
                  <span className="add-menu__item-label">{opt.label}</span>
                  <span className="add-menu__item-desc">{opt.desc}</span>
                </div>
              </div>
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

import { useState, useEffect, useCallback } from 'react'
import { useIDEStore } from '../stores/workspace.store'

interface StatusBarItem {
  id: string
  text: string
  tooltip: string
  command?: string
  alignment: number // 1 = Left, 2 = Right
  priority: number
  visible: boolean
}

export function StatusBar() {
  const [items, setItems] = useState<StatusBarItem[]>([])
  const [message, setMessage] = useState<string | null>(null)
  const activeWs = useIDEStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  )
  const setExtensionsOpen = useIDEStore((s) => s.setExtensionsOpen)

  useEffect(() => {
    const cleanup = window.electronAPI.extensions.onStatusBarUpdate((item: StatusBarItem) => {
      setItems((prev) => {
        const idx = prev.findIndex((i) => i.id === item.id)
        if (idx >= 0) {
          const updated = [...prev]
          updated[idx] = item
          return updated
        }
        return [...prev, item]
      })
    })

    const cleanupRemove = window.electronAPI.extensions.onStatusBarRemove((id: string) => {
      setItems((prev) => prev.filter((i) => i.id !== id))
    })

    const cleanupMessage = window.electronAPI.extensions.onStatusBarMessage((text: string) => {
      setMessage(text)
      setTimeout(() => setMessage(null), 5000)
    })

    return () => {
      cleanup()
      cleanupRemove()
      cleanupMessage()
    }
  }, [])

  const handleClick = useCallback((command?: string) => {
    if (command) {
      window.electronAPI.extensions.executeCommand(command)
    }
  }, [])

  const visibleItems = items.filter((i) => i.visible)
  const leftItems = visibleItems
    .filter((i) => i.alignment === 1)
    .sort((a, b) => b.priority - a.priority)
  const rightItems = visibleItems
    .filter((i) => i.alignment === 2)
    .sort((a, b) => b.priority - a.priority)

  return (
    <div className="statusbar">
      <div className="statusbar__left">
        {activeWs && (
          <span className="statusbar__item statusbar__item--builtin">
            {activeWs.rootPath.split(/[\\/]/).pop()}
          </span>
        )}
        {leftItems.map((item) => (
          <button
            key={item.id}
            className={`statusbar__item ${item.command ? 'statusbar__item--clickable' : ''}`}
            title={item.tooltip}
            onClick={() => handleClick(item.command)}
          >
            {item.text}
          </button>
        ))}
        {message && (
          <span className="statusbar__item statusbar__message">{message}</span>
        )}
      </div>
      <div className="statusbar__right">
        {rightItems.map((item) => (
          <button
            key={item.id}
            className={`statusbar__item ${item.command ? 'statusbar__item--clickable' : ''}`}
            title={item.tooltip}
            onClick={() => handleClick(item.command)}
          >
            {item.text}
          </button>
        ))}
        <button
          className="statusbar__item statusbar__item--clickable"
          title="Extensions"
          onClick={() => setExtensionsOpen(true)}
        >
          <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '4px' }}><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>
          Extensions
        </button>
      </div>
    </div>
  )
}

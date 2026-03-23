import { useEffect, useState } from 'react'
import { useIDEStore } from '../stores/workspace.store'
import { AddComponentMenu } from './AddComponentMenu'
import { WorkspaceSwitcher } from './WorkspaceSwitcher'
import { IconChromeMaximize, IconChromeMinimize, IconChromeRestore, IconClose } from './ui/ChromeIcons'

interface Props {
  showAddComponentMenu: boolean
}

export function TitleBar({ showAddComponentMenu }: Props) {
  const setExtensionsOpen = useIDEStore((s) => s.setExtensionsOpen)
  const [maximized, setMaximized] = useState(false)

  useEffect(() => {
    const w = window.electronAPI?.window
    if (!w?.isMaximized || !w?.onMaximizedChange) return
    void w.isMaximized().then(setMaximized)
    return w.onMaximizedChange(setMaximized)
  }, [])

  return (
    <div className="titlebar">
      <div className="titlebar__drag-region" />
      <div className="titlebar__left">
        <span className="titlebar__brand">Dynamic IDE</span>
      </div>
      <div className="titlebar__center">
        <WorkspaceSwitcher />
      </div>
      <div className="titlebar__right">
        {showAddComponentMenu && (
          <>
            <AddComponentMenu />
            <button
              type="button"
              className="add-menu__trigger"
              style={{ width: 'auto', padding: '0 8px', gap: '4px' }}
              title="Extensions"
              onClick={() => setExtensionsOpen(true)}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="12 2 2 7 12 12 22 7 12 2" />
                <polyline points="2 17 12 22 22 17" />
                <polyline points="2 12 12 17 22 12" />
              </svg>
              <span style={{ fontSize: '11px', fontWeight: 600 }}>Extensions</span>
            </button>
          </>
        )}
        <div className="titlebar__controls">
          <button
            type="button"
            className="titlebar__btn"
            title="Minimize"
            aria-label="Minimize"
            onClick={() => window.electronAPI.window.minimize()}
          >
            <IconChromeMinimize width={15} height={15} />
          </button>
          <button
            type="button"
            className="titlebar__btn"
            title={maximized ? 'Restore' : 'Maximize'}
            aria-label={maximized ? 'Restore' : 'Maximize'}
            onClick={() => window.electronAPI.window.maximize()}
          >
            {maximized ? (
              <IconChromeRestore width={15} height={15} />
            ) : (
              <IconChromeMaximize width={15} height={15} />
            )}
          </button>
          <button
            type="button"
            className="titlebar__btn titlebar__btn--close"
            title="Close"
            aria-label="Close"
            onClick={() => window.electronAPI.window.close()}
          >
            <IconClose size="md" width={15} height={15} />
          </button>
        </div>
      </div>
    </div>
  )
}

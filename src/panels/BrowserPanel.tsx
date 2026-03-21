import { useState, useEffect, useRef, useCallback } from 'react'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'
import type { BrowserProfile, BookmarkNode } from '../types/electron'

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

export function BrowserPanel({ panel }: Props) {
  const updatePanel = useIDEStore((s) => s.updatePanel)

  const containerRef = useRef<HTMLDivElement>(null)
  const webviewRef = useRef<Electron.WebviewTag | null>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const savedUrl = panel.componentState?.url || 'https://www.google.com'
  const [displayUrl, setDisplayUrl] = useState(savedUrl)
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>(
    panel.componentState?.bookmarks || [],
  )
  const [showImportModal, setShowImportModal] = useState(false)
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [importStatus, setImportStatus] = useState('')

  useEffect(() => {
    const container = containerRef.current
    if (!container || webviewRef.current) return

    const wv = document.createElement('webview') as Electron.WebviewTag
    wv.setAttribute('src', savedUrl)
    wv.setAttribute('partition', 'persist:browser')
    wv.setAttribute('allowpopups', '')
    wv.style.width = '100%'
    wv.style.height = '100%'
    wv.style.border = 'none'
    wv.style.display = 'flex'
    wv.style.flex = '1'

    const onStartLoading = () => setIsLoading(true)
    const onStopLoading = () => setIsLoading(false)

    const onNavigate = (e: Electron.DidNavigateEvent) => {
      setDisplayUrl(e.url)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
      updatePanel(panel.id, {
        componentState: { ...panel.componentState, url: e.url },
      })
    }

    const onNavigateInPage = (e: Electron.DidNavigateInPageEvent) => {
      setDisplayUrl(e.url)
      setCanGoBack(wv.canGoBack())
      setCanGoForward(wv.canGoForward())
    }

    wv.addEventListener('did-start-loading', onStartLoading)
    wv.addEventListener('did-stop-loading', onStopLoading)
    wv.addEventListener('did-navigate', onNavigate as any)
    wv.addEventListener('did-navigate-in-page', onNavigateInPage as any)

    container.appendChild(wv)
    webviewRef.current = wv

    return () => {
      wv.removeEventListener('did-start-loading', onStartLoading)
      wv.removeEventListener('did-stop-loading', onStopLoading)
      wv.removeEventListener('did-navigate', onNavigate as any)
      wv.removeEventListener('did-navigate-in-page', onNavigateInPage as any)
    }
  }, [])

  const navigate = useCallback(
    (targetUrl: string) => {
      let processed = targetUrl.trim()
      if (!processed) return

      if (!/^https?:\/\//i.test(processed) && !/^file:\/\//i.test(processed)) {
        if (/^[\w-]+(\.[\w-]+)+/.test(processed)) {
          processed = 'https://' + processed
        } else {
          processed =
            'https://www.google.com/search?q=' + encodeURIComponent(processed)
        }
      }

      setDisplayUrl(processed)
      webviewRef.current?.loadURL(processed)
    },
    [],
  )

  const handleUrlKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') {
        navigate(displayUrl)
        urlInputRef.current?.blur()
      }
    },
    [displayUrl, navigate],
  )

  const goBack = useCallback(() => webviewRef.current?.goBack(), [])
  const goForward = useCallback(() => webviewRef.current?.goForward(), [])
  const reload = useCallback(() => {
    if (isLoading) webviewRef.current?.stop()
    else webviewRef.current?.reload()
  }, [isLoading])

  const detectProfiles = useCallback(async () => {
    try {
      const detected = await window.electronAPI.browser.detectProfiles()
      setProfiles(detected)
    } catch (err) {
      console.error('Failed to detect profiles:', err)
    }
  }, [])

  const importProfile = useCallback(
    async (profilePath: string) => {
      setImportStatus('Importing profile data... Ensure the source browser is closed.')
      try {
        const result = await window.electronAPI.browser.importProfile(profilePath)
        setImportStatus(result.message)
        if (result.bookmarks) {
          setBookmarks(result.bookmarks)
          updatePanel(panel.id, {
            componentState: { ...panel.componentState, bookmarks: result.bookmarks },
          })
        }
      } catch (err: any) {
        setImportStatus('Import failed: ' + (err.message || 'Unknown error'))
      }
    },
    [panel.id, panel.componentState, updatePanel],
  )

  const importBookmarksOnly = useCallback(
    async (profilePath: string) => {
      try {
        const result = await window.electronAPI.browser.importBookmarks(profilePath)
        if (result.bookmarks) {
          setBookmarks(result.bookmarks)
          updatePanel(panel.id, {
            componentState: { ...panel.componentState, bookmarks: result.bookmarks },
          })
          setImportStatus('Bookmarks imported successfully')
        }
      } catch (err: any) {
        setImportStatus('Bookmark import failed: ' + (err.message || 'Unknown error'))
      }
    },
    [panel.id, panel.componentState, updatePanel],
  )

  return (
    <div className="browser-panel">
      <div className="browser-panel__toolbar">
        <button
          className="browser-panel__nav-btn"
          onClick={goBack}
          disabled={!canGoBack}
          title="Back"
        >
          ◀
        </button>
        <button
          className="browser-panel__nav-btn"
          onClick={goForward}
          disabled={!canGoForward}
          title="Forward"
        >
          ▶
        </button>
        <button className="browser-panel__nav-btn" onClick={reload} title="Reload">
          {isLoading ? '✕' : '↻'}
        </button>

        <div className="browser-panel__url-bar">
          {isLoading && <div className="browser-panel__loading-bar" />}
          <input
            ref={urlInputRef}
            className="browser-panel__url-input"
            value={displayUrl}
            onChange={(e) => setDisplayUrl(e.target.value)}
            onKeyDown={handleUrlKeyDown}
            onFocus={(e) => e.target.select()}
            placeholder="Search or enter URL"
            spellCheck={false}
          />
        </div>

        <button
          className="browser-panel__nav-btn"
          onClick={() => setShowBookmarks(!showBookmarks)}
          title="Bookmarks"
        >
          {showBookmarks ? '★' : '☆'}
        </button>
        <button
          className="browser-panel__nav-btn browser-panel__import-trigger"
          onClick={() => {
            setShowImportModal(true)
            detectProfiles()
          }}
          title="Import browser data"
        >
          ⇓
        </button>
      </div>

      <div className="browser-panel__body">
        {showBookmarks && bookmarks.length > 0 && (
          <div className="browser-panel__sidebar">
            <div className="browser-panel__sidebar-header">Bookmarks</div>
            <div className="browser-panel__sidebar-list">
              <BookmarkTree nodes={bookmarks} onNavigate={navigate} />
            </div>
          </div>
        )}
        <div className="browser-panel__webview-container" ref={containerRef} />
      </div>

      {showImportModal && (
        <div
          className="browser-panel__modal-overlay"
          onClick={() => setShowImportModal(false)}
        >
          <div
            className="browser-panel__modal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="browser-panel__modal-header">
              <span>Import Browser Data</span>
              <button
                className="browser-panel__modal-close"
                onClick={() => setShowImportModal(false)}
              >
                ×
              </button>
            </div>
            <div className="browser-panel__modal-body">
              <p className="browser-panel__modal-hint">
                Import cookies, saved sessions, and bookmarks from an installed
                browser. Close the source browser first for best results.
              </p>

              {profiles.length === 0 ? (
                <div className="browser-panel__modal-empty">
                  No browser profiles detected
                </div>
              ) : (
                <div className="browser-panel__profile-list">
                  {profiles.map((p, i) => (
                    <div key={i} className="browser-panel__profile-item">
                      <div className="browser-panel__profile-info">
                        <span className="browser-panel__profile-browser">
                          {p.browser}
                        </span>
                        <span className="browser-panel__profile-name">
                          {p.profileName}
                        </span>
                      </div>
                      <div className="browser-panel__profile-actions">
                        <button
                          className="browser-panel__profile-btn"
                          onClick={() => importProfile(p.profilePath)}
                        >
                          Full Import
                        </button>
                        <button
                          className="browser-panel__profile-btn browser-panel__profile-btn--secondary"
                          onClick={() => importBookmarksOnly(p.profilePath)}
                        >
                          Bookmarks
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {importStatus && (
                <div className="browser-panel__import-status">{importStatus}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function BookmarkTree({
  nodes,
  onNavigate,
}: {
  nodes: BookmarkNode[]
  onNavigate: (url: string) => void
}) {
  return (
    <>
      {nodes.map((node, i) => {
        if (node.children) {
          return <BookmarkFolder key={i} node={node} onNavigate={onNavigate} />
        }
        return (
          <button
            key={i}
            className="browser-panel__bookmark-item"
            onClick={() => node.url && onNavigate(node.url)}
            title={node.url}
          >
            {node.name}
          </button>
        )
      })}
    </>
  )
}

function BookmarkFolder({
  node,
  onNavigate,
}: {
  node: BookmarkNode
  onNavigate: (url: string) => void
}) {
  const [open, setOpen] = useState(false)

  return (
    <div className="browser-panel__bookmark-folder">
      <button
        className="browser-panel__bookmark-folder-toggle"
        onClick={() => setOpen(!open)}
      >
        <span className="browser-panel__bookmark-folder-icon">
          {open ? '▾' : '▸'}
        </span>
        {node.name}
      </button>
      {open && node.children && (
        <div className="browser-panel__bookmark-folder-children">
          <BookmarkTree nodes={node.children} onNavigate={onNavigate} />
        </div>
      )}
    </div>
  )
}

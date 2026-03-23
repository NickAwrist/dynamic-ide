import { useState, useEffect, useRef, useCallback, type KeyboardEvent } from 'react'
import { PanelState, WorkspaceState, useIDEStore } from '../../stores/workspace.store'
import type { BookmarkNode, BrowserProfile } from '../../types/electron'
import { createUiLogger, Scopes } from '../../lib/logger'
import { BookmarkTree } from './BookmarkTree'
import { BrowserImportModal } from './BrowserImportModal'
import { BrowserToolbar } from './BrowserToolbar'
import { BrowserTabBar } from './BrowserTabBar'
import {
  defaultBrowserTabs,
  MAX_BROWSER_TABS,
  newBrowserTabId,
  type BrowserTab,
} from '../../lib/browser-tabs'
import { addInPanelBrowserTab } from '../../lib/browser-panel-actions'
import { useOpenUrlStore } from '../../stores/open-url.store'

const log = createUiLogger(Scopes.uiPanelBrowser)

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

type ElectronWebview = {
  loadURL: (u: string) => void
  getURL: () => string
  canGoBack: () => boolean
  canGoForward: () => boolean
  goBack: () => void
  goForward: () => void
  reload: () => void
  stop: () => void
  addEventListener: (ev: string, fn: (...args: unknown[]) => void) => void
  removeEventListener: (ev: string, fn: (...args: unknown[]) => void) => void
  setAttribute: (n: string, v: string) => void
  style: CSSStyleDeclaration
  parentElement: HTMLElement | null
  getWebContents?: () => { setWindowOpenHandler?: (cb: (d: { url: string }) => { action: 'deny' | 'allow' }) => void }
}

function attachBrowserWindowOpenHandler(wv: ElectronWebview, panelId: string) {
  const apply = () => {
    try {
      const wc = wv.getWebContents?.()
      const fn = wc && typeof wc === 'object' && 'setWindowOpenHandler' in wc ? (wc as any).setWindowOpenHandler : null
      if (typeof fn !== 'function') return false
      fn.call(wc, (details: { url: string }) => {
        const u = details?.url
        if (u && /^https?:\/\//i.test(u)) {
          addInPanelBrowserTab(panelId, u)
        }
        return { action: 'deny' as const }
      })
      return true
    } catch {
      return false
    }
  }
  if (apply()) return
  ;(wv as unknown as { addEventListener: typeof wv.addEventListener }).addEventListener('dom-ready', function onReady() {
    wv.removeEventListener('dom-ready', onReady as any)
    apply()
  })
}

export function BrowserPanel({ panel, workspace: _workspace }: Props) {
  const updatePanel = useIDEStore((s) => s.updatePanel)

  const containerRef = useRef<HTMLDivElement>(null)
  const tabWebviewsRef = useRef<Map<string, ElectronWebview>>(new Map())
  const activeTabIdRef = useRef<string>('')
  const urlInputRef = useRef<HTMLInputElement>(null)

  const componentStateRef = useRef(panel.componentState)
  useEffect(() => {
    componentStateRef.current = panel.componentState
  }, [panel.componentState])

  const { tabs, activeTabId } = defaultBrowserTabs(panel.componentState)
  activeTabIdRef.current = activeTabId

  const [displayUrl, setDisplayUrl] = useState(() => {
    const t = tabs.find((x) => x.id === activeTabId)
    return t?.url || 'https://www.google.com'
  })
  const [canGoBack, setCanGoBack] = useState(false)
  const [canGoForward, setCanGoForward] = useState(false)
  const [isLoading, setIsLoading] = useState(false)
  const [showBookmarks, setShowBookmarks] = useState(false)
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>(panel.componentState?.bookmarks || [])
  const [showImportModal, setShowImportModal] = useState(false)
  const [profiles, setProfiles] = useState<BrowserProfile[]>([])
  const [importStatus, setImportStatus] = useState('')
  const [migratedLegacy, setMigratedLegacy] = useState(false)

  const pendingForThisPanel = useOpenUrlStore(
    (s) => (s.pendingBrowserNav?.panelId === panel.id ? s.pendingBrowserNav : null),
  )

  useEffect(() => {
    const cs = panel.componentState
    if (Array.isArray(cs.tabs) && cs.tabs.length > 0) {
      setMigratedLegacy(true)
      return
    }
    const { tabs: nextTabs, activeTabId: nextActive } = defaultBrowserTabs(cs)
    updatePanel(panel.id, {
      componentState: { ...cs, tabs: nextTabs, activeTabId: nextActive },
    })
    setMigratedLegacy(true)
  }, [panel.id])

  useEffect(() => {
    if (!pendingForThisPanel) return
    const nav = useOpenUrlStore.getState().consumePendingBrowserNavForPanel(panel.id)
    if (!nav) return

    const cs = componentStateRef.current
    const { tabs: curTabs } = defaultBrowserTabs(cs)

    if (nav.tabId === 'new') {
      if (curTabs.length >= MAX_BROWSER_TABS) return
      const newId = newBrowserTabId()
      const nextTabs: BrowserTab[] = [...curTabs, { id: newId, url: nav.url }]
      updatePanel(panel.id, {
        componentState: { ...cs, tabs: nextTabs, activeTabId: newId },
      })
      return
    }

    const nextTabs = curTabs.map((t) => (t.id === nav.tabId ? { ...t, url: nav.url } : t))
    updatePanel(panel.id, {
      componentState: { ...cs, tabs: nextTabs, activeTabId: nav.tabId },
    })
    queueMicrotask(() => {
      tabWebviewsRef.current.get(nav.tabId)?.loadURL(nav.url)
    })
  }, [pendingForThisPanel, panel.id, updatePanel])

  useEffect(() => {
    const t = tabs.find((x) => x.id === activeTabId)
    if (t?.url) setDisplayUrl(t.url)
    const wv = tabWebviewsRef.current.get(activeTabId)
    if (wv) {
      try {
        const u = wv.getURL()
        if (u && u !== 'about:blank' && u !== 'data:,') setDisplayUrl(u)
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
      } catch {
        /* ignore */
      }
    }
  }, [activeTabId, tabs])

  useEffect(() => {
    if (!migratedLegacy) return
    const container = containerRef.current
    if (!container) return

    const map = tabWebviewsRef.current
    const tabIds = new Set(tabs.map((t) => t.id))

    for (const [id, wv] of [...map.entries()]) {
      if (!tabIds.has(id)) {
        if (wv.parentElement === container) container.removeChild(wv as unknown as Node)
        map.delete(id)
      }
    }

    const syncTabUrl = (tabId: string, wv: ElectronWebview) => {
      try {
        const currentUrl = wv.getURL()
        if (!currentUrl || currentUrl === 'about:blank' || currentUrl === 'data:,') return
        const cs = componentStateRef.current
        const { tabs: curTabs, activeTabId: curActive } = defaultBrowserTabs(cs)
        const prev = curTabs.find((x) => x.id === tabId)?.url
        if (prev === currentUrl) return
        const nextTabs = curTabs.map((t) => (t.id === tabId ? { ...t, url: currentUrl } : t))
        updatePanel(panel.id, {
          componentState: { ...cs, tabs: nextTabs, activeTabId: curActive },
        })
      } catch (err) {
        log.error('navigation_error', err instanceof Error ? err.message : String(err))
      }
    }

    const refreshChrome = (tabId: string, wv: ElectronWebview) => {
      if (tabId !== activeTabIdRef.current) return
      try {
        const currentUrl = wv.getURL()
        if (currentUrl && currentUrl !== 'about:blank' && currentUrl !== 'data:,') {
          setDisplayUrl(currentUrl)
        }
        setCanGoBack(wv.canGoBack())
        setCanGoForward(wv.canGoForward())
      } catch {
        /* ignore */
      }
    }

    for (const tab of tabs) {
      let wv = map.get(tab.id)
      if (!wv) {
        log.debug('webview_mount', `${panel.id} tab=${tab.id} src=${tab.url}`)
        wv = document.createElement('webview') as unknown as ElectronWebview
        wv.setAttribute('partition', 'persist:browser')
        wv.setAttribute('src', tab.url)
        wv.setAttribute('allowpopups', '')
        wv.style.width = '100%'
        wv.style.height = '100%'
        wv.style.border = 'none'
        wv.style.flex = '1'

        const tabId = tab.id
        const onStartLoading = () => {
          if (tabId === activeTabIdRef.current) setIsLoading(true)
        }
        const onStopLoading = () => {
          if (tabId === activeTabIdRef.current) setIsLoading(false)
        }
        const handleNavigation = () => {
          syncTabUrl(tabId, wv!)
          refreshChrome(tabId, wv!)
        }
        const onTitle = (e: Event) => {
          const title = (e as unknown as { title?: string }).title
          if (!title) return
          const cs = componentStateRef.current
          const { tabs: curTabs, activeTabId: curActive } = defaultBrowserTabs(cs)
          const nextTabs = curTabs.map((t) => (t.id === tabId ? { ...t, title } : t))
          updatePanel(panel.id, {
            componentState: { ...cs, tabs: nextTabs, activeTabId: curActive },
          })
        }

        ;(wv as any).__orbisStart = onStartLoading
        ;(wv as any).__orbisStop = onStopLoading
        ;(wv as any).__orbisNav = handleNavigation
        ;(wv as any).__orbisTitle = onTitle

        wv.addEventListener('did-start-loading', onStartLoading)
        wv.addEventListener('did-stop-loading', onStopLoading)
        wv.addEventListener('did-navigate', handleNavigation)
        wv.addEventListener('did-navigate-in-page', handleNavigation)
        wv.addEventListener('load-commit', handleNavigation)
        wv.addEventListener('page-title-updated', onTitle as any)

        attachBrowserWindowOpenHandler(wv, panel.id)

        container.appendChild(wv as unknown as Node)
        map.set(tab.id, wv)
      }
    }

    for (const [id, wv] of map.entries()) {
      const show = id === activeTabId
      wv.style.display = show ? 'flex' : 'none'
    }

    return () => {
      /* tab-removed cleanup above; full clear on panel unmount in separate effect */
    }
  }, [panel.id, migratedLegacy, tabs, activeTabId, updatePanel])

  useEffect(() => {
    return () => {
      const container = containerRef.current
      const map = tabWebviewsRef.current
      for (const wv of map.values()) {
        if (container && wv.parentElement === container) {
          container.removeChild(wv as unknown as Node)
        }
      }
      map.clear()
    }
  }, [panel.id])

  const navigate = useCallback(
    (targetUrl: string) => {
      let processed = targetUrl.trim()
      if (!processed) return

      if (!/^https?:\/\//i.test(processed) && !/^file:\/\//i.test(processed)) {
        if (/^[\w-]+(\.[\w-]+)+/.test(processed)) {
          processed = 'https://' + processed
        } else {
          processed = 'https://www.google.com/search?q=' + encodeURIComponent(processed)
        }
      }

      setDisplayUrl(processed)
      const wv = tabWebviewsRef.current.get(activeTabIdRef.current)
      wv?.loadURL(processed)

      const cs = componentStateRef.current
      const { tabs: curTabs, activeTabId: curActive } = defaultBrowserTabs(cs)
      const nextTabs = curTabs.map((t) => (t.id === curActive ? { ...t, url: processed } : t))
      updatePanel(panel.id, {
        componentState: { ...cs, tabs: nextTabs, activeTabId: curActive },
      })
    },
    [panel.id, updatePanel],
  )

  const handleUrlKeyDown = useCallback(
    (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === 'Enter') {
        navigate(displayUrl)
        urlInputRef.current?.blur()
      }
    },
    [displayUrl, navigate],
  )

  const goBack = useCallback(() => tabWebviewsRef.current.get(activeTabIdRef.current)?.goBack(), [activeTabId])
  const goForward = useCallback(() => tabWebviewsRef.current.get(activeTabIdRef.current)?.goForward(), [activeTabId])
  const reload = useCallback(() => {
    const wv = tabWebviewsRef.current.get(activeTabIdRef.current)
    if (!wv) return
    if (isLoading) wv.stop()
    else wv.reload()
  }, [isLoading, activeTabId])

  const detectProfiles = useCallback(async () => {
    try {
      const detected = await window.electronAPI.browser.detectProfiles()
      setProfiles(detected)
    } catch (err) {
      log.error('detect_profiles_failed', err instanceof Error ? err.message : String(err))
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
          const cs = componentStateRef.current
          updatePanel(panel.id, {
            componentState: { ...cs, bookmarks: result.bookmarks },
          })
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setImportStatus('Import failed: ' + msg)
      }
    },
    [panel.id, updatePanel],
  )

  const importBookmarksOnly = useCallback(
    async (profilePath: string) => {
      try {
        const result = await window.electronAPI.browser.importBookmarks(profilePath)
        if (result.bookmarks) {
          setBookmarks(result.bookmarks)
          const cs = componentStateRef.current
          updatePanel(panel.id, {
            componentState: { ...cs, bookmarks: result.bookmarks },
          })
          setImportStatus('Bookmarks imported successfully')
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Unknown error'
        setImportStatus('Bookmark import failed: ' + msg)
      }
    },
    [panel.id, updatePanel],
  )

  const selectTab = useCallback(
    (tabId: string) => {
      const cs = componentStateRef.current
      updatePanel(panel.id, {
        componentState: { ...cs, activeTabId: tabId },
      })
    },
    [panel.id, updatePanel],
  )

  const closeTab = useCallback(
    (tabId: string) => {
      const cs = componentStateRef.current
      const { tabs: curTabs, activeTabId: curActive } = defaultBrowserTabs(cs)
      if (curTabs.length <= 1) return
      const idx = curTabs.findIndex((t) => t.id === tabId)
      if (idx < 0) return
      const nextTabs = curTabs.filter((t) => t.id !== tabId)
      let nextActive = curActive
      if (curActive === tabId) {
        nextActive = nextTabs[Math.max(0, idx - 1)]?.id ?? nextTabs[0].id
      }
      updatePanel(panel.id, {
        componentState: { ...cs, tabs: nextTabs, activeTabId: nextActive },
      })
    },
    [panel.id, updatePanel],
  )

  const newTab = useCallback(() => {
    const cs = componentStateRef.current
    const { tabs: curTabs, activeTabId: curActive } = defaultBrowserTabs(cs)
    if (curTabs.length >= MAX_BROWSER_TABS) return
    const cur = curTabs.find((t) => t.id === curActive)
    const startUrl = cur?.url || 'https://www.google.com'
    const newId = newBrowserTabId()
    updatePanel(panel.id, {
      componentState: {
        ...cs,
        tabs: [...curTabs, { id: newId, url: startUrl }],
        activeTabId: newId,
      },
    })
  }, [panel.id, updatePanel])

  return (
    <div className="browser-panel">
      <BrowserTabBar
        tabs={tabs}
        activeTabId={activeTabId}
        onSelectTab={selectTab}
        onCloseTab={closeTab}
        onNewTab={newTab}
        canAddTab={tabs.length < MAX_BROWSER_TABS}
      />
      <BrowserToolbar
        displayUrl={displayUrl}
        isLoading={isLoading}
        canGoBack={canGoBack}
        canGoForward={canGoForward}
        showBookmarks={showBookmarks}
        urlInputRef={urlInputRef}
        onDisplayUrlChange={setDisplayUrl}
        onUrlKeyDown={handleUrlKeyDown}
        onGoBack={goBack}
        onGoForward={goForward}
        onReload={reload}
        onToggleBookmarks={() => setShowBookmarks(!showBookmarks)}
        onOpenImport={() => {
          setShowImportModal(true)
          void detectProfiles()
        }}
      />

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
        <BrowserImportModal
          profiles={profiles}
          importStatus={importStatus}
          onClose={() => setShowImportModal(false)}
          onImportProfile={importProfile}
          onImportBookmarksOnly={importBookmarksOnly}
        />
      )}
    </div>
  )
}

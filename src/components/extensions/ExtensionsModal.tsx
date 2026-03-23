import { useState, useEffect, useCallback, useRef } from 'react'
import type { InstalledExtension, ThemeInfo } from '../../types/electron'
import { useIDEStore } from '../../stores/workspace.store'
import { applyFullTheme } from '../../utils/theme-engine'
import type { MarketplaceExtension, HostStatus } from './extensionModalTypes'
import { ExtensionsModalSidebar } from './ExtensionsModalSidebar'
import { IconClose } from './ExtensionModalIcons'
import { InstalledTab } from './InstalledTab'
import { MarketplaceDetailView } from './MarketplaceDetailView'
import { MarketplaceTab } from './MarketplaceTab'
import { ThemesTab } from './ThemesTab'
import { createUiLogger, Scopes } from '../../lib/logger'

const log = createUiLogger(Scopes.uiModalExtensions)

export function ExtensionsModal() {
  const isExtensionsOpen = useIDEStore((s) => s.isExtensionsOpen)
  const setExtensionsOpen = useIDEStore((s) => s.setExtensionsOpen)
  const addPanel = useIDEStore((s) => s.addPanel)

  const [tab, setTab] = useState<'marketplace' | 'installed' | 'themes'>('marketplace')
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<MarketplaceExtension[]>([])
  const [installed, setInstalled] = useState<InstalledExtension[]>([])
  const [themes, setThemes] = useState<ThemeInfo[]>([])
  const [searching, setSearching] = useState(false)
  const [installing, setInstalling] = useState<string | null>(null)
  const [activating, setActivating] = useState<string | null>(null)
  const [applyingTheme, setApplyingTheme] = useState<string | null>(null)
  const [hostStatus, setHostStatus] = useState<HostStatus>({
    running: false,
    error: null,
    stderr: [],
    starting: false,
  })
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [selectedExt, setSelectedExt] = useState<MarketplaceExtension | null>(null)
  const searchTimeout = useRef<ReturnType<typeof setTimeout> | null>(null)

  const refreshHostStatus = useCallback(async () => {
    if (!isExtensionsOpen) return
    try {
      const status = await window.electronAPI.extensions.getHostStatus()
      setHostStatus((prev) => ({ ...status, starting: prev.starting && !status.running }))
    } catch {
      setHostStatus({ running: false, error: 'Unable to query host status', stderr: [], starting: false })
    }
  }, [isExtensionsOpen])

  const loadInstalled = useCallback(async () => {
    if (!isExtensionsOpen) return
    try {
      const list = await window.electronAPI.extensions.listInstalled()
      setInstalled(list)
    } catch (err: unknown) {
      log.error('load_installed_failed', err instanceof Error ? err.message : String(err))
    }
  }, [isExtensionsOpen])

  const loadThemes = useCallback(async () => {
    if (!isExtensionsOpen) return
    try {
      const list = await window.electronAPI.extensions.getThemes()
      setThemes(list)
    } catch (err: unknown) {
      log.error('load_themes_failed', err instanceof Error ? err.message : String(err))
    }
  }, [isExtensionsOpen])

  useEffect(() => {
    if (isExtensionsOpen) {
      loadInstalled()
      loadThemes()
      refreshHostStatus()
    }
  }, [isExtensionsOpen, loadInstalled, loadThemes, refreshHostStatus])

  const startExtensionHost = useCallback(async () => {
    setHostStatus((prev) => ({ ...prev, starting: true, error: null }))
    setError(null)
    try {
      const ws = (window as unknown as { __activeWorkspaceRoot?: string }).__activeWorkspaceRoot
      await window.electronAPI.extensions.startHost(ws ? [ws] : [])
      setStatusMsg('Extension host started')
      setTimeout(() => setStatusMsg(null), 3000)
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Failed to start extension host: ${msg}`)
    }
    await refreshHostStatus()
  }, [refreshHostStatus])

  const searchMarketplace = useCallback(async (q: string) => {
    if (!q.trim()) {
      setResults([])
      return
    }
    setSearching(true)
    setError(null)
    try {
      const data = await window.electronAPI.extensions.search(q)
      setResults(data.extensions || [])
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Search failed'
      setError(msg)
    }
    setSearching(false)
  }, [])

  const handleQueryChange = useCallback(
    (value: string) => {
      setQuery(value)
      if (searchTimeout.current) clearTimeout(searchTimeout.current)
      searchTimeout.current = setTimeout(() => searchMarketplace(value), 400)
    },
    [searchMarketplace],
  )

  const handleInstall = useCallback(
    async (ext: MarketplaceExtension) => {
      const extId = `${ext.namespace}.${ext.name}`
      setInstalling(extId)
      setError(null)
      try {
        await window.electronAPI.extensions.install(ext.namespace, ext.name)
        await loadInstalled()
        await loadThemes()
        setStatusMsg(`Installed ${ext.displayName || ext.name}. Restart host to activate.`)
        setTimeout(() => setStatusMsg(null), 5000)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Install failed: ${msg}`)
      }
      setInstalling(null)
    },
    [loadInstalled, loadThemes],
  )

  const handleUninstall = useCallback(
    async (extId: string) => {
      setError(null)
      try {
        await window.electronAPI.extensions.uninstall(extId)
        await loadInstalled()
        await loadThemes()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Uninstall failed: ${msg}`)
      }
    },
    [loadInstalled, loadThemes],
  )

  const handleToggle = useCallback(
    async (extId: string, enabled: boolean) => {
      try {
        await window.electronAPI.extensions.toggle(extId, enabled)
        await loadInstalled()
        await loadThemes()
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Toggle failed: ${msg}`)
      }
    },
    [loadInstalled, loadThemes],
  )

  const handleActivate = useCallback(
    async (ext: InstalledExtension) => {
      setActivating(ext.id)
      setError(null)
      try {
        if (!hostStatus.running) {
          await startExtensionHost()
        }
        await window.electronAPI.extensions.activateExtension(ext.id)
        setStatusMsg(`Activated ${ext.manifest.displayName || ext.manifest.name}`)
        setTimeout(() => setStatusMsg(null), 3000)
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        setError(`Activation failed: ${msg}`)
      }
      setActivating(null)
      await refreshHostStatus()
    },
    [hostStatus.running, startExtensionHost, refreshHostStatus],
  )

  const handleApplyTheme = useCallback(async (theme: ThemeInfo) => {
    setApplyingTheme(`${theme.extensionId}:${theme.label}`)
    setError(null)
    try {
      const themeData = await window.electronAPI.extensions.loadTheme(theme.themePath)
      if (themeData) {
        applyFullTheme(themeData, theme.uiTheme, undefined, theme)
        const event = new CustomEvent('ide-theme-change', { detail: { theme, themeData } })
        window.dispatchEvent(event)
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err)
      setError(`Theme apply failed: ${msg}`)
    }
    setApplyingTheme(null)
  }, [])

  if (!isExtensionsOpen) return null

  const mainHeaderTitle =
    tab === 'marketplace'
      ? 'Extension Marketplace'
      : tab === 'installed'
        ? 'Installed Extensions'
        : 'Themes'

  return (
    <div className="ext-modal-overlay" onClick={() => setExtensionsOpen(false)}>
      <div className="ext-modal" onClick={(e) => e.stopPropagation()}>
        <ExtensionsModalSidebar
          tab={tab}
          installedCount={installed.length}
          themesCount={themes.length}
          hostStatus={hostStatus}
          onTabChange={(t) => {
            setTab(t)
            setSelectedExt(null)
          }}
          onLoadThemes={loadThemes}
          onStartHost={startExtensionHost}
        />

        <div className="ext-modal__main">
          <div className="ext-modal__main-header">
            <h2 className="ext-modal__pane-title">{mainHeaderTitle}</h2>
            <button type="button" className="ext-modal__close-btn" onClick={() => setExtensionsOpen(false)}>
              <IconClose size="xl" />
            </button>
          </div>

          <div className="ext-modal__content-area">
            {statusMsg && <div className="ext-modal__status">{statusMsg}</div>}
            {error && <div className="ext-modal__error">{error}</div>}

            {selectedExt ? (
              <MarketplaceDetailView
                selectedExt={selectedExt}
                installed={installed}
                installingId={installing}
                error={error}
                onBack={() => setSelectedExt(null)}
                onInstall={handleInstall}
              />
            ) : (
              <>
                {tab === 'marketplace' && (
                  <MarketplaceTab
                    query={query}
                    results={results}
                    searching={searching}
                    installed={installed}
                    installingId={installing}
                    onQueryChange={handleQueryChange}
                    onSelect={setSelectedExt}
                    onInstall={handleInstall}
                  />
                )}

                {tab === 'installed' && (
                  <InstalledTab
                    installed={installed}
                    activating={activating}
                    onActivate={handleActivate}
                    onToggle={handleToggle}
                    onUninstall={handleUninstall}
                    onOpenExtensionPanel={(ext) => {
                      addPanel('extension-panel', {
                        title: ext.manifest.displayName || ext.manifest.name,
                      })
                      setExtensionsOpen(false)
                    }}
                  />
                )}

                {tab === 'themes' && (
                  <ThemesTab themes={themes} applyingTheme={applyingTheme} onApplyTheme={handleApplyTheme} />
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

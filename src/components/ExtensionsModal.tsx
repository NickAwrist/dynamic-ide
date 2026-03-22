import { useState, useEffect, useCallback, useRef } from 'react'
import type { InstalledExtension, ThemeInfo } from '../types/electron'
import { useIDEStore } from '../stores/workspace.store'
import { applyFullTheme } from '../utils/theme-engine'

interface MarketplaceExtension {
  name: string
  namespace: string
  displayName?: string
  description?: string
  version: string
  iconUrl?: string
  downloadUrl?: string
  downloadCount?: number
  averageRating?: number
  categories?: string[]
}

interface HostStatus {
  running: boolean
  error: string | null
  stderr: string[]
  starting: boolean
}

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
  const [hostStatus, setHostStatus] = useState<HostStatus>({ running: false, error: null, stderr: [], starting: false })
  const [error, setError] = useState<string | null>(null)
  const [statusMsg, setStatusMsg] = useState<string | null>(null)
  const [selectedExt, setSelectedExt] = useState<MarketplaceExtension | null>(null)
  const [showStderr, setShowStderr] = useState(false)
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
    } catch (err: any) {
      console.error('Failed to load installed extensions:', err)
    }
  }, [isExtensionsOpen])

  const loadThemes = useCallback(async () => {
    if (!isExtensionsOpen) return
    try {
      const list = await window.electronAPI.extensions.getThemes()
      setThemes(list)
    } catch (err: any) {
      console.error('Failed to load themes:', err)
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
      const ws = (window as any).__activeWorkspaceRoot
      await window.electronAPI.extensions.startHost(ws ? [ws] : [])
      setStatusMsg('Extension host started')
      setTimeout(() => setStatusMsg(null), 3000)
    } catch (err: any) {
      setError(`Failed to start extension host: ${err.message}`)
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
    } catch (err: any) {
      setError(err.message || 'Search failed')
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
      } catch (err: any) {
        setError(`Install failed: ${err.message}`)
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
      } catch (err: any) {
        setError(`Uninstall failed: ${err.message}`)
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
      } catch (err: any) {
        setError(`Toggle failed: ${err.message}`)
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
      } catch (err: any) {
        setError(`Activation failed: ${err.message}`)
      }
      setActivating(null)
      await refreshHostStatus()
    },
    [hostStatus.running, startExtensionHost, refreshHostStatus],
  )

  const handleApplyTheme = useCallback(
    async (theme: ThemeInfo) => {
      setApplyingTheme(`${theme.extensionId}:${theme.label}`)
      setError(null)
      try {
        const themeData = await window.electronAPI.extensions.loadTheme(theme.themePath)
        if (themeData) {
          applyFullTheme(themeData, theme.uiTheme, undefined, theme)
          const event = new CustomEvent('ide-theme-change', { detail: { theme, themeData } })
          window.dispatchEvent(event)
        }
      } catch (err: any) {
        setError(`Theme apply failed: ${err.message}`)
      }
      setApplyingTheme(null)
    },
    [],
  )

  const isInstalled = (ext: MarketplaceExtension) => {
    const matchId = `${ext.namespace}.${ext.name}`
    return installed.some((e) => e.id.startsWith(matchId))
  }

  const formatDownloads = (n?: number) => {
    if (!n) return ''
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
    if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`
    return String(n)
  }

  const getContribSummary = (ext: InstalledExtension) => {
    const parts: string[] = []
    const c = ext.manifest.contributes
    if (!c) return 'No contributions'
    if (c.themes?.length) parts.push(`${c.themes.length} theme${c.themes.length > 1 ? 's' : ''}`)
    if (c.commands?.length) parts.push(`${c.commands.length} command${c.commands.length > 1 ? 's' : ''}`)
    if (c.languages?.length) parts.push(`${c.languages.length} language${c.languages.length > 1 ? 's' : ''}`)
    if (c.snippets?.length) parts.push('snippets')
    if (c.grammars?.length) parts.push('syntax')
    if (c.iconThemes?.length) parts.push('icon theme')
    const has = ext.manifest.main || ext.manifest.browser
    if (has) parts.push('activatable')
    return parts.length > 0 ? parts.join(' · ') : 'Static contribution'
  }

  if (!isExtensionsOpen) return null

  const renderDetailView = () => (
    <div className="ext-modal__detail">
      <div className="ext-modal__detail-header">
        <button className="ext-modal__back-btn" onClick={() => setSelectedExt(null)}>
          ← Back to List
        </button>
      </div>
      <div className="ext-modal__detail-content">
        <div className="ext-modal__detail-top">
          {selectedExt!.iconUrl && (
            <img className="ext-modal__detail-icon" src={selectedExt!.iconUrl} alt="" />
          )}
          <div className="ext-modal__detail-info">
            <h2 className="ext-modal__detail-name">
              {selectedExt!.displayName || selectedExt!.name}
            </h2>
            <span className="ext-modal__detail-publisher">{selectedExt!.namespace}</span>
            <span className="ext-modal__detail-version">v{selectedExt!.version}</span>
            {selectedExt!.downloadCount !== undefined && (
              <span className="ext-modal__detail-downloads">
                {formatDownloads(selectedExt!.downloadCount)} downloads
              </span>
            )}
          </div>
        </div>
        <p className="ext-modal__detail-desc">{selectedExt!.description}</p>
        {selectedExt!.categories && selectedExt!.categories.length > 0 && (
          <div className="ext-modal__detail-categories">
            {selectedExt!.categories.map((c) => (
              <span key={c} className="ext-modal__category-tag">{c}</span>
            ))}
          </div>
        )}
        <div className="ext-modal__detail-actions">
          {isInstalled(selectedExt!) ? (
            <button className="ext-modal__btn ext-modal__btn--installed" disabled>
              Installed
            </button>
          ) : (
            <button
              className="ext-modal__btn ext-modal__btn--install"
              onClick={() => handleInstall(selectedExt!)}
              disabled={installing !== null}
            >
              {installing === `${selectedExt!.namespace}.${selectedExt!.name}` ? 'Installing...' : 'Install'}
            </button>
          )}
        </div>
      </div>
      {error && <div className="ext-modal__error">{error}</div>}
    </div>
  )

  return (
    <div className="ext-modal-overlay" onClick={() => setExtensionsOpen(false)}>
      <div className="ext-modal" onClick={(e) => e.stopPropagation()}>
        
        <div className="ext-modal__sidebar">
          <div className="ext-modal__sidebar-header">
            <h3>Extensions</h3>
          </div>
          <div className="ext-modal__tabs">
            <button
              className={`ext-modal__tab ${tab === 'marketplace' ? 'ext-modal__tab--active' : ''}`}
              onClick={() => { setTab('marketplace'); setSelectedExt(null); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
              Marketplace
            </button>
            <button
              className={`ext-modal__tab ${tab === 'installed' ? 'ext-modal__tab--active' : ''}`}
              onClick={() => { setTab('installed'); setSelectedExt(null); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"></path><polyline points="7.5 4.21 12 6.81 16.5 4.21"></polyline><polyline points="7.5 19.79 7.5 14.6 3 12"></polyline><polyline points="21 12 16.5 14.6 16.5 19.79"></polyline><polyline points="3.27 6.96 12 12.01 20.73 6.96"></polyline><line x1="12" y1="22.08" x2="12" y2="12"></line></svg>
              Installed ({installed.length})
            </button>
            <button
              className={`ext-modal__tab ${tab === 'themes' ? 'ext-modal__tab--active' : ''}`}
              onClick={() => { setTab('themes'); loadThemes(); setSelectedExt(null); }}
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"></path></svg>
              Themes ({themes.length})
            </button>
          </div>

          {/* Host controls merged into the sidebar bottom */}
          <div className="ext-modal__sidebar-footer">
            <div className="ext-modal__host-status">
              <span className={`ext-modal__host-dot ${hostStatus.running ? 'ext-modal__host-dot--on' : hostStatus.error ? 'ext-modal__host-dot--err' : ''}`} />
              <span>{hostStatus.starting ? 'Starting...' : hostStatus.running ? 'Host Running' : 'Host Stopped'}</span>
            </div>
            <button
              className="ext-modal__btn ext-modal__btn--sm"
              onClick={startExtensionHost}
              disabled={hostStatus.starting}
            >
              {hostStatus.starting ? 'Starting...' : hostStatus.running ? 'Restart Host' : 'Start Host'}
            </button>
          </div>
        </div>

        <div className="ext-modal__main">
          <div className="ext-modal__main-header">
            <h2 className="ext-modal__view-title">
              {tab === 'marketplace' ? 'Extension Marketplace' : tab === 'installed' ? 'Installed Extensions' : 'Themes'}
            </h2>
            <button className="ext-modal__close-btn" onClick={() => setExtensionsOpen(false)}>
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
            </button>
          </div>

          <div className="ext-modal__content-area">
            {statusMsg && <div className="ext-modal__status">{statusMsg}</div>}
            {error && <div className="ext-modal__error">{error}</div>}

            {selectedExt ? (
              renderDetailView()
            ) : (
              <>
                {/* Marketplace */}
                {tab === 'marketplace' && (
                  <div className="ext-modal__view">
                    <div className="ext-modal__search">
                      <svg className="ext-modal__search-icon" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                      <input
                        className="ext-modal__search-input"
                        type="text"
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        placeholder="Search extensions on Open VSX..."
                        spellCheck={false}
                      />
                      {searching && <span className="ext-modal__search-spinner" />}
                    </div>
                    <div className="ext-modal__list ext-modal__grid">
                      {results.length === 0 && !searching && query && (
                        <div className="ext-modal__empty">No extensions found</div>
                      )}
                      {!query && !searching && (
                        <div className="ext-modal__empty">Search for extensions to install</div>
                      )}
                      {results.map((ext) => {
                        const extId = `${ext.namespace}.${ext.name}`
                        const alreadyInstalled = isInstalled(ext)
                        return (
                          <div key={extId} className="ext-modal__card" onClick={() => setSelectedExt(ext)}>
                            <div className="ext-modal__card-top">
                              {ext.iconUrl ? (
                                <img className="ext-modal__card-icon" src={ext.iconUrl} alt="" />
                              ) : (
                                <div className="ext-modal__card-icon ext-modal__card-icon--placeholder">Ext</div>
                              )}
                              <div className="ext-modal__card-info">
                                <div className="ext-modal__card-name">{ext.displayName || ext.name}</div>
                                <div className="ext-modal__card-publisher">{ext.namespace}</div>
                              </div>
                            </div>
                            <div className="ext-modal__card-desc">{ext.description}</div>
                            <div className="ext-modal__card-actions">
                              {ext.downloadCount !== undefined && (
                                <span className="ext-modal__card-downloads">{formatDownloads(ext.downloadCount)}↓</span>
                              )}
                              {alreadyInstalled ? (
                                <span className="ext-modal__card-badge">Installed</span>
                              ) : (
                                <button
                                  className="ext-modal__btn ext-modal__btn--install ext-modal__btn--sm"
                                  onClick={(e) => { e.stopPropagation(); handleInstall(ext) }}
                                  disabled={installing !== null}
                                >
                                  {installing === extId ? '...' : 'Install'}
                                </button>
                              )}
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Installed */}
                {tab === 'installed' && (
                  <div className="ext-modal__view">
                    <div className="ext-modal__list">
                      {installed.length === 0 && (
                        <div className="ext-modal__empty">No extensions installed</div>
                      )}
                      {installed.map((ext) => {
                        const hasRunnable = !!(ext.manifest.main || ext.manifest.browser)
                        
                        let iconUrl = null
                        if (ext.manifest.icon) {
                          const iconPath = `${ext.extensionPath}/${ext.manifest.icon}`.replace(/\\/g, '/')
                          iconUrl = `vscode-webview-resource://${iconPath.startsWith('/') ? '' : '/'}${iconPath}`
                        }

                        return (
                          <div key={ext.id} className="ext-modal__list-item">
                            {iconUrl ? (
                              <img className="ext-modal__list-item-icon" src={iconUrl} alt="" />
                            ) : (
                              <div className="ext-modal__list-item-icon ext-modal__list-item-icon--placeholder">Ext</div>
                            )}
                            <div className="ext-modal__list-item-info">
                              <div className="ext-modal__list-item-name">
                                {ext.manifest.displayName || ext.manifest.name}
                              </div>
                              <div className="ext-modal__list-item-publisher">{ext.manifest.publisher}</div>
                              <div className="ext-modal__list-item-desc">{ext.manifest.description}</div>
                              <div className="ext-modal__list-item-contrib">{getContribSummary(ext)}</div>
                            </div>
                            <div className="ext-modal__list-item-actions">
                              <div className="ext-modal__btn-group">
                                {hasRunnable && ext.enabled && (
                                  <>
                                    <button
                                      className="ext-modal__icon-btn ext-modal__icon-btn--primary"
                                      onClick={() => handleActivate(ext)}
                                      disabled={activating !== null}
                                      title={activating === ext.id ? 'Activating...' : 'Activate'}
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
                                    </button>
                                    <button
                                      className="ext-modal__icon-btn"
                                      onClick={() => {
                                        addPanel('extension-view', {
                                          title: ext.manifest.displayName || ext.manifest.name,
                                        })
                                        setExtensionsOpen(false)
                                      }}
                                      title="Open View"
                                    >
                                      <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><line x1="9" y1="3" x2="9" y2="21"></line></svg>
                                    </button>
                                  </>
                                )}
                                <button
                                  className="ext-modal__icon-btn"
                                  onClick={() => handleToggle(ext.id, !ext.enabled)}
                                  title={ext.enabled ? 'Disable' : 'Enable'}
                                >
                                  {ext.enabled ? (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                                  ) : (
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18.36 6.64a9 9 0 1 1-12.73 0"></path><line x1="12" y1="2" x2="12" y2="12"></line></svg>
                                  )}
                                </button>
                                <button
                                  className="ext-modal__icon-btn ext-modal__icon-btn--danger"
                                  onClick={() => handleUninstall(ext.id)}
                                  title="Uninstall"
                                >
                                  <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                                </button>
                              </div>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}

                {/* Themes */}
                {tab === 'themes' && (
                  <div className="ext-modal__view">
                    <div className="ext-modal__list ext-modal__grid">
                      {themes.length === 0 && (
                        <div className="ext-modal__empty">
                          No themes available. Install a theme extension from Marketplace.
                        </div>
                      )}
                      {themes.map((theme) => {
                        const key = `${theme.extensionId}:${theme.label}`
                        const savedRaw = localStorage.getItem('dynamic-ide-theme')
                        const isActive = savedRaw ? (() => {
                          try { const s = JSON.parse(savedRaw); return s.label === theme.label && s.extensionId === theme.extensionId } catch { return false }
                        })() : false
                        return (
                          <div key={key} className={`ext-modal__card ext-modal__card--theme ${isActive ? 'ext-modal__card--active' : ''}`}>
                            <div className="ext-modal__theme-preview" onClick={() => handleApplyTheme(theme)}>
                               <div className="ext-modal__theme-preview-color1" style={{ background: theme.uiTheme === 'vs-dark' ? '#252526' : '#f3f3f3' }} />
                               <div className="ext-modal__theme-preview-color2" style={{ background: theme.uiTheme === 'vs-dark' ? '#1e1e1e' : '#ffffff' }} />
                            </div>
                            <div className="ext-modal__card-info">
                              <div className="ext-modal__card-name">
                                {theme.label}
                                {isActive && <span className="ext-modal__card-badge">Active</span>}
                              </div>
                              <div className="ext-modal__card-publisher">
                                from {theme.extensionId}
                              </div>
                              <div className="ext-modal__theme-type">
                                {theme.uiTheme === 'vs-dark' ? 'Dark' : theme.uiTheme === 'vs' ? 'Light' : 'High Contrast'}
                              </div>
                            </div>
                            <div className="ext-modal__card-actions" style={{ flexDirection: 'row', justifyContent: 'flex-start', marginTop: '4px' }}>
                              <button
                                className={`ext-modal__btn ext-modal__btn--sm ${isActive ? 'ext-modal__btn--installed' : 'ext-modal__btn--install'}`}
                                onClick={() => handleApplyTheme(theme)}
                                disabled={applyingTheme !== null || isActive}
                              >
                                {applyingTheme === key ? 'Applying...' : isActive ? 'Applied' : 'Apply Theme'}
                              </button>
                            </div>
                          </div>
                        )
                      })}
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}

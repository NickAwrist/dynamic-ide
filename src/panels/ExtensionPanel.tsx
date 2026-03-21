import { useState, useEffect, useCallback, useRef } from 'react'
import type { InstalledExtension, ThemeInfo } from '../types/electron'
import { useIDEStore } from '../stores/workspace.store'

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

export function ExtensionPanel() {
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
    try {
      const status = await window.electronAPI.extensions.getHostStatus()
      setHostStatus((prev) => ({ ...status, starting: prev.starting && !status.running }))
    } catch {
      setHostStatus({ running: false, error: 'Unable to query host status', stderr: [], starting: false })
    }
  }, [])

  const loadInstalled = useCallback(async () => {
    try {
      const list = await window.electronAPI.extensions.listInstalled()
      setInstalled(list)
    } catch (err: any) {
      console.error('Failed to load installed extensions:', err)
    }
  }, [])

  const loadThemes = useCallback(async () => {
    try {
      const list = await window.electronAPI.extensions.getThemes()
      setThemes(list)
    } catch (err: any) {
      console.error('Failed to load themes:', err)
    }
  }, [])

  useEffect(() => {
    loadInstalled()
    loadThemes()
    refreshHostStatus()
  }, [loadInstalled, loadThemes, refreshHostStatus])

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
          // Store theme choice so EditorPanel can pick it up
          const event = new CustomEvent('ide-theme-change', { detail: { theme, themeData } })
          window.dispatchEvent(event)
          localStorage.setItem('dynamic-ide-theme', JSON.stringify(theme))
          setStatusMsg(`Applied theme: ${theme.label}`)
          setTimeout(() => setStatusMsg(null), 3000)
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

  // ---------- Detail view ----------
  if (selectedExt) {
    return (
      <div className="ext-panel">
        <div className="ext-panel__detail-header">
          <button className="ext-panel__back-btn" onClick={() => setSelectedExt(null)}>
            ← Back
          </button>
        </div>
        <div className="ext-panel__detail">
          <div className="ext-panel__detail-top">
            {selectedExt.iconUrl && (
              <img className="ext-panel__detail-icon" src={selectedExt.iconUrl} alt="" />
            )}
            <div className="ext-panel__detail-info">
              <h2 className="ext-panel__detail-name">
                {selectedExt.displayName || selectedExt.name}
              </h2>
              <span className="ext-panel__detail-publisher">{selectedExt.namespace}</span>
              <span className="ext-panel__detail-version">v{selectedExt.version}</span>
              {selectedExt.downloadCount !== undefined && (
                <span className="ext-panel__detail-downloads">
                  {formatDownloads(selectedExt.downloadCount)} downloads
                </span>
              )}
            </div>
          </div>
          <p className="ext-panel__detail-desc">{selectedExt.description}</p>
          {selectedExt.categories && selectedExt.categories.length > 0 && (
            <div className="ext-panel__detail-categories">
              {selectedExt.categories.map((c) => (
                <span key={c} className="ext-panel__category-tag">{c}</span>
              ))}
            </div>
          )}
          <div className="ext-panel__detail-actions">
            {isInstalled(selectedExt) ? (
              <button className="ext-panel__btn ext-panel__btn--installed" disabled>
                Installed
              </button>
            ) : (
              <button
                className="ext-panel__btn ext-panel__btn--install"
                onClick={() => handleInstall(selectedExt)}
                disabled={installing !== null}
              >
                {installing === `${selectedExt.namespace}.${selectedExt.name}` ? 'Installing...' : 'Install'}
              </button>
            )}
          </div>
        </div>
        {error && <div className="ext-panel__error">{error}</div>}
      </div>
    )
  }

  // ---------- Main tabs ----------
  return (
    <div className="ext-panel">
      <div className="ext-panel__tabs">
        <button
          className={`ext-panel__tab ${tab === 'marketplace' ? 'ext-panel__tab--active' : ''}`}
          onClick={() => setTab('marketplace')}
        >
          Marketplace
        </button>
        <button
          className={`ext-panel__tab ${tab === 'installed' ? 'ext-panel__tab--active' : ''}`}
          onClick={() => setTab('installed')}
        >
          Installed ({installed.length})
        </button>
        <button
          className={`ext-panel__tab ${tab === 'themes' ? 'ext-panel__tab--active' : ''}`}
          onClick={() => { setTab('themes'); loadThemes() }}
        >
          Themes ({themes.length})
        </button>
      </div>

      {statusMsg && <div className="ext-panel__status">{statusMsg}</div>}
      {error && <div className="ext-panel__error">{error}</div>}

      {/* ===== Host controls ===== */}
      {tab === 'installed' && (
        <div className="ext-panel__host-section">
          <div className="ext-panel__host-bar">
            <span className={`ext-panel__host-dot ${hostStatus.running ? 'ext-panel__host-dot--on' : hostStatus.error ? 'ext-panel__host-dot--err' : ''}`} />
            <span className="ext-panel__host-label">
              {hostStatus.starting
                ? 'Starting...'
                : hostStatus.running
                  ? 'Host Running'
                  : 'Host Stopped'}
            </span>
            <button
              className="ext-panel__btn ext-panel__btn--sm ext-panel__btn--install"
              onClick={startExtensionHost}
              disabled={hostStatus.starting}
            >
              {hostStatus.starting ? 'Starting...' : hostStatus.running ? 'Restart' : 'Start Host'}
            </button>
            <button
              className="ext-panel__btn ext-panel__btn--sm"
              onClick={refreshHostStatus}
              title="Refresh status"
            >
              ↻
            </button>
          </div>
          {hostStatus.error && (
            <div className="ext-panel__host-error">
              <strong>Error:</strong> {hostStatus.error}
              {hostStatus.stderr.length > 0 && (
                <button
                  className="ext-panel__btn ext-panel__btn--sm ext-panel__btn--link"
                  onClick={() => setShowStderr((v) => !v)}
                >
                  {showStderr ? 'Hide logs' : 'Show logs'}
                </button>
              )}
            </div>
          )}
          {showStderr && hostStatus.stderr.length > 0 && (
            <pre className="ext-panel__host-stderr">{hostStatus.stderr.join('')}</pre>
          )}
        </div>
      )}

      {/* ===== Marketplace ===== */}
      {tab === 'marketplace' && (
        <div className="ext-panel__marketplace">
          <div className="ext-panel__search">
            <input
              className="ext-panel__search-input"
              type="text"
              value={query}
              onChange={(e) => handleQueryChange(e.target.value)}
              placeholder="Search extensions on Open VSX..."
              spellCheck={false}
            />
            {searching && <span className="ext-panel__search-spinner" />}
          </div>
          <div className="ext-panel__results">
            {results.length === 0 && !searching && query && (
              <div className="ext-panel__empty">No extensions found</div>
            )}
            {!query && !searching && (
              <div className="ext-panel__empty">Search for extensions to install</div>
            )}
            {results.map((ext) => {
              const extId = `${ext.namespace}.${ext.name}`
              const alreadyInstalled = isInstalled(ext)
              return (
                <div key={extId} className="ext-panel__item" onClick={() => setSelectedExt(ext)}>
                  <div className="ext-panel__item-icon-wrap">
                    {ext.iconUrl ? (
                      <img className="ext-panel__item-icon" src={ext.iconUrl} alt="" />
                    ) : (
                      <div className="ext-panel__item-icon ext-panel__item-icon--placeholder">Ext</div>
                    )}
                  </div>
                  <div className="ext-panel__item-info">
                    <div className="ext-panel__item-name">{ext.displayName || ext.name}</div>
                    <div className="ext-panel__item-publisher">{ext.namespace}</div>
                    <div className="ext-panel__item-desc">{ext.description}</div>
                  </div>
                  <div className="ext-panel__item-actions">
                    {ext.downloadCount !== undefined && (
                      <span className="ext-panel__item-downloads">{formatDownloads(ext.downloadCount)}</span>
                    )}
                    {alreadyInstalled ? (
                      <span className="ext-panel__item-badge">Installed</span>
                    ) : (
                      <button
                        className="ext-panel__btn ext-panel__btn--install ext-panel__btn--sm"
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

      {/* ===== Installed ===== */}
      {tab === 'installed' && (
        <div className="ext-panel__installed">
          {installed.length === 0 && (
            <div className="ext-panel__empty">No extensions installed</div>
          )}
          {installed.map((ext) => {
            const hasRunnable = !!(ext.manifest.main || ext.manifest.browser)
            return (
              <div key={ext.id} className="ext-panel__item ext-panel__item--installed">
                <div className="ext-panel__item-icon-wrap">
                  <div className="ext-panel__item-icon ext-panel__item-icon--placeholder">Ext</div>
                </div>
                <div className="ext-panel__item-info">
                  <div className="ext-panel__item-name">
                    {ext.manifest.displayName || ext.manifest.name}
                  </div>
                  <div className="ext-panel__item-publisher">{ext.manifest.publisher}</div>
                  <div className="ext-panel__item-desc">{ext.manifest.description}</div>
                  <div className="ext-panel__item-contrib">{getContribSummary(ext)}</div>
                </div>
                <div className="ext-panel__item-actions ext-panel__item-actions--col">
                  {hasRunnable && ext.enabled && (
                    <button
                      className="ext-panel__btn ext-panel__btn--activate ext-panel__btn--sm"
                      onClick={() => handleActivate(ext)}
                      disabled={activating !== null}
                    >
                      {activating === ext.id ? 'Activating...' : 'Activate'}
                    </button>
                  )}
                  {hasRunnable && ext.enabled && (
                    <button
                      className="ext-panel__btn ext-panel__btn--install ext-panel__btn--sm"
                      onClick={() => {
                        addPanel('extension-view', {
                          title: ext.manifest.displayName || ext.manifest.name,
                        })
                      }}
                    >
                      Open View
                    </button>
                  )}
                  <label className="ext-panel__toggle-label">
                    <input
                      type="checkbox"
                      checked={ext.enabled}
                      onChange={(e) => handleToggle(ext.id, e.target.checked)}
                    />
                    <span className="ext-panel__toggle-text">
                      {ext.enabled ? 'On' : 'Off'}
                    </span>
                  </label>
                  <button
                    className="ext-panel__btn ext-panel__btn--danger ext-panel__btn--sm"
                    onClick={() => handleUninstall(ext.id)}
                  >
                    Uninstall
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ===== Themes ===== */}
      {tab === 'themes' && (
        <div className="ext-panel__themes">
          {themes.length === 0 && (
            <div className="ext-panel__empty">
              No themes available. Install a theme extension from the Marketplace.
            </div>
          )}
          {themes.map((theme) => {
            const key = `${theme.extensionId}:${theme.label}`
            const savedRaw = localStorage.getItem('dynamic-ide-theme')
            const isActive = savedRaw ? (() => {
              try { const s = JSON.parse(savedRaw); return s.label === theme.label && s.extensionId === theme.extensionId } catch { return false }
            })() : false
            return (
              <div key={key} className="ext-panel__theme-item">
                <div className="ext-panel__theme-info">
                  <div className="ext-panel__theme-name">
                    {theme.label}
                    {isActive && <span className="ext-panel__theme-active">Active</span>}
                  </div>
                  <div className="ext-panel__theme-ext">
                    from {theme.extensionId}
                  </div>
                  <div className="ext-panel__theme-type">
                    {theme.uiTheme === 'vs-dark' ? 'Dark' : theme.uiTheme === 'vs' ? 'Light' : 'High Contrast'}
                  </div>
                </div>
                <button
                  className={`ext-panel__btn ext-panel__btn--sm ${isActive ? 'ext-panel__btn--installed' : 'ext-panel__btn--install'}`}
                  onClick={() => handleApplyTheme(theme)}
                  disabled={applyingTheme !== null || isActive}
                >
                  {applyingTheme === key ? 'Applying...' : isActive ? 'Active' : 'Apply'}
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

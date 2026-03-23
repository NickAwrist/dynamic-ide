import { useEffect, useMemo, useState } from 'react'
import { useIDEStore } from '../stores/workspace.store'
import { useOpenUrlStore } from '../stores/open-url.store'
import { defaultBrowserTabs, newBrowserTabId, tabLabel } from '../lib/browser-tabs'
import { IconClose } from './ui/ChromeIcons'

export function OpenUrlModal() {
  const prompt = useOpenUrlStore((s) => s.prompt)
  const closePrompt = useOpenUrlStore((s) => s.closePrompt)
  const setPendingBrowserNav = useOpenUrlStore((s) => s.setPendingBrowserNav)

  const activeWs = useIDEStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  )
  const addPanel = useIDEStore((s) => s.addPanel)
  const bringToFront = useIDEStore((s) => s.bringToFront)

  const browserPanels = useMemo(
    () => activeWs?.panels.filter((p) => p.type === 'browser') ?? [],
    [activeWs?.panels],
  )

  const [panelId, setPanelId] = useState<string>('')
  const [tabTarget, setTabTarget] = useState<'new' | string>('new')

  useEffect(() => {
    if (!prompt) return
    const first = browserPanels[0]?.id ?? ''
    setPanelId(browserPanels.length === 1 ? first : first)
    setTabTarget('new')
  }, [prompt, browserPanels])

  if (!prompt) return null

  const url = prompt.url
  const displayUrl = url.length > 72 ? `${url.slice(0, 70)}…` : url

  const openSystem = () => {
    closePrompt()
    void window.electronAPI.shell.openExternal(url)
  }

  const openInBrowserPanel = () => {
    if (!activeWs) return
    closePrompt()

    if (browserPanels.length === 0) {
      const tid = newBrowserTabId()
      const newId = addPanel('browser', {
        tabs: [{ id: tid, url }],
        activeTabId: tid,
      })
      if (newId) bringToFront(newId)
      return
    }

    const targetPanel = (panelId || browserPanels[0]?.id) ?? ''
    if (!targetPanel) return
    const tabId = tabTarget === 'new' ? 'new' : tabTarget
    setPendingBrowserNav({ panelId: targetPanel, tabId, url })
    bringToFront(targetPanel)
  }

  const selectedPanel = browserPanels.find((p) => p.id === panelId) ?? browserPanels[0]
  const { tabs } = selectedPanel ? defaultBrowserTabs(selectedPanel.componentState) : { tabs: [] }

  return (
    <div
      className="open-url-modal__overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="open-url-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closePrompt()
      }}
    >
      <div className="open-url-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="open-url-modal__header">
          <span id="open-url-modal-title">Open link</span>
          <button type="button" className="open-url-modal__close" onClick={closePrompt} aria-label="Close">
            <IconClose size="sm" />
          </button>
        </div>
        <div className="open-url-modal__body">
          <p className="open-url-modal__url" title={url}>
            {displayUrl}
          </p>

          {browserPanels.length > 1 && (
            <label className="open-url-modal__field">
              <span>Browser panel</span>
              <select
                className="open-url-modal__select"
                value={panelId || browserPanels[0]?.id}
                onChange={(e) => {
                  setPanelId(e.target.value)
                  setTabTarget('new')
                }}
              >
                {browserPanels.map((p, i) => (
                  <option key={p.id} value={p.id}>
                    Browser {i + 1}
                  </option>
                ))}
              </select>
            </label>
          )}

          {browserPanels.length > 0 && (
            <label className="open-url-modal__field">
              <span>Tab</span>
              <select
                className="open-url-modal__select"
                value={tabTarget}
                onChange={(e) => setTabTarget(e.target.value as 'new' | string)}
              >
                <option value="new">New tab</option>
                {tabs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {tabLabel(t)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <div className="open-url-modal__actions">
            <button type="button" className="open-url-modal__btn open-url-modal__btn--secondary" onClick={closePrompt}>
              Cancel
            </button>
            <button type="button" className="open-url-modal__btn open-url-modal__btn--secondary" onClick={openSystem}>
              System browser
            </button>
            <button type="button" className="open-url-modal__btn open-url-modal__btn--primary" onClick={openInBrowserPanel}>
              {browserPanels.length === 0 ? 'Add Browser panel' : 'Open in Browser panel'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

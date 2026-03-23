import type { BrowserTab } from '../../lib/browser-tabs'
import { tabLabel } from '../../lib/browser-tabs'
import { IconClose } from '../../components/ui/ChromeIcons'

interface Props {
  tabs: BrowserTab[]
  activeTabId: string
  onSelectTab: (tabId: string) => void
  onCloseTab: (tabId: string) => void
  onNewTab: () => void
  canAddTab: boolean
}

export function BrowserTabBar({
  tabs,
  activeTabId,
  onSelectTab,
  onCloseTab,
  onNewTab,
  canAddTab,
}: Props) {
  return (
    <div className="browser-panel__tab-bar" role="tablist" aria-label="Browser tabs">
      <div className="browser-panel__tab-scroll">
        {tabs.map((tab) => {
          const active = tab.id === activeTabId
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={active}
              className={`browser-panel__tab${active ? ' browser-panel__tab--active' : ''}`}
            >
              <button
                type="button"
                className="browser-panel__tab-label"
                onClick={() => onSelectTab(tab.id)}
                title={tab.url}
              >
                {tabLabel(tab)}
              </button>
              {tabs.length > 1 && (
                <button
                  type="button"
                  className="browser-panel__tab-close"
                  onClick={(e) => {
                    e.stopPropagation()
                    onCloseTab(tab.id)
                  }}
                  aria-label={`Close ${tabLabel(tab)}`}
                >
                  <IconClose size="sm" />
                </button>
              )}
            </div>
          )
        })}
      </div>
      <button
        type="button"
        className="browser-panel__tab-new"
        onClick={onNewTab}
        disabled={!canAddTab}
        title={canAddTab ? 'New tab' : 'Maximum tabs reached'}
      >
        +
      </button>
    </div>
  )
}

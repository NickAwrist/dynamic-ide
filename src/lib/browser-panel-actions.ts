import {
  defaultBrowserTabs,
  MAX_BROWSER_TABS,
  newBrowserTabId,
  type BrowserTab,
} from './browser-tabs'
import { requestOpenUrl } from './request-open-url'
import { useIDEStore } from '../stores/workspace.store'

/** New tab in the given browser panel (e.g. window.open from embedded browser). */
export function addInPanelBrowserTab(panelId: string, url: string): void {
  const ide = useIDEStore.getState()
  const ws = ide.getActiveWorkspace()
  const panel = ws?.panels.find((p) => p.id === panelId)
  if (!panel || panel.type !== 'browser') return
  const { tabs } = defaultBrowserTabs(panel.componentState)
  if (tabs.length >= MAX_BROWSER_TABS) {
    requestOpenUrl(url)
    return
  }
  const newId = newBrowserTabId()
  const nextTabs: BrowserTab[] = [...tabs, { id: newId, url }]
  ide.updatePanel(panelId, {
    componentState: { ...panel.componentState, tabs: nextTabs, activeTabId: newId },
  })
  ide.bringToFront(panelId)
}

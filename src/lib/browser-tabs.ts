export const MAX_BROWSER_TABS = 12

export type BrowserTab = { id: string; url: string; title?: string }

export function newBrowserTabId(): string {
  return `tab-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`
}

export function defaultBrowserTabs(
  componentState: Record<string, unknown>,
): { tabs: BrowserTab[]; activeTabId: string } {
  const legacyUrl =
    typeof componentState.url === 'string' && componentState.url.trim()
      ? componentState.url.trim()
      : 'https://www.google.com'

  if (
    Array.isArray(componentState.tabs) &&
    componentState.tabs.length > 0 &&
    typeof componentState.activeTabId === 'string'
  ) {
    const tabs = componentState.tabs as BrowserTab[]
    const activeTabId = tabs.some((t) => t.id === componentState.activeTabId)
      ? (componentState.activeTabId as string)
      : tabs[0].id
    return { tabs, activeTabId }
  }

  const id = newBrowserTabId()
  return { tabs: [{ id, url: legacyUrl }], activeTabId: id }
}

export function tabLabel(tab: BrowserTab): string {
  if (tab.title?.trim()) return tab.title.trim()
  try {
    const u = new URL(tab.url)
    return u.host || tab.url.slice(0, 32)
  } catch {
    return tab.url.slice(0, 32) || 'New tab'
  }
}

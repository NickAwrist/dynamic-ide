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

/** Short summary for open-URL modal: what this embedded browser is showing. */
export function browserPanelPickerSummary(panel: {
  componentState: Record<string, unknown>
}): string {
  const { tabs, activeTabId } = defaultBrowserTabs(panel.componentState)
  const active = tabs.find((t) => t.id === activeTabId) ?? tabs[0]
  const site = tabLabel(active)
  const short = site.length > 44 ? `${site.slice(0, 42)}…` : site
  if (tabs.length <= 1) return short
  return `${short} (${tabs.length} tabs)`
}

export function disambiguatePickerSummaries(summaries: string[]): string[] {
  const count = new Map<string, number>()
  for (const s of summaries) count.set(s, (count.get(s) ?? 0) + 1)
  const seen = new Map<string, number>()
  return summaries.map((s) => {
    if ((count.get(s) ?? 0) <= 1) return s
    const n = (seen.get(s) ?? 0) + 1
    seen.set(s, n)
    return `${s} — panel ${n}`
  })
}

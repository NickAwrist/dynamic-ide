import { create } from 'zustand'

export type PendingBrowserNavigation = {
  panelId: string
  tabId: string | 'new'
  url: string
}

type OpenUrlState = {
  prompt: { url: string } | null
  pendingBrowserNav: PendingBrowserNavigation | null
  openPrompt: (url: string) => void
  closePrompt: () => void
  setPendingBrowserNav: (nav: PendingBrowserNavigation) => void
  /** Clears pending nav only when it targets this panel (other panels ignore). */
  consumePendingBrowserNavForPanel: (panelId: string) => PendingBrowserNavigation | null
}

export const useOpenUrlStore = create<OpenUrlState>((set, get) => ({
  prompt: null,
  pendingBrowserNav: null,
  openPrompt: (url) => set({ prompt: { url } }),
  closePrompt: () => set({ prompt: null }),
  setPendingBrowserNav: (nav) => set({ pendingBrowserNav: nav }),
  consumePendingBrowserNavForPanel: (panelId) => {
    const n = get().pendingBrowserNav
    if (!n || n.panelId !== panelId) return null
    set({ pendingBrowserNav: null })
    return n
  },
}))

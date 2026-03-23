import { useOpenUrlStore } from '../stores/open-url.store'

/** http(s) → in-app prompt; mailto/file → system handler. */
export function requestOpenUrl(url: string): void {
  const trimmed = url.trim()
  if (!trimmed) return
  try {
    const u = new URL(trimmed)
    if (u.protocol === 'http:' || u.protocol === 'https:') {
      useOpenUrlStore.getState().openPrompt(u.href)
      return
    }
    if (u.protocol === 'mailto:' || u.protocol === 'file:') {
      void window.electronAPI.shell.openExternal(u.href)
      return
    }
  } catch {
    /* fall through */
  }
  void window.electronAPI.shell.openExternal(trimmed)
}

type WebviewLike = {
  addEventListener: (ev: string, fn: (...args: unknown[]) => void) => void
  removeEventListener: (ev: string, fn: (...args: unknown[]) => void) => void
  getWebContents?: () => { setWindowOpenHandler?: (cb: (d: { url: string }) => { action: 'deny' | 'allow' }) => void }
}

/** Intercept window.open / target=_blank in an embedded webview (e.g. T3). */
export function attachT3GuestOpenUrlHandler(wv: WebviewLike): void {
  const apply = () => {
    try {
      const wc = wv.getWebContents?.()
      const fn = wc && typeof wc === 'object' && 'setWindowOpenHandler' in wc ? (wc as any).setWindowOpenHandler : null
      if (typeof fn !== 'function') return false
      fn.call(wc, (details: { url: string }) => {
        const u = details?.url
        if (u && /^https?:\/\//i.test(u)) {
          requestOpenUrl(u)
        }
        return { action: 'deny' as const }
      })
      return true
    } catch {
      return false
    }
  }
  if (apply()) return
  const onReady = () => {
    wv.removeEventListener('dom-ready', onReady as any)
    apply()
  }
  wv.addEventListener('dom-ready', onReady as any)
}

export function installGlobalLinkCapture(): () => void {
  const onClick = (e: MouseEvent) => {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return
    }
    const el = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null
    if (!el) return
    const href = el.getAttribute('href')
    if (!href || href.startsWith('javascript:')) return
    if (href === '#' || href.startsWith('#')) return
    let resolved: URL
    try {
      resolved = new URL(href, window.location.href)
    } catch {
      return
    }
    if (resolved.protocol !== 'http:' && resolved.protocol !== 'https:') return
    e.preventDefault()
    e.stopPropagation()
    requestOpenUrl(resolved.href)
  }
  document.addEventListener('click', onClick, true)
  return () => document.removeEventListener('click', onClick, true)
}

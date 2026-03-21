import { useState, useEffect, useRef, useCallback } from 'react'

interface Props {
  panel: {
    id: string
    type: string
    viewId?: string
    title?: string
  }
}

export function ExtensionViewPanel({ panel }: Props) {
  const [html, setHtml] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [availableViews, setAvailableViews] = useState<Array<{ viewId: string; type: string }>>([])
  const [selectedViewId, setSelectedViewId] = useState<string | null>(panel.viewId || null)
  const iframeRef = useRef<HTMLIFrameElement>(null)

  useEffect(() => {
    if (selectedViewId) return
    let cancelled = false
    const load = async () => {
      try {
        const views = await window.electronAPI.extensions.getRegisteredViews()
        if (!cancelled) setAvailableViews(views)
      } catch (err: any) {
        // silently ignore — views not available yet
      }
      if (!cancelled) setLoading(false)
    }
    load()
    return () => { cancelled = true }
  }, [selectedViewId])

  const resolveView = useCallback(async (viewId: string) => {
    setSelectedViewId(viewId)
    setLoading(true)
    setError(null)
    try {
      const result = await window.electronAPI.extensions.resolveWebviewView(viewId)
      if (result?.html) {
        setHtml(wrapHtml(result.html, viewId))
      } else {
        setError('Extension did not provide any HTML content for this view.')
      }
    } catch (err: any) {
      setError(`Failed to resolve view: ${err.message}`)
    }
    setLoading(false)
  }, [])

  // Auto-resolve if viewId is preset
  useEffect(() => {
    if (panel.viewId) {
      resolveView(panel.viewId)
    }
  }, [panel.viewId, resolveView])

  // Listen for HTML updates from the extension host (live updates)
  useEffect(() => {
    if (!selectedViewId) return
    const unsub = window.electronAPI.extensions.onWebviewHtml((data) => {
      if (data.viewId === selectedViewId) {
        setHtml(wrapHtml(data.html, selectedViewId))
      }
    })
    return unsub
  }, [selectedViewId])

  // Listen for postMessage from extension → webview
  useEffect(() => {
    if (!selectedViewId) return
    const unsub = window.electronAPI.extensions.onWebviewMessage((data) => {
      if (data.viewId === selectedViewId && iframeRef.current?.contentWindow) {
        iframeRef.current.contentWindow.postMessage(data.message, '*')
      }
    })
    return unsub
  }, [selectedViewId])

  // Listen for postMessage from webview iframe → extension
  useEffect(() => {
    if (!selectedViewId) return
    const handler = (event: MessageEvent) => {
      if (event.source === iframeRef.current?.contentWindow) {
        window.electronAPI.extensions.sendWebviewMessage(selectedViewId, event.data)
      }
    }
    globalThis.addEventListener('message', handler)
    return () => globalThis.removeEventListener('message', handler)
  }, [selectedViewId])

  // View picker when no viewId is set
  if (!selectedViewId) {
    return (
      <div className="ext-view-panel">
        <div className="ext-view-panel__picker">
          <h3>Select an extension view</h3>
          {loading && <div className="ext-view-panel__loading">Loading views...</div>}
          {!loading && availableViews.length === 0 && (
            <div className="ext-view-panel__empty">
              No extension views registered. Start the extension host and activate an extension first.
            </div>
          )}
          {availableViews.map((v) => (
            <button
              key={v.viewId}
              className="ext-view-panel__view-btn"
              onClick={() => resolveView(v.viewId)}
            >
              <span className="ext-view-panel__view-id">{v.viewId}</span>
              <span className="ext-view-panel__view-type">{v.type}</span>
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="ext-view-panel">
      {loading && <div className="ext-view-panel__loading">Loading extension view...</div>}
      {error && (
        <div className="ext-view-panel__error">
          <p>{error}</p>
          <button className="ext-view-panel__retry" onClick={() => resolveView(selectedViewId)}>
            Retry
          </button>
        </div>
      )}
      {html && (
        <iframe
          ref={iframeRef}
          className="ext-view-panel__iframe"
          srcDoc={html}
          sandbox="allow-scripts allow-forms allow-popups allow-same-origin"
          title={panel.title || selectedViewId}
        />
      )}
    </div>
  )
}

function extractNonce(html: string): string | null {
  const match = html.match(/nonce-([A-Za-z0-9+/=]+)/)
  return match ? match[1] : null
}

function wrapHtml(html: string, viewId: string): string {
  if (html.includes('<html') || html.includes('<!DOCTYPE')) {
    const nonce = extractNonce(html)
    const bridge = getMessagingBridge(viewId, nonce)
    // Inject bridge in <head> BEFORE extension scripts so acquireVsCodeApi is defined early
    const injected = html.replace(/<head([^>]*)>/i, `<head$1>${bridge}`)
    return injected
  }
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>body{margin:0;padding:8px;font-family:sans-serif;color:#cdd6f4;background:#1e1e2e;}</style></head>
<body>${html}${getMessagingBridge(viewId, null)}</body>
</html>`
}

function getMessagingBridge(_viewId: string, nonce: string | null): string {
  const nonceAttr = nonce ? ` nonce="${nonce}"` : ''
  return `<script${nonceAttr}>
(function(){
  const vscode = {
    postMessage: function(msg) { window.parent.postMessage(msg, '*'); },
    setState: function(s) { window.__vscState = s; },
    getState: function() { return window.__vscState; }
  };
  window.acquireVsCodeApi = function() { return vscode; };
  window.addEventListener('message', function(e) {
    if (e.source === window.parent) {
      window.dispatchEvent(new MessageEvent('message', { data: e.data }));
    }
  });
})();
</script>`
}

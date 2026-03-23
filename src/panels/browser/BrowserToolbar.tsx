import type { KeyboardEvent, RefObject } from 'react'
import { IconClose } from '../../components/ui/ChromeIcons'

interface Props {
  displayUrl: string
  isLoading: boolean
  canGoBack: boolean
  canGoForward: boolean
  showBookmarks: boolean
  urlInputRef: RefObject<HTMLInputElement | null>
  onDisplayUrlChange: (v: string) => void
  onUrlKeyDown: (e: KeyboardEvent<HTMLInputElement>) => void
  onGoBack: () => void
  onGoForward: () => void
  onReload: () => void
  onToggleBookmarks: () => void
  onOpenImport: () => void
}

export function BrowserToolbar({
  displayUrl,
  isLoading,
  canGoBack,
  canGoForward,
  showBookmarks,
  urlInputRef,
  onDisplayUrlChange,
  onUrlKeyDown,
  onGoBack,
  onGoForward,
  onReload,
  onToggleBookmarks,
  onOpenImport,
}: Props) {
  return (
    <div className="browser-panel__toolbar">
      <button type="button" className="browser-panel__nav-btn" onClick={onGoBack} disabled={!canGoBack} title="Back">
        ◀
      </button>
      <button
        type="button"
        className="browser-panel__nav-btn"
        onClick={onGoForward}
        disabled={!canGoForward}
        title="Forward"
      >
        ▶
      </button>
      <button
        type="button"
        className="browser-panel__nav-btn"
        onClick={onReload}
        title={isLoading ? 'Stop' : 'Reload'}
        aria-label={isLoading ? 'Stop loading' : 'Reload'}
      >
        {isLoading ? <IconClose size="sm" /> : '↻'}
      </button>

      <div className="browser-panel__url-bar">
        {isLoading && <div className="browser-panel__loading-bar" />}
        <input
          ref={urlInputRef as RefObject<HTMLInputElement>}
          className="browser-panel__url-input"
          value={displayUrl}
          onChange={(e) => onDisplayUrlChange(e.target.value)}
          onKeyDown={onUrlKeyDown}
          onFocus={(e) => e.target.select()}
          placeholder="Search or enter URL"
          spellCheck={false}
        />
      </div>

      <button type="button" className="browser-panel__nav-btn" onClick={onToggleBookmarks} title="Bookmarks">
        {showBookmarks ? '★' : '☆'}
      </button>
      <button
        type="button"
        className="browser-panel__nav-btn browser-panel__import-trigger"
        onClick={onOpenImport}
        title="Import browser data"
      >
        ⇓
      </button>
    </div>
  )
}

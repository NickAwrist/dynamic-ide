import type { BrowserProfile } from '../../types/electron'
import { IconClose } from '../../components/ui/ChromeIcons'

interface Props {
  profiles: BrowserProfile[]
  importStatus: string
  onClose: () => void
  onImportProfile: (profilePath: string) => void
  onImportBookmarksOnly: (profilePath: string) => void
}

export function BrowserImportModal({
  profiles,
  importStatus,
  onClose,
  onImportProfile,
  onImportBookmarksOnly,
}: Props) {
  return (
    <div className="browser-panel__modal-overlay" onClick={onClose}>
      <div className="browser-panel__modal" onClick={(e) => e.stopPropagation()}>
        <div className="browser-panel__modal-header">
          <span>Import Browser Data</span>
          <button type="button" className="browser-panel__modal-close" onClick={onClose} aria-label="Close">
            <IconClose size="md" />
          </button>
        </div>
        <div className="browser-panel__modal-body">
          <p className="browser-panel__modal-hint">
            Import cookies, saved sessions, and bookmarks from an installed browser. Close the source browser first for
            best results.
          </p>

          {profiles.length === 0 ? (
            <div className="browser-panel__modal-empty">No browser profiles detected</div>
          ) : (
            <div className="browser-panel__profile-list">
              {profiles.map((p, i) => (
                <div key={i} className="browser-panel__profile-item">
                  <div className="browser-panel__profile-info">
                    <span className="browser-panel__profile-browser">{p.browser}</span>
                    <span className="browser-panel__profile-name">{p.profileName}</span>
                  </div>
                  <div className="browser-panel__profile-actions">
                    <button type="button" className="browser-panel__profile-btn" onClick={() => onImportProfile(p.profilePath)}>
                      Full Import
                    </button>
                    <button
                      type="button"
                      className="browser-panel__profile-btn browser-panel__profile-btn--secondary"
                      onClick={() => onImportBookmarksOnly(p.profilePath)}
                    >
                      Bookmarks
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}

          {importStatus && <div className="browser-panel__import-status">{importStatus}</div>}
        </div>
      </div>
    </div>
  )
}

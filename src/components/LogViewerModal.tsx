import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { AppLogEntry, AppLogLevel } from '../types/electron'
import { IconClose } from './ui/ChromeIcons'

interface Props {
  open: boolean
  onClose: () => void
}

const LEVELS: Array<AppLogLevel | 'all'> = ['all', 'debug', 'info', 'warn', 'error']

export function LogViewerModal({ open, onClose }: Props) {
  const [entries, setEntries] = useState<AppLogEntry[]>([])
  const [levelFilter, setLevelFilter] = useState<AppLogLevel | 'all'>('all')
  const bodyRef = useRef<HTMLDivElement>(null)
  const tailRef = useRef(true)

  const filtered = useMemo(() => {
    if (levelFilter === 'all') return entries
    return entries.filter((e) => e.level === levelFilter)
  }, [entries, levelFilter])

  const reload = useCallback(async () => {
    const list = await window.electronAPI.appLog.getRecent()
    setEntries(list)
  }, [])

  useEffect(() => {
    if (!open) return
    void reload()
    const unsub = window.electronAPI.appLog.onEntry((entry) => {
      setEntries((prev) => [...prev.slice(-1999), entry])
    })
    return unsub
  }, [open, reload])

  useEffect(() => {
    if (!open || !tailRef.current || !bodyRef.current) return
    bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [open, filtered])

  const onScroll = () => {
    const el = bodyRef.current
    if (!el) return
    const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
    tailRef.current = nearBottom
  }

  const copyAll = async () => {
    const text = filtered
      .map(
        (e) =>
          `${e.ts} ${e.level.toUpperCase().padEnd(5)} ${e.scope} ${e.message}${e.detail ? ` ${e.detail}` : ''}`,
      )
      .join('\n')
    try {
      await navigator.clipboard.writeText(text)
    } catch {
      /* ignore */
    }
  }

  const clearBuffer = async () => {
    await window.electronAPI.appLog.clearBuffer()
    await reload()
  }

  const revealFile = async () => {
    await window.electronAPI.appLog.revealLogFile()
  }

  if (!open) return null

  return (
    <div
      className="app-log-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-log-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="app-log-modal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="app-log-modal__header">
          <div>
            <h2 id="app-log-title" className="app-log-modal__title">
              Application logs
            </h2>
            <p className="app-log-modal__hint">Toggle: Ctrl+Shift+L · Main process + UI</p>
          </div>
          <div className="app-log-modal__toolbar">
            <label>
              Level
              <select
                value={levelFilter}
                onChange={(e) => setLevelFilter(e.target.value as AppLogLevel | 'all')}
              >
                {LEVELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </label>
            <div className="app-log-modal__actions">
              <button type="button" className="app-log-modal__btn" onClick={() => void reload()}>
                Refresh
              </button>
              <button type="button" className="app-log-modal__btn" onClick={() => void copyAll()}>
                Copy all
              </button>
              <button type="button" className="app-log-modal__btn" onClick={() => void clearBuffer()}>
                Clear buffer
              </button>
              <button type="button" className="app-log-modal__btn" onClick={() => void revealFile()}>
                Log file…
              </button>
            </div>
            <button
              type="button"
              className="app-log-modal__btn--close"
              onClick={onClose}
              aria-label="Close"
            >
              <IconClose size="lg" />
            </button>
          </div>
        </div>
        <div
          className="app-log-modal__body"
          ref={bodyRef}
          onScroll={onScroll}
        >
          {filtered.length === 0 ? (
            <div className="app-log-modal__empty">No log lines match the filter.</div>
          ) : (
            filtered.map((e, i) => (
              <div key={`${e.ts}-${i}`} className="app-log-modal__row">
                <span className="app-log-modal__ts">{e.ts}</span>
                <span className={`app-log-modal__level app-log-modal__level--${e.level}`}>
                  {e.level}
                </span>
                <span>
                  <span className="app-log-modal__scope">{e.scope}</span> {e.message}
                  {e.detail ? ` ${e.detail}` : ''}
                </span>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  )
}

import { useCallback, useEffect, useState } from 'react'
import { PanelState, WorkspaceState } from '../stores/workspace.store'

interface FileStatus {
  path: string
  index: string
  working_dir: string
}

interface LogEntry {
  hash: string
  date: string
  message: string
  author_name: string
}

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

export function GitPanel({ panel, workspace }: Props) {
  const [isRepo, setIsRepo] = useState<boolean | null>(null)
  const [branch, setBranch] = useState<string | null>(null)
  const [staged, setStaged] = useState<FileStatus[]>([])
  const [unstaged, setUnstaged] = useState<FileStatus[]>([])
  const [commitMsg, setCommitMsg] = useState('')
  const [log, setLog] = useState<LogEntry[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [initializing, setInitializing] = useState(false)
  const [tab, setTab] = useState<'changes' | 'log'>('changes')

  const refresh = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const status = await window.electronAPI.git.status(workspace.rootPath)

      if (!status.isRepo) {
        setIsRepo(false)
        setStaged([])
        setUnstaged([])
        setBranch(null)
        setLoading(false)
        return
      }

      setIsRepo(true)
      setBranch(status.current || 'HEAD')

      const stagedFiles: FileStatus[] = [
        ...(status.created || []).map((p: string) => ({ path: p, index: 'A', working_dir: ' ' })),
        ...(status.staged || []).map((p: string) => ({ path: p, index: 'M', working_dir: ' ' })),
        ...(status.deleted || []).map((p: string) => ({ path: p, index: 'D', working_dir: ' ' })),
        ...(status.renamed || []).map((r: any) => ({ path: r.to, index: 'R', working_dir: ' ' })),
      ]

      const unstagedFiles: FileStatus[] = [
        ...(status.modified || []).map((p: string) => ({ path: p, index: ' ', working_dir: 'M' })),
        ...(status.not_added || []).map((p: string) => ({ path: p, index: '?', working_dir: '?' })),
      ]

      const stagedPaths = new Set(stagedFiles.map((f) => f.path))
      const filteredUnstaged = unstagedFiles.filter((f) => !stagedPaths.has(f.path))

      setStaged(stagedFiles)
      setUnstaged(filteredUnstaged)
    } catch (err: any) {
      setError(err.message || 'Failed to get git status')
    }
    setLoading(false)
  }, [workspace.rootPath])

  const refreshLog = useCallback(async () => {
    try {
      const result = await window.electronAPI.git.log(workspace.rootPath, 30)
      setLog(
        (result.entries || []).map((entry: any) => ({
          hash: entry.hash?.slice(0, 7) || '',
          date: entry.date || '',
          message: entry.message || '',
          author_name: entry.author_name || '',
        })),
      )
    } catch {
      setLog([])
    }
  }, [workspace.rootPath])

  useEffect(() => {
    refresh()
    refreshLog()
  }, [refresh, refreshLog])

  const handleInit = useCallback(async () => {
    setInitializing(true)
    try {
      await window.electronAPI.git.init(workspace.rootPath)
      await refresh()
      await refreshLog()
    } catch (err: any) {
      setError(err.message || 'Failed to initialize git repository')
    }
    setInitializing(false)
  }, [workspace.rootPath, refresh, refreshLog])

  const stageFiles = useCallback(
    async (files: string[]) => {
      try {
        await window.electronAPI.git.stage(workspace.rootPath, files)
        await refresh()
      } catch (err: any) {
        setError(err.message || 'Stage failed')
      }
    },
    [workspace.rootPath, refresh],
  )

  const unstageFiles = useCallback(
    async (files: string[]) => {
      try {
        await window.electronAPI.git.unstage(workspace.rootPath, files)
        await refresh()
      } catch (err: any) {
        setError(err.message || 'Unstage failed')
      }
    },
    [workspace.rootPath, refresh],
  )

  const commitChanges = useCallback(async () => {
    if (!commitMsg.trim()) return
    setError(null)
    try {
      await window.electronAPI.git.commit(workspace.rootPath, commitMsg)
      setCommitMsg('')
      await refresh()
      await refreshLog()
    } catch (err: any) {
      setError(err.message || 'Commit failed')
    }
  }, [workspace.rootPath, commitMsg, refresh, refreshLog])

  const stageAll = useCallback(() => {
    const files = unstaged.map((f) => f.path)
    if (files.length > 0) stageFiles(files)
  }, [unstaged, stageFiles])

  const unstageAll = useCallback(() => {
    const files = staged.map((f) => f.path)
    if (files.length > 0) unstageFiles(files)
  }, [staged, unstageFiles])

  const statusIcon = (index: string, wd: string) => {
    if (index === 'A' || wd === '?') return 'A'
    if (index === 'D') return 'D'
    if (index === 'R') return 'R'
    return 'M'
  }

  const statusClass = (icon: string) => {
    switch (icon) {
      case 'A': return 'git-status--added'
      case 'D': return 'git-status--deleted'
      case 'R': return 'git-status--renamed'
      default: return 'git-status--modified'
    }
  }

  // Not a git repo — offer to init
  if (isRepo === false) {
    return (
      <div className="git-panel">
        <div className="git-panel__init">
          <div className="git-panel__init-icon">&#x2139;</div>
          <p className="git-panel__init-text">
            This folder is not a git repository.
          </p>
          <button
            className="git-panel__init-btn"
            onClick={handleInit}
            disabled={initializing}
          >
            {initializing ? 'Initializing...' : 'Initialize Git Repository'}
          </button>
          {error && <div className="git-panel__error">{error}</div>}
        </div>
      </div>
    )
  }

  // Still loading initial state
  if (isRepo === null) {
    return (
      <div className="git-panel">
        <div className="git-panel__loading">Checking repository...</div>
      </div>
    )
  }

  return (
    <div className="git-panel">
      <div className="git-panel__tab-bar">
        <button
          className={`git-panel__tab ${tab === 'changes' ? 'git-panel__tab--active' : ''}`}
          onClick={() => setTab('changes')}
        >
          Changes
        </button>
        <button
          className={`git-panel__tab ${tab === 'log' ? 'git-panel__tab--active' : ''}`}
          onClick={() => { setTab('log'); refreshLog() }}
        >
          Log
        </button>
        {branch && (
          <span className="git-panel__branch">{branch}</span>
        )}
        <button
          className="git-panel__refresh"
          onClick={() => { refresh(); refreshLog() }}
          title="Refresh"
        >
          &#x21BB;
        </button>
      </div>

      {tab === 'changes' && (
        <div className="git-panel__changes">
          <div className="git-panel__section">
            <div className="git-panel__section-header">
              <span>Staged ({staged.length})</span>
              {staged.length > 0 && (
                <button className="git-panel__action" onClick={unstageAll}>
                  Unstage All
                </button>
              )}
            </div>
            {staged.map((f) => {
              const icon = statusIcon(f.index, f.working_dir)
              return (
                <div key={`s-${f.path}`} className="git-panel__file">
                  <span className={`git-panel__file-status ${statusClass(icon)}`}>
                    {icon}
                  </span>
                  <span className="git-panel__file-path">{f.path}</span>
                  <button
                    className="git-panel__file-action"
                    onClick={() => unstageFiles([f.path])}
                    title="Unstage"
                  >
                    &minus;
                  </button>
                </div>
              )
            })}
          </div>

          <div className="git-panel__section">
            <div className="git-panel__section-header">
              <span>Changes ({unstaged.length})</span>
              {unstaged.length > 0 && (
                <button className="git-panel__action" onClick={stageAll}>
                  Stage All
                </button>
              )}
            </div>
            {unstaged.map((f) => {
              const icon = statusIcon(f.index, f.working_dir)
              return (
                <div key={`u-${f.path}`} className="git-panel__file">
                  <span className={`git-panel__file-status ${statusClass(icon)}`}>
                    {icon}
                  </span>
                  <span className="git-panel__file-path">{f.path}</span>
                  <button
                    className="git-panel__file-action"
                    onClick={() => stageFiles([f.path])}
                    title="Stage"
                  >
                    +
                  </button>
                </div>
              )
            })}
          </div>

          {staged.length === 0 && unstaged.length === 0 && !loading && (
            <div className="git-panel__clean">
              Working tree clean
            </div>
          )}

          <div className="git-panel__commit">
            <textarea
              className="git-panel__commit-input"
              placeholder="Commit message..."
              value={commitMsg}
              onChange={(e) => setCommitMsg(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') commitChanges()
              }}
              rows={3}
            />
            <button
              className="git-panel__commit-btn"
              onClick={commitChanges}
              disabled={!commitMsg.trim() || staged.length === 0}
            >
              Commit ({staged.length} file{staged.length !== 1 ? 's' : ''})
            </button>
          </div>

          {error && <div className="git-panel__error">{error}</div>}
        </div>
      )}

      {tab === 'log' && (
        <div className="git-panel__log">
          {log.length === 0 ? (
            <div className="git-panel__empty">No commits yet</div>
          ) : (
            log.map((entry, i) => (
              <div key={`${entry.hash}-${i}`} className="git-panel__log-entry">
                <div className="git-panel__log-header">
                  <span className="git-panel__log-hash">{entry.hash}</span>
                  <span className="git-panel__log-date">
                    {entry.date ? new Date(entry.date).toLocaleDateString() : ''}
                  </span>
                </div>
                <div className="git-panel__log-message">{entry.message}</div>
                <div className="git-panel__log-author">{entry.author_name}</div>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  )
}

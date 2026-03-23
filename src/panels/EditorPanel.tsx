import { useCallback, useEffect, useState, useRef } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'
import { configureMonacoTypeScript } from '../utils/monaco-typescript'
import { applyFullTheme, getSavedThemeInfo, getCurrentThemeId, registerMonaco } from '../utils/theme-engine'
import { createUiLogger, Scopes } from '../lib/logger'
import { IconClose } from '../components/ui/ChromeIcons'

const log = createUiLogger(Scopes.uiPanelEditor)

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

interface TabInfo {
  filePath: string
  name: string
  content: string
  dirty: boolean
}

export function EditorPanel({ panel, workspace }: Props) {
  const updatePanel = useIDEStore((s) => s.updatePanel)
  const tabs: TabInfo[] = panel.componentState.tabs || []
  const activeTab: number = panel.componentState.activeTab ?? 0
  const [monacoTheme, setMonacoTheme] = useState('vs-dark')
  const monacoRef = useRef<Monaco | null>(null)

  // Listen for theme changes — Monaco was already updated by applyFullTheme
  // via the global ref, we just need to sync the local state
  useEffect(() => {
    const handler = () => {
      setMonacoTheme(getCurrentThemeId() || 'vs-dark')
    }
    window.addEventListener('ide-theme-change', handler)
    return () => window.removeEventListener('ide-theme-change', handler)
  }, [])

  // Register Monaco globally and apply saved/default theme on first mount
  const handleEditorMount = useCallback((_editor: any, monaco: Monaco) => {
    monacoRef.current = monaco
    registerMonaco(monaco)

    const saved = getSavedThemeInfo()
    if (!saved) {
      import('../themes/default-theme').then(({ default: defaultTheme }) => {
        applyFullTheme(defaultTheme, 'vs-dark', monaco)
        setMonacoTheme(getCurrentThemeId() || 'vs-dark')
      })
      return
    }
    window.electronAPI.extensions.loadTheme(saved.themePath).then((themeData: any) => {
      if (!themeData) return
      applyFullTheme(themeData, saved.uiTheme, monaco, saved)
      setMonacoTheme(getCurrentThemeId() || 'vs-dark')
    }).catch(() => { /* ignore bad saved theme */ })
  }, [])

  const setTabs = useCallback(
    (newTabs: TabInfo[], newActiveTab?: number) => {
      updatePanel(panel.id, {
        componentState: {
          ...panel.componentState,
          tabs: newTabs,
          activeTab: newActiveTab ?? activeTab,
        },
      })
    },
    [panel.id, panel.componentState, activeTab, updatePanel],
  )

  const openFile = useCallback(
    async (filePath: string) => {
      const existing = tabs.findIndex((t) => t.filePath === filePath)
      if (existing >= 0) {
        setTabs(tabs, existing)
        return
      }

      try {
        const content = await window.electronAPI.fs.readFile(filePath)
        const name = filePath.split(/[\\/]/).pop() || filePath
        const newTabs = [...tabs, { filePath, name, content, dirty: false }]
        setTabs(newTabs, newTabs.length - 1)
      } catch (err) {
        log.error('open_file_failed', err instanceof Error ? err.message : String(err))
      }
    },
    [tabs, setTabs],
  )

  // Expose openFile on the panel for other panels to call
  useEffect(() => {
    ;(window as any).__editorPanels = (window as any).__editorPanels || {}
    ;(window as any).__editorPanels[panel.id] = { openFile }
    return () => {
      delete (window as any).__editorPanels?.[panel.id]
    }
  }, [panel.id, openFile])

  const saveFile = useCallback(async () => {
    const tab = tabs[activeTab]
    if (!tab) return
    try {
      await window.electronAPI.fs.writeFile(tab.filePath, tab.content)
      const newTabs = tabs.map((t, i) =>
        i === activeTab ? { ...t, dirty: false } : t,
      )
      setTabs(newTabs)
    } catch (err) {
      log.error('save_file_failed', err instanceof Error ? err.message : String(err))
    }
  }, [tabs, activeTab, setTabs])

  const closeTab = useCallback(
    (idx: number) => {
      const newTabs = tabs.filter((_, i) => i !== idx)
      const newActive = idx >= newTabs.length ? newTabs.length - 1 : idx
      setTabs(newTabs, Math.max(0, newActive))
    },
    [tabs, setTabs],
  )

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        e.stopPropagation()
        saveFile()
      }
    }
    window.addEventListener('keydown', handler, true)
    return () => window.removeEventListener('keydown', handler, true)
  }, [saveFile])

  const currentTab = tabs[activeTab]

  const getLanguage = (name: string) => {
    const ext = name.split('.').pop()?.toLowerCase()
    const map: Record<string, string> = {
      ts: 'typescript',
      tsx: 'typescript',
      js: 'javascript',
      jsx: 'javascript',
      json: 'json',
      html: 'html',
      css: 'css',
      md: 'markdown',
      py: 'python',
      rs: 'rust',
      go: 'go',
      yaml: 'yaml',
      yml: 'yaml',
      toml: 'toml',
      sh: 'shell',
      bash: 'shell',
    }
    return map[ext || ''] || 'plaintext'
  }

  return (
    <div className="editor-panel">
      {tabs.length > 0 && (
        <div className="editor-panel__tabs">
          {tabs.map((tab, idx) => (
            <div
              key={tab.filePath}
              className={`editor-panel__tab ${idx === activeTab ? 'editor-panel__tab--active' : ''}`}
              onClick={() => setTabs(tabs, idx)}
            >
              <span className="editor-panel__tab-name">
                {tab.dirty && <span className="editor-panel__tab-dot" />}
                {tab.name}
              </span>
              <button
                type="button"
                className="editor-panel__tab-close"
                title="Close tab"
                aria-label="Close tab"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(idx)
                }}
              >
                <IconClose size="xs" />
              </button>
            </div>
          ))}
        </div>
      )}
      {currentTab ? (
        <Editor
          height="100%"
          path={currentTab.filePath}
          language={getLanguage(currentTab.name)}
          value={currentTab.content}
          theme={monacoTheme}
          beforeMount={configureMonacoTypeScript}
          onMount={handleEditorMount}
          onChange={(value) => {
            const newTabs = tabs.map((t, i) =>
              i === activeTab ? { ...t, content: value || '', dirty: true } : t,
            )
            setTabs(newTabs)
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            wordWrap: 'on',
            automaticLayout: true,
            scrollBeyondLastLine: false,
            padding: { top: 8 },
          }}
        />
      ) : (
        <div className="editor-panel__empty">
          <p>No file open</p>
          <p className="editor-panel__empty-hint">
            Open a file from the File Explorer
          </p>
        </div>
      )}
    </div>
  )
}

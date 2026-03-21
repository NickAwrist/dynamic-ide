import { useCallback, useEffect, useState, useRef } from 'react'
import Editor, { type Monaco } from '@monaco-editor/react'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'
import { convertToMonacoTheme, applyCSSVariables } from '../utils/theme-engine'

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

  // Listen for theme changes dispatched from the ExtensionPanel
  useEffect(() => {
    const handler = (e: Event) => {
      const { theme, themeData } = (e as CustomEvent).detail
      if (!monacoRef.current || !themeData) return
      const converted = convertToMonacoTheme(themeData, theme.uiTheme)
      const id = `ext-${theme.extensionId}-${theme.label}`.replace(/[^a-zA-Z0-9-]/g, '-')
      monacoRef.current.editor.defineTheme(id, converted)
      monacoRef.current.editor.setTheme(id)
      setMonacoTheme(id)
      applyCSSVariables(themeData)
    }
    window.addEventListener('ide-theme-change', handler)
    return () => window.removeEventListener('ide-theme-change', handler)
  }, [])

  // Apply saved theme on first Monaco mount
  const handleEditorMount = useCallback((_editor: any, monaco: Monaco) => {
    monacoRef.current = monaco
    const raw = localStorage.getItem('dynamic-ide-theme')
    if (!raw) return
    try {
      const saved = JSON.parse(raw)
      window.electronAPI.extensions.loadTheme(saved.themePath).then((themeData: any) => {
        if (!themeData) return
        const converted = convertToMonacoTheme(themeData, saved.uiTheme)
        const id = `ext-${saved.extensionId}-${saved.label}`.replace(/[^a-zA-Z0-9-]/g, '-')
        monaco.editor.defineTheme(id, converted)
        monaco.editor.setTheme(id)
        setMonacoTheme(id)
        applyCSSVariables(themeData)
      })
    } catch { /* ignore bad saved theme */ }
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
        console.error('Failed to open file:', err)
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
      console.error('Failed to save file:', err)
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
        saveFile()
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
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
                className="editor-panel__tab-close"
                onClick={(e) => {
                  e.stopPropagation()
                  closeTab(idx)
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
      {currentTab ? (
        <Editor
          height="100%"
          language={getLanguage(currentTab.name)}
          value={currentTab.content}
          theme={monacoTheme}
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

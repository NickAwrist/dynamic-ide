import { useCallback, useEffect, useRef, useState, type MouseEvent } from 'react'
import { Codicon } from '../../components/codicon/Codicon'
import { PanelState, WorkspaceState, useIDEStore } from '../../stores/workspace.store'
import { FileContextMenu } from './FileContextMenu'
import { FileTree } from './FileTree'
import type { ContextAction, ContextMenu, InlineInputState, TreeNode } from './fileTreeTypes'
import { getPathSep, reconcileTree, updateTreeAt } from './fileTreeUtils'
import { createUiLogger, Scopes } from '../../lib/logger'

const log = createUiLogger(Scopes.uiPanelExplorer)

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

export function FileExplorerPanel({ panel, workspace }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [inlineInput, setInlineInput] = useState<InlineInputState | null>(null)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)
  const treeRef = useRef<TreeNode[]>([])
  treeRef.current = tree

  const loadDir = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.electronAPI.fs.readDir(dirPath)
      return entries.map((e: { name: string; path: string; isDirectory: boolean }) => ({
        ...e,
        expanded: false,
      }))
    } catch {
      return []
    }
  }, [])

  const refreshRoot = useCallback(async () => {
    const next = await reconcileTree(treeRef.current, workspace.rootPath, loadDir)
    setTree(next)
    setLoading(false)
  }, [workspace.rootPath, loadDir])

  useEffect(() => {
    refreshRoot()
  }, [refreshRoot])

  useEffect(() => {
    window.electronAPI.fs.watch(workspace.rootPath)

    let debounce: ReturnType<typeof setTimeout> | null = null
    const cleanup = window.electronAPI.fs.onChanged(() => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => refreshRoot(), 300)
    })

    return () => {
      cleanup()
      window.electronAPI.fs.unwatch(workspace.rootPath)
    }
  }, [workspace.rootPath, refreshRoot])

  useEffect(() => {
    const handler = () => {
      if (contextMenu) setContextMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  useEffect(() => {
    if (inlineInput && inputRef.current) {
      inputRef.current.focus()
      if (inlineInput.action === 'rename' && inlineInput.existingName) {
        const dotIdx = inlineInput.existingName.lastIndexOf('.')
        if (dotIdx > 0) {
          inputRef.current.setSelectionRange(0, dotIdx)
        } else {
          inputRef.current.select()
        }
      }
    }
  }, [inlineInput])

  const toggleDir = useCallback(
    async (node: TreeNode, path: number[]) => {
      if (!node.expanded && !node.children) {
        const children = await loadDir(node.path)
        setTree((prev) => updateTreeAt(prev, path, (n) => ({ ...n, expanded: true, children })))
      } else {
        setTree((prev) => updateTreeAt(prev, path, (n) => ({ ...n, expanded: !n.expanded })))
      }
    },
    [loadDir],
  )

  const openFileInEditor = useCallback((filePath: string) => {
    const editorPanels = (window as unknown as { __editorPanels?: Record<string, { openFile: (p: string) => void }> })
      .__editorPanels
    if (editorPanels) {
      const firstEditor = Object.values(editorPanels)[0]
      if (firstEditor) {
        firstEditor.openFile(filePath)
        return
      }
    }
    const store = useIDEStore.getState()
    store.addPanel('editor')
    setTimeout(() => {
      const panels = (window as unknown as { __editorPanels?: Record<string, { openFile: (p: string) => void }> })
        .__editorPanels
      if (panels) {
        const editor = Object.values(panels)[0]
        editor?.openFile(filePath)
      }
    }, 200)
  }, [])

  const handleContextMenu = useCallback(
    (e: MouseEvent, node: TreeNode | null, parentPath: string) => {
      e.preventDefault()
      e.stopPropagation()
      const panelRect = panelRef.current?.getBoundingClientRect()
      setContextMenu({
        x: e.clientX - (panelRect?.left || 0),
        y: e.clientY - (panelRect?.top || 0),
        node,
        parentPath,
      })
    },
    [],
  )

  const handleDelete = useCallback(async (node: TreeNode) => {
    const confirmed = confirm(
      `Delete "${node.name}"${node.isDirectory ? ' and all its contents' : ''}?`,
    )
    if (!confirmed) return
    try {
      await window.electronAPI.fs.deletePath(node.path)
    } catch (err) {
      console.error('Delete failed:', err)
    }
  }, [])

  const handleContextAction = useCallback(
    (action: ContextAction) => {
      if (!contextMenu) return
      const { node, parentPath } = contextMenu
      setContextMenu(null)

      if (action === 'newFile' || action === 'newFolder') {
        const targetDir = node?.isDirectory ? node.path : parentPath
        setInlineInput({ action, parentPath: targetDir, depth: 0 })
        setInputValue('')
      } else if (action === 'rename' && node) {
        setInlineInput({
          action: 'rename',
          parentPath,
          existingName: node.name,
          existingPath: node.path,
          depth: 0,
        })
        setInputValue(node.name)
      } else if (action === 'delete' && node) {
        void handleDelete(node)
      }
    },
    [contextMenu, handleDelete],
  )

  const commitInlineInput = useCallback(async () => {
    if (!inlineInput || !inputValue.trim()) {
      setInlineInput(null)
      return
    }

    const name = inputValue.trim()

    try {
      if (inlineInput.action === 'newFile') {
        const fullPath = `${inlineInput.parentPath}${getPathSep()}${name}`
        await window.electronAPI.fs.createFile(fullPath)
      } else if (inlineInput.action === 'newFolder') {
        const fullPath = `${inlineInput.parentPath}${getPathSep()}${name}`
        await window.electronAPI.fs.createDir(fullPath)
      } else if (inlineInput.action === 'rename' && inlineInput.existingPath) {
        const dir = inlineInput.existingPath.substring(0, inlineInput.existingPath.lastIndexOf(getPathSep()))
        const newPath = `${dir}${getPathSep()}${name}`
        await window.electronAPI.fs.renamePath(inlineInput.existingPath, newPath)
      }
    } catch (err) {
      log.error('file_operation_failed', err instanceof Error ? err.message : String(err))
    }

    setInlineInput(null)
    setInputValue('')
  }, [inlineInput, inputValue])

  if (loading) {
    return <div className="file-explorer-panel__loading">Loading...</div>
  }

  return (
    <div
      className="file-explorer-panel"
      ref={panelRef}
      onContextMenu={(e) => handleContextMenu(e, null, workspace.rootPath)}
    >
      <div className="file-explorer-panel__header">
        <div className="file-explorer-panel__title-block" title={workspace.rootPath}>
          <span className="file-explorer-panel__label">Explorer</span>
          <span className="file-explorer-panel__root">{workspace.rootPath.split(/[\\/]/).pop()}</span>
        </div>
        <div className="file-explorer-panel__actions">
          <button
            type="button"
            className="file-explorer-panel__action-btn"
            title="New File"
            onClick={() => {
              setInlineInput({ action: 'newFile', parentPath: workspace.rootPath, depth: 0 })
              setInputValue('')
            }}
          >
            <Codicon name="new-file" />
          </button>
          <button
            type="button"
            className="file-explorer-panel__action-btn"
            title="New Folder"
            onClick={() => {
              setInlineInput({ action: 'newFolder', parentPath: workspace.rootPath, depth: 0 })
              setInputValue('')
            }}
          >
            <Codicon name="new-folder" />
          </button>
          <button type="button" className="file-explorer-panel__action-btn" title="Refresh" onClick={refreshRoot}>
            <Codicon name="refresh" />
          </button>
        </div>
      </div>
      <FileTree
        tree={tree}
        workspaceRootPath={workspace.rootPath}
        inlineInput={inlineInput}
        inputValue={inputValue}
        inputRef={inputRef}
        setInputValue={setInputValue}
        setInlineInput={setInlineInput}
        commitInlineInput={commitInlineInput}
        toggleDir={toggleDir}
        openFileInEditor={openFileInEditor}
        handleContextMenu={handleContextMenu}
      />

      {contextMenu && (
        <FileContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          hasNode={!!contextMenu.node}
          onAction={handleContextAction}
        />
      )}
    </div>
  )
}

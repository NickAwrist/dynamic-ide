import { useCallback, useEffect, useRef, useState } from 'react'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'

interface DirEntry {
  name: string
  path: string
  isDirectory: boolean
}

interface TreeNode extends DirEntry {
  children?: TreeNode[]
  expanded?: boolean
}

interface Props {
  panel: PanelState
  workspace: WorkspaceState
}

type ContextAction = 'newFile' | 'newFolder' | 'rename' | 'delete'

interface ContextMenu {
  x: number
  y: number
  node: TreeNode | null
  parentPath: string
}

export function FileExplorerPanel({ panel, workspace }: Props) {
  const [tree, setTree] = useState<TreeNode[]>([])
  const [loading, setLoading] = useState(true)
  const [contextMenu, setContextMenu] = useState<ContextMenu | null>(null)
  const [inlineInput, setInlineInput] = useState<{
    action: 'newFile' | 'newFolder' | 'rename'
    parentPath: string
    existingName?: string
    existingPath?: string
    depth: number
    afterIndex?: number
  } | null>(null)
  const [inputValue, setInputValue] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const loadDir = useCallback(async (dirPath: string): Promise<TreeNode[]> => {
    try {
      const entries = await window.electronAPI.fs.readDir(dirPath)
      return entries.map((e: DirEntry) => ({
        ...e,
        expanded: false,
      }))
    } catch {
      return []
    }
  }, [])

  const refreshRoot = useCallback(async () => {
    const entries = await loadDir(workspace.rootPath)
    setTree(entries)
    setLoading(false)
  }, [workspace.rootPath, loadDir])

  // Initial load
  useEffect(() => {
    refreshRoot()
  }, [refreshRoot])

  // Watch for filesystem changes and auto-refresh
  useEffect(() => {
    window.electronAPI.fs.watch(workspace.rootPath)

    let debounce: ReturnType<typeof setTimeout> | null = null
    const cleanup = window.electronAPI.fs.onChanged((dirPath) => {
      if (debounce) clearTimeout(debounce)
      debounce = setTimeout(() => refreshRoot(), 300)
    })

    return () => {
      cleanup()
      window.electronAPI.fs.unwatch(workspace.rootPath)
    }
  }, [workspace.rootPath, refreshRoot])

  // Close context menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (contextMenu) setContextMenu(null)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [contextMenu])

  // Focus inline input when it appears
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
    const editorPanels = (window as any).__editorPanels
    if (editorPanels) {
      const firstEditor = Object.values(editorPanels)[0] as any
      if (firstEditor) {
        firstEditor.openFile(filePath)
        return
      }
    }
    const store = useIDEStore.getState()
    store.addPanel('editor')
    setTimeout(() => {
      const panels = (window as any).__editorPanels
      if (panels) {
        const editor = Object.values(panels)[0] as any
        editor?.openFile(filePath)
      }
    }, 200)
  }, [])

  const handleContextMenu = useCallback(
    (e: React.MouseEvent, node: TreeNode | null, parentPath: string) => {
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
          parentPath: parentPath,
          existingName: node.name,
          existingPath: node.path,
          depth: 0,
        })
        setInputValue(node.name)
      } else if (action === 'delete' && node) {
        handleDelete(node)
      }
    },
    [contextMenu],
  )

  const handleDelete = useCallback(
    async (node: TreeNode) => {
      const confirmed = confirm(`Delete "${node.name}"${node.isDirectory ? ' and all its contents' : ''}?`)
      if (!confirmed) return
      try {
        await window.electronAPI.fs.deletePath(node.path)
      } catch (err) {
        console.error('Delete failed:', err)
      }
    },
    [],
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
      console.error('File operation failed:', err)
    }

    setInlineInput(null)
    setInputValue('')
  }, [inlineInput, inputValue])

  const renderInlineInput = (depth: number) => (
    <div className="file-node file-node--input" style={{ paddingLeft: depth * 16 + 8 }}>
      <span className="file-node__icon">
        {inlineInput?.action === 'newFolder' ? '+' : ' '}
      </span>
      <input
        ref={inputRef}
        className="file-node__inline-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commitInlineInput()
          if (e.key === 'Escape') { setInlineInput(null); setInputValue('') }
        }}
        onBlur={commitInlineInput}
      />
    </div>
  )

  const renderNode = (node: TreeNode, path: number[], depth: number) => {
    const isRenaming = inlineInput?.action === 'rename' && inlineInput.existingPath === node.path

    return (
      <div key={node.path}>
        {isRenaming ? (
          <div className="file-node file-node--input" style={{ paddingLeft: depth * 16 + 8 }}>
            <span className="file-node__icon">
              {node.isDirectory ? (node.expanded ? '\u25BE' : '\u25B8') : ' '}
            </span>
            <input
              ref={inputRef}
              className="file-node__inline-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') commitInlineInput()
                if (e.key === 'Escape') { setInlineInput(null); setInputValue('') }
              }}
              onBlur={commitInlineInput}
            />
          </div>
        ) : (
          <div
            className={`file-node ${node.isDirectory ? 'file-node--dir' : 'file-node--file'}`}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={() => {
              if (node.isDirectory) toggleDir(node, path)
              else openFileInEditor(node.path)
            }}
            onContextMenu={(e) => {
              const parentDir = node.path.substring(0, node.path.lastIndexOf(getPathSep()))
              handleContextMenu(e, node, parentDir)
            }}
          >
            <span className="file-node__icon">
              {node.isDirectory ? (node.expanded ? '\u25BE' : '\u25B8') : ' '}
            </span>
            <span className="file-node__name">{node.name}</span>
          </div>
        )}
        {node.isDirectory && node.expanded && (
          <div>
            {/* Show inline input at top of this directory if creating inside it */}
            {inlineInput &&
              (inlineInput.action === 'newFile' || inlineInput.action === 'newFolder') &&
              inlineInput.parentPath === node.path &&
              renderInlineInput(depth + 1)}
            {node.children?.map((child, i) =>
              renderNode(child, [...path, i], depth + 1),
            )}
          </div>
        )}
      </div>
    )
  }

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
        <span className="file-explorer-panel__root">
          {workspace.rootPath.split(/[\\/]/).pop()}
        </span>
        <div className="file-explorer-panel__actions">
          <button
            className="file-explorer-panel__action-btn"
            title="New File"
            onClick={() => {
              setInlineInput({ action: 'newFile', parentPath: workspace.rootPath, depth: 0 })
              setInputValue('')
            }}
          >
            +
          </button>
          <button
            className="file-explorer-panel__action-btn"
            title="New Folder"
            onClick={() => {
              setInlineInput({ action: 'newFolder', parentPath: workspace.rootPath, depth: 0 })
              setInputValue('')
            }}
          >
            +&#x1F4C1;
          </button>
          <button
            className="file-explorer-panel__action-btn"
            title="Refresh"
            onClick={refreshRoot}
          >
            &#x21BB;
          </button>
        </div>
      </div>
      <div className="file-explorer-panel__tree">
        {/* Inline input at root level */}
        {inlineInput &&
          (inlineInput.action === 'newFile' || inlineInput.action === 'newFolder') &&
          inlineInput.parentPath === workspace.rootPath &&
          renderInlineInput(0)}
        {tree.length === 0 && !inlineInput ? (
          <div className="file-explorer-panel__empty">Empty directory</div>
        ) : (
          tree.map((node, i) => renderNode(node, [i], 0))
        )}
      </div>

      {/* Context menu */}
      {contextMenu && (
        <div
          className="file-context-menu"
          style={{ left: contextMenu.x, top: contextMenu.y }}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button className="file-context-menu__item" onClick={() => handleContextAction('newFile')}>
            New File
          </button>
          <button className="file-context-menu__item" onClick={() => handleContextAction('newFolder')}>
            New Folder
          </button>
          {contextMenu.node && (
            <>
              <div className="file-context-menu__divider" />
              <button className="file-context-menu__item" onClick={() => handleContextAction('rename')}>
                Rename
              </button>
              <button className="file-context-menu__item file-context-menu__item--danger" onClick={() => handleContextAction('delete')}>
                Delete
              </button>
            </>
          )}
        </div>
      )}
    </div>
  )
}

function getPathSep() {
  return navigator.platform.startsWith('Win') ? '\\' : '/'
}

function updateTreeAt(
  nodes: TreeNode[],
  indices: number[],
  updater: (node: TreeNode) => TreeNode,
): TreeNode[] {
  return nodes.map((n, i) => {
    if (i !== indices[0]) return n
    if (indices.length === 1) return updater(n)
    return {
      ...n,
      children: n.children ? updateTreeAt(n.children, indices.slice(1), updater) : n.children,
    }
  })
}

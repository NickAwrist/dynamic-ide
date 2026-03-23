import type { MouseEvent, ReactNode, RefObject } from 'react'
import { Codicon } from '../../components/codicon/Codicon'
import type { InlineInputState, TreeNode } from './fileTreeTypes'
import { fileIconForFileName } from './fileExplorerIcons'
import { getPathSep } from './fileTreeUtils'

interface FileTreeProps {
  tree: TreeNode[]
  workspaceRootPath: string
  inlineInput: InlineInputState | null
  inputValue: string
  inputRef: RefObject<HTMLInputElement | null>
  setInputValue: (v: string) => void
  setInlineInput: (v: InlineInputState | null) => void
  commitInlineInput: () => void
  toggleDir: (node: TreeNode, path: number[]) => Promise<void>
  openFileInEditor: (filePath: string) => void
  handleContextMenu: (e: MouseEvent, node: TreeNode | null, parentPath: string) => void
}

export function FileTree({
  tree,
  workspaceRootPath,
  inlineInput,
  inputValue,
  inputRef,
  setInputValue,
  setInlineInput,
  commitInlineInput,
  toggleDir,
  openFileInEditor,
  handleContextMenu,
}: FileTreeProps) {
  const rootInlineNew =
    inlineInput &&
    (inlineInput.action === 'newFile' || inlineInput.action === 'newFolder') &&
    inlineInput.parentPath === workspaceRootPath

  const renderInlineInput = (depth: number) => (
    <div className="file-node file-node--input" style={{ paddingLeft: depth * 16 + 8 }}>
      <span className="file-node__twisty file-node__twisty--blank" aria-hidden />
      <Codicon
        name={inlineInput?.action === 'newFolder' ? 'new-folder' : 'new-file'}
        className="file-node__kind-icon file-node__kind-icon--input"
      />
      <input
        ref={inputRef as RefObject<HTMLInputElement>}
        className="file-node__inline-input"
        value={inputValue}
        onChange={(e) => setInputValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void commitInlineInput()
          if (e.key === 'Escape') {
            setInlineInput(null)
            setInputValue('')
          }
        }}
        onBlur={() => void commitInlineInput()}
      />
    </div>
  )

  const renderNode = (node: TreeNode, path: number[], depth: number): ReactNode => {
    const isRenaming = inlineInput?.action === 'rename' && inlineInput.existingPath === node.path

    return (
      <div key={node.path}>
        {isRenaming ? (
          <div className="file-node file-node--input" style={{ paddingLeft: depth * 16 + 8 }}>
            {node.isDirectory ? (
              <Codicon
                name={node.expanded ? 'chevron-down' : 'chevron-right'}
                className="file-node__twisty"
              />
            ) : (
              <span className="file-node__twisty file-node__twisty--blank" aria-hidden />
            )}
            <Codicon
              name={
                node.isDirectory
                  ? node.expanded
                    ? 'folder-opened'
                    : 'folder'
                  : fileIconForFileName(node.name)
              }
              className={`file-node__kind-icon ${node.isDirectory ? 'file-node__kind-icon--dir' : ''}`}
            />
            <input
              ref={inputRef as RefObject<HTMLInputElement>}
              className="file-node__inline-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void commitInlineInput()
                if (e.key === 'Escape') {
                  setInlineInput(null)
                  setInputValue('')
                }
              }}
              onBlur={() => void commitInlineInput()}
            />
          </div>
        ) : (
          <div
            className={`file-node ${node.isDirectory ? 'file-node--dir' : 'file-node--file'}`}
            style={{ paddingLeft: depth * 16 + 8 }}
            onClick={() => {
              if (node.isDirectory) void toggleDir(node, path)
              else openFileInEditor(node.path)
            }}
            onContextMenu={(e) => {
              const parentDir = node.path.substring(0, node.path.lastIndexOf(getPathSep()))
              handleContextMenu(e, node, parentDir)
            }}
          >
            {node.isDirectory ? (
              <Codicon
                name={node.expanded ? 'chevron-down' : 'chevron-right'}
                className="file-node__twisty"
              />
            ) : (
              <span className="file-node__twisty file-node__twisty--blank" aria-hidden />
            )}
            <Codicon
              name={
                node.isDirectory
                  ? node.expanded
                    ? 'folder-opened'
                    : 'folder'
                  : fileIconForFileName(node.name)
              }
              className={`file-node__kind-icon ${node.isDirectory ? 'file-node__kind-icon--dir' : ''}`}
            />
            <span className="file-node__name">{node.name}</span>
          </div>
        )}
        {node.isDirectory && node.expanded && (
          <div>
            {inlineInput &&
              (inlineInput.action === 'newFile' || inlineInput.action === 'newFolder') &&
              inlineInput.parentPath === node.path &&
              renderInlineInput(depth + 1)}
            {node.children?.map((child, i) => renderNode(child, [...path, i], depth + 1))}
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="file-explorer-panel__tree">
      {rootInlineNew && renderInlineInput(0)}
      {tree.length === 0 && !rootInlineNew ? (
        <div className="file-explorer-panel__empty">
          <p className="file-explorer-panel__empty-title">Nothing here yet</p>
          <p className="file-explorer-panel__empty-hint">Right-click to add files or folders</p>
        </div>
      ) : (
        tree.map((node, i) => renderNode(node, [i], 0))
      )}
    </div>
  )
}

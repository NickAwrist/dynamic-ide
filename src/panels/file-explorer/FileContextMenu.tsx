import { Codicon } from '../../components/codicon/Codicon'
import type { ContextAction } from './fileTreeTypes'

interface Props {
  x: number
  y: number
  hasNode: boolean
  onAction: (action: ContextAction) => void
}

export function FileContextMenu({ x, y, hasNode, onAction }: Props) {
  return (
    <div
      className="file-context-menu"
      style={{ left: x, top: y }}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button type="button" className="file-context-menu__item" onClick={() => onAction('newFile')}>
        <Codicon name="new-file" className="file-context-menu__icon" />
        <span>New File</span>
      </button>
      <button type="button" className="file-context-menu__item" onClick={() => onAction('newFolder')}>
        <Codicon name="new-folder" className="file-context-menu__icon" />
        <span>New Folder</span>
      </button>
      {hasNode && (
        <>
          <div className="file-context-menu__divider" />
          <button type="button" className="file-context-menu__item" onClick={() => onAction('rename')}>
            <Codicon name="edit" className="file-context-menu__icon" />
            <span>Rename</span>
          </button>
          <button
            type="button"
            className="file-context-menu__item file-context-menu__item--danger"
            onClick={() => onAction('delete')}
          >
            <Codicon name="trash" className="file-context-menu__icon" />
            <span>Delete</span>
          </button>
        </>
      )}
    </div>
  )
}

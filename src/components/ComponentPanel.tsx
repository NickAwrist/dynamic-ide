import { useCallback, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'
import { EditorPanel } from '../panels/EditorPanel'
import { TerminalPanel } from '../panels/TerminalPanel'
import { FileExplorerPanel } from '../panels/FileExplorerPanel'
import { GitPanel } from '../panels/GitPanel'
import { BrowserPanel } from '../panels/BrowserPanel'
import { ExtensionViewPanel } from '../panels/ExtensionViewPanel'
import { snapPosition, snapResize, SnapGuide, Rect } from '../utils/snap'

const PANEL_TITLES: Record<string, string> = {
  editor: 'Code Editor',
  terminal: 'Terminal',
  'file-explorer': 'File Explorer',
  git: 'Git',
  browser: 'Browser',
  'extension-view': 'Extension View',
}

interface Props {
  panel: PanelState
  workspace: WorkspaceState
  canvasSize: { width: number; height: number }
  onShowGuides: (guides: SnapGuide[]) => void
  onClearGuides: () => void
}

export function ComponentPanel({ panel, workspace, canvasSize, onShowGuides, onClearGuides }: Props) {
  const updatePanel = useIDEStore((s) => s.updatePanel)
  const removePanel = useIDEStore((s) => s.removePanel)
  const bringToFront = useIDEStore((s) => s.bringToFront)
  const allPanels = useIDEStore((s) => {
    const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
    return ws?.panels || []
  })
  const rndRef = useRef<Rnd>(null)

  const getOtherRects = useCallback((): Rect[] => {
    return allPanels
      .filter((p) => p.id !== panel.id)
      .map((p) => ({ id: p.id, x: p.x, y: p.y, width: p.width, height: p.height }))
  }, [allPanels, panel.id])

  const onMouseDown = useCallback(() => {
    bringToFront(panel.id)
  }, [panel.id, bringToFront])

  const renderContent = () => {
    switch (panel.type) {
      case 'editor':
        return <EditorPanel panel={panel} workspace={workspace} />
      case 'terminal':
        return <TerminalPanel panel={panel} workspace={workspace} />
      case 'file-explorer':
        return <FileExplorerPanel panel={panel} workspace={workspace} />
      case 'git':
        return <GitPanel panel={panel} workspace={workspace} />
      case 'browser':
        return <BrowserPanel panel={panel} workspace={workspace} />
      case 'extension-view':
        return <ExtensionViewPanel panel={{
          id: panel.id,
          type: panel.type,
          viewId: panel.componentState?.viewId,
          title: panel.componentState?.title,
        }} />
      default:
        return <div className="panel__placeholder">Unknown panel type</div>
    }
  }

  return (
    <Rnd
      ref={rndRef}
      default={{
        x: panel.x,
        y: panel.y,
        width: panel.width,
        height: panel.height,
      }}
      style={{ zIndex: panel.zIndex }}
      minWidth={200}
      minHeight={150}
      bounds="parent"
      dragHandleClassName="panel__titlebar"
      onMouseDown={onMouseDown}
      onDrag={(_e, d) => {
        const result = snapPosition(
          { id: panel.id, x: d.x, y: d.y, width: panel.width, height: panel.height },
          getOtherRects(),
          canvasSize.width,
          canvasSize.height,
        )
        onShowGuides(result.guides)
      }}
      onDragStop={(_e, d) => {
        const result = snapPosition(
          { id: panel.id, x: d.x, y: d.y, width: panel.width, height: panel.height },
          getOtherRects(),
          canvasSize.width,
          canvasSize.height,
        )
        onClearGuides()
        updatePanel(panel.id, { x: result.x, y: result.y })
        // Update the Rnd position to match the snapped position
        rndRef.current?.updatePosition({ x: result.x, y: result.y })
      }}
      onResize={(_e, dir, ref, _delta, position) => {
        const w = parseInt(ref.style.width)
        const h = parseInt(ref.style.height)
        const result = snapResize(
          { id: panel.id, x: panel.x, y: panel.y, width: panel.width, height: panel.height },
          dir,
          position.x,
          position.y,
          w,
          h,
          getOtherRects(),
          canvasSize.width,
          canvasSize.height,
        )
        onShowGuides(result.guides)
      }}
      onResizeStop={(_e, dir, ref, _delta, position) => {
        const w = parseInt(ref.style.width)
        const h = parseInt(ref.style.height)
        const result = snapResize(
          { id: panel.id, x: panel.x, y: panel.y, width: panel.width, height: panel.height },
          dir,
          position.x,
          position.y,
          w,
          h,
          getOtherRects(),
          canvasSize.width,
          canvasSize.height,
        )
        onClearGuides()
        updatePanel(panel.id, {
          width: result.width,
          height: result.height,
          x: result.x,
          y: result.y,
        })
        rndRef.current?.updateSize({ width: result.width, height: result.height })
        rndRef.current?.updatePosition({ x: result.x, y: result.y })
      }}
    >
      <div className="panel" onMouseDown={onMouseDown}>
        <div className="panel__titlebar">
          <span className="panel__title">
            {panel.type === 'extension-view' && panel.componentState?.title
              ? panel.componentState.title
              : PANEL_TITLES[panel.type]}
          </span>
          <button
            className="panel__close"
            onClick={(e) => {
              e.stopPropagation()
              removePanel(panel.id)
            }}
            title="Close panel"
          >
            ×
          </button>
        </div>
        <div className="panel__content">{renderContent()}</div>
      </div>
    </Rnd>
  )
}

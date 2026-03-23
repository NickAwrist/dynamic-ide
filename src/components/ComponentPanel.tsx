import { useCallback, useRef } from 'react'
import { Rnd } from 'react-rnd'
import { PanelState, WorkspaceState, useIDEStore } from '../stores/workspace.store'
import { EditorPanel } from '../panels/EditorPanel'
import { TerminalPanel } from '../panels/TerminalPanel'
import { FileExplorerPanel } from '../panels/FileExplorerPanel'
import { GitPanel } from '../panels/GitPanel'
import { BrowserPanel } from '../panels/BrowserPanel'
import { ExtensionPanel } from '../panels/ExtensionPanel'
import { T3CodePanel } from '../panels/T3CodePanel'
import { snapPosition, snapResize, SnapGuide, Rect } from '../utils/snap'
import { IconClose } from './ui/ChromeIcons'

const PANEL_TITLES: Record<string, string> = {
  editor: 'Code Editor',
  terminal: 'Terminal',
  'file-explorer': 'File Explorer',
  git: 'Git',
  browser: 'Browser',
  'extension-panel': 'Extension Panel',
  't3-code': 'T3 Code',
}

interface Props {
  panel: PanelState
  workspace: WorkspaceState
  canvasSize: { width: number; height: number }
  onShowGuides: (guides: SnapGuide[]) => void
  onClearGuides: () => void
  /** Terminal / browser / t3-code: single React tree; toggle visibility per active workspace. */
  keepAliveSlot?: boolean
  keepAliveHidden?: boolean
}

export function ComponentPanel({
  panel,
  workspace,
  canvasSize,
  onShowGuides,
  onClearGuides,
  keepAliveSlot = false,
  keepAliveHidden = false,
}: Props) {
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
    if (keepAliveSlot && keepAliveHidden) return
    bringToFront(panel.id)
  }, [panel.id, bringToFront, keepAliveSlot, keepAliveHidden])

  const isHiddenKeepAlive = keepAliveSlot && keepAliveHidden

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
      case 'extension-panel':
        return <ExtensionPanel panel={{
          id: panel.id,
          type: panel.type,
          viewId: panel.componentState?.viewId,
          title: panel.componentState?.title,
        }} />
      case 't3-code':
        return <T3CodePanel panel={panel} workspace={workspace} />
      default:
        return <div className="panel__placeholder">Unknown panel type</div>
    }
  }

  const innerPanel = (
    <div className="panel" onMouseDown={isHiddenKeepAlive ? undefined : onMouseDown}>
      <div className="panel__titlebar">
        <span className="panel__title">
          {panel.type === 'extension-panel' && panel.componentState?.title
            ? panel.componentState.title
            : PANEL_TITLES[panel.type]}
        </span>
        {panel.type === 't3-code' && (
          <button
            className="panel__close"
            onClick={(e) => {
              e.stopPropagation()
              window.dispatchEvent(new CustomEvent('reload-t3-panel', { detail: { id: panel.id } }))
            }}
            title="Reload T3 Code"
          >
            ↻
          </button>
        )}
        <button
          className="panel__close"
          onClick={(e) => {
            e.stopPropagation()
            removePanel(panel.id)
          }}
          title="Close panel"
          aria-label="Close panel"
        >
          <IconClose size="sm" />
        </button>
      </div>
      <div className="panel__content">{renderContent()}</div>
    </div>
  )

  return (
    <Rnd
      ref={rndRef}
      {...(keepAliveSlot
        ? {
            position: { x: isHiddenKeepAlive ? 0 : panel.x, y: isHiddenKeepAlive ? 0 : panel.y },
            size: { width: panel.width, height: panel.height },
          }
        : {
            default: {
              x: panel.x,
              y: panel.y,
              width: panel.width,
              height: panel.height,
            },
          })}
      style={{
        zIndex: isHiddenKeepAlive ? 0 : panel.zIndex,
        visibility: isHiddenKeepAlive ? 'hidden' : 'visible',
        pointerEvents: isHiddenKeepAlive ? 'none' : 'auto',
      }}
      minWidth={200}
      minHeight={150}
      bounds="parent"
      dragHandleClassName="panel__titlebar"
      disableDragging={keepAliveSlot ? keepAliveHidden : false}
      enableResizing={keepAliveSlot ? !keepAliveHidden : undefined}
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
      {innerPanel}
    </Rnd>
  )
}

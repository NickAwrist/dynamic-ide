import { useCallback, useRef, useState, useEffect, useMemo } from 'react'
import {
  useIDEStore,
  KEEP_ALIVE_PANEL_TYPES,
  type WorkspaceState,
  type PanelState,
} from '../stores/workspace.store'
import { ComponentPanel } from './ComponentPanel'
import { AddComponentMenu } from './AddComponentMenu'
import { WorkspaceTemplatePicker } from './workspace-templates/WorkspaceTemplatePicker'
import { SnapGuide } from '../utils/snap'

export function Canvas() {
  const workspaces = useIDEStore((s) => s.workspaces)
  const activeWorkspaceId = useIDEStore((s) => s.activeWorkspaceId)
  const setWorkspaceManagerOpen = useIDEStore((s) => s.setWorkspaceManagerOpen)
  const activeWs = useMemo(
    () => workspaces.find((w) => w.id === activeWorkspaceId),
    [workspaces, activeWorkspaceId],
  )

  const keepAliveSet = useMemo(() => new Set(KEEP_ALIVE_PANEL_TYPES), [])

  /** One mount per panel id — visibility toggles with active workspace (no remount on switch). */
  const keepAlivePanels = useMemo(() => {
    const out: { workspace: WorkspaceState; panel: PanelState }[] = []
    for (const w of workspaces) {
      for (const panel of w.panels) {
        if (keepAliveSet.has(panel.type)) out.push({ workspace: w, panel })
      }
    }
    return out
  }, [workspaces, keepAliveSet])
  const canvasRef = useRef<HTMLDivElement>(null)
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  const [guides, setGuides] = useState<SnapGuide[]>([])

  useEffect(() => {
    const el = canvasRef.current
    if (!el) return
    const ro = new ResizeObserver((entries) => {
      const { width, height } = entries[0].contentRect
      setCanvasSize({ width, height })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const clearGuides = useCallback(() => setGuides([]), [])

  if (!activeWs) {
    return (
      <div className="canvas canvas--empty" ref={canvasRef}>
        <div className="canvas__placeholder">
          <p className="canvas__placeholder-text">No workspace selected</p>
          <p className="canvas__placeholder-hint">
            Create or open a workspace to get started
          </p>
          <button
            type="button"
            className="workspace-modal__btn workspace-modal__btn--primary canvas__open-workspace-cta"
            onClick={() => setWorkspaceManagerOpen(true)}
          >
            Open or create workspace…
          </button>
        </div>
      </div>
    )
  }

  const hasPanels = activeWs.panels.length > 0

  return (
    <div
      className={!hasPanels ? 'canvas canvas--empty-workspace' : 'canvas'}
      ref={canvasRef}
    >
      {keepAlivePanels.map(({ workspace, panel }) => (
        <ComponentPanel
          key={panel.id}
          panel={panel}
          workspace={workspace}
          canvasSize={canvasSize}
          onShowGuides={setGuides}
          onClearGuides={clearGuides}
          keepAliveSlot
          keepAliveHidden={workspace.id !== activeWorkspaceId}
        />
      ))}
      {activeWs.panels
        .filter((p) => !keepAliveSet.has(p.type))
        .map((panel) => (
          <ComponentPanel
            key={panel.id}
            panel={panel}
            workspace={activeWs}
            canvasSize={canvasSize}
            onShowGuides={setGuides}
            onClearGuides={clearGuides}
          />
        ))}
      {guides.map((g, i) => (
        <div
          key={i}
          className="snap-guide"
          style={
            g.orientation === 'vertical'
              ? { left: g.position, top: g.start, width: 1, height: g.end - g.start }
              : { left: g.start, top: g.position, width: g.end - g.start, height: 1 }
          }
        />
      ))}
      {!hasPanels && (
        <div className="canvas__placeholder canvas__placeholder--empty-ws">
          <p className="canvas__placeholder-text">Workspace is empty</p>
          <p className="canvas__placeholder-hint">
            Pick a layout or add panels with the + button in the title bar
          </p>
          <WorkspaceTemplatePicker layoutSize={canvasSize} />
          <div className="canvas__placeholder__add-menu">
            <AddComponentMenu subscribeGlobalOpen={false} />
          </div>
        </div>
      )}
    </div>
  )
}

import { useCallback, useRef, useState, useEffect } from 'react'
import { useIDEStore } from '../stores/workspace.store'
import { ComponentPanel } from './ComponentPanel'
import { AddComponentMenu } from './AddComponentMenu'
import { SnapGuide } from '../utils/snap'

export function Canvas() {
  const activeWs = useIDEStore((s) =>
    s.workspaces.find((w) => w.id === s.activeWorkspaceId),
  )
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
        </div>
      </div>
    )
  }

  const hasPanels = activeWs.panels.length > 0

  return (
    <div className="canvas" ref={canvasRef}>
      {activeWs.panels.map((panel) => (
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
        <div className="canvas__placeholder">
          <p className="canvas__placeholder-text">Workspace is empty</p>
          <p className="canvas__placeholder-hint">
            Click the + button to add components
          </p>
          <div style={{ marginTop: 16 }}>
            <AddComponentMenu />
          </div>
        </div>
      )}
    </div>
  )
}

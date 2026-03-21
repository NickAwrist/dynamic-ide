export interface Rect {
  id: string
  x: number
  y: number
  width: number
  height: number
}

export interface SnapResult {
  x: number
  y: number
  guides: SnapGuide[]
}

export interface SnapGuide {
  orientation: 'horizontal' | 'vertical'
  position: number
  start: number
  end: number
}

const SNAP_THRESHOLD = 12

export function snapPosition(
  dragging: Rect,
  others: Rect[],
  canvasWidth: number,
  canvasHeight: number,
): SnapResult {
  let bestX = dragging.x
  let bestY = dragging.y
  let closestDx = SNAP_THRESHOLD + 1
  let closestDy = SNAP_THRESHOLD + 1
  const guides: SnapGuide[] = []

  const dragRight = dragging.x + dragging.width
  const dragBottom = dragging.y + dragging.height
  const dragCenterX = dragging.x + dragging.width / 2
  const dragCenterY = dragging.y + dragging.height / 2

  const snapEdges: { val: number; target: number; axis: 'x' | 'y'; guide: SnapGuide }[] = []

  // Canvas edges
  snapEdges.push(
    { val: dragging.x, target: 0, axis: 'x', guide: { orientation: 'vertical', position: 0, start: 0, end: canvasHeight } },
    { val: dragRight, target: canvasWidth, axis: 'x', guide: { orientation: 'vertical', position: canvasWidth, start: 0, end: canvasHeight } },
    { val: dragging.y, target: 0, axis: 'y', guide: { orientation: 'horizontal', position: 0, start: 0, end: canvasWidth } },
    { val: dragBottom, target: canvasHeight, axis: 'y', guide: { orientation: 'horizontal', position: canvasHeight, start: 0, end: canvasWidth } },
  )

  for (const other of others) {
    if (other.id === dragging.id) continue

    const oRight = other.x + other.width
    const oBottom = other.y + other.height
    const oCenterX = other.x + other.width / 2
    const oCenterY = other.y + other.height / 2

    const yOverlap = !(dragBottom < other.y || dragging.y > oBottom)
    const xOverlap = !(dragRight < other.x || dragging.x > oRight)
    const vStart = Math.min(dragging.y, other.y)
    const vEnd = Math.max(dragBottom, oBottom)
    const hStart = Math.min(dragging.x, other.x)
    const hEnd = Math.max(dragRight, oRight)

    // Left edge of dragging -> right edge of other (dock right)
    snapEdges.push({ val: dragging.x, target: oRight, axis: 'x', guide: { orientation: 'vertical', position: oRight, start: vStart, end: vEnd } })
    // Right edge of dragging -> left edge of other (dock left)
    snapEdges.push({ val: dragRight, target: other.x, axis: 'x', guide: { orientation: 'vertical', position: other.x, start: vStart, end: vEnd } })
    // Left-to-left
    snapEdges.push({ val: dragging.x, target: other.x, axis: 'x', guide: { orientation: 'vertical', position: other.x, start: vStart, end: vEnd } })
    // Right-to-right
    snapEdges.push({ val: dragRight, target: oRight, axis: 'x', guide: { orientation: 'vertical', position: oRight, start: vStart, end: vEnd } })
    // Center X
    snapEdges.push({ val: dragCenterX, target: oCenterX, axis: 'x', guide: { orientation: 'vertical', position: oCenterX, start: vStart, end: vEnd } })

    // Top-to-bottom
    snapEdges.push({ val: dragging.y, target: oBottom, axis: 'y', guide: { orientation: 'horizontal', position: oBottom, start: hStart, end: hEnd } })
    // Bottom-to-top
    snapEdges.push({ val: dragBottom, target: other.y, axis: 'y', guide: { orientation: 'horizontal', position: other.y, start: hStart, end: hEnd } })
    // Top-to-top
    snapEdges.push({ val: dragging.y, target: other.y, axis: 'y', guide: { orientation: 'horizontal', position: other.y, start: hStart, end: hEnd } })
    // Bottom-to-bottom
    snapEdges.push({ val: dragBottom, target: oBottom, axis: 'y', guide: { orientation: 'horizontal', position: oBottom, start: hStart, end: hEnd } })
    // Center Y
    snapEdges.push({ val: dragCenterY, target: oCenterY, axis: 'y', guide: { orientation: 'horizontal', position: oCenterY, start: hStart, end: hEnd } })
  }

  for (const edge of snapEdges) {
    const dist = Math.abs(edge.val - edge.target)
    if (dist > SNAP_THRESHOLD) continue

    if (edge.axis === 'x') {
      const offset = edge.target - edge.val
      const snappedX = dragging.x + offset
      if (dist < closestDx) {
        closestDx = dist
        bestX = snappedX
        // Remove old x guides and add this one
        const idx = guides.findIndex((g) => g.orientation === 'vertical')
        if (idx >= 0) guides.splice(idx, 1)
        guides.push(edge.guide)
      }
    } else {
      const offset = edge.target - edge.val
      const snappedY = dragging.y + offset
      if (dist < closestDy) {
        closestDy = dist
        bestY = snappedY
        const idx = guides.findIndex((g) => g.orientation === 'horizontal')
        if (idx >= 0) guides.splice(idx, 1)
        guides.push(edge.guide)
      }
    }
  }

  return { x: bestX, y: bestY, guides }
}

export interface ResizeSnapResult {
  width: number
  height: number
  x: number
  y: number
  neighborUpdates: { id: string; x: number; y: number; width: number; height: number }[]
  guides: SnapGuide[]
}

export function snapResize(
  panel: Rect,
  direction: string,
  newX: number,
  newY: number,
  newW: number,
  newH: number,
  others: Rect[],
  canvasWidth: number,
  canvasHeight: number,
): ResizeSnapResult {
  let x = newX, y = newY, w = newW, h = newH
  const guides: SnapGuide[] = []
  const neighborUpdates: { id: string; x: number; y: number; width: number; height: number }[] = []

  const right = x + w
  const bottom = y + h

  // Snap right edge
  if (direction.includes('right') || direction.includes('Right')) {
    if (Math.abs(right - canvasWidth) < SNAP_THRESHOLD) {
      w = canvasWidth - x
      guides.push({ orientation: 'vertical', position: canvasWidth, start: 0, end: canvasHeight })
    }
    for (const other of others) {
      if (other.id === panel.id) continue
      // Snap to left edge of neighbor
      if (Math.abs(right - other.x) < SNAP_THRESHOLD) {
        w = other.x - x
        guides.push({ orientation: 'vertical', position: other.x, start: Math.min(y, other.y), end: Math.max(bottom, other.y + other.height) })
      }
    }
  }

  // Snap left edge
  if (direction.includes('left') || direction.includes('Left')) {
    if (Math.abs(x - 0) < SNAP_THRESHOLD) {
      w = w + x
      x = 0
      guides.push({ orientation: 'vertical', position: 0, start: 0, end: canvasHeight })
    }
    for (const other of others) {
      if (other.id === panel.id) continue
      const oRight = other.x + other.width
      if (Math.abs(x - oRight) < SNAP_THRESHOLD) {
        w = w + (x - oRight)
        x = oRight
        guides.push({ orientation: 'vertical', position: oRight, start: Math.min(y, other.y), end: Math.max(bottom, other.y + other.height) })
      }
    }
  }

  // Snap bottom edge
  if (direction.includes('bottom') || direction.includes('Bottom')) {
    if (Math.abs(y + h - canvasHeight) < SNAP_THRESHOLD) {
      h = canvasHeight - y
      guides.push({ orientation: 'horizontal', position: canvasHeight, start: 0, end: canvasWidth })
    }
    for (const other of others) {
      if (other.id === panel.id) continue
      if (Math.abs((y + h) - other.y) < SNAP_THRESHOLD) {
        h = other.y - y
        guides.push({ orientation: 'horizontal', position: other.y, start: Math.min(x, other.x), end: Math.max(right, other.x + other.width) })
      }
    }
  }

  // Snap top edge
  if (direction.includes('top') || direction.includes('Top')) {
    if (Math.abs(y - 0) < SNAP_THRESHOLD) {
      h = h + y
      y = 0
      guides.push({ orientation: 'horizontal', position: 0, start: 0, end: canvasWidth })
    }
    for (const other of others) {
      if (other.id === panel.id) continue
      const oBottom = other.y + other.height
      if (Math.abs(y - oBottom) < SNAP_THRESHOLD) {
        h = h + (y - oBottom)
        y = oBottom
        guides.push({ orientation: 'horizontal', position: oBottom, start: Math.min(x, other.x), end: Math.max(right, other.x + other.width) })
      }
    }
  }

  return { width: w, height: h, x, y, neighborUpdates, guides }
}

import type { TreeNode } from './fileTreeTypes'

export type LoadDirFn = (dirPath: string) => Promise<TreeNode[]>

/** Re-reads a directory and merges with previous tree so expanded folders stay open. */
export async function reconcileTree(
  prevNodes: TreeNode[] | undefined,
  dirPath: string,
  loadDir: LoadDirFn,
): Promise<TreeNode[]> {
  const fresh = await loadDir(dirPath)
  const oldByPath = new Map((prevNodes ?? []).map((n) => [n.path, n]))

  return Promise.all(
    fresh.map(async (e) => {
      const old = oldByPath.get(e.path)
      const expanded = !!(old?.expanded && e.isDirectory)
      let children: TreeNode[] | undefined
      if (e.isDirectory && expanded) {
        children = await reconcileTree(old?.children, e.path, loadDir)
      }
      return { ...e, expanded, children }
    }),
  )
}

export function getPathSep(): string {
  return navigator.platform.startsWith('Win') ? '\\' : '/'
}

export function updateTreeAt(
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

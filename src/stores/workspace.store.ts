import { create } from 'zustand'

export type PanelType = 'editor' | 'terminal' | 'file-explorer' | 'git' | 'browser' | 'extensions' | 'extension-view'

export interface PanelState {
  id: string
  type: PanelType
  x: number
  y: number
  width: number
  height: number
  zIndex: number
  componentState: Record<string, any>
}

export interface WorkspaceState {
  id: string
  name: string
  rootPath: string
  panels: PanelState[]
}

interface IDEStore {
  workspaces: WorkspaceState[]
  activeWorkspaceId: string | null
  maxZIndex: number

  // Workspace CRUD
  addWorkspace: (name: string, rootPath: string) => void
  removeWorkspace: (id: string) => void
  setActiveWorkspace: (id: string) => void
  getActiveWorkspace: () => WorkspaceState | undefined

  // Panel CRUD
  addPanel: (type: PanelType, componentState?: Record<string, any>) => void
  removePanel: (panelId: string) => void
  updatePanel: (panelId: string, updates: Partial<PanelState>) => void
  bringToFront: (panelId: string) => void

  // Persistence
  loadFromDisk: () => Promise<void>
  saveToDisk: () => Promise<void>

  // Internal
  _nextId: () => string
}

let saveTimeout: ReturnType<typeof setTimeout> | null = null

function debouncedSave(store: IDEStore) {
  if (saveTimeout) clearTimeout(saveTimeout)
  saveTimeout = setTimeout(() => store.saveToDisk(), 500)
}

const PANEL_DEFAULTS: Record<PanelType, { width: number; height: number }> = {
  editor: { width: 700, height: 500 },
  terminal: { width: 700, height: 350 },
  'file-explorer': { width: 300, height: 500 },
  git: { width: 350, height: 500 },
  browser: { width: 900, height: 600 },
  extensions: { width: 400, height: 550 },
  'extension-view': { width: 500, height: 500 },
}

export const useIDEStore = create<IDEStore>()((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  maxZIndex: 1,

  _nextId: () => {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
  },

  addWorkspace: (name, rootPath) => {
    const id = get()._nextId()
    const ws: WorkspaceState = { id, name, rootPath, panels: [] }
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      activeWorkspaceId: id,
    }))
    debouncedSave(get())
  },

  removeWorkspace: (id) => {
    set((s) => {
      const filtered = s.workspaces.filter((w) => w.id !== id)
      return {
        workspaces: filtered,
        activeWorkspaceId:
          s.activeWorkspaceId === id
            ? filtered[0]?.id ?? null
            : s.activeWorkspaceId,
      }
    })
    window.electronAPI?.workspace.delete(id)
    debouncedSave(get())
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id })
    debouncedSave(get())
  },

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get()
    return workspaces.find((w) => w.id === activeWorkspaceId)
  },

  addPanel: (type, componentState) => {
    const ws = get().getActiveWorkspace()
    if (!ws) return

    const defaults = PANEL_DEFAULTS[type]
    const offset = ws.panels.length * 30
    const newZ = get().maxZIndex + 1

    const panel: PanelState = {
      id: get()._nextId(),
      type,
      x: 80 + offset,
      y: 80 + offset,
      width: defaults.width,
      height: defaults.height,
      zIndex: newZ,
      componentState: componentState || {},
    }

    set((s) => ({
      maxZIndex: newZ,
      workspaces: s.workspaces.map((w) =>
        w.id === ws.id ? { ...w, panels: [...w.panels, panel] } : w,
      ),
    }))
    debouncedSave(get())
  },

  removePanel: (panelId) => {
    const ws = get().getActiveWorkspace()
    if (!ws) return
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === ws.id
          ? { ...w, panels: w.panels.filter((p) => p.id !== panelId) }
          : w,
      ),
    }))
    debouncedSave(get())
  },

  updatePanel: (panelId, updates) => {
    const ws = get().getActiveWorkspace()
    if (!ws) return
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.id === ws.id
          ? {
              ...w,
              panels: w.panels.map((p) =>
                p.id === panelId ? { ...p, ...updates } : p,
              ),
            }
          : w,
      ),
    }))
    debouncedSave(get())
  },

  bringToFront: (panelId) => {
    const newZ = get().maxZIndex + 1
    set((s) => {
      const ws = s.workspaces.find((w) => w.id === s.activeWorkspaceId)
      if (!ws) return s
      return {
        maxZIndex: newZ,
        workspaces: s.workspaces.map((w) =>
          w.id === ws.id
            ? {
                ...w,
                panels: w.panels.map((p) =>
                  p.id === panelId ? { ...p, zIndex: newZ } : p,
                ),
              }
            : w,
        ),
      }
    })
  },

  loadFromDisk: async () => {
    try {
      const loaded = await window.electronAPI.workspace.loadAll()
      if (loaded.length > 0) {
        let maxZ = 1
        loaded.forEach((ws: WorkspaceState) =>
          ws.panels.forEach((p) => {
            if (p.zIndex > maxZ) maxZ = p.zIndex
          }),
        )
        set({
          workspaces: loaded,
          activeWorkspaceId: loaded[0].id,
          maxZIndex: maxZ,
        })
      }
    } catch {
      // first run, no saved data
    }
  },

  saveToDisk: async () => {
    const { workspaces } = get()
    for (const ws of workspaces) {
      try {
        await window.electronAPI.workspace.save(ws)
      } catch {
        // save failed silently
      }
    }
  },
}))

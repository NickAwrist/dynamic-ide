import { create } from 'zustand'
import { createUiLogger, Scopes } from '../lib/logger'
import {
  buildWorkspaceTemplatePanels,
  type WorkspaceTemplateId,
} from '../lib/workspace-templates'
import type { PanelState, PanelType } from './panel-types'

export type { PanelState, PanelType } from './panel-types'

const log = createUiLogger(Scopes.uiStoreWorkspace)

/** Kept mounted (hidden) when switching away so PTY/webview sessions survive. */
export const KEEP_ALIVE_PANEL_TYPES: PanelType[] = ['terminal', 'browser', 't3-code']

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
  isExtensionsOpen: boolean
  isLogViewerOpen: boolean
  isWorkspaceManagerOpen: boolean

  // Workspace CRUD
  addWorkspace: (name: string, rootPath: string) => void
  closeWorkspace: (id: string) => Promise<void>
  openWorkspace: (id: string) => Promise<void>
  deleteWorkspacePermanently: (id: string) => Promise<void>
  renameWorkspace: (id: string, name: string) => Promise<void>
  setActiveWorkspace: (id: string) => void
  getActiveWorkspace: () => WorkspaceState | undefined
  setExtensionsOpen: (val: boolean) => void
  setLogViewerOpen: (val: boolean) => void
  setWorkspaceManagerOpen: (val: boolean) => void

  // Panel CRUD
  addPanel: (type: PanelType, componentState?: Record<string, any>) => string | null
  applyWorkspaceTemplate: (
    templateId: WorkspaceTemplateId,
    layoutSize: { width: number; height: number },
  ) => void
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

function clearSaveDebounce() {
  if (saveTimeout) {
    clearTimeout(saveTimeout)
    saveTimeout = null
  }
}

function maxZIndexFromWorkspaces(workspaces: WorkspaceState[]): number {
  let maxZ = 1
  for (const ws of workspaces) {
    for (const p of ws.panels) {
      if (p.zIndex > maxZ) maxZ = p.zIndex
    }
  }
  return maxZ
}

const PANEL_DEFAULTS: Record<PanelType, { width: number; height: number }> = {
  editor: { width: 700, height: 500 },
  terminal: { width: 700, height: 350 },
  'file-explorer': { width: 300, height: 500 },
  git: { width: 350, height: 500 },
  browser: { width: 900, height: 600 },
  'extension-panel': { width: 500, height: 500 },
  't3-code': { width: 600, height: 750 },
}

export const useIDEStore = create<IDEStore>()((set, get) => ({
  workspaces: [],
  activeWorkspaceId: null,
  maxZIndex: 1,
  isExtensionsOpen: false,
  isLogViewerOpen: false,
  isWorkspaceManagerOpen: false,

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

  closeWorkspace: async (id) => {
    clearSaveDebounce()
    await get().saveToDisk()
    set((s) => {
      const filtered = s.workspaces.filter((w) => w.id !== id)
      const nextActive =
        s.activeWorkspaceId === id ? filtered[0]?.id ?? null : s.activeWorkspaceId
      return {
        workspaces: filtered,
        activeWorkspaceId: nextActive,
      }
    })
    await get().saveToDisk()
  },

  openWorkspace: async (id) => {
    const { workspaces } = get()
    if (workspaces.some((w) => w.id === id)) {
      set({ activeWorkspaceId: id })
      debouncedSave(get())
      return
    }
    const raw = await window.electronAPI.workspace.loadById(id)
    if (!raw) return
    const ws = raw as WorkspaceState
    set((s) => ({
      workspaces: [...s.workspaces, ws],
      activeWorkspaceId: id,
      maxZIndex: Math.max(s.maxZIndex, maxZIndexFromWorkspaces([ws])),
    }))
    debouncedSave(get())
  },

  deleteWorkspacePermanently: async (id) => {
    clearSaveDebounce()
    await get().saveToDisk()
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
    try {
      await window.electronAPI.workspace.delete(id)
    } catch {
      // ignore
    }
    await get().saveToDisk()
  },

  renameWorkspace: async (id, name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    const { workspaces } = get()
    const existing = workspaces.find((w) => w.id === id)
    if (existing) {
      set((s) => ({
        workspaces: s.workspaces.map((w) =>
          w.id === id ? { ...w, name: trimmed } : w,
        ),
      }))
      debouncedSave(get())
      return
    }
    const raw = await window.electronAPI.workspace.loadById(id)
    if (!raw) return
    const ws = { ...raw, name: trimmed }
    try {
      await window.electronAPI.workspace.save(ws)
    } catch {
      // ignore
    }
  },

  setActiveWorkspace: (id) => {
    set({ activeWorkspaceId: id })
    debouncedSave(get())
  },

  getActiveWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get()
    return workspaces.find((w) => w.id === activeWorkspaceId)
  },

  setExtensionsOpen: (val: boolean) => {
    set({ isExtensionsOpen: val })
  },

  setLogViewerOpen: (val: boolean) => {
    set({ isLogViewerOpen: val })
  },

  setWorkspaceManagerOpen: (val: boolean) => {
    set({ isWorkspaceManagerOpen: val })
  },

  addPanel: (type, componentState) => {
    const ws = get().getActiveWorkspace()
    if (!ws) return null

    const defaults = PANEL_DEFAULTS[type]
    const offset = ws.panels.length * 30
    const newZ = get().maxZIndex + 1
    const panelId = get()._nextId()

    const panel: PanelState = {
      id: panelId,
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
    return panelId
  },

  applyWorkspaceTemplate: (templateId, layoutSize) => {
    const ws = get().getActiveWorkspace()
    if (!ws || ws.panels.length > 0) return

    const cw = Math.floor(layoutSize.width) > 0 ? Math.floor(layoutSize.width) : 1280
    const ch = Math.floor(layoutSize.height) > 0 ? Math.floor(layoutSize.height) : 800
    const panels = buildWorkspaceTemplatePanels(
      templateId,
      cw,
      ch,
      get()._nextId,
      get().maxZIndex,
    )
    const newMaxZ = panels.reduce((m, p) => Math.max(m, p.zIndex), get().maxZIndex)

    set((s) => ({
      maxZIndex: newMaxZ,
      workspaces: s.workspaces.map((w) =>
        w.id === ws.id ? { ...w, panels } : w,
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
    log.debug('update_panel', JSON.stringify({ panelId, updates }))
    set((s) => ({
      workspaces: s.workspaces.map((w) =>
        w.panels.some((p) => p.id === panelId)
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
      const session = await window.electronAPI.workspace.loadSession()
      if (!session) return

      const loaded: WorkspaceState[] = []
      for (const id of session.openWorkspaceIds) {
        const w = await window.electronAPI.workspace.loadById(id)
        if (w) loaded.push(w as WorkspaceState)
      }

      let activeId = session.activeWorkspaceId
      if (activeId && !loaded.some((w) => w.id === activeId)) {
        activeId = loaded[0]?.id ?? null
      }
      if (!activeId && loaded.length > 0) activeId = loaded[0].id

      const openIds = loaded.map((w) => w.id)
      const sessionDirty =
        openIds.length !== session.openWorkspaceIds.length ||
        session.activeWorkspaceId !== activeId

      set({
        workspaces: loaded,
        activeWorkspaceId: activeId,
        maxZIndex: Math.max(1, maxZIndexFromWorkspaces(loaded)),
      })

      if (sessionDirty) {
        try {
          await window.electronAPI.workspace.saveSession({
            openWorkspaceIds: openIds,
            activeWorkspaceId: activeId,
          })
        } catch {
          // ignore
        }
      }
    } catch {
      // first run or IPC unavailable
    }
  },

  saveToDisk: async () => {
    const { workspaces, activeWorkspaceId } = get()
    for (const ws of workspaces) {
      try {
        await window.electronAPI.workspace.save(ws)
      } catch {
        // save failed silently
      }
    }
    try {
      await window.electronAPI.workspace.saveSession({
        openWorkspaceIds: workspaces.map((w) => w.id),
        activeWorkspaceId,
      })
    } catch {
      // ignore
    }
  },
}))

import { ReactNode } from 'react'
import { Codicon } from '../codicon/Codicon'
import type { PanelType } from '../../stores/panel-types'

/** Payload passed through submenu rows; parent decides how to add the panel. */
export type AddPanelSubmenuPick =
  | { kind: 'panel'; panelType: PanelType; state?: Record<string, unknown> }
  | { kind: 'extension-panel'; viewId: string }

export type AddPanelMenuLeaf = {
  kind: 'leaf'
  key: string
  panelType: PanelType
  label: string
  desc: string
  icon: ReactNode
  state?: Record<string, unknown>
}

export type AddPanelMenuSubmenu = {
  kind: 'submenu'
  id: string
  label: string
  desc: string
  icon: ReactNode
  /** Shown when this submenu is open (optional). */
  submenuTitle?: string
  /** Inline choices (e.g. AI agents). */
  items?: Array<{
    key: string
    label: string
    desc: string
    icon: ReactNode
    pick: AddPanelSubmenuPick
  }>
  /** Async choices (e.g. extension contributions). */
  loadItems?: () => Promise<
    Array<{
      key: string
      label: string
      desc: string
      icon: ReactNode
      pick: AddPanelSubmenuPick
    }>
  >
}

export type AddPanelMenuEntry = AddPanelMenuLeaf | AddPanelMenuSubmenu

/** Public-folder icons; must respect Vite `base` (e.g. `./`) so packaged Electron file:// loads work. */
function panelMenuIconSrc(filename: string): string {
  const base = import.meta.env.BASE_URL
  return `${base}${base.endsWith('/') ? '' : '/'}icons/${filename}`
}

export const ADD_PANEL_MENU_ENTRIES: AddPanelMenuEntry[] = [
  {
    kind: 'leaf',
    key: 'editor',
    panelType: 'editor',
    label: 'Code Editor',
    desc: 'Edit files with syntax highlighting',
    icon: <Codicon name="file-code" />,
  },
  {
    kind: 'leaf',
    key: 'shell',
    panelType: 'terminal',
    label: 'Shell',
    desc: 'Full terminal emulator',
    icon: <Codicon name="terminal" />,
  },
  {
    kind: 'submenu',
    id: 'ai-agents',
    label: 'AI agents',
    desc: 'Coding agents and agent UIs',
    icon: <Codicon name="hubot" />,
    submenuTitle: 'AI agents',
    items: [
      {
        key: 'claude',
        label: 'Claude Code',
        desc: 'Run Anthropic Claude Code',
        icon: <img src={panelMenuIconSrc('claude.png')} width={16} height={16} alt="Claude" />,
        pick: { kind: 'panel', panelType: 'terminal', state: { command: 'claude' } },
      },
      {
        key: 'gemini',
        label: 'Gemini CLI',
        desc: 'Run Google Gemini',
        icon: <img src={panelMenuIconSrc('gemini.png')} width={16} height={16} alt="Gemini" />,
        pick: { kind: 'panel', panelType: 'terminal', state: { command: 'gemini' } },
      },
      {
        key: 'codex',
        label: 'Codex',
        desc: 'Run OpenAI Codex',
        icon: <img src={panelMenuIconSrc('codex.png')} width={16} height={16} alt="Codex" />,
        pick: { kind: 'panel', panelType: 'terminal', state: { command: 'codex' } },
      },
      {
        key: 't3-code',
        label: 'T3 Code',
        desc: 'Graphical panel for the T3 coding agent',
        icon: <img src={panelMenuIconSrc('t3_code.png')} width={16} height={16} alt="T3 Code" />,
        pick: { kind: 'panel', panelType: 't3-code' },
      },
    ],
  },
  {
    kind: 'leaf',
    key: 'file-explorer',
    panelType: 'file-explorer',
    label: 'File Explorer',
    desc: 'Browse project files',
    icon: <Codicon name="folder-opened" />,
  },
  {
    kind: 'leaf',
    key: 'git',
    panelType: 'git',
    label: 'Git',
    desc: 'Stage, commit, and view history',
    icon: <Codicon name="git-branch" />,
  },
  {
    kind: 'leaf',
    key: 'browser',
    panelType: 'browser',
    label: 'Browser',
    desc: 'Embedded web browser with profile import',
    icon: <Codicon name="globe" />,
  },
  {
    kind: 'submenu',
    id: 'extension-panel',
    label: 'Extension Panel',
    desc: 'Open a panel provided by an extension',
    icon: <Codicon name="extensions" />,
    submenuTitle: 'Extension panels',
    loadItems: async () => {
      try {
        const raw = await window.electronAPI.extensions.getRegisteredExtensionPanels()
        return raw.map((v) => ({
          key: v.viewId,
          label: v.viewId,
          desc: v.type,
          icon: <Codicon name="extensions" />,
          pick: { kind: 'extension-panel' as const, viewId: v.viewId },
        }))
      } catch {
        return []
      }
    },
  },
]

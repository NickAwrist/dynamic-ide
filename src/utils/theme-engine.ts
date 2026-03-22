import type { editor } from 'monaco-editor'
import defaultTheme, { type VSCodeTheme } from '../themes/default-theme'
import { createUiLogger, Scopes } from '../lib/logger'

const log = createUiLogger(Scopes.uiThemeEngine)

// ─── Types ───────────────────────────────────────────────────────────────────

export interface ThemeInfo {
  extensionId: string
  label: string
  uiTheme: string
  themePath: string
}

// ─── VSCode Color Key → CSS Variable Mapping ────────────────────────────────
// Every entry maps a standard VSCode workbench color key to a CSS custom
// property name that the UI consumes. Adding a new color is one line.

const CSS_VAR_MAP: Record<string, string> = {
  // Base / global
  'foreground':                        '--text-primary',
  'descriptionForeground':             '--text-secondary',
  'errorForeground':                   '--danger',
  'focusBorder':                       '--accent',
  'widget.shadow':                     '--widget-shadow',
  'selection.background':              '--selection-bg',

  // Title bar
  'titleBar.activeBackground':         '--bg-toolbar',
  'titleBar.activeForeground':         '--titlebar-fg',
  'titleBar.inactiveBackground':       '--titlebar-inactive-bg',
  'titleBar.inactiveForeground':       '--titlebar-inactive-fg',

  // Activity bar
  'activityBar.background':            '--activity-bg',
  'activityBar.foreground':            '--activity-fg',
  'activityBar.inactiveForeground':    '--activity-inactive-fg',
  'activityBarBadge.background':       '--badge-bg',
  'activityBarBadge.foreground':       '--badge-fg',

  // Side bar
  'sideBar.background':                '--bg-secondary',
  'sideBar.foreground':                '--sidebar-fg',
  'sideBarTitle.foreground':           '--sidebar-title-fg',
  'sideBarSectionHeader.background':   '--sidebar-section-bg',
  'sideBarSectionHeader.foreground':   '--sidebar-section-fg',

  // Editor
  'editor.background':                 '--bg-primary',
  'editor.foreground':                 '--editor-fg',
  'editor.lineHighlightBackground':    '--editor-line-highlight',
  'editor.selectionBackground':        '--editor-selection',
  'editorCursor.foreground':           '--editor-cursor',
  'editorLineNumber.foreground':       '--text-muted',
  'editorLineNumber.activeForeground': '--editor-line-number-active',
  'editorIndentGuide.background':      '--editor-indent-guide',
  'editorIndentGuide.activeBackground':'--editor-indent-guide-active',
  'editorWidget.background':           '--bg-surface',
  'editorWidget.border':               '--border-color',

  // Editor groups & tabs
  'editorGroupHeader.tabsBackground':  '--tabs-bg',
  'editorGroup.border':                '--editor-group-border',
  'tab.activeBackground':              '--tab-active-bg',
  'tab.activeForeground':              '--tab-active-fg',
  'tab.inactiveBackground':            '--tab-inactive-bg',
  'tab.inactiveForeground':            '--tab-inactive-fg',
  'tab.border':                        '--tab-border',
  'tab.activeBorderTop':               '--tab-active-border-top',

  // Status bar
  'statusBar.background':              '--statusbar-bg',
  'statusBar.foreground':              '--statusbar-fg',
  'statusBarItem.hoverBackground':     '--bg-surface-hover',

  // Panel
  'panel.background':                  '--panel-bg',
  'panel.border':                      '--panel-border',
  'panelTitle.activeBorder':           '--panel-title-active-border',
  'panelTitle.activeForeground':       '--panel-title-active-fg',
  'panelTitle.inactiveForeground':     '--panel-title-inactive-fg',

  // Terminal
  'terminal.background':               '--terminal-bg',
  'terminal.foreground':               '--terminal-fg',
  'terminal.ansiBlack':                '--ansi-black',
  'terminal.ansiRed':                  '--ansi-red',
  'terminal.ansiGreen':                '--ansi-green',
  'terminal.ansiYellow':               '--ansi-yellow',
  'terminal.ansiBlue':                 '--ansi-blue',
  'terminal.ansiMagenta':              '--ansi-magenta',
  'terminal.ansiCyan':                 '--ansi-cyan',
  'terminal.ansiWhite':                '--ansi-white',
  'terminal.ansiBrightBlack':          '--ansi-bright-black',
  'terminal.ansiBrightRed':            '--ansi-bright-red',
  'terminal.ansiBrightGreen':          '--ansi-bright-green',
  'terminal.ansiBrightYellow':         '--ansi-bright-yellow',
  'terminal.ansiBrightBlue':           '--ansi-bright-blue',
  'terminal.ansiBrightMagenta':        '--ansi-bright-magenta',
  'terminal.ansiBrightCyan':           '--ansi-bright-cyan',
  'terminal.ansiBrightWhite':          '--ansi-bright-white',

  // Input
  'input.background':                  '--input-bg',
  'input.foreground':                  '--input-fg',
  'input.border':                      '--input-border',
  'input.placeholderForeground':       '--input-placeholder',

  // Button
  'button.background':                 '--button-bg',
  'button.foreground':                 '--button-fg',
  'button.hoverBackground':            '--button-hover-bg',
  'button.secondaryBackground':        '--button-secondary-bg',
  'button.secondaryForeground':        '--button-secondary-fg',

  // Scrollbar
  'scrollbar.shadow':                  '--scrollbar-shadow',
  'scrollbarSlider.background':        '--scrollbar-bg',
  'scrollbarSlider.hoverBackground':   '--scrollbar-hover-bg',
  'scrollbarSlider.activeBackground':  '--scrollbar-active-bg',

  // Lists and trees
  'list.activeSelectionBackground':    '--list-active-bg',
  'list.activeSelectionForeground':    '--list-active-fg',
  'list.inactiveSelectionBackground':  '--list-inactive-bg',
  'list.hoverBackground':             '--list-hover-bg',
  'list.highlightForeground':         '--list-highlight-fg',

  // Notifications
  'notifications.background':          '--notification-bg',
  'notifications.foreground':          '--notification-fg',
  'notifications.border':              '--notification-border',

  // Badge
  'badge.background':                  '--badge-bg',
  'badge.foreground':                  '--badge-fg',

  // Progress bar
  'progressBar.background':            '--progress-bg',

  // Git decorations
  'gitDecoration.addedResourceForeground':       '--git-added',
  'gitDecoration.modifiedResourceForeground':     '--git-modified',
  'gitDecoration.deletedResourceForeground':      '--git-deleted',
  'gitDecoration.untrackedResourceForeground':    '--git-untracked',
  'gitDecoration.conflictingResourceForeground':  '--git-conflict',
}

/** All CSS custom properties set by applyFullTheme (direct + derived). Used to clear stale values after reload/hydration. */
const DERIVED_CSS_VAR_KEYS = [
  '--accent',
  '--accent-hover',
  '--bg-surface',
  '--bg-surface-hover',
  '--success',
  '--warning',
  '--danger',
  '--text-muted',
  '--text-secondary',
  '--accent-tint-10',
  '--accent-tint-06',
  '--accent-tint-03',
  '--danger-tint-15',
  '--danger-tint-08',
  '--success-tint-10',
  '--border-tint-40',
  '--radius',
] as const

const MANAGED_CSS_VAR_NAMES: string[] = [
  ...new Set<string>([...Object.values(CSS_VAR_MAP), ...DERIVED_CSS_VAR_KEYS]),
]

const THEME_CSS_CACHE_KEY = 'dynamic-ide-theme-css-cache'
const THEME_CSS_CACHE_VERSION = 1

export interface ThemeCssCachePayload {
  v: number
  themeType: string
  vars: Record<string, string>
}

function clearManagedThemeCssVars(root: HTMLElement): void {
  for (const name of MANAGED_CSS_VAR_NAMES) {
    root.style.removeProperty(name)
  }
}

/** Restore last session theme variables before first paint. Returns true if cache was applied. */
export function hydrateThemeFromCache(): boolean {
  try {
    const raw = localStorage.getItem(THEME_CSS_CACHE_KEY)
    if (!raw) return false
    const parsed = JSON.parse(raw) as Partial<ThemeCssCachePayload>
    if (
      parsed.v !== THEME_CSS_CACHE_VERSION ||
      !parsed.vars ||
      typeof parsed.vars !== 'object'
    ) {
      return false
    }
    const root = document.documentElement
    for (const [k, v] of Object.entries(parsed.vars)) {
      if (typeof v === 'string' && v.length > 0) {
        root.style.setProperty(k, v)
      }
    }
    if (parsed.themeType) {
      root.dataset.themeType = parsed.themeType
    }
    return true
  } catch {
    return false
  }
}

function normalizeHexForChrome(hex: string): string | null {
  let h = hex.trim()
  if (!h.startsWith('#')) h = `#${h}`
  if (/^#[0-9a-fA-F]{6}$/.test(h)) return h
  if (/^#[0-9a-fA-F]{8}$/.test(h)) return h.slice(0, 7)
  return null
}

function syncWindowChromeFromEditorBackground(editorBackground: string): void {
  const hex = normalizeHexForChrome(editorBackground)
  if (!hex) return
  try {
    void window.electronAPI?.window?.syncChromeBackground?.(hex)
  } catch {
    /* ignore */
  }
}

// ─── Color Utilities ─────────────────────────────────────────────────────────

function hexToHSL(hex: string): { h: number; s: number; l: number; a: number } {
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)

  let a = 1
  if (h.length === 8) {
    a = parseInt(h.slice(6, 8), 16) / 255
    h = h.slice(0, 6)
  } else if (h.length === 4) {
    a = parseInt(h[3] + h[3], 16) / 255
    h = h.slice(0, 3)
  }

  if (h.length === 3) {
    h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  }

  const r = parseInt(h.slice(0, 2), 16) / 255
  const g = parseInt(h.slice(2, 4), 16) / 255
  const b = parseInt(h.slice(4, 6), 16) / 255

  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2

  if (max === min) return { h: 0, s: 0, l, a }

  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)

  let hue = 0
  if (max === r) hue = ((g - b) / d + (g < b ? 6 : 0)) / 6
  else if (max === g) hue = ((b - r) / d + 2) / 6
  else hue = ((r - g) / d + 4) / 6

  return { h: hue * 360, s, l, a }
}

function hslToHex(h: number, s: number, l: number, a = 1): string {
  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }

  let r: number, g: number, b: number
  if (s === 0) {
    r = g = b = l
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s
    const p = 2 * l - q
    r = hue2rgb(p, q, h / 360 + 1 / 3)
    g = hue2rgb(p, q, h / 360)
    b = hue2rgb(p, q, h / 360 - 1 / 3)
  }

  const toHex = (n: number) =>
    Math.round(Math.min(1, Math.max(0, n)) * 255)
      .toString(16)
      .padStart(2, '0')

  const hex = `#${toHex(r)}${toHex(g)}${toHex(b)}`
  if (a < 1) return hex + toHex(a)
  return hex
}

function adjustLightness(hex: string, delta: number): string {
  const { h, s, l, a } = hexToHSL(hex)
  return hslToHex(h, s, Math.min(1, Math.max(0, l + delta)), a)
}

function withAlpha(hex: string, alpha: number): string {
  let h = hex.trim()
  if (h.startsWith('#')) h = h.slice(1)
  if (h.length === 8) h = h.slice(0, 6) // strip existing alpha
  if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2]
  const a = Math.round(Math.min(1, Math.max(0, alpha)) * 255)
    .toString(16)
    .padStart(2, '0')
  return `#${h}${a}`
}

// ─── Monaco Conversion ───────────────────────────────────────────────────────

function uiThemeToMonacoBase(uiTheme: string): 'vs' | 'vs-dark' | 'hc-black' {
  switch (uiTheme) {
    case 'vs':       return 'vs'
    case 'vs-dark':  return 'vs-dark'
    case 'hc-black': return 'hc-black'
    case 'hc-light': return 'vs'
    default:         return 'vs-dark'
  }
}

/** Normalize a color value for Monaco: strip #, expand 3-digit to 6-digit hex */
function normalizeHex(color: unknown): string | null {
  if (typeof color !== 'string') return null
  let c = color.trim()
  if (c.startsWith('#')) c = c.slice(1)
  // Expand 3-digit hex → 6-digit (e.g. fff → ffffff)
  if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]
  // Expand 4-digit hex → 8-digit (e.g. fff8 → ffffff88)
  if (c.length === 4) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2] + c[3] + c[3]
  // Validate hex
  if (!/^[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/.test(c)) return null
  return c
}

export function convertToMonacoTheme(
  themeData: VSCodeTheme,
  uiTheme: string,
  resolvedColors?: Record<string, string>,
): editor.IStandaloneThemeData {
  const base = uiThemeToMonacoBase(uiTheme)
  const rules: editor.ITokenThemeRule[] = []

  if (themeData.tokenColors) {
    for (const tc of themeData.tokenColors) {
      if (!tc.settings) continue
      const scopes = Array.isArray(tc.scope)
        ? tc.scope
        : tc.scope
          ? tc.scope.split(',').map((s) => s.trim())
          : ['']

      for (const scope of scopes) {
        const rule: editor.ITokenThemeRule = { token: scope }
        const fg = normalizeHex(tc.settings.foreground)
        const bg = normalizeHex(tc.settings.background)
        if (fg) rule.foreground = fg
        if (bg) rule.background = bg
        if (tc.settings.fontStyle) rule.fontStyle = tc.settings.fontStyle
        rules.push(rule)
      }
    }
  }

  // Use resolved colors (with gap-filled defaults) if provided,
  // otherwise fall back to raw theme colors.
  // Normalize hex values — Monaco requires 6+ digit hex for workbench colors too.
  const colorSource = resolvedColors || themeData.colors || {}
  const colors: Record<string, string> = {}
  for (const [key, val] of Object.entries(colorSource)) {
    if (typeof val !== 'string' || !val) continue
    const normalized = normalizeHex(val)
    colors[key] = normalized ? `#${normalized}` : val
  }

  return { base, inherit: true, rules, colors }
}

// ─── Determine Theme Type ────────────────────────────────────────────────────

function resolveThemeType(themeData: VSCodeTheme, uiTheme?: string): 'dark' | 'light' | 'hc' {
  if (themeData.type === 'light' || uiTheme === 'vs' || uiTheme === 'hc-light') return 'light'
  if (themeData.type === 'hc' || uiTheme === 'hc-black') return 'hc'
  if (uiTheme === 'vs-dark' || themeData.type === 'dark') return 'dark'

  // Heuristic: check editor background luminance
  const bg = themeData.colors?.['editor.background']
  if (bg) {
    const { l } = hexToHSL(bg)
    return l > 0.5 ? 'light' : 'dark'
  }
  return 'dark'
}

// ─── Resolve Complete Color Palette ──────────────────────────────────────────
// Fill in any missing VSCode colour keys with intelligent derivations
// from whatever the theme DOES define.

function resolveColors(raw: Record<string, string>, isDark: boolean): Record<string, string> {
  const c = { ...raw }
  const get = (key: string) => c[key]
  const set = (key: string, val: string) => { if (!c[key]) c[key] = val }

  // 4 anchor colours everything derives from
  const edBg = get('editor.background') || (isDark ? '#1e1e2e' : '#ffffff')
  const edFg = get('editor.foreground') || get('foreground') || (isDark ? '#cccccc' : '#333333')
  const fg   = get('foreground') || edFg
  const acc  = get('focusBorder') || get('button.background') ||
               get('activityBar.foreground') || get('tab.activeBorderTop') ||
               get('panelTitle.activeBorder') || (isDark ? '#007acc' : '#005fb8')

  set('editor.background', edBg)
  set('editor.foreground', edFg)
  set('foreground', fg)
  set('focusBorder', acc)

  const darker  = (d: number) => adjustLightness(edBg, isDark ? -d : d)
  const lighter = (d: number) => adjustLightness(edBg, isDark ?  d : -d)

  // UI backgrounds
  set('titleBar.activeBackground',       get('sideBar.background') || darker(0.04))
  set('titleBar.activeForeground',       fg)
  set('titleBar.inactiveBackground',     get('titleBar.activeBackground')!)
  set('titleBar.inactiveForeground',     adjustLightness(fg, isDark ? -0.2 : 0.2))
  set('sideBar.background',             get('titleBar.activeBackground') || darker(0.03))
  set('sideBar.foreground',             fg)
  set('sideBarTitle.foreground',        get('descriptionForeground') || adjustLightness(fg, isDark ? -0.15 : 0.15))
  set('sideBarSectionHeader.background', get('sideBar.background')!)
  set('sideBarSectionHeader.foreground', get('sideBarTitle.foreground')!)
  set('activityBar.background',          get('titleBar.activeBackground')!)
  set('activityBar.foreground',          acc)
  set('activityBar.inactiveForeground',  adjustLightness(fg, isDark ? -0.3 : 0.3))
  set('activityBarBadge.background',     acc)
  set('activityBarBadge.foreground',     isDark ? darker(0.1) : '#ffffff')

  // Widgets / surfaces
  set('editorWidget.background',         lighter(0.03))
  set('editorWidget.border',             adjustLightness(edBg, isDark ? 0.1 : -0.15))
  set('input.background',               get('editorWidget.background')!)
  set('input.foreground',               fg)
  set('input.border',                   get('editorWidget.border')!)
  set('input.placeholderForeground',    adjustLightness(fg, isDark ? -0.3 : 0.3))

  // Editor
  set('editor.lineHighlightBackground',  lighter(0.02))
  set('editor.selectionBackground',      withAlpha(acc, 0.3))
  set('editorCursor.foreground',         fg)
  set('editorLineNumber.foreground',     adjustLightness(fg, isDark ? -0.35 : 0.35))
  set('editorLineNumber.activeForeground', get('descriptionForeground') || adjustLightness(fg, isDark ? -0.15 : 0.15))
  set('editorIndentGuide.background',    get('editorWidget.border')!)
  set('editorIndentGuide.activeBackground', adjustLightness(get('editorWidget.border')!, isDark ? 0.1 : -0.1))

  // Tabs
  set('editorGroupHeader.tabsBackground', get('titleBar.activeBackground')!)
  set('editorGroup.border',              get('editorWidget.border')!)
  set('tab.activeBackground',            get('sideBar.background') || darker(0.02))
  set('tab.activeForeground',            fg)
  set('tab.inactiveBackground',          get('editorGroupHeader.tabsBackground')!)
  set('tab.inactiveForeground',          get('editorLineNumber.foreground')!)
  set('tab.border',                      get('editorWidget.border')!)
  set('tab.activeBorderTop',             acc)

  // Status bar
  set('statusBar.background',            get('titleBar.activeBackground')!)
  set('statusBar.foreground',            get('descriptionForeground') || adjustLightness(fg, isDark ? -0.15 : 0.15))
  set('statusBarItem.hoverBackground',   lighter(0.05))

  // Panel
  set('panel.background',               edBg)
  set('panel.border',                   get('editorWidget.border')!)
  set('panelTitle.activeBorder',        acc)
  set('panelTitle.activeForeground',    fg)
  set('panelTitle.inactiveForeground',  get('editorLineNumber.foreground')!)

  // Terminal
  set('terminal.background',            edBg)
  set('terminal.foreground',            edFg)

  // Buttons
  set('button.background',              acc)
  set('button.foreground',              isDark ? darker(0.1) : '#ffffff')
  set('button.hoverBackground',         adjustLightness(acc, isDark ? 0.05 : -0.05))
  set('button.secondaryBackground',     get('editorWidget.border')!)
  set('button.secondaryForeground',     fg)

  // Scrollbar
  set('scrollbar.shadow',               withAlpha('#000000', isDark ? 0.2 : 0.1))
  set('scrollbarSlider.background',     withAlpha(get('editorWidget.border')!, 0.5))
  set('scrollbarSlider.hoverBackground', withAlpha(get('editorWidget.border')!, 0.7))
  set('scrollbarSlider.activeBackground', withAlpha(get('editorWidget.border')!, 0.9))
  set('widget.shadow',                  withAlpha('#000000', isDark ? 0.4 : 0.16))

  // Lists
  set('list.activeSelectionBackground',  get('editorWidget.border')!)
  set('list.activeSelectionForeground',  fg)
  set('list.inactiveSelectionBackground', lighter(0.04))
  set('list.hoverBackground',           lighter(0.04))
  set('list.highlightForeground',       acc)

  // Semantic colours
  set('descriptionForeground',          adjustLightness(fg, isDark ? -0.15 : 0.15))
  set('errorForeground',                isDark ? '#f38ba8' : '#d32f2f')
  set('selection.background',           withAlpha(acc, 0.3))
  set('progressBar.background',         acc)

  // Notifications / badges
  set('notifications.background',       get('editorWidget.background')!)
  set('notifications.foreground',       fg)
  set('notifications.border',           get('editorWidget.border')!)
  set('badge.background',               acc)
  set('badge.foreground',               get('button.foreground')!)

  // Git
  set('gitDecoration.addedResourceForeground',      isDark ? '#a6e3a1' : '#2e7d32')
  set('gitDecoration.modifiedResourceForeground',    isDark ? '#f9e2af' : '#e65100')
  set('gitDecoration.deletedResourceForeground',     isDark ? '#f38ba8' : '#c62828')
  set('gitDecoration.untrackedResourceForeground',   get('gitDecoration.addedResourceForeground')!)
  set('gitDecoration.conflictingResourceForeground', isDark ? '#fab387' : '#ff6f00')

  // ANSI terminal colours
  const ansi: Record<string, string> = isDark ? {
    'terminal.ansiBlack':'#45475a','terminal.ansiRed':'#f38ba8','terminal.ansiGreen':'#a6e3a1',
    'terminal.ansiYellow':'#f9e2af','terminal.ansiBlue':'#89b4fa','terminal.ansiMagenta':'#cba6f7',
    'terminal.ansiCyan':'#94e2d5','terminal.ansiWhite':'#bac2de','terminal.ansiBrightBlack':'#585b70',
    'terminal.ansiBrightRed':'#f38ba8','terminal.ansiBrightGreen':'#a6e3a1',
    'terminal.ansiBrightYellow':'#f9e2af','terminal.ansiBrightBlue':'#89b4fa',
    'terminal.ansiBrightMagenta':'#f5c2e7','terminal.ansiBrightCyan':'#94e2d5',
    'terminal.ansiBrightWhite':'#a6adc8',
  } : {
    'terminal.ansiBlack':'#000000','terminal.ansiRed':'#cd3131','terminal.ansiGreen':'#00bc00',
    'terminal.ansiYellow':'#949800','terminal.ansiBlue':'#0451a5','terminal.ansiMagenta':'#bc05bc',
    'terminal.ansiCyan':'#0598bc','terminal.ansiWhite':'#555555','terminal.ansiBrightBlack':'#666666',
    'terminal.ansiBrightRed':'#cd3131','terminal.ansiBrightGreen':'#14ce14',
    'terminal.ansiBrightYellow':'#b5ba00','terminal.ansiBrightBlue':'#0451a5',
    'terminal.ansiBrightMagenta':'#bc05bc','terminal.ansiBrightCyan':'#0598bc',
    'terminal.ansiBrightWhite':'#a5a5a5',
  }
  for (const [k, v] of Object.entries(ansi)) set(k, v)

  return c
}

// ─── Apply Full Theme ────────────────────────────────────────────────────────

let currentThemeId: string | null = null
let themeVersion = 0
const allSetVars = new Set<string>()
let globalMonaco: typeof import('monaco-editor') | null = null

function persistThemeCache(root: HTMLElement, themeType: string): void {
  const vars: Record<string, string> = {}
  for (const name of allSetVars) {
    const val = root.style.getPropertyValue(name).trim()
    if (val) vars[name] = val
  }
  try {
    const payload: ThemeCssCachePayload = {
      v: THEME_CSS_CACHE_VERSION,
      themeType,
      vars,
    }
    localStorage.setItem(THEME_CSS_CACHE_KEY, JSON.stringify(payload))
  } catch {
    /* quota / private mode */
  }
}

export function getCurrentThemeId(): string | null {
  return currentThemeId
}

/**
 * Register the Monaco editor instance so applyFullTheme always has access.
 * Call this once from EditorPanel on mount.
 */
export function registerMonaco(monaco: typeof import('monaco-editor')): void {
  globalMonaco = monaco
}

export function applyFullTheme(
  themeData: VSCodeTheme,
  uiTheme: string,
  monaco?: typeof import('monaco-editor'),
  themeInfo?: ThemeInfo,
): void {
  const root = document.documentElement

  // 0. Clear managed CSS variables (in-memory set is empty after reload; hydrate needs full clear)
  clearManagedThemeCssVars(root)
  allSetVars.clear()

  // Determine theme type early so resolveColors knows light vs dark
  const themeType = resolveThemeType(themeData, uiTheme)
  const isDark = themeType !== 'light'

  // 1. Resolve a complete colour palette (fills gaps with smart defaults)
  const colors = resolveColors(themeData.colors || {}, isDark)

  // 2. Set all direct CSS variables from the map
  for (const [vsKey, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const color = colors[vsKey]
    if (color) {
      root.style.setProperty(cssVar, color)
      allSetVars.add(cssVar)
    }
  }

  // 3. Derived / composite variables
  const accent      = colors['focusBorder']!
  const bgSurface   = colors['editorWidget.background']!
  const bgSurfHover = colors['statusBarItem.hoverBackground'] || colors['list.hoverBackground'] ||
                      adjustLightness(bgSurface, isDark ? 0.03 : -0.03)
  const accentHover = colors['button.hoverBackground'] || adjustLightness(accent, isDark ? 0.05 : -0.05)
  const success     = colors['gitDecoration.addedResourceForeground']!
  const warning     = colors['gitDecoration.modifiedResourceForeground']!
  const danger      = colors['errorForeground']!
  const textMuted   = colors['editorLineNumber.foreground']!
  const textSec     = colors['descriptionForeground']!

  const derived: Record<string, string> = {
    '--accent':           accent,
    '--accent-hover':     accentHover,
    '--bg-surface':       bgSurface,
    '--bg-surface-hover': bgSurfHover,
    '--success':          success,
    '--warning':          warning,
    '--danger':           danger,
    '--text-muted':       textMuted,
    '--text-secondary':   textSec,
    '--accent-tint-10':   withAlpha(accent, 0.1),
    '--accent-tint-06':   withAlpha(accent, 0.06),
    '--accent-tint-03':   withAlpha(accent, 0.03),
    '--danger-tint-15':   withAlpha(danger, 0.15),
    '--danger-tint-08':   withAlpha(danger, 0.08),
    '--success-tint-10':  withAlpha(success, 0.1),
    '--border-tint-40':   withAlpha(colors['editorWidget.border'] || '#383850', 0.4),
    '--radius':           '6px',
  }
  for (const [k, v] of Object.entries(derived)) {
    root.style.setProperty(k, v)
    allSetVars.add(k)
  }

  // 4. Theme type attribute
  root.dataset.themeType = themeType

  // 5. Monaco theme — use passed monaco OR the globally registered one
  //    Wrapped in try/catch so CSS variables survive even if Monaco rejects the theme
  const monacoInstance = monaco || globalMonaco
  if (monacoInstance) {
    try {
      themeVersion++
      const monacoTheme = convertToMonacoTheme(themeData, uiTheme, colors)
      const baseName = themeInfo
        ? `ext-theme-${themeInfo.extensionId}-${themeInfo.label}`.replace(/[^a-zA-Z0-9-]/g, '-')
        : 'dynamic-ide-default'
      const themeId = `${baseName}-v${themeVersion}`
      monacoInstance.editor.defineTheme(themeId, monacoTheme)
      monacoInstance.editor.setTheme(themeId)
      currentThemeId = themeId
    } catch (err) {
      log.warn('monaco_theme_apply', err instanceof Error ? err.message : String(err))
    }
  }

  // 6. Persist extension theme selection
  if (themeInfo) {
    localStorage.setItem('dynamic-ide-theme', JSON.stringify({
      extensionId: themeInfo.extensionId,
      label: themeInfo.label,
      uiTheme: themeInfo.uiTheme,
      themePath: themeInfo.themePath,
    }))
  }

  persistThemeCache(root, themeType)
  syncWindowChromeFromEditorBackground(colors['editor.background'] || '#1e1e2e')
}

// ─── Theme Initialization ────────────────────────────────────────────────────

export async function initializeDefaultTheme(
  monaco?: typeof import('monaco-editor'),
): Promise<void> {
  const saved = getSavedThemeInfo()

  if (saved) {
    try {
      const themeData = await window.electronAPI.extensions.loadTheme(saved.themePath)
      if (themeData) {
        applyFullTheme(themeData, saved.uiTheme, monaco, saved)
        return
      }
    } catch {
      localStorage.removeItem('dynamic-ide-theme')
    }
  }

  applyFullTheme(defaultTheme, 'vs-dark', monaco)
}

export function getSavedThemeInfo(): ThemeInfo | null {
  try {
    const raw = localStorage.getItem('dynamic-ide-theme')
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

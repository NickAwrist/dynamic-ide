import type { editor } from 'monaco-editor'

interface VSCodeTheme {
  name?: string
  type?: string
  colors?: Record<string, string>
  tokenColors?: Array<{
    name?: string
    scope?: string | string[]
    settings: {
      foreground?: string
      background?: string
      fontStyle?: string
    }
  }>
  semanticHighlighting?: boolean
  semanticTokenColors?: Record<string, any>
}

interface ThemeInfo {
  extensionId: string
  label: string
  uiTheme: string
  themePath: string
}

const CSS_VAR_MAP: Record<string, string> = {
  'editor.background': '--ide-editor-bg',
  'editor.foreground': '--ide-editor-fg',
  'editor.lineHighlightBackground': '--ide-editor-line-highlight',
  'editor.selectionBackground': '--ide-editor-selection',
  'editorCursor.foreground': '--ide-editor-cursor',
  'editorLineNumber.foreground': '--ide-editor-line-number',
  'editorLineNumber.activeForeground': '--ide-editor-line-number-active',
  'sideBar.background': '--ide-sidebar-bg',
  'sideBar.foreground': '--ide-sidebar-fg',
  'sideBarTitle.foreground': '--ide-sidebar-title-fg',
  'activityBar.background': '--ide-activity-bg',
  'activityBar.foreground': '--ide-activity-fg',
  'titleBar.activeBackground': '--ide-titlebar-bg',
  'titleBar.activeForeground': '--ide-titlebar-fg',
  'titleBar.inactiveBackground': '--ide-titlebar-inactive-bg',
  'titleBar.inactiveForeground': '--ide-titlebar-inactive-fg',
  'statusBar.background': '--ide-statusbar-bg',
  'statusBar.foreground': '--ide-statusbar-fg',
  'tab.activeBackground': '--ide-tab-active-bg',
  'tab.activeForeground': '--ide-tab-active-fg',
  'tab.inactiveBackground': '--ide-tab-inactive-bg',
  'tab.inactiveForeground': '--ide-tab-inactive-fg',
  'tab.border': '--ide-tab-border',
  'panel.background': '--ide-panel-bg',
  'panel.border': '--ide-panel-border',
  'terminal.background': '--ide-terminal-bg',
  'terminal.foreground': '--ide-terminal-fg',
  'input.background': '--ide-input-bg',
  'input.foreground': '--ide-input-fg',
  'input.border': '--ide-input-border',
  'input.placeholderForeground': '--ide-input-placeholder',
  'button.background': '--ide-button-bg',
  'button.foreground': '--ide-button-fg',
  'button.hoverBackground': '--ide-button-hover-bg',
  'list.activeSelectionBackground': '--ide-list-active-bg',
  'list.activeSelectionForeground': '--ide-list-active-fg',
  'list.hoverBackground': '--ide-list-hover-bg',
  'focusBorder': '--ide-focus-border',
  'foreground': '--ide-fg',
  'descriptionForeground': '--ide-description-fg',
  'errorForeground': '--ide-error-fg',
  'widget.shadow': '--ide-widget-shadow',
  'scrollbar.shadow': '--ide-scrollbar-shadow',
  'scrollbarSlider.background': '--ide-scrollbar-bg',
  'scrollbarSlider.hoverBackground': '--ide-scrollbar-hover-bg',
  'scrollbarSlider.activeBackground': '--ide-scrollbar-active-bg',
}

function uiThemeToMonacoBase(uiTheme: string): 'vs' | 'vs-dark' | 'hc-black' {
  switch (uiTheme) {
    case 'vs': return 'vs'
    case 'vs-dark': return 'vs-dark'
    case 'hc-black': return 'hc-black'
    case 'hc-light': return 'vs'
    default: return 'vs-dark'
  }
}

export function convertToMonacoTheme(
  themeData: VSCodeTheme,
  uiTheme: string,
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
        if (tc.settings.foreground) rule.foreground = stripHash(tc.settings.foreground)
        if (tc.settings.background) rule.background = stripHash(tc.settings.background)
        if (tc.settings.fontStyle) rule.fontStyle = tc.settings.fontStyle
        rules.push(rule)
      }
    }
  }

  const colors: Record<string, string> = {}
  if (themeData.colors) {
    for (const [key, value] of Object.entries(themeData.colors)) {
      if (value) colors[key] = value
    }
  }

  return { base, inherit: true, rules, colors }
}

function stripHash(color: string): string {
  return color.startsWith('#') ? color.slice(1) : color
}

export function applyCSSVariables(themeData: VSCodeTheme): void {
  const root = document.documentElement

  if (themeData.colors) {
    for (const [vsKey, cssVar] of Object.entries(CSS_VAR_MAP)) {
      const color = themeData.colors[vsKey]
      if (color) {
        root.style.setProperty(cssVar, color)
      }
    }
  }
}

export function clearCSSVariables(): void {
  const root = document.documentElement
  for (const cssVar of Object.values(CSS_VAR_MAP)) {
    root.style.removeProperty(cssVar)
  }
}

let currentThemeId: string | null = null

export function getCurrentThemeId(): string | null {
  return currentThemeId
}

export async function applyTheme(
  themeInfo: ThemeInfo,
  monaco: typeof import('monaco-editor'),
): Promise<void> {
  try {
    const themeData = await window.electronAPI.extensions.loadTheme(themeInfo.themePath)
    if (!themeData) return

    const monacoTheme = convertToMonacoTheme(themeData, themeInfo.uiTheme)
    const themeId = `ext-theme-${themeInfo.extensionId}-${themeInfo.label}`.replace(/[^a-zA-Z0-9-]/g, '-')

    monaco.editor.defineTheme(themeId, monacoTheme)
    monaco.editor.setTheme(themeId)

    applyCSSVariables(themeData)
    currentThemeId = themeId

    localStorage.setItem('dynamic-ide-theme', JSON.stringify({
      extensionId: themeInfo.extensionId,
      label: themeInfo.label,
      uiTheme: themeInfo.uiTheme,
      themePath: themeInfo.themePath,
    }))
  } catch (err) {
    console.error('Failed to apply theme:', err)
  }
}

export function getSavedThemeInfo(): ThemeInfo | null {
  try {
    const raw = localStorage.getItem('dynamic-ide-theme')
    if (raw) return JSON.parse(raw)
  } catch {}
  return null
}

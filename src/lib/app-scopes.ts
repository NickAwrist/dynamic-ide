/**
 * Canonical hierarchical scopes (proto-style). Root prefix: orbis
 */
export const Scopes = {
  mainExtensionProtocol: 'orbis.main.extension.protocol',
  mainExtensionHost: 'orbis.main.extension.host',
  mainExtensionHostProcess: 'orbis.main.extension.host.process',
  mainPty: 'orbis.main.pty',
  mainExtensionRpc: 'orbis.main.extension.rpc',
  mainExtensionBridge: 'orbis.main.extension.bridge',
  uiPanelBrowser: 'orbis.ui.panel.browser',
  uiPanelEditor: 'orbis.ui.panel.editor',
  uiPanelTerminal: 'orbis.ui.panel.terminal',
  uiPanelT3: 'orbis.ui.panel.t3',
  uiPanelExplorer: 'orbis.ui.panel.explorer',
  uiStoreWorkspace: 'orbis.ui.store.workspace',
  uiModalExtensions: 'orbis.ui.modal.extensions',
  uiThemeEngine: 'orbis.ui.theme.engine',
} as const

export type ScopeKey = keyof typeof Scopes

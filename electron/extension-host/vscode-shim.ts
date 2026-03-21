/**
 * Minimal vscode API shim that gets injected when extensions require('vscode').
 * Implements the subset needed for basic extension activation and contribution.
 */

type Listener = (...args: any[]) => any

let sendToMain: (method: string, params: any) => void = () => {}

export function _setSendToMain(fn: (method: string, params: any) => void) {
  sendToMain = fn
}

// --- Disposable ---

class Disposable {
  private _callOnDispose?: () => void
  constructor(callOnDispose: () => void) {
    this._callOnDispose = callOnDispose
  }
  dispose() {
    this._callOnDispose?.()
    this._callOnDispose = undefined
  }
  static from(...disposables: { dispose: () => any }[]): Disposable {
    return new Disposable(() => {
      for (const d of disposables) d.dispose()
    })
  }
}

// --- EventEmitter ---

class EventEmitter<T> {
  private _listeners: Array<(e: T) => any> = []

  event = (listener: (e: T) => any, _thisArgs?: any, disposables?: Disposable[]): Disposable => {
    this._listeners.push(listener)
    const d = new Disposable(() => {
      const idx = this._listeners.indexOf(listener)
      if (idx >= 0) this._listeners.splice(idx, 1)
    })
    disposables?.push(d as any)
    return d
  }

  fire(data: T) {
    for (const l of this._listeners) {
      try { l(data) } catch (e) { console.error(e) }
    }
  }

  dispose() {
    this._listeners.length = 0
  }
}

// --- Uri ---

class Uri {
  readonly scheme: string
  readonly authority: string
  readonly path: string
  readonly query: string
  readonly fragment: string

  private constructor(scheme: string, authority: string, path: string, query: string, fragment: string) {
    this.scheme = scheme
    this.authority = authority
    this.path = path
    this.query = query
    this.fragment = fragment
  }

  get fsPath(): string {
    if (this.scheme === 'file') {
      let p = this.path
      // On Windows, strip the leading / before a drive letter: /C:/foo → C:/foo
      if (process.platform === 'win32' && /^\/[a-zA-Z]:\//.test(p)) {
        p = p.slice(1)
      }
      return p.replace(/\//g, process.platform === 'win32' ? '\\' : '/')
    }
    return this.path
  }

  toString(): string {
    let result = `${this.scheme}://`
    if (this.authority) result += this.authority
    result += this.path
    if (this.query) result += `?${this.query}`
    if (this.fragment) result += `#${this.fragment}`
    return result
  }

  with(change: { scheme?: string; authority?: string; path?: string; query?: string; fragment?: string }): Uri {
    return new Uri(
      change.scheme ?? this.scheme,
      change.authority ?? this.authority,
      change.path ?? this.path,
      change.query ?? this.query,
      change.fragment ?? this.fragment,
    )
  }

  toJSON(): any {
    return { scheme: this.scheme, authority: this.authority, path: this.path, query: this.query, fragment: this.fragment }
  }

  static parse(value: string): Uri {
    const match = value.match(/^([a-zA-Z][\w+.-]*):\/\/([^/?#]*)([^?#]*)(\?[^#]*)?(#.*)?$/)
    if (match) {
      return new Uri(match[1], match[2] || '', match[3] || '', (match[4] || '').slice(1), (match[5] || '').slice(1))
    }
    return new Uri('file', '', value, '', '')
  }

  static file(path: string): Uri {
    const normalized = path.replace(/\\/g, '/')
    return new Uri('file', '', normalized.startsWith('/') ? normalized : '/' + normalized, '', '')
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    const joined = [base.path, ...pathSegments].join('/')
    return base.with({ path: joined })
  }
}

// --- CancellationToken ---

class CancellationTokenSource {
  private _token: { isCancellationRequested: boolean; onCancellationRequested: any }
  private _emitter = new EventEmitter<void>()

  constructor() {
    this._token = {
      isCancellationRequested: false,
      onCancellationRequested: this._emitter.event,
    }
  }

  get token() { return this._token }

  cancel() {
    this._token.isCancellationRequested = true
    this._emitter.fire()
  }

  dispose() {
    this._emitter.dispose()
  }
}

// --- Position / Range / Selection ---

class Position {
  constructor(public readonly line: number, public readonly character: number) {}
  isEqual(other: Position) { return this.line === other.line && this.character === other.character }
  isBefore(other: Position) { return this.line < other.line || (this.line === other.line && this.character < other.character) }
  isAfter(other: Position) { return !this.isEqual(other) && !this.isBefore(other) }
  translate(lineDelta = 0, characterDelta = 0) { return new Position(this.line + lineDelta, this.character + characterDelta) }
  with(line?: number, character?: number) { return new Position(line ?? this.line, character ?? this.character) }
}

class Range {
  readonly start: Position
  readonly end: Position
  constructor(startLine: number | Position, startChar: number | Position, endLine?: number, endChar?: number) {
    if (startLine instanceof Position && startChar instanceof Position) {
      this.start = startLine; this.end = startChar
    } else {
      this.start = new Position(startLine as number, startChar as number)
      this.end = new Position(endLine!, endChar!)
    }
  }
  get isEmpty() { return this.start.isEqual(this.end) }
  get isSingleLine() { return this.start.line === this.end.line }
  contains(posOrRange: Position | Range) { return true }
  with(start?: Position, end?: Position) { return new Range(start ?? this.start, end ?? this.end) }
}

class Selection extends Range {
  readonly anchor: Position
  readonly active: Position
  constructor(anchorLine: number | Position, anchorChar: number | Position, activeLine?: number, activeChar?: number) {
    if (anchorLine instanceof Position && anchorChar instanceof Position) {
      super(anchorLine, anchorChar)
      this.anchor = anchorLine; this.active = anchorChar
    } else {
      super(anchorLine as number, anchorChar as number, activeLine!, activeChar!)
      this.anchor = new Position(anchorLine as number, anchorChar as number)
      this.active = new Position(activeLine!, activeChar!)
    }
  }
  get isReversed() { return this.anchor.isAfter(this.active) }
}

// --- Enums ---

enum StatusBarAlignment { Left = 1, Right = 2 }
enum ViewColumn { Active = -1, Beside = -2, One = 1, Two = 2, Three = 3 }
enum DiagnosticSeverity { Error = 0, Warning = 1, Information = 2, Hint = 3 }
enum ConfigurationTarget { Global = 1, Workspace = 2, WorkspaceFolder = 3 }
enum ExtensionKind { UI = 1, Workspace = 2 }
enum OverviewRulerLane { Left = 1, Center = 2, Right = 4, Full = 7 }
enum TextEditorRevealType { Default = 0, InCenter = 1, InCenterIfOutsideViewport = 2, AtTop = 3 }

// --- Output Channel ---

class OutputChannel {
  private _lines: string[] = []
  constructor(public readonly name: string) {}
  append(value: string) { this._lines.push(value) }
  appendLine(value: string) { this._lines.push(value + '\n') }
  clear() { this._lines.length = 0 }
  show() { sendToMain('outputChannel.show', { name: this.name }) }
  hide() {}
  dispose() {}
  replace(value: string) { this._lines = [value] }
}

// --- StatusBarItem ---

class StatusBarItem {
  alignment: StatusBarAlignment
  priority: number
  text = ''
  tooltip = ''
  color: string | undefined
  backgroundColor: string | undefined
  command: string | undefined
  accessibilityInformation: any
  name: string | undefined

  private _visible = false
  private _id: string

  constructor(alignment: StatusBarAlignment, priority: number) {
    this.alignment = alignment
    this.priority = priority
    this._id = `sbi_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  }

  show() {
    this._visible = true
    sendToMain('statusBar.update', {
      id: this._id,
      text: this.text,
      tooltip: this.tooltip,
      command: this.command,
      alignment: this.alignment,
      priority: this.priority,
      visible: true,
    })
  }

  hide() {
    this._visible = false
    sendToMain('statusBar.update', {
      id: this._id,
      visible: false,
    })
  }

  dispose() {
    this.hide()
    sendToMain('statusBar.remove', { id: this._id })
  }
}

// --- Webview infrastructure ---

class WebviewImpl {
  private _html = ''
  private _options: any = {}
  private _messageEmitter = new EventEmitter<any>()
  private _viewId: string

  constructor(viewId: string) {
    this._viewId = viewId
  }

  get html() { return this._html }
  set html(value: string) {
    this._html = value
    sendToMain('webview.htmlUpdate', { viewId: this._viewId, html: value })
  }

  get options() { return this._options }
  set options(value: any) { this._options = value }

  get cspSource() { return 'vscode-webview-resource:' }

  onDidReceiveMessage = this._messageEmitter.event

  postMessage(message: any): Thenable<boolean> {
    sendToMain('webview.postMessage', { viewId: this._viewId, message })
    return Promise.resolve(true)
  }

  asWebviewUri(uri: any): any {
    if (uri && uri.fsPath) {
      const normalized = uri.fsPath.replace(/\\/g, '/')
      const withLeadingSlash = normalized.startsWith('/') ? normalized : '/' + normalized
      return Uri.parse(`vscode-webview-resource://${encodeURI(withLeadingSlash)}`)
    }
    return uri
  }

  _receiveMessage(message: any) {
    this._messageEmitter.fire(message)
  }
}

const webviewViewProviders = new Map<string, any>()
const liveWebviews = new Map<string, WebviewImpl>()

export function _getRegisteredViews(): Array<{ viewId: string; type: 'webviewView' | 'treeData' | 'webviewPanel' }> {
  const views: Array<{ viewId: string; type: 'webviewView' | 'treeData' | 'webviewPanel' }> = []
  for (const viewId of webviewViewProviders.keys()) {
    views.push({ viewId, type: 'webviewView' })
  }
  return views
}

export async function _resolveWebviewView(viewId: string): Promise<{ html: string } | null> {
  const provider = webviewViewProviders.get(viewId)
  if (!provider || !provider.resolveWebviewView) {
    return null
  }

  const webview = new WebviewImpl(viewId)
  liveWebviews.set(viewId, webview)

  const view = {
    webview,
    viewType: viewId,
    title: '',
    description: '',
    badge: undefined,
    onDidChangeVisibility: new EventEmitter<boolean>().event,
    onDidDispose: new EventEmitter<void>().event,
    visible: true,
    show: () => {},
    dispose: () => { liveWebviews.delete(viewId) },
  }

  const cancellationToken = {
    isCancellationRequested: false,
    onCancellationRequested: new EventEmitter<any>().event,
  }

  try {
    const maybePromise = provider.resolveWebviewView(view, {}, cancellationToken)
    if (maybePromise && typeof maybePromise.then === 'function') {
      await maybePromise
    }
  } catch (err: any) {
    console.error(`[vscode-shim] resolveWebviewView failed for ${viewId}:`, err)
    return { html: `<html><body><pre>Error resolving view: ${err.message}</pre></body></html>` }
  }

  return { html: webview.html }
}

export function _handleWebviewMessage(viewId: string, message: any) {
  const webview = liveWebviews.get(viewId)
  if (webview) {
    webview._receiveMessage(message)
  }
}

// --- Commands ---

const commandRegistry = new Map<string, (...args: any[]) => any>()

// Context keys store (for setContext / when-clause evaluation)
const contextKeys = new Map<string, any>()

// Register VS Code built-in commands that extensions expect to exist
function registerBuiltinCommands() {
  commandRegistry.set('setContext', (key: string, value: any) => {
    contextKeys.set(key, value)
  })
  commandRegistry.set('workbench.action.openSettings', () => {})
  commandRegistry.set('workbench.action.openGlobalKeybindings', () => {})
  commandRegistry.set('workbench.extensions.installExtension', () => Promise.resolve())
  commandRegistry.set('workbench.extensions.uninstallExtension', () => Promise.resolve())
  commandRegistry.set('vscode.open', () => Promise.resolve())
  commandRegistry.set('vscode.openFolder', () => Promise.resolve())
  commandRegistry.set('vscode.diff', () => Promise.resolve())
  commandRegistry.set('editor.action.showReferences', () => Promise.resolve())
  commandRegistry.set('markdown.showPreview', () => Promise.resolve())
  commandRegistry.set('workbench.action.closeActiveEditor', () => {})
  commandRegistry.set('workbench.action.reloadWindow', () => {})
  commandRegistry.set('_setContext', (key: string, value: any) => { contextKeys.set(key, value) })
}
registerBuiltinCommands()

const commands = {
  registerCommand(command: string, callback: (...args: any[]) => any, _thisArg?: any): Disposable {
    commandRegistry.set(command, callback)
    sendToMain('commands.registered', { command })
    return new Disposable(() => { commandRegistry.delete(command) })
  },

  registerTextEditorCommand(command: string, callback: (...args: any[]) => any, _thisArg?: any): Disposable {
    commandRegistry.set(command, callback)
    return new Disposable(() => { commandRegistry.delete(command) })
  },

  async executeCommand<T = unknown>(command: string, ...args: any[]): Promise<T> {
    const handler = commandRegistry.get(command)
    if (handler) return handler(...args)
    // Silently resolve for unknown commands instead of crashing
    console.warn(`[vscode-shim] Unknown command: ${command}`)
    return undefined as any
  },

  getCommands(filterInternal = false): Thenable<string[]> {
    return Promise.resolve(Array.from(commandRegistry.keys()))
  },
}

export function _executeCommand(command: string, args: any[]): any {
  const handler = commandRegistry.get(command)
  if (handler) return handler(...args)
  console.warn(`[vscode-shim] Unknown command: ${command}`)
  return undefined
}

export function _getRegisteredCommands(): string[] {
  return Array.from(commandRegistry.keys())
}

// --- Window ---

const window = {
  showInformationMessage(message: string, ...items: any[]): Thenable<any> {
    sendToMain('window.showMessage', { level: 'info', message, items })
    return Promise.resolve(undefined)
  },
  showWarningMessage(message: string, ...items: any[]): Thenable<any> {
    sendToMain('window.showMessage', { level: 'warn', message, items })
    return Promise.resolve(undefined)
  },
  showErrorMessage(message: string, ...items: any[]): Thenable<any> {
    sendToMain('window.showMessage', { level: 'error', message, items })
    return Promise.resolve(undefined)
  },
  showQuickPick(items: any[], options?: any): Thenable<any> {
    return Promise.resolve(undefined)
  },
  showInputBox(options?: any): Thenable<string | undefined> {
    return Promise.resolve(undefined)
  },
  createOutputChannel(name: string): OutputChannel {
    return new OutputChannel(name)
  },
  createStatusBarItem(alignmentOrId?: StatusBarAlignment | string, priorityOrAlignment?: number | StatusBarAlignment, priority?: number): StatusBarItem {
    let alignment = StatusBarAlignment.Left
    let prio = 0
    if (typeof alignmentOrId === 'number') {
      alignment = alignmentOrId
      prio = (priorityOrAlignment as number) || 0
    }
    return new StatusBarItem(alignment, prio)
  },
  showTextDocument: () => Promise.resolve(undefined),
  createTextEditorDecorationType: () => ({ key: '', dispose: () => {} }),
  activeTextEditor: undefined as any,
  visibleTextEditors: [] as any[],
  onDidChangeActiveTextEditor: new EventEmitter<any>().event,
  onDidChangeVisibleTextEditors: new EventEmitter<any[]>().event,
  onDidChangeTextEditorSelection: new EventEmitter<any>().event,
  onDidChangeWindowState: new EventEmitter<any>().event,
  onDidChangeTextEditorVisibleRanges: new EventEmitter<any>().event,
  onDidChangeTextEditorOptions: new EventEmitter<any>().event,
  onDidOpenTerminal: new EventEmitter<any>().event,
  onDidCloseTerminal: new EventEmitter<any>().event,
  onDidChangeActiveTerminal: new EventEmitter<any>().event,
  createWebviewPanel: (_viewType: string, _title: string, _showOptions: any, _options?: any) => {
    const panelId = `panel_${_viewType}_${Date.now()}`
    const webview = new WebviewImpl(panelId)
    liveWebviews.set(panelId, webview)
    const disposeEmitter = new EventEmitter<void>()
    const panel = {
      viewType: _viewType,
      title: _title,
      webview,
      options: _options || {},
      viewColumn: undefined,
      active: true,
      visible: true,
      onDidDispose: disposeEmitter.event,
      onDidChangeViewState: new EventEmitter<any>().event,
      reveal: () => {},
      dispose: () => {
        liveWebviews.delete(panelId)
        disposeEmitter.fire()
      },
    }
    sendToMain('window.webviewPanelCreated', { panelId, viewType: _viewType, title: _title })
    return panel
  },
  registerWebviewViewProvider: (viewId: string, provider: any, _options?: any) => {
    webviewViewProviders.set(viewId, provider)
    sendToMain('window.webviewViewRegistered', { viewId })
    return new Disposable(() => { webviewViewProviders.delete(viewId) })
  },
  registerTreeDataProvider: (viewId: string, treeDataProvider: any) => {
    sendToMain('window.treeDataProviderRegistered', { viewId })
    return new Disposable(() => {})
  },
  createTreeView: (viewId: string, options: any) => {
    sendToMain('window.treeViewCreated', { viewId })
    return {
      onDidExpandElement: new EventEmitter<any>().event,
      onDidCollapseElement: new EventEmitter<any>().event,
      onDidChangeSelection: new EventEmitter<any>().event,
      onDidChangeVisibility: new EventEmitter<any>().event,
      onDidChangeCheckboxState: new EventEmitter<any>().event,
      selection: [],
      visible: true,
      message: undefined,
      title: undefined,
      description: undefined,
      badge: undefined,
      reveal: () => Promise.resolve(),
      dispose: () => {},
    }
  },
  registerUriHandler: (_handler: any) => new Disposable(() => {}),
  registerCustomEditorProvider: (_viewType: string, _provider: any, _options?: any) => new Disposable(() => {}),
  registerTerminalProfileProvider: (_id: string, _provider: any) => new Disposable(() => {}),
  registerFileDecorationProvider: (_provider: any) => new Disposable(() => {}),
  registerTerminalLinkProvider: (_provider: any) => new Disposable(() => {}),
  createTerminal: (_options?: any) => ({
    name: _options?.name || 'Terminal',
    processId: Promise.resolve(undefined),
    sendText: () => {},
    show: () => {},
    hide: () => {},
    dispose: () => {},
    exitStatus: undefined,
    creationOptions: {},
    state: { isInteractedWith: false },
  }),
  terminals: [] as any[],
  activeTerminal: undefined as any,
  withProgress: (_options: any, task: any) => task(
    { report: (_value: any) => {} },
    { isCancellationRequested: false, onCancellationRequested: new EventEmitter<any>().event },
  ),
  setStatusBarMessage: (text: string, _hideAfterTimeout?: number) => {
    sendToMain('statusBar.message', { text })
    return new Disposable(() => {})
  },
  showSaveDialog: () => Promise.resolve(undefined),
  showOpenDialog: () => Promise.resolve(undefined),
  activeColorTheme: { kind: 2 }, // ColorThemeKind.Dark
  onDidChangeActiveColorTheme: new EventEmitter<any>().event,
  state: { focused: true },
  tabGroups: { all: [], onDidChangeTabs: new EventEmitter<any>().event, onDidChangeTabGroups: new EventEmitter<any>().event, close: () => Promise.resolve() },
}

// --- Workspace ---

let _workspaceFolders: Array<{ uri: Uri; name: string; index: number }> = []
const _configuration: Record<string, any> = {}

const workspaceEmitter = {
  onDidChangeConfiguration: new EventEmitter<any>(),
  onDidOpenTextDocument: new EventEmitter<any>(),
  onDidCloseTextDocument: new EventEmitter<any>(),
  onDidChangeTextDocument: new EventEmitter<any>(),
  onDidSaveTextDocument: new EventEmitter<any>(),
  onDidChangeWorkspaceFolders: new EventEmitter<any>(),
}

const workspace = {
  get workspaceFolders() { return _workspaceFolders.length > 0 ? _workspaceFolders : undefined },
  get name() { return _workspaceFolders[0]?.name },
  get rootPath() { return _workspaceFolders[0]?.uri.fsPath },
  getConfiguration(section?: string) {
    const data = section ? (_configuration[section] || {}) : _configuration
    return {
      get<T>(key: string, defaultValue?: T): T {
        return data[key] !== undefined ? data[key] : defaultValue as T
      },
      has(key: string) { return key in data },
      inspect() { return undefined },
      update() { return Promise.resolve() },
    }
  },
  createFileSystemWatcher: () => ({
    onDidCreate: new EventEmitter<any>().event,
    onDidChange: new EventEmitter<any>().event,
    onDidDelete: new EventEmitter<any>().event,
    dispose: () => {},
  }),
  openTextDocument: () => Promise.resolve({ getText: () => '', uri: Uri.file(''), languageId: 'plaintext' }),
  findFiles: () => Promise.resolve([]),
  onDidChangeConfiguration: workspaceEmitter.onDidChangeConfiguration.event,
  onDidOpenTextDocument: workspaceEmitter.onDidOpenTextDocument.event,
  onDidCloseTextDocument: workspaceEmitter.onDidCloseTextDocument.event,
  onDidChangeTextDocument: workspaceEmitter.onDidChangeTextDocument.event,
  onDidSaveTextDocument: workspaceEmitter.onDidSaveTextDocument.event,
  onDidChangeWorkspaceFolders: workspaceEmitter.onDidChangeWorkspaceFolders.event,
  fs: {
    readFile: () => Promise.resolve(Buffer.from('')),
    writeFile: () => Promise.resolve(),
    stat: () => Promise.resolve({ type: 1, size: 0, ctime: 0, mtime: 0 }),
    readDirectory: () => Promise.resolve([]),
    createDirectory: () => Promise.resolve(),
    delete: () => Promise.resolve(),
    rename: () => Promise.resolve(),
  },
  textDocuments: [],
  applyEdit: () => Promise.resolve(true),
  registerTextDocumentContentProvider: () => new Disposable(() => {}),
}

export function _setWorkspaceFolders(folders: string[]) {
  _workspaceFolders = folders.map((f, i) => ({
    uri: Uri.file(f),
    name: f.split(/[\\/]/).pop() || f,
    index: i,
  }))
}

// --- Extensions ---

const _extensionMap = new Map<string, any>()

const extensions = {
  getExtension(extensionId: string) {
    return _extensionMap.get(extensionId)
  },
  get all() {
    return Array.from(_extensionMap.values())
  },
  onDidChange: new EventEmitter<void>().event,
}

export function _registerExtension(id: string, ext: any) {
  _extensionMap.set(id, ext)
}

// --- Env ---

const env = {
  appName: 'Dynamic IDE',
  appRoot: process.cwd(),
  language: 'en',
  machineId: 'dynamic-ide',
  sessionId: `session-${Date.now()}`,
  uriScheme: 'dynamic-ide',
  clipboard: {
    readText: () => Promise.resolve(''),
    writeText: () => Promise.resolve(),
  },
  openExternal: (uri: Uri) => {
    sendToMain('env.openExternal', { uri: uri.toString() })
    return Promise.resolve(true)
  },
  shell: process.platform === 'win32' ? 'powershell.exe' : '/bin/bash',
  isNewAppInstall: false,
  isTelemetryEnabled: false,
  onDidChangeTelemetryEnabled: new EventEmitter<boolean>().event,
}

// --- Languages ---

const languages = {
  registerCompletionItemProvider: () => new Disposable(() => {}),
  registerHoverProvider: () => new Disposable(() => {}),
  registerDefinitionProvider: () => new Disposable(() => {}),
  registerReferenceProvider: () => new Disposable(() => {}),
  registerDocumentSymbolProvider: () => new Disposable(() => {}),
  registerCodeActionsProvider: () => new Disposable(() => {}),
  registerCodeLensProvider: () => new Disposable(() => {}),
  registerDocumentFormattingEditProvider: () => new Disposable(() => {}),
  registerDocumentRangeFormattingEditProvider: () => new Disposable(() => {}),
  registerSignatureHelpProvider: () => new Disposable(() => {}),
  registerRenameProvider: () => new Disposable(() => {}),
  registerDiagnosticCollection: () => ({ set: () => {}, delete: () => {}, clear: () => {}, dispose: () => {} }),
  createDiagnosticCollection: (name?: string) => ({
    name: name || '',
    set: () => {},
    delete: () => {},
    clear: () => {},
    forEach: () => {},
    get: () => undefined,
    has: () => false,
    dispose: () => {},
  }),
  getLanguages: () => Promise.resolve([]),
  match: () => 0,
  getDiagnostics: () => [],
  onDidChangeDiagnostics: new EventEmitter<any>().event,
  registerInlineCompletionItemProvider: () => new Disposable(() => {}),
  registerDocumentLinkProvider: () => new Disposable(() => {}),
  registerColorProvider: () => new Disposable(() => {}),
  registerFoldingRangeProvider: () => new Disposable(() => {}),
  registerDeclarationProvider: () => new Disposable(() => {}),
  registerImplementationProvider: () => new Disposable(() => {}),
  registerTypeDefinitionProvider: () => new Disposable(() => {}),
  registerCallHierarchyProvider: () => new Disposable(() => {}),
  registerTypeHierarchyProvider: () => new Disposable(() => {}),
  registerLinkedEditingRangeProvider: () => new Disposable(() => {}),
  registerDocumentSemanticTokensProvider: () => new Disposable(() => {}),
  registerDocumentRangeSemanticTokensProvider: () => new Disposable(() => {}),
  registerSelectionRangeProvider: () => new Disposable(() => {}),
  registerWorkspaceSymbolProvider: () => new Disposable(() => {}),
  registerInlayHintsProvider: () => new Disposable(() => {}),
  registerEvaluatableExpressionProvider: () => new Disposable(() => {}),
  setTextDocumentLanguage: () => Promise.resolve(undefined),
  setLanguageConfiguration: () => new Disposable(() => {}),
}

// --- TreeView stubs ---

class TreeItem {
  label: string | any
  collapsibleState?: number
  command?: any
  contextValue?: string
  description?: string
  iconPath?: any
  id?: string
  resourceUri?: Uri
  tooltip?: string | any
  constructor(labelOrUri: string | Uri, collapsibleState?: number) {
    this.label = typeof labelOrUri === 'string' ? labelOrUri : labelOrUri.toString()
    this.collapsibleState = collapsibleState
  }
}

enum TreeItemCollapsibleState { None = 0, Collapsed = 1, Expanded = 2 }

// --- Additional enums ---

enum TextDocumentSaveReason { Manual = 1, AfterDelay = 2, FocusOut = 3 }
enum EndOfLine { LF = 1, CRLF = 2 }
enum FileType { Unknown = 0, File = 1, Directory = 2, SymbolicLink = 64 }
enum CompletionItemKind {
  Text = 0, Method = 1, Function = 2, Constructor = 3, Field = 4,
  Variable = 5, Class = 6, Interface = 7, Module = 8, Property = 9,
  Unit = 10, Value = 11, Enum = 12, Keyword = 13, Snippet = 14,
  Color = 15, File = 16, Reference = 17, Folder = 18, EnumMember = 19,
  Constant = 20, Struct = 21, Event = 22, Operator = 23, TypeParameter = 24,
}
enum CompletionTriggerKind { Invoke = 0, TriggerCharacter = 1, TriggerForIncompleteCompletions = 2 }
enum SymbolKind {
  File = 0, Module = 1, Namespace = 2, Package = 3, Class = 4,
  Method = 5, Property = 6, Field = 7, Constructor = 8, Enum = 9,
  Interface = 10, Function = 11, Variable = 12, Constant = 13, String = 14,
  Number = 15, Boolean = 16, Array = 17, Object = 18, Key = 19,
  Null = 20, EnumMember = 21, Struct = 22, Event = 23, Operator = 24,
  TypeParameter = 25,
}
enum IndentAction { None = 0, Indent = 1, IndentOutdent = 2, Outdent = 3 }
enum CodeActionKind { Empty = '', QuickFix = 'quickfix', Refactor = 'refactor', Source = 'source' }
enum ProgressLocation { SourceControl = 1, Window = 10, Notification = 15 }
enum ColorThemeKind { Light = 1, Dark = 2, HighContrast = 3, HighContrastLight = 4 }
enum TaskRevealKind { Always = 1, Silent = 2, Never = 3 }
enum TaskPanelKind { Shared = 1, Dedicated = 2, New = 3 }
enum TaskScope { Global = 1, Workspace = 2 }
enum DocumentHighlightKind { Text = 0, Read = 1, Write = 2 }
enum InlineCompletionTriggerKind { Invoke = 0, Automatic = 1 }
enum FoldingRangeKind { Comment = 1, Imports = 2, Region = 3 }
enum SemanticTokensLegend { }
enum LogLevel { Off = 0, Trace = 1, Debug = 2, Info = 3, Warning = 4, Error = 5 }

// --- CompletionItem / CompletionList ---

class CompletionItem {
  label: string | any
  kind?: CompletionItemKind
  detail?: string
  documentation?: string | any
  sortText?: string
  filterText?: string
  insertText?: string | any
  range?: any
  command?: any
  constructor(label: string | any, kind?: CompletionItemKind) {
    this.label = label
    this.kind = kind
  }
}

class CompletionList {
  isIncomplete: boolean
  items: CompletionItem[]
  constructor(items: CompletionItem[] = [], isIncomplete = false) {
    this.items = items
    this.isIncomplete = isIncomplete
  }
}

// --- SnippetString ---

class SnippetString {
  value: string
  constructor(value = '') { this.value = value }
  appendText(str: string) { this.value += str.replace(/[$}\\]/g, '\\$&'); return this }
  appendTabstop(n = 0) { this.value += `$${n}`; return this }
  appendPlaceholder(value: string | ((s: SnippetString) => any), n?: number) {
    if (typeof value === 'string') this.value += `\${${n || 1}:${value}}`
    return this
  }
  appendChoice(values: string[], n?: number) { this.value += `\${${n || 1}|${values.join(',')}|}`; return this }
  appendVariable(name: string, defaultValue?: string) { this.value += `\${${name}:${defaultValue || ''}}`; return this }
}

// --- TextEdit / WorkspaceEdit ---

class TextEdit {
  range: Range
  newText: string
  constructor(range: Range, newText: string) { this.range = range; this.newText = newText }
  static replace(range: Range, newText: string) { return new TextEdit(range, newText) }
  static insert(position: Position, newText: string) { return new TextEdit(new Range(position, position), newText) }
  static delete(range: Range) { return new TextEdit(range, '') }
}

class WorkspaceEdit {
  private _edits: any[] = []
  replace(uri: Uri, range: Range, newText: string) { this._edits.push({ uri, range, newText }) }
  insert(uri: Uri, position: Position, newText: string) { this.replace(uri, new Range(position, position), newText) }
  delete(uri: Uri, range: Range) { this.replace(uri, range, '') }
  has(uri: Uri) { return this._edits.some((e) => e.uri?.toString() === uri.toString()) }
  set(uri: Uri, edits: TextEdit[]) { this._edits.push({ uri, edits }) }
  get size() { return this._edits.length }
  entries() { return this._edits }
  createFile() {}
  deleteFile() {}
  renameFile() {}
}

// --- Diagnostic ---

class Diagnostic {
  range: Range
  message: string
  severity: DiagnosticSeverity
  source?: string
  code?: string | number | any
  relatedInformation?: any[]
  tags?: number[]
  constructor(range: Range, message: string, severity: DiagnosticSeverity = DiagnosticSeverity.Error) {
    this.range = range
    this.message = message
    this.severity = severity
  }
}

// --- Location / DocumentLink ---

class Location {
  uri: Uri
  range: Range
  constructor(uri: Uri, rangeOrPosition: Range | Position) {
    this.uri = uri
    this.range = rangeOrPosition instanceof Position
      ? new Range(rangeOrPosition, rangeOrPosition)
      : rangeOrPosition
  }
}

class DocumentLink {
  range: Range
  target?: Uri
  tooltip?: string
  constructor(range: Range, target?: Uri) { this.range = range; this.target = target }
}

// --- CodeAction / CodeLens ---

class CodeAction {
  title: string
  kind?: any
  diagnostics?: Diagnostic[]
  isPreferred?: boolean
  edit?: WorkspaceEdit
  command?: any
  constructor(title: string, kind?: any) { this.title = title; this.kind = kind }
}

class CodeLens {
  range: Range
  command?: any
  isResolved: boolean
  constructor(range: Range, command?: any) { this.range = range; this.command = command; this.isResolved = !!command }
}

// --- Hover ---

class Hover {
  contents: any[]
  range?: Range
  constructor(contents: any, range?: Range) {
    this.contents = Array.isArray(contents) ? contents : [contents]
    this.range = range
  }
}

// --- SemanticTokensBuilder / SemanticTokensLegend class ---

class SemanticTokensLegendClass {
  tokenTypes: string[]
  tokenModifiers: string[]
  constructor(tokenTypes: string[], tokenModifiers: string[] = []) {
    this.tokenTypes = tokenTypes
    this.tokenModifiers = tokenModifiers
  }
}

class SemanticTokensBuilder {
  private _legend: SemanticTokensLegendClass
  constructor(legend?: SemanticTokensLegendClass) { this._legend = legend || new SemanticTokensLegendClass([]) }
  push() {}
  build() { return { data: new Uint32Array(0) } }
}

// --- RelativePattern ---

class RelativePattern {
  base: string
  pattern: string
  baseUri: Uri
  constructor(base: any, pattern: string) {
    this.base = typeof base === 'string' ? base : (base?.uri?.fsPath || base?.fsPath || '')
    this.pattern = pattern
    this.baseUri = typeof base === 'string' ? Uri.file(base) : (base?.uri || base)
  }
}

// --- MarkdownString ---

class MarkdownString {
  value: string
  isTrusted?: boolean
  supportThemeIcons?: boolean
  supportHtml?: boolean
  constructor(value = '', supportThemeIcons = false) {
    this.value = value
    this.supportThemeIcons = supportThemeIcons
  }
  appendText(value: string) { this.value += value; return this }
  appendMarkdown(value: string) { this.value += value; return this }
  appendCodeblock(value: string, language?: string) { this.value += `\n\`\`\`${language || ''}\n${value}\n\`\`\`\n`; return this }
}

// --- ThemeColor / ThemeIcon ---

class ThemeColor {
  constructor(public readonly id: string) {}
}

class ThemeIcon {
  static readonly File = new ThemeIcon('file')
  static readonly Folder = new ThemeIcon('folder')
  constructor(public readonly id: string, public readonly color?: ThemeColor) {}
}

// --- Assemble the API ---

export function createVSCodeAPI() {
  return {
    // Classes
    Disposable,
    EventEmitter,
    Uri,
    CancellationTokenSource,
    Position,
    Range,
    Selection,
    TreeItem,
    MarkdownString,
    ThemeColor,
    ThemeIcon,
    CompletionItem,
    CompletionList,
    SnippetString,
    TextEdit,
    WorkspaceEdit,
    Diagnostic,
    Location,
    DocumentLink,
    CodeAction,
    CodeLens,
    Hover,
    RelativePattern,
    SemanticTokensLegend: SemanticTokensLegendClass,
    SemanticTokensBuilder,

    // Enums
    StatusBarAlignment,
    ViewColumn,
    DiagnosticSeverity,
    ConfigurationTarget,
    ExtensionKind,
    OverviewRulerLane,
    TextEditorRevealType,
    TreeItemCollapsibleState,
    TextDocumentSaveReason,
    EndOfLine,
    FileType,
    CompletionItemKind,
    CompletionTriggerKind,
    SymbolKind,
    IndentAction,
    CodeActionKind,
    ProgressLocation,
    ColorThemeKind,
    TaskRevealKind,
    TaskPanelKind,
    TaskScope,
    DocumentHighlightKind,
    InlineCompletionTriggerKind,
    FoldingRangeKind,
    LogLevel,

    // Namespaces
    commands,
    window,
    workspace,
    extensions,
    env,
    languages,

    // Misc
    version: '1.90.0',

    // debug namespace stub
    debug: {
      onDidTerminateDebugSession: new EventEmitter<any>().event,
      onDidStartDebugSession: new EventEmitter<any>().event,
      onDidChangeActiveDebugSession: new EventEmitter<any>().event,
      onDidReceiveDebugSessionCustomEvent: new EventEmitter<any>().event,
      onDidChangeBreakpoints: new EventEmitter<any>().event,
      registerDebugConfigurationProvider: () => new Disposable(() => {}),
      registerDebugAdapterDescriptorFactory: () => new Disposable(() => {}),
      registerDebugAdapterTrackerFactory: () => new Disposable(() => {}),
      startDebugging: () => Promise.resolve(false),
      stopDebugging: () => Promise.resolve(),
      addBreakpoints: () => {},
      removeBreakpoints: () => {},
      activeDebugSession: undefined,
      activeDebugConsole: { append: () => {}, appendLine: () => {} },
      breakpoints: [],
      activeStackItem: undefined,
    },

    // tasks namespace stub
    tasks: {
      registerTaskProvider: () => new Disposable(() => {}),
      fetchTasks: () => Promise.resolve([]),
      executeTask: () => Promise.resolve(undefined),
      taskExecutions: [],
      onDidStartTask: new EventEmitter<any>().event,
      onDidEndTask: new EventEmitter<any>().event,
      onDidStartTaskProcess: new EventEmitter<any>().event,
      onDidEndTaskProcess: new EventEmitter<any>().event,
    },

    // scm namespace stub
    scm: {
      createSourceControl: (_id: string, _label: string) => ({
        inputBox: { value: '', placeholder: '' },
        createResourceGroup: () => ({
          resourceStates: [],
          dispose: () => {},
          hideWhenEmpty: false,
        }),
        dispose: () => {},
        count: 0,
        quickDiffProvider: undefined,
        commitTemplate: undefined,
        acceptInputCommand: undefined,
        statusBarCommands: undefined,
      }),
    },

    // authentication namespace stub
    authentication: {
      getSession: () => Promise.resolve(undefined),
      registerAuthenticationProvider: () => new Disposable(() => {}),
      onDidChangeSessions: new EventEmitter<any>().event,
    },

    // comments namespace stub
    comments: {
      createCommentController: () => ({
        commentingRangeProvider: undefined,
        dispose: () => {},
        createCommentThread: () => ({
          range: undefined, uri: undefined, comments: [],
          collapsibleState: 0, canReply: true, dispose: () => {},
        }),
      }),
    },

    // notebooks namespace stub
    notebooks: {
      createNotebookController: () => ({
        supportedLanguages: undefined,
        supportsExecutionOrder: false,
        createNotebookCellExecution: () => undefined,
        dispose: () => {},
        onDidChangeSelectedNotebooks: new EventEmitter<any>().event,
      }),
      registerNotebookCellStatusBarItemProvider: () => new Disposable(() => {}),
      createRendererMessaging: () => ({
        onDidReceiveMessage: new EventEmitter<any>().event,
        postMessage: () => Promise.resolve(true),
      }),
    },

    // l10n namespace stub
    l10n: {
      t: (message: string | any, ...args: any[]) => typeof message === 'string' ? message : message?.message || '',
      bundle: undefined,
      uri: undefined,
    },

    // tests namespace stub
    tests: {
      createTestController: () => ({
        createTestItem: () => ({ children: { add: () => {}, delete: () => {}, replace: () => {}, forEach: () => {}, get: () => undefined, size: 0 } }),
        createRunProfile: () => ({ dispose: () => {} }),
        createTestRun: () => ({
          passed: () => {}, failed: () => {}, skipped: () => {},
          started: () => {}, enqueued: () => {}, errored: () => {},
          appendOutput: () => {}, end: () => {},
        }),
        dispose: () => {},
        items: { add: () => {}, delete: () => {}, replace: () => {}, forEach: () => {}, get: () => undefined, size: 0 },
      }),
    },
  }
}

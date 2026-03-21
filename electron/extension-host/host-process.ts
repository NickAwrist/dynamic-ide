/**
 * Extension Host Process
 *
 * This runs as a child process spawned by ExtensionHostService.
 * It loads extensions, injects the vscode API shim, and communicates
 * with the main process over IPC.
 */

process.on('uncaughtException', (err) => {
  console.error('[ext-host] Uncaught exception:', err)
  try {
    process.send?.({ method: 'extension.error', params: { message: err.message, stack: err.stack } })
  } catch {}
})

process.on('unhandledRejection', (reason: any) => {
  console.error('[ext-host] Unhandled rejection:', reason)
  try {
    process.send?.({ method: 'extension.error', params: { message: reason?.message || String(reason) } })
  } catch {}
})

import Module from 'module'
import path from 'path'
import {
  createVSCodeAPI,
  _setSendToMain,
  _setWorkspaceFolders,
  _registerExtension,
  _executeCommand,
  _getRegisteredCommands,
  _getRegisteredViews,
  _resolveWebviewView,
  _handleWebviewMessage,
} from './vscode-shim'

interface ExtensionInfo {
  id: string
  extensionPath: string
  manifest: {
    name: string
    publisher: string
    main?: string
    activationEvents?: string[]
    [key: string]: any
  }
}

interface InitParams {
  extensionsDir: string
  extensions: ExtensionInfo[]
  workspaceFolders: string[]
}

const loadedExtensions = new Map<string, { module: any; context: any }>()
let extensionInfos: ExtensionInfo[] = []

const vscodeApi = createVSCodeAPI()
const originalResolveFilename = (Module as any)._resolveFilename
;(Module as any)._resolveFilename = function (
  request: string,
  parent: any,
  isMain: boolean,
  options: any,
) {
  if (request === 'vscode') {
    return 'vscode'
  }
  return originalResolveFilename.call(this, request, parent, isMain, options)
}

const originalLoad = (Module as any)._load
;(Module as any)._load = function (request: string, parent: any, isMain: boolean) {
  if (request === 'vscode') {
    return vscodeApi
  }
  return originalLoad.call(this, request, parent, isMain)
}

function sendToMain(method: string, params: any) {
  if (process.send) {
    process.send({ method, params })
  }
}

function sendResponse(id: number, result?: any, error?: string) {
  if (process.send) {
    process.send({ id, result, error })
  }
}

_setSendToMain(sendToMain)

async function handleInitialize(params: InitParams): Promise<void> {
  extensionInfos = params.extensions
  _setWorkspaceFolders(params.workspaceFolders)

  for (const ext of extensionInfos) {
    _registerExtension(`${ext.manifest.publisher}.${ext.manifest.name}`, {
      id: `${ext.manifest.publisher}.${ext.manifest.name}`,
      extensionUri: vscodeApi.Uri.file(ext.extensionPath),
      extensionPath: ext.extensionPath,
      isActive: false,
      packageJSON: ext.manifest,
      extensionKind: vscodeApi.ExtensionKind.Workspace,
      exports: undefined,
    })
  }
}

async function autoActivateExtensions(): Promise<void> {
  for (const ext of extensionInfos) {
    const events = ext.manifest.activationEvents || []
    const shouldAutoActivate = events.includes('*') || events.includes('onStartupFinished')
    if (shouldAutoActivate) {
      try {
        await activateExtension(ext.id)
      } catch (err: any) {
        console.error(`Failed to auto-activate ${ext.id}:`, err.message || err)
        sendToMain('extension.activationFailed', {
          extensionId: ext.id,
          error: err.message || String(err),
        })
      }
    }
  }
}

async function activateExtension(extensionId: string): Promise<void> {
  if (loadedExtensions.has(extensionId)) return

  const extInfo = extensionInfos.find((e) => e.id === extensionId)
  if (!extInfo) throw new Error(`Extension not found: ${extensionId}`)
  if (!extInfo.manifest.main) {
    loadedExtensions.set(extensionId, { module: {}, context: {} })
    return
  }

  const mainPath = path.resolve(extInfo.extensionPath, extInfo.manifest.main)

  try {
    const extModule = require(mainPath)

    const context = {
      subscriptions: [] as Array<{ dispose: () => void }>,
      workspaceState: createMemento(),
      globalState: createMemento(),
      extensionPath: extInfo.extensionPath,
      extensionUri: vscodeApi.Uri.file(extInfo.extensionPath),
      storagePath: path.join(extInfo.extensionPath, '.storage'),
      globalStoragePath: path.join(extInfo.extensionPath, '.global-storage'),
      logPath: path.join(extInfo.extensionPath, '.logs'),
      extensionMode: 3, // Production
      extension: {
        id: `${extInfo.manifest.publisher}.${extInfo.manifest.name}`,
        extensionUri: vscodeApi.Uri.file(extInfo.extensionPath),
        extensionPath: extInfo.extensionPath,
        isActive: true,
        packageJSON: extInfo.manifest,
        extensionKind: vscodeApi.ExtensionKind.Workspace,
        exports: undefined as any,
      },
      asAbsolutePath: (relativePath: string) => path.join(extInfo.extensionPath, relativePath),
      environmentVariableCollection: {
        persistent: false,
        replace: () => {},
        append: () => {},
        prepend: () => {},
        get: () => undefined,
        forEach: () => {},
        clear: () => {},
        delete: () => {},
        [Symbol.iterator]: function* () {},
      },
      secrets: {
        get: () => Promise.resolve(undefined),
        store: () => Promise.resolve(),
        delete: () => Promise.resolve(),
        onDidChange: new vscodeApi.EventEmitter().event,
      },
      logUri: vscodeApi.Uri.file(path.join(extInfo.extensionPath, '.logs')),
      storageUri: vscodeApi.Uri.file(path.join(extInfo.extensionPath, '.storage')),
      globalStorageUri: vscodeApi.Uri.file(path.join(extInfo.extensionPath, '.global-storage')),
    }

    if (typeof extModule.activate === 'function') {
      const exports = await extModule.activate(context)
      context.extension.exports = exports
    }

    loadedExtensions.set(extensionId, { module: extModule, context })

    sendToMain('extension.activated', {
      extensionId,
      publisher: extInfo.manifest.publisher,
      name: extInfo.manifest.name,
    })
  } catch (err: any) {
    console.error(`Failed to activate extension ${extensionId}:`, err.message || err)
    sendToMain('extension.activationFailed', {
      extensionId,
      error: err.message || String(err),
    })
    loadedExtensions.set(extensionId, { module: {}, context: {} })
  }
}

async function deactivateExtension(extensionId: string): Promise<void> {
  const loaded = loadedExtensions.get(extensionId)
  if (!loaded) return

  if (typeof loaded.module.deactivate === 'function') {
    try {
      await loaded.module.deactivate()
    } catch (err) {
      console.error(`Error deactivating ${extensionId}:`, err)
    }
  }

  if (loaded.context?.subscriptions) {
    for (const sub of loaded.context.subscriptions) {
      try { sub.dispose() } catch {}
    }
  }

  loadedExtensions.delete(extensionId)
}

function createMemento() {
  const store = new Map<string, any>()
  return {
    keys: () => Array.from(store.keys()),
    get<T>(key: string, defaultValue?: T): T {
      return store.has(key) ? store.get(key) : defaultValue as T
    },
    update(key: string, value: any) {
      if (value === undefined) store.delete(key)
      else store.set(key, value)
      return Promise.resolve()
    },
    setKeysForSync: () => {},
  }
}

process.on('message', async (msg: any) => {
  const { id, method, params } = msg

  try {
    let result: any

    switch (method) {
      case 'initialize':
        await handleInitialize(params)
        result = { ok: true }
        if (id !== undefined) {
          sendResponse(id, result)
        }
        autoActivateExtensions().catch((err) => {
          console.error('[ext-host] Auto-activation error:', err)
        })
        return

      case 'activateExtension':
        await activateExtension(params.extensionId)
        result = { ok: true }
        break

      case 'deactivateExtension':
        await deactivateExtension(params.extensionId)
        result = { ok: true }
        break

      case 'executeCommand':
        result = await _executeCommand(params.command, params.args || [])
        break

      case 'getRegisteredCommands':
        result = _getRegisteredCommands()
        break

      case 'getRegisteredViews':
        result = _getRegisteredViews()
        break

      case 'resolveWebviewView':
        result = await _resolveWebviewView(params.viewId)
        break

      case 'webviewMessage':
        _handleWebviewMessage(params.viewId, params.message)
        result = { ok: true }
        break

      case 'shutdown':
        for (const [extId] of loadedExtensions) {
          await deactivateExtension(extId)
        }
        result = { ok: true }
        setTimeout(() => process.exit(0), 100)
        break

      default:
        throw new Error(`Unknown method: ${method}`)
    }

    if (id !== undefined) {
      sendResponse(id, result)
    }
  } catch (err: any) {
    if (id !== undefined) {
      sendResponse(id, undefined, err.message || String(err))
    }
  }
})

process.on('SIGTERM', async () => {
  for (const [extId] of loadedExtensions) {
    await deactivateExtension(extId)
  }
  process.exit(0)
})

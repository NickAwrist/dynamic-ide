import type { Monaco } from '@monaco-editor/react'

/**
 * Monaco runs TypeScript/JavaScript in a browser worker — not a full language server.
 * Without your repo's tsconfig and node_modules, the worker flags valid code (imports,
 * path aliases, strictness). Tune compiler + diagnostics so editing matches a typical app.
 */
export function configureMonacoTypeScript(monaco: Monaco): void {
  const ts = monaco.languages.typescript
  if (!ts?.typescriptDefaults || !ts.javascriptDefaults) return

  const compilerOptions = {
    target: ts.ScriptTarget.ESNext,
    module: ts.ModuleKind.ESNext,
    moduleResolution: ts.ModuleResolutionKind.NodeJs,
    jsx: ts.JsxEmit.ReactJSX,
    allowJs: true,
    allowSyntheticDefaultImports: true,
    esModuleInterop: true,
    isolatedModules: true,
    skipLibCheck: true,
    noEmit: true,
    strict: false,
    strictNullChecks: false,
    noImplicitAny: false,
    suppressImplicitAnyIndexErrors: true,
    resolveJsonModule: true,
  }

  ts.typescriptDefaults.setCompilerOptions(compilerOptions)
  ts.javascriptDefaults.setCompilerOptions(compilerOptions)

  const diagnosticsOptions = {
    noSuggestionDiagnostics: true,
    diagnosticCodesToIgnore: [
      2307, // Cannot find module — worker has no project node_modules / path mappings
      7016, // Could not find a declaration file for module
    ],
  }

  ts.typescriptDefaults.setDiagnosticsOptions(diagnosticsOptions)
  ts.javascriptDefaults.setDiagnosticsOptions(diagnosticsOptions)

  ts.typescriptDefaults.setEagerModelSync(true)
  ts.javascriptDefaults.setEagerModelSync(true)
}

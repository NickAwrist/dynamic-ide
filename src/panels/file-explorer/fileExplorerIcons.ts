/** Codicon name (without `codicon-` prefix) for file explorer rows. */
export function fileIconForFileName(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  const ext = dot >= 0 ? fileName.slice(dot + 1).toLowerCase() : ''

  switch (ext) {
    case 'json':
    case 'jsonc':
      return 'json'
    case 'md':
    case 'mdx':
      return 'markdown'
    case 'py':
      return 'python'
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'webp':
    case 'svg':
    case 'ico':
      return 'file-media'
    case 'pdf':
      return 'file-pdf'
    case 'zip':
    case 'gz':
    case 'tgz':
    case '7z':
      return 'file-zip'
    case 'txt':
    case 'log':
    case 'csv':
      return 'file-text'
    case 'ts':
    case 'tsx':
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
    case 'css':
    case 'scss':
    case 'less':
    case 'html':
    case 'htm':
    case 'vue':
    case 'svelte':
    case 'rs':
    case 'go':
    case 'java':
    case 'kt':
    case 'c':
    case 'cpp':
    case 'h':
    case 'hpp':
    case 'cs':
    case 'rb':
    case 'php':
    case 'swift':
    case 'sql':
    case 'yaml':
    case 'yml':
    case 'toml':
    case 'xml':
    case 'sh':
    case 'ps1':
    case 'bat':
      return 'file-code'
    default:
      return 'file'
  }
}

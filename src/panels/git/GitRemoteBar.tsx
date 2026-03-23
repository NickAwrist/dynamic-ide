import type { GitRemoteOriginInfo } from '../../types/electron'
import { requestOpenUrl } from '../../lib/request-open-url'

interface Props {
  remoteInfo: GitRemoteOriginInfo
}

export function GitRemoteBar({ remoteInfo }: Props) {
  return (
    <div className="git-panel__remote" title={remoteInfo.raw}>
      <button
        type="button"
        className="git-panel__remote-link"
        onClick={() => requestOpenUrl(remoteInfo.repoUrl)}
      >
        Repository
      </button>
      <button
        type="button"
        className="git-panel__remote-link"
        onClick={() => requestOpenUrl(remoteInfo.issuesUrl)}
      >
        Issues
      </button>
      <button
        type="button"
        className="git-panel__remote-link"
        onClick={() => requestOpenUrl(remoteInfo.pullsUrl)}
      >
        {remoteInfo.pullsLabel}
      </button>
    </div>
  )
}

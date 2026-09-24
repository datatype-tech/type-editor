import { app, net, shell } from 'electron'
import { spawn } from 'node:child_process'
import { createWriteStream } from 'node:fs'
import { unlink } from 'node:fs/promises'
import { join } from 'node:path'
import type { UpdateCheckResult, UpdateDownloadProgress, UpdateInfo } from '../shared/ipc'

const RELEASES_API = 'https://api.github.com/repos/datatype-tech/type-editor/releases'

export function parseSemver(v: string): [number, number, number] {
  const clean = v.replace(/^v/i, '').trim()
  const [major = '0', minor = '0', patch = '0'] = clean.split('-')[0].split('.')
  return [parseInt(major, 10) || 0, parseInt(minor, 10) || 0, parseInt(patch, 10) || 0]
}

export function isNewerVersion(remote: string, current: string): boolean {
  const [rMaj, rMin, rPatch] = parseSemver(remote)
  const [cMaj, cMin, cPatch] = parseSemver(current)

  if (rMaj !== cMaj) return rMaj > cMaj
  if (rMin !== cMin) return rMin > cMin
  return rPatch > cPatch
}

interface GitHubAsset {
  name: string
  browser_download_url: string
  size?: number
}

interface GitHubRelease {
  tag_name: string
  name: string
  body: string
  html_url: string
  published_at: string
  draft: boolean
  prerelease: boolean
  assets: GitHubAsset[]
}

/** GitHub's unauthenticated API allows 60 requests/hour per IP; re-checking on
 * every launch, every close, and every manual click can burn through that
 * fast, so a recent result is reused instead of re-hitting the network. */
const CHECK_THROTTLE_MS = 5 * 60 * 1000

class AutoUpdater {
  private cachedUpdate: UpdateInfo | null = null
  private downloadedPath: string | null = null
  private isDownloading = false
  private lastCheckedAt = 0
  private lastResult: UpdateCheckResult | null = null
  public userDeclinedOnClose = false

  public getCachedUpdate(): UpdateInfo | null {
    return this.cachedUpdate
  }

  public getDownloadedPath(): string | null {
    return this.downloadedPath
  }

  public async checkForUpdates(silent = false): Promise<UpdateCheckResult> {
    const currentVersion = app.getVersion()

    if (this.lastResult && Date.now() - this.lastCheckedAt < CHECK_THROTTLE_MS) {
      return this.lastResult
    }

    try {
      const headers: Record<string, string> = {
        'User-Agent': `Type-Editor/${currentVersion}`,
        Accept: 'application/vnd.github.v3+json'
      }

      if (process.env.GH_TOKEN) {
        headers['Authorization'] = `Bearer ${process.env.GH_TOKEN}`
      }

      const response = await net.fetch(RELEASES_API, { headers })
      if (!response.ok) {
        if (response.status === 403 && response.headers.get('x-ratelimit-remaining') === '0') {
          const resetHeader = response.headers.get('x-ratelimit-reset')
          const resetAt = resetHeader ? Number(resetHeader) * 1000 : undefined
          return this.remember({ hasUpdate: false, currentVersion, error: 'rate_limited', rateLimitResetAt: resetAt })
        }
        throw new Error(`GitHub API returned ${response.status}: ${response.statusText}`)
      }

      const releases = (await response.json()) as GitHubRelease[]
      if (!Array.isArray(releases) || releases.length === 0) {
        return this.remember({ hasUpdate: false, currentVersion })
      }

      // Find the latest non-draft release
      const latest = releases.find((r) => !r.draft)
      if (!latest) {
        return this.remember({ hasUpdate: false, currentVersion })
      }

      const remoteVersion = latest.tag_name.replace(/^v/i, '')
      const hasUpdate = isNewerVersion(remoteVersion, currentVersion)

      if (!hasUpdate) {
        this.cachedUpdate = null
        return this.remember({ hasUpdate: false, currentVersion })
      }

      // Find best asset for Windows / current platform
      const assets = latest.assets || []
      let matchedAsset: GitHubAsset | undefined

      if (process.platform === 'win32') {
        matchedAsset =
          assets.find((a) => a.name.endsWith('-setup.exe') || a.name.endsWith('.exe')) ||
          assets.find((a) => a.name.endsWith('.zip'))
      } else if (process.platform === 'darwin') {
        matchedAsset =
          assets.find((a) => a.name.endsWith('.dmg')) ||
          assets.find((a) => a.name.endsWith('.zip'))
      } else {
        matchedAsset =
          assets.find((a) => a.name.endsWith('.AppImage')) ||
          assets.find((a) => a.name.endsWith('.tar.gz'))
      }

      const updateInfo: UpdateInfo = {
        version: remoteVersion,
        name: latest.name || `Type Editor ${remoteVersion}`,
        releaseNotes: latest.body || '',
        releaseUrl: latest.html_url,
        publishedAt: latest.published_at,
        downloadUrl: matchedAsset ? matchedAsset.browser_download_url : null,
        assetName: matchedAsset ? matchedAsset.name : null,
        assetSize: matchedAsset?.size
      }

      this.cachedUpdate = updateInfo
      return this.remember({
        hasUpdate: true,
        currentVersion,
        update: updateInfo
      })
    } catch (error) {
      if (!silent) {
        console.error('Failed to check for updates:', error)
      }
      return this.remember({
        hasUpdate: false,
        currentVersion,
        error: (error as Error).message
      })
    }
  }

  /** Caches a result for `CHECK_THROTTLE_MS` so back-to-back checks (boot,
   * close-guard, a user clicking twice) don't each spend a request. */
  private remember(result: UpdateCheckResult): UpdateCheckResult {
    this.lastResult = result
    this.lastCheckedAt = Date.now()
    return result
  }

  public async downloadUpdate(
    onProgress?: (progress: UpdateDownloadProgress) => void
  ): Promise<{ success: boolean; localPath?: string; error?: string }> {
    if (!this.cachedUpdate || !this.cachedUpdate.downloadUrl) {
      return { success: false, error: 'No download URL available' }
    }

    if (this.downloadedPath) {
      return { success: true, localPath: this.downloadedPath }
    }

    if (this.isDownloading) {
      return { success: false, error: 'Download already in progress' }
    }

    this.isDownloading = true
    const fileName =
      this.cachedUpdate.assetName || `TypeEditor-${this.cachedUpdate.version}-setup.exe`
    const targetPath = join(app.getPath('temp'), fileName)

    try {
      const response = await net.fetch(this.cachedUpdate.downloadUrl)
      if (!response.ok || !response.body) {
        throw new Error(`Failed to download asset: ${response.statusText}`)
      }

      const contentLength = Number(response.headers.get('content-length')) || this.cachedUpdate.assetSize || 0
      let transferred = 0

      const fileStream = createWriteStream(targetPath)
      const reader = response.body.getReader()

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        fileStream.write(Buffer.from(value))
        transferred += value.length
        if (contentLength > 0 && onProgress) {
          const percent = Math.min(100, Math.round((transferred / contentLength) * 100))
          onProgress({ percent, transferred, total: contentLength })
        }
      }

      await new Promise<void>((resolve, reject) => {
        fileStream.end((err?: Error | null) => (err ? reject(err) : resolve()))
      })

      this.downloadedPath = targetPath
      this.isDownloading = false
      return { success: true, localPath: targetPath }
    } catch (error) {
      this.isDownloading = false
      try {
        await unlink(targetPath).catch(() => undefined)
      } catch {
        // ignore
      }
      return { success: false, error: (error as Error).message }
    }
  }

  public installAndQuit(targetPath?: string): void {
    const installPath = targetPath || this.downloadedPath
    if (!installPath) {
      if (this.cachedUpdate?.releaseUrl) {
        void shell.openExternal(this.cachedUpdate.releaseUrl)
      }
      return
    }

    try {
      if (process.platform === 'win32' && installPath.endsWith('.exe')) {
        const child = spawn(installPath, [], {
          detached: true,
          stdio: 'ignore'
        })
        child.unref()
        app.quit()
        return
      }

      void shell.openPath(installPath).then(() => {
        app.quit()
      })
    } catch (error) {
      console.error('Failed to launch installer:', error)
      if (this.cachedUpdate?.releaseUrl) {
        void shell.openExternal(this.cachedUpdate.releaseUrl)
      }
    }
  }
}

export const updater = new AutoUpdater()

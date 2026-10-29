/**
 * In-App Application OTA (Over-The-Air) & PWA Updater Service
 * Connects directly to GitHub Version Releases API (e.g. nurmd/webapp)
 * Supports:
 * 1. PWA Browser/Standalone: ServiceWorker skip-waiting, cache invalidation, and hot-reload.
 * 2. GitHub Releases & Raw repository version checking with fallbacks.
 * 3. Android Native WebView: Streaming APK download, SHA-256 integrity verification, and package installer.
 */

export interface AppReleaseInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  releaseTitle: string;
  releaseNotes: string[];
  apkUrl: string;
  apkSize: string;
  sha256?: string;
  sha256Url?: string;
  htmlUrl?: string;
  isMandatory?: boolean;
  isPwa?: boolean;
  hasSwWaiting?: boolean;
  pwaTarballUrl?: string;
  commitMessage?: string;
}

export interface OtaProgressCallback {
  (percent: number, loadedBytes: number, totalBytes: number): void;
}

export interface OtaDownloadOptions {
  apkUrl: string;
  expectedSha256?: string;
  onProgress?: OtaProgressCallback;
  onSuccess?: (hash: string) => void;
  onError?: (errorMessage: string, canRetry: boolean) => void;
}

import packageJson from '../../package.json';
import { sha256Hex } from '../core/utils/crypto.ts';

export const CURRENT_APP_VERSION = packageJson.version || '1.0.35';
export const CURRENT_VERSION_CODE = (() => {
  const parts = CURRENT_APP_VERSION.split('.').map((p) => parseInt(p, 10) || 0);
  return (parts[0] || 1) * 10000 + (parts[1] || 0) * 100 + (parts[2] || 0);
})();
export const DEFAULT_GITHUB_REPO = 'nurmd/webapp';

class UpdateService {
  private lastChecked: string | null = null;
  private cachedRelease: AppReleaseInfo | null = null;
  private activeAbortController: AbortController | null = null;
  private swRegistration: ServiceWorkerRegistration | null = null;
  private pwaUpdateListeners: Array<(info: AppReleaseInfo) => void> = [];

  constructor() {
    this.initServiceWorkerListener();
  }

  public isPwaEnvironment(): boolean {
    if (typeof window === 'undefined') return false;
    const hasAndroidBridge = !!(window as any).AndroidBridge;
    return !hasAndroidBridge;
  }

  public getCurrentVersion(): string {
    return CURRENT_APP_VERSION;
  }

  public getGitHubRepo(): string {
    if (typeof localStorage !== 'undefined') {
      const stored = localStorage.getItem('vyapar_github_repo');
      if (stored && stored.trim()) return stored.trim();
    }
    return DEFAULT_GITHUB_REPO;
  }

  public setGitHubRepo(repo: string): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem('vyapar_github_repo', repo.trim());
    }
  }

  /**
   * Initializes Service Worker listeners to detect updates in real-time
   */
  private initServiceWorkerListener(): void {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;
      this.swRegistration = reg;

      // Check if a worker is already waiting to activate
      if (reg.waiting) {
        this.notifyPwaUpdateAvailable(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            this.notifyPwaUpdateAvailable(true);
          }
        });
      });
    }).catch(() => {});
  }

  private notifyPwaUpdateAvailable(hasSwWaiting: boolean = true): void {
    const info: AppReleaseInfo = this.cachedRelease || {
      version: CURRENT_APP_VERSION,
      versionCode: CURRENT_VERSION_CODE,
      releaseDate: new Date().toISOString().split('T')[0],
      releaseTitle: `Vyapar PRO PWA Update Available`,
      releaseNotes: [
        'New web version ready with latest billing and POS features',
        'Offline cache and service worker refresh',
        'Performance enhancements and stability fixes'
      ],
      apkUrl: '',
      apkSize: 'Web App',
      isPwa: true,
      hasSwWaiting
    };
    info.isPwa = true;
    info.hasSwWaiting = hasSwWaiting;

    this.pwaUpdateListeners.forEach((listener) => {
      try {
        listener(info);
      } catch (e) {
        console.warn('Error in PWA update listener:', e);
      }
    });
  }

  public onPwaUpdate(callback: (info: AppReleaseInfo) => void): () => void {
    this.pwaUpdateListeners.push(callback);
    return () => {
      this.pwaUpdateListeners = this.pwaUpdateListeners.filter((cb) => cb !== callback);
    };
  }

  /**
   * Triggers the PWA to skip waiting, clears stale asset caches, and reloads
   */
  public async applyPwaUpdate(): Promise<void> {
    if (typeof window === 'undefined') return;

    try {
      // 1. Send SKIP_WAITING to waiting Service Worker
      if ('serviceWorker' in navigator) {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg && reg.waiting) {
          reg.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }

      // 2. Clear cached responses in CacheStorage
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((key) => {
            console.log('[PWA Update] Deleting stale cache:', key);
            return caches.delete(key);
          })
        );
      }
    } catch (err) {
      console.warn('[PWA Update] Cache clearing warning:', err);
    }

    // 3. Short delay then reload window to mount fresh assets
    setTimeout(() => {
      window.location.reload();
    }, 250);
  }

  private async formatReleaseData(data: any, repo: string, isPwa: boolean): Promise<AppReleaseInfo> {
    const tag = (data.tag_name || '').replace(/^v/, '');
    const cleanVersion = tag || CURRENT_APP_VERSION;

    const notes: string[] = [];
    let parsedSha256: string | undefined;

    if (data.body) {
      const lines = data.body.split('\n');
      for (const line of lines) {
        const trimmed = line.trim();
        const shaMatch = trimmed.match(/sha-?256[:\s]+([a-f0-9]{64})/i);
        if (shaMatch) {
          parsedSha256 = shaMatch[1].toLowerCase();
        } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
          notes.push(trimmed.replace(/^[-*•]\s+/, '').replace(/\*\*/g, ''));
        } else if (
          trimmed &&
          !trimmed.toLowerCase().includes('full changelog') &&
          !trimmed.startsWith('http') &&
          !trimmed.startsWith('#') &&
          !trimmed.startsWith('---') &&
          !trimmed.toLowerCase().startsWith('compare/')
        ) {
          notes.push(trimmed.replace(/\*\*/g, ''));
        }
      }
    }

    const apkAsset = data.assets?.find(
      (a: any) => a.name && (a.name.endsWith('.apk') || a.name.includes('.apk'))
    );
    const pwaAsset = data.assets?.find(
      (a: any) => a.name && (a.name.includes('pwa') || a.name.endsWith('.tar.gz'))
    );
    const shaAsset = data.assets?.find(
      (a: any) => a.name && a.name.endsWith('.sha256')
    );

    const dynamicNotes = notes.length > 0 
      ? notes 
      : await this.fetchDynamicReleaseNotes(repo, cleanVersion);

    const hasApkAsset = !!apkAsset?.browser_download_url;

    return {
      version: cleanVersion,
      versionCode: this.calculateVersionCode(cleanVersion),
      releaseDate: data.published_at ? data.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
      releaseTitle: data.name || `Vyapar PRO v${cleanVersion}`,
      releaseNotes: dynamicNotes,
      apkUrl: hasApkAsset ? apkAsset.browser_download_url : '',
      apkSize: hasApkAsset
        ? (apkAsset.size ? `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB` : (isPwa ? 'Web PWA' : 'Android APK'))
        : (isPwa ? 'Web PWA' : 'Release page'),
      sha256: parsedSha256,
      sha256Url: hasApkAsset ? shaAsset?.browser_download_url : undefined,
      htmlUrl: data.html_url || `https://github.com/${repo}/releases`,
      isPwa,
      pwaTarballUrl: pwaAsset?.browser_download_url,
      isMandatory: false,
    };
  }

  /**
   * Checks for updates by querying:
   * 1. GitHub Releases API (releases/latest)
   * 2. Fallback: Raw package.json & commits on GitHub master branch
   * 3. Fallback: Local /version.json
   */
  public async checkForUpdates(): Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestRelease?: AppReleaseInfo;
    error?: string;
  }> {
    this.lastChecked = new Date().toISOString();
    const repo = this.getGitHubRepo();
    const isPwa = this.isPwaEnvironment();

    // Trigger ServiceWorker check in parallel if on PWA
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {});
      }).catch(() => {});
    }

    let lastError: string | null = null;

    // 1. Attempt GitHub Releases API with cache-busting.
    // Do NOT send Cache-Control / Pragma here: those headers are not in GitHub's
    // CORS Access-Control-Allow-Headers list, so a browser/WebView preflight fails.
    // A failed API request must never prevent the raw fallbacks below from running.
    try {
      const apiUrl = `https://api.github.com/repos/${repo}/releases/latest?_t=${Date.now()}`;
      const res = await fetch(apiUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (res.ok) {
        const data = await res.json();
        const releaseInfo = await this.formatReleaseData(data, repo, isPwa);

        if (this.isNewer(releaseInfo.version, CURRENT_APP_VERSION)) {
          this.cachedRelease = releaseInfo;
          return {
            hasUpdate: true,
            currentVersion: CURRENT_APP_VERSION,
            latestRelease: releaseInfo,
          };
        }
      } else {
        lastError = `GitHub Releases API returned HTTP ${res.status}`;
      }
    } catch (err: any) {
      lastError = err?.message || 'GitHub Releases API unavailable';
      console.warn('[UpdateService] Releases API failed:', err);
    }

    // 1b. Check recent releases list if latest release wasn't newer (guards against GitHub latest tag designation delays)
    try {
      const listUrl = `https://api.github.com/repos/${repo}/releases?per_page=5&_t=${Date.now()}`;
      const listRes = await fetch(listUrl, {
        cache: 'no-store',
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (listRes.ok) {
        const releasesList = await listRes.json();
        if (Array.isArray(releasesList)) {
          for (const rel of releasesList) {
            if (rel.draft) continue;
            const relInfo = await this.formatReleaseData(rel, repo, isPwa);
            if (this.isNewer(relInfo.version, CURRENT_APP_VERSION)) {
              this.cachedRelease = relInfo;
              return {
                hasUpdate: true,
                currentVersion: CURRENT_APP_VERSION,
                latestRelease: relInfo,
              };
            }
          }
        }
      }
    } catch (_err) {
      console.warn('[UpdateService] Failed to query releases list:', _err);
    }

    // 2. Fallback: raw public/version.json on GitHub master. Cache-busting is
    // essential because raw.githubusercontent.com caches files for several minutes.
    try {
      const rawVersionUrl = `https://raw.githubusercontent.com/${repo}/master/public/version.json?t=${Date.now()}`;
      const rawVersionRes = await fetch(rawVersionUrl, { cache: 'no-store' });

      if (rawVersionRes.ok) {
        const vData = await rawVersionRes.json();
        const rawVersion = String(vData?.version || '').replace(/^v/, '');

        if (rawVersion) {
          const notes = Array.isArray(vData.releaseNotes) && vData.releaseNotes.length > 0
            ? vData.releaseNotes
            : await this.fetchDynamicReleaseNotes(repo, rawVersion);
          const releaseInfo: AppReleaseInfo = {
            version: rawVersion,
            versionCode: this.calculateVersionCode(rawVersion),
            releaseDate: vData.buildTime ? vData.buildTime.split('T')[0] : new Date().toISOString().split('T')[0],
            releaseTitle: `Vyapar PRO v${rawVersion}`,
            releaseNotes: notes,
            apkUrl: '',
            apkSize: isPwa ? 'Web PWA' : 'Release page',
            sha256Url: undefined,
            htmlUrl: `https://github.com/${repo}/releases`,
            isPwa,
          };

          this.cachedRelease = releaseInfo;
          return {
            hasUpdate: this.isNewer(rawVersion, CURRENT_APP_VERSION),
            currentVersion: CURRENT_APP_VERSION,
            latestRelease: releaseInfo,
          };
        }
      }
    } catch (_err) {
      console.warn('[UpdateService] Failed to query raw version.json:', _err);
    }

    // 3. Fallback: Query raw package.json from GitHub master branch.
    try {
      const rawPkgUrl = `https://raw.githubusercontent.com/${repo}/master/package.json?t=${Date.now()}`;
      const rawRes = await fetch(rawPkgUrl, { cache: 'no-store' });

      if (rawRes.ok) {
        const rawPkg = await rawRes.json();
        const githubVersion = (rawPkg.version || '').replace(/^v/, '');

        // Fetch latest commit message
        let commitMsg = 'Latest updates from GitHub master repository';
        try {
          const commitsRes = await fetch(`https://api.github.com/repos/${repo}/commits/master`, {
            headers: { Accept: 'application/vnd.github.v3+json' },
          });
          if (commitsRes.ok) {
            const commitData = await commitsRes.json();
            commitMsg = commitData.commit?.message?.split('\n')[0] || commitMsg;
          }
        } catch (_e) {}

        const dynamicNotes = await this.fetchDynamicReleaseNotes(repo, githubVersion, commitMsg);

        const releaseInfo: AppReleaseInfo = {
          version: githubVersion,
          versionCode: this.calculateVersionCode(githubVersion),
          releaseDate: new Date().toISOString().split('T')[0],
          releaseTitle: `Vyapar PRO v${githubVersion} (GitHub Master)`,
          releaseNotes: dynamicNotes,
          apkUrl: '',
          apkSize: isPwa ? 'Web PWA' : 'Release page',
          sha256Url: undefined,
          htmlUrl: `https://github.com/${repo}/releases`,
          isPwa,
          commitMessage: commitMsg,
        };

        this.cachedRelease = releaseInfo;
        return {
          hasUpdate: this.isNewer(releaseInfo.version, CURRENT_APP_VERSION),
          currentVersion: CURRENT_APP_VERSION,
          latestRelease: releaseInfo,
        };
      }
    } catch (_err) {
      console.warn('[UpdateService] Failed to query raw package.json:', _err);
    }

    // 4. Fallback: Query local server /version.json
    if (typeof window !== 'undefined') {
      try {
        const localVersionRes = await fetch(`./version.json?t=${Date.now()}`, { cache: 'no-store' });
        if (localVersionRes.ok) {
          const vData = await localVersionRes.json();
          const localVersion = String(vData?.version || '').replace(/^v/, '');

          // Only surface the bundled manifest when it is actually newer. Returning
          // the current version here would hide a total remote-check failure.
          if (localVersion && this.isNewer(localVersion, CURRENT_APP_VERSION)) {
            const dynamicNotes = Array.isArray(vData.releaseNotes) && vData.releaseNotes.length > 0
              ? vData.releaseNotes
              : [
                  `Vyapar Books update v${localVersion} deployed`,
                  'Click Update to refresh application cache'
                ];
            const releaseInfo: AppReleaseInfo = {
              version: localVersion,
              versionCode: this.calculateVersionCode(localVersion),
              releaseDate: vData.buildTime ? vData.buildTime.split('T')[0] : new Date().toISOString().split('T')[0],
              releaseTitle: `Vyapar PRO v${localVersion}`,
              releaseNotes: dynamicNotes,
              apkUrl: '',
              apkSize: 'Web PWA',
              isPwa: true,
            };
            return {
              hasUpdate: true,
              currentVersion: CURRENT_APP_VERSION,
              latestRelease: releaseInfo,
            };
          }
        }
      } catch (_err) {
        console.warn('[UpdateService] Failed to query local version.json:', _err);
      }
    }

    return {
      hasUpdate: false,
      currentVersion: CURRENT_APP_VERSION,
      latestRelease: this.cachedRelease || undefined,
      error: lastError || `Could not fetch release information from GitHub (${repo})`,
    };
  }

  public isNewer(latest: string, current: string): boolean {
    const lParts = latest.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const cParts = current.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  /**
   * Dynamically retrieves release notes from multiple reliable sources:
   * 1. Remote public/version.json on GitHub master
   * 2. GitHub Commits API (recent commit messages)
   * 3. Local /version.json
   */
  public async fetchDynamicReleaseNotes(
    repo: string,
    targetVersion?: string,
    fallbackCommitMsg?: string
  ): Promise<string[]> {
    // 1. Try remote public/version.json
    try {
      const rawVersionUrl = `https://raw.githubusercontent.com/${repo}/master/public/version.json?t=${Date.now()}`;
      const res = await fetch(rawVersionUrl);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.releaseNotes) && data.releaseNotes.length > 0) {
          return data.releaseNotes;
        }
      }
    } catch (_e) {}

    // 2. Try GitHub Commits API
    try {
      const commitsUrl = `https://api.github.com/repos/${repo}/commits?per_page=8`;
      const res = await fetch(commitsUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });
      if (res.ok) {
        const commits = await res.json();
        if (Array.isArray(commits)) {
          const notes: string[] = [];
          for (const item of commits) {
            const rawMsg = item?.commit?.message?.split('\n')[0]?.trim();
            if (
              rawMsg &&
              !rawMsg.startsWith('Merge') &&
              !rawMsg.startsWith('bump') &&
              !rawMsg.toLowerCase().includes('subagent') &&
              !rawMsg.toLowerCase().includes('wip')
            ) {
              const cleaned = rawMsg.replace(/^[a-z]+(\([a-z0-9_-]+\))?:\s*/i, '').trim();
              if (cleaned && !notes.includes(cleaned)) {
                notes.push(cleaned);
              }
            }
            if (notes.length >= 6) break;
          }
          if (notes.length > 0) return notes;
        }
      }
    } catch (_e) {}

    // 3. Try Local version.json (if in browser)
    if (typeof window !== 'undefined') {
      try {
        const localRes = await fetch(`./version.json?t=${Date.now()}`);
        if (localRes.ok) {
          const vData = await localRes.json();
          if (Array.isArray(vData.releaseNotes) && vData.releaseNotes.length > 0) {
            return vData.releaseNotes;
          }
        }
      } catch (_e) {}
    }

    // 4. Fallback commit message or version-specific text
    if (fallbackCommitMsg && fallbackCommitMsg.trim()) {
      return [fallbackCommitMsg.trim()];
    }

    return [
      `Version ${targetVersion || CURRENT_APP_VERSION} includes performance enhancements, bug fixes, and stability updates.`
    ];
  }

  public calculateVersionCode(versionStr: string): number {
    const parts = versionStr.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const major = parts[0] || 1;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    return major * 10000 + minor * 100 + patch;
  }

  public async calculateSha256(data: ArrayBuffer): Promise<string> {
    return sha256Hex(data);
  }

  public startInternalDownload(options: OtaDownloadOptions): () => void {
    if (!options.apkUrl || !options.apkUrl.trim()) {
      options.onError?.('Cannot download: No APK URL available for this release.', false);
      return () => {};
    }

    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;

    if (bridge && typeof bridge.startInternalDownload === 'function') {
      if (typeof window !== 'undefined') {
        (window as any).onOtaProgress = (percent: number, loaded: number, total: number) => {
          options.onProgress?.(percent, loaded, total);
        };
        (window as any).onOtaSuccess = (hash: string) => {
          options.onSuccess?.(hash);
        };
        (window as any).onOtaError = (msg: string, canRetry: boolean) => {
          options.onError?.(msg, canRetry);
        };
      }
      bridge.startInternalDownload(options.apkUrl, options.expectedSha256 || '');
      return () => {
        if (typeof bridge.cancelInternalDownload === 'function') {
          bridge.cancelInternalDownload();
        }
      };
    }

    const abortController = new AbortController();
    this.activeAbortController = abortController;

    (async () => {
      try {
        const response = await fetch(options.apkUrl, { signal: abortController.signal });
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status} ${response.statusText}`);
        }

        const contentLengthHeader = response.headers.get('content-length');
        const totalBytes = contentLengthHeader ? parseInt(contentLengthHeader, 10) : 0;
        const reader = response.body?.getReader();

        if (!reader) {
          throw new Error('Streaming response body not supported by browser');
        }

        const chunks: Uint8Array[] = [];
        let loadedBytes = 0;

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) {
            chunks.push(value);
            loadedBytes += value.length;
            const percent = totalBytes > 0 ? Math.round((loadedBytes / totalBytes) * 100) : -1;
            options.onProgress?.(percent, loadedBytes, totalBytes);
          }
        }

        const totalBuffer = new Uint8Array(loadedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          totalBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        const calculatedHash = await this.calculateSha256(totalBuffer.buffer);
        const expected = (options.expectedSha256 || '').trim().toLowerCase();

        if (expected && calculatedHash.toLowerCase() !== expected) {
          const msg = `Checksum verification failed! Expected: ${expected.slice(0, 10)}... Got: ${calculatedHash.slice(0, 10)}...`;
          options.onError?.(msg, true);
          return;
        }

        const blob = new Blob([totalBuffer], { type: 'application/vnd.android.package-archive' });
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objectUrl;
        link.download = 'GSTBilling-Vyapar.apk';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(objectUrl);

        options.onSuccess?.(calculatedHash);
      } catch (err: any) {
        if (err.name === 'AbortError') return;
        const msg = err.message || 'Download failed due to network error';
        options.onError?.(msg, true);
      }
    })();

    return () => {
      abortController.abort();
    };
  }

  public clearTempApk(): void {
    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;
    if (bridge && typeof bridge.clearTempApk === 'function') {
      bridge.clearTempApk();
    }
  }

  public installUpdate(apkUrl: string): void {
    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;
    if (bridge && typeof bridge.installApk === 'function') {
      bridge.installApk(apkUrl);
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(apkUrl, '_blank');
    }
  }

  public openReleasePage(url?: string): void {
    const repo = this.getGitHubRepo();
    const targetUrl = (url && url.trim()) ? url.trim() : `https://github.com/${repo}/releases`;
    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;
    if (bridge && typeof bridge.openUrl === 'function') {
      bridge.openUrl(targetUrl);
      return;
    }
    if (typeof window !== 'undefined') {
      window.open(targetUrl, '_blank');
    }
  }
}

export function cacheUrlsInServiceWorker(urls: string[]): void {
  if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;
  if (navigator.serviceWorker.controller) {
    navigator.serviceWorker.controller.postMessage({
      type: 'CACHE_URLS',
      urls,
    });
  }
}

export const updateService = new UpdateService();

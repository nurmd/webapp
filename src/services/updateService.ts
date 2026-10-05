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
    const apiUrl = `https://api.github.com/repos/${repo}/releases/latest`;
    const isPwa = this.isPwaEnvironment();

    // Trigger ServiceWorker check in parallel if on PWA
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.getRegistration().then((reg) => {
        reg?.update().catch(() => {});
      }).catch(() => {});
    }

    try {
      // 1. Attempt GitHub Releases API
      const res = await fetch(apiUrl, {
        headers: { Accept: 'application/vnd.github.v3+json' },
      });

      if (res.ok) {
        const data = await res.json();
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

        const releaseInfo: AppReleaseInfo = {
          version: cleanVersion,
          versionCode: this.calculateVersionCode(cleanVersion),
          releaseDate: data.published_at ? data.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
          releaseTitle: data.name || `Vyapar PRO v${cleanVersion}`,
          releaseNotes: notes.length > 0 ? notes : [
            'Enhanced Clean POS Billing with fixed table layout and customer selector',
            'Full PWA offline support with instant background synchronization',
            'Thermal receipt printing (58mm/80mm) and Dynamic UPI QR codes',
          ],
          apkUrl: apkAsset?.browser_download_url || `https://github.com/${repo}/releases/latest`,
          apkSize: apkAsset?.size ? `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB` : (isPwa ? 'Web PWA' : '20.2 MB'),
          sha256: parsedSha256,
          sha256Url: shaAsset?.browser_download_url,
          htmlUrl: data.html_url,
          isPwa,
          pwaTarballUrl: pwaAsset?.browser_download_url,
          isMandatory: false,
        };

        this.cachedRelease = releaseInfo;
        const hasUpdate = this.isNewer(releaseInfo.version, CURRENT_APP_VERSION);

        return {
          hasUpdate,
          currentVersion: CURRENT_APP_VERSION,
          latestRelease: releaseInfo,
        };
      }

      // 2. Fallback: Query raw package.json from GitHub master branch
      console.log('[UpdateService] Releases API non-200. Querying raw GitHub master package.json...');
      const rawPkgUrl = `https://raw.githubusercontent.com/${repo}/master/package.json`;
      const rawRes = await fetch(rawPkgUrl);

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

        const releaseInfo: AppReleaseInfo = {
          version: githubVersion,
          versionCode: this.calculateVersionCode(githubVersion),
          releaseDate: new Date().toISOString().split('T')[0],
          releaseTitle: `Vyapar PRO v${githubVersion} (GitHub Master)`,
          releaseNotes: [
            commitMsg,
            'Clean Clutter-Free POS Billing Counter with fixed item table scroll',
            'Installable Offline-First PWA for Debian Linux Server',
            'Automatic GitHub deployment pipeline with Service Worker hot-reload'
          ],
          apkUrl: `https://github.com/${repo}/releases`,
          apkSize: isPwa ? 'Web PWA' : '20.2 MB',
          htmlUrl: `https://github.com/${repo}`,
          isPwa,
          commitMessage: commitMsg,
        };

        this.cachedRelease = releaseInfo;
        const hasUpdate = this.isNewer(releaseInfo.version, CURRENT_APP_VERSION);

        return {
          hasUpdate,
          currentVersion: CURRENT_APP_VERSION,
          latestRelease: releaseInfo,
        };
      }

      // 3. Fallback: Query local server /version.json
      if (typeof window !== 'undefined') {
        const localVersionRes = await fetch(`./version.json?t=${Date.now()}`);
        if (localVersionRes.ok) {
          const vData = await localVersionRes.json();
          if (vData.version && this.isNewer(vData.version, CURRENT_APP_VERSION)) {
            const releaseInfo: AppReleaseInfo = {
              version: vData.version,
              versionCode: this.calculateVersionCode(vData.version),
              releaseDate: vData.buildTime ? vData.buildTime.split('T')[0] : new Date().toISOString().split('T')[0],
              releaseTitle: `Vyapar PRO v${vData.version}`,
              releaseNotes: [
                'New PWA build deployed on server',
                'Click Update to refresh application cache'
              ],
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
      }

      return {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestRelease: this.cachedRelease || undefined,
        error: `Could not fetch release information from GitHub (${repo})`,
      };
    } catch (err: any) {
      console.warn('GitHub update check network error:', err);
      return {
        hasUpdate: false,
        currentVersion: CURRENT_APP_VERSION,
        latestRelease: this.cachedRelease || undefined,
        error: err?.message || 'Network error checking for updates',
      };
    }
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

  public calculateVersionCode(versionStr: string): number {
    const parts = versionStr.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const major = parts[0] || 1;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    return major * 10000 + minor * 100 + patch;
  }

  public async calculateSha256(data: ArrayBuffer): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return '';
  }

  public startInternalDownload(options: OtaDownloadOptions): () => void {
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
}

export const updateService = new UpdateService();

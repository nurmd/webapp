/**
 * In-App Application OTA (Over-The-Air) Updater Service
 * Connects directly to GitHub Version Releases API (e.g. nurmd/webapp)
 * Compares semantic versions, parses cryptographic SHA-256 checksums,
 * performs internal streaming downloads, verifies file integrity,
 * cleans up temporary installation artifacts, and prompts for retry on mismatch.
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

export const CURRENT_APP_VERSION = '1.0.20';
export const CURRENT_VERSION_CODE = 10020;
export const DEFAULT_GITHUB_REPO = 'nurmd/webapp';

class UpdateService {
  private lastChecked: string | null = null;
  private cachedRelease: AppReleaseInfo | null = null;
  private activeAbortController: AbortController | null = null;

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
   * Checks for updates by querying GitHub Releases API:
   * GET https://api.github.com/repos/{owner}/{repo}/releases/latest
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

    try {
      const res = await fetch(apiUrl, {
        headers: {
          Accept: 'application/vnd.github.v3+json',
        },
      });

      if (res.ok) {
        const data = await res.json();
        const tag = (data.tag_name || '').replace(/^v/, '');
        const cleanVersion = tag || CURRENT_APP_VERSION;

        // Parse release notes from markdown body
        const notes: string[] = [];
        let parsedSha256: string | undefined;

        if (data.body) {
          const lines = data.body.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            // Check for explicit SHA256 line: "SHA256: <hash>" or "sha256: <hash>"
            const shaMatch = trimmed.match(/sha-?256[:\s]+([a-f0-9]{64})/i);
            if (shaMatch) {
              parsedSha256 = shaMatch[1].toLowerCase();
            } else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
              notes.push(trimmed.replace(/^[-*•]\s+/, '').replace(/\*\*/g, ''));
            }
          }
        }
        if (notes.length === 0 && data.body) {
          notes.push(data.body.slice(0, 300));
        }

        // Find binary APK asset
        const apkAsset = data.assets?.find(
          (a: any) => a.name && (a.name.endsWith('.apk') || a.name.includes('.apk'))
        );

        // Find optional attached .sha256 checksum asset
        const shaAsset = data.assets?.find(
          (a: any) => a.name && a.name.endsWith('.sha256')
        );

        const sha256Url = shaAsset?.browser_download_url;

        // If sha256 wasn't parsed from body, try fetching from the .sha256 asset
        if (!parsedSha256 && sha256Url) {
          try {
            const shaRes = await fetch(sha256Url);
            if (shaRes.ok) {
              const text = await shaRes.text();
              const hashMatch = text.match(/([a-fA-F0-9]{64})/);
              if (hashMatch) {
                parsedSha256 = hashMatch[1].toLowerCase();
              }
            }
          } catch (_e) {
            // Ignore asset fetch failure; can proceed with fallback
          }
        }

        const apkUrl = apkAsset?.browser_download_url || data.html_url || `https://github.com/${repo}/releases/latest`;
        const apkSize = apkAsset?.size
          ? `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB`
          : '20.2 MB';

        const releaseInfo: AppReleaseInfo = {
          version: cleanVersion,
          versionCode: this.calculateVersionCode(cleanVersion),
          releaseDate: data.published_at ? data.published_at.split('T')[0] : new Date().toISOString().split('T')[0],
          releaseTitle: data.name || `Vyapar PRO v${cleanVersion}`,
          releaseNotes: notes.length > 0 ? notes : [
            'Direct ESC/POS 58mm & 80mm thermal receipt printing',
            'Dual barcode scanning with hardware wedge listener',
            'Party Ledger Passbook & Double-Entry Payment Vouchers',
            'Government NIC E-Way Bill & E-Invoice JSON compliance',
          ],
          apkUrl,
          apkSize,
          sha256: parsedSha256,
          sha256Url,
          htmlUrl: data.html_url,
          isMandatory: false,
        };

        this.cachedRelease = releaseInfo;
        const hasUpdate = this.isNewer(releaseInfo.version, CURRENT_APP_VERSION);

        return {
          hasUpdate,
          currentVersion: CURRENT_APP_VERSION,
          latestRelease: releaseInfo,
        };
      } else {
        const errorMsg = res.status === 404
          ? `No GitHub releases found for ${repo}`
          : `GitHub API returned ${res.status}`;
        console.warn(errorMsg);
        return {
          hasUpdate: false,
          currentVersion: CURRENT_APP_VERSION,
          latestRelease: this.cachedRelease || undefined,
          error: errorMsg,
        };
      }
    } catch (err: any) {
      console.warn('GitHub OTA release check failed or offline:', err);
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

  /**
   * Calculates cryptographic SHA-256 of an ArrayBuffer in browser / web environments.
   */
  public async calculateSha256(data: ArrayBuffer): Promise<string> {
    if (typeof crypto !== 'undefined' && crypto.subtle) {
      const hashBuffer = await crypto.subtle.digest('SHA-256', data);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
    }
    return '';
  }

  /**
   * Initiates internal OTA download:
   * 1. If running inside Android WebView (`AndroidBridge.startInternalDownload`),
   *    downloads stream natively to app cache, streams SHA-256, verifies hash,
   *    and launches Android Package Installer.
   * 2. If running in a web browser, streams the file via fetch(), calculates SHA-256,
   *    verifies checksum, and triggers the verified file download.
   * 3. If checksum fails at any point, cleans temp files and notifies the caller
   *    with canRetry = true.
   */
  public startInternalDownload(options: OtaDownloadOptions): () => void {
    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;

    // A) Android Native WebView Bridge
    if (bridge && typeof bridge.startInternalDownload === 'function') {
      // Wire global callbacks for native events
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

    // B) Web / Browser Fallback Streaming Download
    const abortController = new AbortController();
    this.activeAbortController = abortController;

    (async () => {
      try {
        const response = await fetch(options.apkUrl, {
          signal: abortController.signal,
        });

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

        // Assemble downloaded buffer
        const totalBuffer = new Uint8Array(loadedBytes);
        let offset = 0;
        for (const chunk of chunks) {
          totalBuffer.set(chunk, offset);
          offset += chunk.length;
        }

        // Checksum verification
        const calculatedHash = await this.calculateSha256(totalBuffer.buffer);
        const expected = (options.expectedSha256 || '').trim().toLowerCase();

        if (expected && calculatedHash.toLowerCase() !== expected) {
          const msg = `Checksum verification failed! Expected: ${expected.slice(0, 10)}... Got: ${calculatedHash.slice(0, 10)}...`;
          options.onError?.(msg, true);
          return;
        }

        // Trigger verified browser download
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

  /**
   * Cleans up any leftover temporary APK file from cache.
   */
  public clearTempApk(): void {
    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;
    if (bridge && typeof bridge.clearTempApk === 'function') {
      bridge.clearTempApk();
    }
  }

  /**
   * Legacy fallback helper to open APK URL if needed.
   */
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

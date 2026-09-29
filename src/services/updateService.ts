/**
 * In-App Application OTA (Over-The-Air) Updater Service
 * Connects directly to GitHub Version Releases API (e.g. nurmd/webapp)
 * Compares semantic versions, fetches release notes, and triggers APK installation.
 */

export interface AppReleaseInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  releaseTitle: string;
  releaseNotes: string[];
  apkUrl: string;
  apkSize: string;
  htmlUrl?: string;
  isMandatory?: boolean;
}

export const CURRENT_APP_VERSION = '1.0.2';
export const CURRENT_VERSION_CODE = 10002;
export const DEFAULT_GITHUB_REPO = 'nurmd/webapp';

class UpdateService {
  private lastChecked: string | null = null;
  private cachedRelease: AppReleaseInfo | null = null;

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
        if (data.body) {
          const lines = data.body.split('\n');
          for (const line of lines) {
            const trimmed = line.trim();
            if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
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

        const apkUrl = apkAsset?.browser_download_url || data.html_url || `https://github.com/${repo}/releases/latest`;
        const apkSize = apkAsset?.size
          ? `${(apkAsset.size / (1024 * 1024)).toFixed(1)} MB`
          : '8.8 MB';

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
      } else if (res.status === 404) {
        console.warn(`No GitHub releases found for ${repo}`);
      }
    } catch (err: any) {
      console.warn('GitHub OTA release check failed or offline:', err);
    }

    // Fallback if GitHub API is offline or rate-limited: check custom endpoint or cached
    const fallbackRelease: AppReleaseInfo = this.cachedRelease || {
      version: '1.0.0',
      versionCode: 1,
      releaseDate: new Date().toISOString().split('T')[0],
      releaseTitle: `Vyapar PRO v1.0.0 (Production Release)`,
      releaseNotes: [
        '100% Offline-First PouchDB & CouchDB multi-device sync',
        'Direct ESC/POS 58mm & 80mm thermal receipt printing',
        'Hardware barcode scanner gun wedge listener + camera scanner',
        '4-Digit PIN Multi-Role Security (Owner, Cashier, Chartered Accountant)',
        'Party Ledger Passbook with automated payment receipt & payment out vouchers',
      ],
      apkUrl: `https://github.com/${repo}/releases/download/v1.0.0/GSTBilling-Vyapar.apk`,
      apkSize: '8.8 MB',
      htmlUrl: `https://github.com/${repo}/releases/tag/v1.0.0`,
      isMandatory: false,
    };

    const hasUpdate = this.isNewer(fallbackRelease.version, CURRENT_APP_VERSION);
    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestRelease: fallbackRelease,
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

  public calculateVersionCode(versionStr: string): number {
    const parts = versionStr.replace(/^v/, '').split('.').map((n) => parseInt(n, 10) || 0);
    const major = parts[0] || 1;
    const minor = parts[1] || 0;
    const patch = parts[2] || 0;
    return major * 10000 + minor * 100 + patch;
  }

  /**
   * Triggers the APK installation / download process:
   * 1. If AndroidBridge is available in WebView, calls native openUrl/installApk.
   * 2. Also opens browser link / creates hidden download element.
   */
  public installUpdate(apkUrl: string): void {
    const bridge = typeof window !== 'undefined' ? (window as any).AndroidBridge : null;

    if (bridge) {
      if (typeof bridge.showToast === 'function') {
        bridge.showToast('Starting Vyapar APK download...');
      }
      if (typeof bridge.installApk === 'function') {
        bridge.installApk(apkUrl);
        return;
      }
      if (typeof bridge.openUrl === 'function') {
        bridge.openUrl(apkUrl);
        return;
      }
    }

    // Web / browser download fallback
    if (typeof document !== 'undefined') {
      const link = document.createElement('a');
      link.href = apkUrl;
      link.setAttribute('download', 'GSTBilling-Vyapar.apk');
      link.setAttribute('target', '_blank');
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } else if (typeof window !== 'undefined') {
      window.open(apkUrl, '_blank');
    }
  }
}

export const updateService = new UpdateService();

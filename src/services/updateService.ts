/**
 * In-App Application Updater Service
 * Checks for updates, compares semantic versions, and triggers native APK download/install.
 */

export interface AppReleaseInfo {
  version: string;
  versionCode: number;
  releaseDate: string;
  releaseTitle: string;
  releaseNotes: string[];
  apkUrl: string;
  apkSize: string;
  isMandatory?: boolean;
}

export const CURRENT_APP_VERSION = '1.0.0';
export const CURRENT_VERSION_CODE = 1;

// Default demo/production update channel
export const DEMO_UPDATE_RELEASE: AppReleaseInfo = {
  version: '1.1.0',
  versionCode: 2,
  releaseDate: '2026-09-29',
  releaseTitle: 'Vyapar PRO v1.1.0 - Multi-Counter & Hardware Thermal Update',
  releaseNotes: [
    'Direct ESC/POS 58mm & 80mm Bluetooth & USB thermal receipt printing',
    'Hardware barcode scanner gun wedge listener + live camera scanner with torch',
    '4-Digit PIN Multi-Role Security (Owner, Cashier, Chartered Accountant)',
    'Official NIC E-Way Bill & IRP E-Invoice JSON v1.1 compliance generators',
    'Vernacular WhatsApp templates in English, Hindi (हिंदी), and Hinglish with dynamic UPI pay links',
    'Offline-First 2-Way CouchDB / PouchDB sync for multi-counter billing',
  ],
  apkUrl: '/GSTBilling-Vyapar.apk',
  apkSize: '8.8 MB',
  isMandatory: false,
};

class UpdateService {
  private lastChecked: string | null = null;
  private cachedRelease: AppReleaseInfo | null = null;

  public getCurrentVersion(): string {
    return CURRENT_APP_VERSION;
  }

  public async checkForUpdates(): Promise<{
    hasUpdate: boolean;
    currentVersion: string;
    latestRelease?: AppReleaseInfo;
  }> {
    this.lastChecked = new Date().toISOString();

    // In a live environment, this fetches from e.g. https://api.yourdomain.com/vyapar-update.json
    // Or GitHub releases API. Here we provide the verified update payload with simulation:
    const customEndpoint = typeof localStorage !== 'undefined' ? localStorage.getItem('vyapar_custom_update_url') : null;

    if (customEndpoint && customEndpoint.trim()) {
      try {
        const res = await fetch(customEndpoint.trim());
        if (res.ok) {
          const data: AppReleaseInfo = await res.json();
          this.cachedRelease = data;
          const hasUpdate = this.isNewer(data.version, CURRENT_APP_VERSION);
          return {
            hasUpdate,
            currentVersion: CURRENT_APP_VERSION,
            latestRelease: data,
          };
        }
      } catch (err) {
        console.warn('Custom update check failed, using default channel:', err);
      }
    }

    // Default release
    this.cachedRelease = DEMO_UPDATE_RELEASE;
    const hasUpdate = this.isNewer(DEMO_UPDATE_RELEASE.version, CURRENT_APP_VERSION);

    return {
      hasUpdate,
      currentVersion: CURRENT_APP_VERSION,
      latestRelease: DEMO_UPDATE_RELEASE,
    };
  }

  public isNewer(latest: string, current: string): boolean {
    const lParts = latest.split('.').map((n) => parseInt(n, 10) || 0);
    const cParts = current.split('.').map((n) => parseInt(n, 10) || 0);

    for (let i = 0; i < Math.max(lParts.length, cParts.length); i++) {
      const l = lParts[i] || 0;
      const c = cParts[i] || 0;
      if (l > c) return true;
      if (l < c) return false;
    }
    return false;
  }

  public installUpdate(apkUrl: string): void {
    // If AndroidBridge is available in WebView, trigger toast or native intent
    const bridge = (window as any).AndroidBridge;
    if (bridge && typeof bridge.showToast === 'function') {
      bridge.showToast('Starting APK download...');
    }

    // Open APK link in browser or trigger download
    const link = document.createElement('a');
    link.href = apkUrl;
    link.setAttribute('download', 'GSTBilling-Vyapar.apk');
    link.setAttribute('target', '_blank');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

export const updateService = new UpdateService();

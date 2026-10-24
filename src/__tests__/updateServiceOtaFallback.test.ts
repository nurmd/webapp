import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AppUpdateModal } from '../components/Update/AppUpdateModal.tsx';
import { AppReleaseInfo, updateService } from '../services/updateService.ts';

const jsonResponse = (body: unknown, status = 200) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const loadService = async () => {
  vi.resetModules();
  const module = await import('../services/updateService.ts');
  return module.updateService;
};

describe('updateService OTA fallback and release safety', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    vi.unstubAllGlobals();
    delete (window as any).AndroidBridge;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
    delete (window as any).AndroidBridge;
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses raw version.json when GitHub API fetch is blocked by CORS preflight, with apkUrl empty and releases htmlUrl', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      if (url.includes('api.github.com')) {
        throw new TypeError('Failed to fetch');
      }

      if (url.includes('/master/public/version.json')) {
        return jsonResponse({
          version: '9.9.9',
          buildTime: '2026-10-22T06:34:53.968Z',
          releaseNotes: ['Fallback release detected'],
        });
      }

      throw new Error(`Unexpected URL in test: ${url}`);
    }));

    const updateService = await loadService();
    const result = await updateService.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.latestRelease?.version).toBe('9.9.9');
    expect(result.latestRelease?.releaseNotes).toContain('Fallback release detected');
    expect(result.error).toBeUndefined();

    // Must never return a raw dist-android APK or SHA URL
    expect(result.latestRelease?.apkUrl).toBe('');
    expect(result.latestRelease?.sha256Url).toBeUndefined();
    expect(result.latestRelease?.htmlUrl).toBe('https://github.com/nurmd/webapp/releases');

    const apiCall = calls.find((call) => call.url.includes('/releases/latest'));
    expect(apiCall).toBeDefined();
    expect(apiCall?.init?.headers).not.toHaveProperty('Cache-Control');
    expect(apiCall?.init?.headers).not.toHaveProperty('Pragma');
  });

  it('release API with an APK asset uses that asset URL and sha256Url', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/releases/latest')) {
        return jsonResponse({
          tag_name: 'v9.9.9',
          published_at: '2026-10-24T12:00:00Z',
          html_url: 'https://github.com/nurmd/webapp/releases/tag/v9.9.9',
          body: 'SHA-256: 0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef\n- Enhanced performance',
          assets: [
            {
              name: 'GSTBilling-Vyapar.apk',
              browser_download_url: 'https://github.com/nurmd/webapp/releases/download/v9.9.9/GSTBilling-Vyapar.apk',
              size: 5800000,
            },
            {
              name: 'GSTBilling-Vyapar.apk.sha256',
              browser_download_url: 'https://github.com/nurmd/webapp/releases/download/v9.9.9/GSTBilling-Vyapar.apk.sha256',
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    }));

    const updateService = await loadService();
    const result = await updateService.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.latestRelease?.apkUrl).toBe('https://github.com/nurmd/webapp/releases/download/v9.9.9/GSTBilling-Vyapar.apk');
    expect(result.latestRelease?.sha256Url).toBe('https://github.com/nurmd/webapp/releases/download/v9.9.9/GSTBilling-Vyapar.apk.sha256');
    expect(result.latestRelease?.htmlUrl).toBe('https://github.com/nurmd/webapp/releases/tag/v9.9.9');
    expect(result.latestRelease?.sha256).toBe('0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef');
  });

  it('release API without an APK asset yields apkUrl === "" and preserves htmlUrl', async () => {
    (window as any).AndroidBridge = {}; // Android environment without APK asset
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('/releases/latest')) {
        return jsonResponse({
          tag_name: 'v9.9.9',
          published_at: '2026-10-24T12:00:00Z',
          html_url: 'https://github.com/nurmd/webapp/releases/tag/v9.9.9',
          body: '- Web only release',
          assets: [
            {
              name: 'vyapar-pwa.tar.gz',
              browser_download_url: 'https://github.com/nurmd/webapp/releases/download/v9.9.9/vyapar-pwa.tar.gz',
            },
          ],
        });
      }
      return jsonResponse({}, 404);
    }));

    const updateService = await loadService();
    const result = await updateService.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.latestRelease?.apkUrl).toBe('');
    expect(result.latestRelease?.sha256Url).toBeUndefined();
    expect(result.latestRelease?.htmlUrl).toBe('https://github.com/nurmd/webapp/releases/tag/v9.9.9');
    expect(result.latestRelease?.apkSize).toBe('Release page');
  });

  it('raw package.json fallback never yields a raw APK URL and directs to releases', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.includes('api.github.com/repos')) {
        throw new TypeError('API network failure');
      }
      if (url.includes('/master/public/version.json')) {
        return jsonResponse({}, 404);
      }
      if (url.includes('/master/package.json')) {
        return jsonResponse({
          version: '9.9.9',
        });
      }
      return jsonResponse({}, 404);
    }));

    const updateService = await loadService();
    const result = await updateService.checkForUpdates();

    expect(result.hasUpdate).toBe(true);
    expect(result.latestRelease?.version).toBe('9.9.9');
    expect(result.latestRelease?.apkUrl).toBe('');
    expect(result.latestRelease?.sha256Url).toBeUndefined();
    expect(result.latestRelease?.htmlUrl).toBe('https://github.com/nurmd/webapp/releases');
  });

  it('openReleasePage uses AndroidBridge.openUrl when present or window.open otherwise', async () => {
    const updateService = await loadService();

    // 1. With AndroidBridge
    const mockBridgeOpenUrl = vi.fn();
    (window as any).AndroidBridge = { openUrl: mockBridgeOpenUrl };

    updateService.openReleasePage('https://github.com/nurmd/webapp/releases/tag/v1.2.30');
    expect(mockBridgeOpenUrl).toHaveBeenCalledWith('https://github.com/nurmd/webapp/releases/tag/v1.2.30');

    // 2. Without AndroidBridge (browser fallback)
    delete (window as any).AndroidBridge;
    const mockWindowOpen = vi.fn();
    vi.stubGlobal('open', mockWindowOpen);

    updateService.openReleasePage('');
    expect(mockWindowOpen).toHaveBeenCalledWith('https://github.com/nurmd/webapp/releases', '_blank');
  });

  it('reports a real error instead of claiming the app is up to date when every source fails', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => {
      throw new TypeError('Network unavailable');
    }));

    const updateService = await loadService();
    const result = await updateService.checkForUpdates();

    expect(result.hasUpdate).toBe(false);
    expect(result.error).toBeTruthy();
    expect(result.error).toContain('Network unavailable');
  });

  it('renders "Open GitHub Release" button when apkUrl is empty in Android mode, and calls openReleasePage', async () => {
    const mockBridgeOpenUrl = vi.fn();
    (window as any).AndroidBridge = { openUrl: mockBridgeOpenUrl };

    const spyOpenReleasePage = vi.spyOn(updateService, 'openReleasePage');

    const testReleaseNoApk: AppReleaseInfo = {
      version: '9.9.9',
      versionCode: 90909,
      releaseDate: '2026-10-24',
      releaseTitle: 'Vyapar PRO v9.9.9',
      releaseNotes: ['Important security patch'],
      apkUrl: '',
      apkSize: 'Release page',
      htmlUrl: 'https://github.com/nurmd/webapp/releases/tag/v9.9.9',
      isPwa: false,
    };

    await act(async () => {
      root!.render(
        React.createElement(AppUpdateModal, {
          isOpen: true,
          releaseInfo: testReleaseNoApk,
          onClose: () => {},
        })
      );
    });

    const openReleaseBtn = container?.querySelector('[data-testid="btn-open-github-release"]') as HTMLButtonElement | null;
    expect(openReleaseBtn).not.toBeNull();
    expect(openReleaseBtn?.textContent).toContain('Open GitHub Release');
    expect(container?.querySelector('[data-testid="btn-download-apk"]')).toBeNull();

    await act(async () => {
      openReleaseBtn?.click();
    });

    expect(spyOpenReleasePage).toHaveBeenCalledWith('https://github.com/nurmd/webapp/releases/tag/v9.9.9');
  });

  it('renders "Download & Verify" button when apkUrl is present in Android mode', async () => {
    (window as any).AndroidBridge = { startInternalDownload: vi.fn() };

    const testReleaseWithApk: AppReleaseInfo = {
      version: '9.9.9',
      versionCode: 90909,
      releaseDate: '2026-10-24',
      releaseTitle: 'Vyapar PRO v9.9.9',
      releaseNotes: ['APK package available'],
      apkUrl: 'https://github.com/nurmd/webapp/releases/download/v9.9.9/GSTBilling-Vyapar.apk',
      apkSize: '5.4 MB',
      sha256: 'a'.repeat(64),
      htmlUrl: 'https://github.com/nurmd/webapp/releases/tag/v9.9.9',
      isPwa: false,
    };

    await act(async () => {
      root!.render(
        React.createElement(AppUpdateModal, {
          isOpen: true,
          releaseInfo: testReleaseWithApk,
          onClose: () => {},
        })
      );
    });

    const downloadBtn = container?.querySelector('[data-testid="btn-download-apk"]') as HTMLButtonElement | null;
    expect(downloadBtn).not.toBeNull();
    expect(downloadBtn?.textContent).toContain('Download & Verify (5.4 MB)');
    expect(container?.querySelector('[data-testid="btn-open-github-release"]')).toBeNull();
  });
});

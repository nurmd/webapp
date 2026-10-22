import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const jsonResponse = (body: unknown) => ({
  ok: true,
  status: 200,
  json: async () => body,
  text: async () => JSON.stringify(body),
});

const loadService = async () => {
  vi.resetModules();
  const module = await import('../services/updateService.ts');
  return module.updateService;
};

describe('updateService OTA fallback', () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('uses raw version.json when GitHub API fetch is blocked by CORS preflight', async () => {
    const calls: Array<{ url: string; init?: RequestInit }> = [];

    vi.stubGlobal('fetch', vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });

      // Simulate the CORS preflight failure caused by non-safelisted
      // Cache-Control / Pragma headers on the old implementation.
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

    const apiCall = calls.find((call) => call.url.includes('/releases/latest'));
    expect(apiCall).toBeDefined();
    // These headers trigger a preflight that GitHub's CORS policy rejects.
    expect(apiCall?.init?.headers).not.toHaveProperty('Cache-Control');
    expect(apiCall?.init?.headers).not.toHaveProperty('Pragma');
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
});

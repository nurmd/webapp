// @vitest-environment happy-dom
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

class TestStorage {
  private store = new Map<string, string>();
  get length() { return this.store.size; }
  clear() { this.store.clear(); }
  getItem(key: string) { return this.store.get(key) ?? null; }
  key(index: number) { return Array.from(this.store.keys())[index] ?? null; }
  removeItem(key: string) { this.store.delete(key); }
  setItem(key: string, value: string) { this.store.set(key, String(value)); }
}

const testStorage = new TestStorage();
Object.defineProperty(globalThis, 'localStorage', { value: testStorage, writable: true, configurable: true });
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'localStorage', { value: testStorage, writable: true, configurable: true });
}

import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

import { AppUpdatePrompt } from '../components/Update/AppUpdatePrompt.tsx';
import { AppReleaseInfo, updateService } from '../services/updateService.ts';
import {
  readSkippedOtaVersion,
  writeSkippedOtaVersion,
  readNotifiedOtaVersion,
  writeNotifiedOtaVersion,
  shouldAutoPromptOta,
  clearOtaPromptStorage,
  OTA_SKIPPED_VERSION_KEY,
  OTA_NOTIFIED_VERSION_KEY,
} from '../core/utils/otaPromptStorage.ts';
import {
  triggerBack,
  resetBackNavigationForTesting,
} from '../core/utils/backNavigation.ts';

describe('AppUpdatePrompt and otaPromptStorage Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    testStorage.clear();
    clearOtaPromptStorage();
    resetBackNavigationForTesting();
    vi.restoreAllMocks();
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
    testStorage.clear();
    clearOtaPromptStorage();
    resetBackNavigationForTesting();
    vi.restoreAllMocks();
  });

  const baseRelease: AppReleaseInfo = {
    version: '1.2.82',
    versionCode: 10282,
    releaseDate: '2026-11-17',
    releaseTitle: 'Performance & Inventory Enhancements',
    releaseNotes: [
      'Added high-speed barcode scanning optimizations',
      'Unified thermal receipt layout for 58mm and 80mm',
      'Optimized indexed queries for large party passbooks',
      'Fixed minor GST cess rounding discrepancy',
    ],
    apkUrl: 'https://github.com/example/releases/download/v1.2.82/app-release.apk',
    apkSize: '15.4 MB',
    htmlUrl: 'https://github.com/example/releases/tag/v1.2.82',
  };

  it('renders the version, release title and dynamically supplied notes, and asserts no release-note text is hardcoded in AppUpdatePrompt.tsx', () => {
    act(() => {
      root!.render(
        <AppUpdatePrompt
          isOpen={true}
          releaseInfo={baseRelease}
          onUpdateNow={vi.fn()}
          onLater={vi.fn()}
          onSkip={vi.fn()}
        />
      );
    });

    const text = container!.textContent || '';
    expect(text).toContain('Update available — v1.2.82');
    expect(text).toContain('Performance & Inventory Enhancements');
    expect(text).toContain('Added high-speed barcode scanning optimizations');
    expect(text).toContain('Unified thermal receipt layout for 58mm and 80mm');
    expect(text).toContain('Optimized indexed queries for large party passbooks');
    // 4th note is truncated into "+1 more"
    expect(text).toContain('+1 more');

    // Invariant 13 static check: ensure no hardcoded fallback strings exist in AppUpdatePrompt.tsx
    const promptSourcePath = path.resolve(__dirname, '../components/Update/AppUpdatePrompt.tsx');
    const promptSource = fs.readFileSync(promptSourcePath, 'utf8');

    const forbiddenPhrases = [
      'bug fixes and performance enhancements',
      'stability updates',
      'performance improvements',
      'minor bug fixes',
    ];
    for (const phrase of forbiddenPhrases) {
      expect(promptSource.toLowerCase()).not.toContain(phrase);
    }
  });

  it('Update Now fires its callback and does not itself start a download', () => {
    const onUpdateNow = vi.fn();
    const downloadSpy = vi.spyOn(updateService, 'startInternalDownload');
    const installSpy = vi.spyOn(updateService, 'installUpdate');

    act(() => {
      root!.render(
        <AppUpdatePrompt
          isOpen={true}
          releaseInfo={baseRelease}
          onUpdateNow={onUpdateNow}
          onLater={vi.fn()}
          onSkip={vi.fn()}
        />
      );
    });

    const buttons = container!.querySelectorAll('button');
    const updateNowBtn = Array.from(buttons).find((b) => b.textContent?.includes('Update Now'));
    expect(updateNowBtn).toBeDefined();

    act(() => {
      updateNowBtn!.click();
    });

    expect(onUpdateNow).toHaveBeenCalledTimes(1);
    expect(downloadSpy).not.toHaveBeenCalled();
    expect(installSpy).not.toHaveBeenCalled();
  });

  it('Later closes without writing the skipped version', () => {
    const onLater = vi.fn();

    act(() => {
      root!.render(
        <AppUpdatePrompt
          isOpen={true}
          releaseInfo={baseRelease}
          onUpdateNow={vi.fn()}
          onLater={onLater}
          onSkip={vi.fn()}
        />
      );
    });

    const buttons = container!.querySelectorAll('button');
    const laterBtn = Array.from(buttons).find((b) => b.textContent?.trim() === 'Later');
    expect(laterBtn).toBeDefined();

    act(() => {
      laterBtn!.click();
    });

    expect(onLater).toHaveBeenCalledTimes(1);
    expect(readSkippedOtaVersion()).toBeNull();
  });

  it('Skip persists the version; shouldAutoPromptOta then returns false for it but true for a newer version', () => {
    const onSkip = vi.fn((ver: string) => {
      writeSkippedOtaVersion(ver);
    });

    act(() => {
      root!.render(
        <AppUpdatePrompt
          isOpen={true}
          releaseInfo={baseRelease}
          onUpdateNow={vi.fn()}
          onLater={vi.fn()}
          onSkip={onSkip}
        />
      );
    });

    const buttons = container!.querySelectorAll('button');
    const skipBtn = Array.from(buttons).find((b) => b.textContent?.includes('Skip this version'));
    expect(skipBtn).toBeDefined();

    act(() => {
      skipBtn!.click();
    });

    expect(onSkip).toHaveBeenCalledWith('1.2.82');
    expect(readSkippedOtaVersion()).toBe('1.2.82');

    // shouldAutoPromptOta returns false for skipped version
    expect(shouldAutoPromptOta('1.2.82', { currentVersion: '1.2.81' })).toBe(false);
    expect(shouldAutoPromptOta('v1.2.82', { currentVersion: '1.2.81' })).toBe(false);

    // shouldAutoPromptOta returns true for a subsequent, newer version
    expect(shouldAutoPromptOta('1.2.83', { currentVersion: '1.2.81' })).toBe(true);
    expect(shouldAutoPromptOta('v1.2.83', { currentVersion: '1.2.81' })).toBe(true);
  });

  it('isMandatory hides Later/Skip and changes primary button label', () => {
    const mandatoryRelease: AppReleaseInfo = {
      ...baseRelease,
      isMandatory: true,
    };

    act(() => {
      root!.render(
        <AppUpdatePrompt
          isOpen={true}
          releaseInfo={mandatoryRelease}
          onUpdateNow={vi.fn()}
          onLater={vi.fn()}
          onSkip={vi.fn()}
        />
      );
    });

    const text = container!.textContent || '';
    expect(text).toContain('Update now (required)');
    expect(text).not.toContain('Later');
    expect(text).not.toContain('Skip this version');
  });

  it('back press closes the prompt', () => {
    const onLater = vi.fn();

    act(() => {
      root!.render(
        <AppUpdatePrompt
          isOpen={true}
          releaseInfo={baseRelease}
          onUpdateNow={vi.fn()}
          onLater={onLater}
          onSkip={vi.fn()}
        />
      );
    });

    // Trigger Android system back
    let handled = false;
    act(() => {
      handled = triggerBack();
    });

    expect(handled).toBe(true);
    expect(onLater).toHaveBeenCalledTimes(1);
  });

  it('storage helpers tolerate malformed JSON, absent keys, and null resets', () => {
    // Malformed JSON in localStorage
    testStorage.setItem(OTA_SKIPPED_VERSION_KEY, '{"bad_json: true');
    expect(readSkippedOtaVersion()).toBe('{"bad_json: true');

    testStorage.setItem(OTA_NOTIFIED_VERSION_KEY, '{"incomplete:');
    expect(readNotifiedOtaVersion()).toBe('{"incomplete:');

    // Normal values and clearing
    writeSkippedOtaVersion('1.3.0');
    expect(readSkippedOtaVersion()).toBe('1.3.0');
    writeSkippedOtaVersion(null);
    expect(readSkippedOtaVersion()).toBeNull();

    writeNotifiedOtaVersion('1.3.0');
    expect(readNotifiedOtaVersion()).toBe('1.3.0');
    writeNotifiedOtaVersion(null);
    expect(readNotifiedOtaVersion()).toBeNull();

    // shouldAutoPromptOta checks
    expect(shouldAutoPromptOta(null)).toBe(false);
    expect(shouldAutoPromptOta('')).toBe(false);
    expect(shouldAutoPromptOta('1.2.81', { currentVersion: '1.2.81' })).toBe(false);
    expect(shouldAutoPromptOta('v1.2.81', { currentVersion: '1.2.81' })).toBe(false);
  });

  it('static guard: App.tsx opens the prompt only through shouldAutoPromptOta, and the manual Settings check path does not consult skip state', () => {
    const appSourcePath = path.resolve(__dirname, '../App.tsx');
    const appSource = fs.readFileSync(appSourcePath, 'utf8');

    // Verify shouldAutoPromptOta is imported
    expect(appSource).toContain('shouldAutoPromptOta');

    // Verify setIsUpdatePromptOpen(true) is conditioned on shouldAutoPromptOta
    const promptOpenIdx = appSource.indexOf('setIsUpdatePromptOpen(true)');
    expect(promptOpenIdx).toBeGreaterThan(0);

    const surroundingCode = appSource.slice(promptOpenIdx - 300, promptOpenIdx);
    expect(surroundingCode).toContain('shouldAutoPromptOta');

    // Extract handleCheckUpdate implementation to verify it does not consult skip/notified state
    const handleCheckUpdateMatch = appSource.match(/const handleCheckUpdate\s*=\s*useCallback\([\s\S]*?\n\s*\},/);
    expect(handleCheckUpdateMatch).toBeDefined();
    const handleCheckUpdateBody = handleCheckUpdateMatch![0];

    expect(handleCheckUpdateBody).not.toContain('shouldAutoPromptOta');
    expect(handleCheckUpdateBody).not.toContain('readSkippedOtaVersion');
    expect(handleCheckUpdateBody).not.toContain('readNotifiedOtaVersion');
  });
});

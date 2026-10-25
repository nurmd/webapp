import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

/**
 * WhatsApp Native Intent Chooser Static Contract Test
 *
 * NOTE: As noted in Phase D handoff, no physical Android device or emulator with
 * WhatsApp or WhatsApp Business installed is available in this environment.
 * Full runtime on-device smoke testing remains pending until hardware is available.
 *
 * This test statically validates that the Kotlin native bridge in MainActivity.kt
 * and AndroidManifest.xml maintain all contract invariants required for multi-package
 * WhatsApp intent resolution, fallback handling, and JavaScript bridge invocation.
 */
describe('WhatsApp Native Chooser Contract (Static Source Verification)', () => {
  const mainActivityPath = path.resolve(
    process.cwd(),
    'android-native/app/src/main/java/com/gstbilling/pos/MainActivity.kt'
  );
  const manifestPath = path.resolve(
    process.cwd(),
    'android-native/app/src/main/AndroidManifest.xml'
  );

  it('verifies that AndroidManifest.xml declares <queries> for WhatsApp and WhatsApp Business', () => {
    expect(fs.existsSync(manifestPath)).toBe(true);
    const manifestContent = fs.readFileSync(manifestPath, 'utf8');

    expect(manifestContent).toContain('<package android:name="com.whatsapp" />');
    expect(manifestContent).toContain('<package android:name="com.whatsapp.w4b" />');
  });

  it('verifies that MainActivity.kt contains the two-package priority resolution list', () => {
    expect(fs.existsSync(mainActivityPath)).toBe(true);
    const activityContent = fs.readFileSync(mainActivityPath, 'utf8');

    expect(activityContent).toContain('listOf("com.whatsapp", "com.whatsapp.w4b")');
  });

  it('verifies that MainActivity.kt configures Intent.createChooser and EXTRA_INITIAL_INTENTS for dual-install', () => {
    const activityContent = fs.readFileSync(mainActivityPath, 'utf8');

    expect(activityContent).toContain('Intent.createChooser');
    expect(activityContent).toContain('Intent.EXTRA_INITIAL_INTENTS');
  });

  it('verifies that MainActivity.kt handles single-target direct launch when only one package is installed', () => {
    const activityContent = fs.readFileSync(mainActivityPath, 'utf8');

    // Asserts branch: availableIntents.size == 1 -> startActivity(availableIntents[0])
    expect(activityContent).toMatch(/availableIntents\.size\s*==\s*1/);
    expect(activityContent).toContain('startActivity(availableIntents[0])');
  });

  it('verifies that MainActivity.kt provides fallback chooser and "WhatsApp is not installed" message when neither package is present', () => {
    const activityContent = fs.readFileSync(mainActivityPath, 'utf8');

    expect(activityContent).toContain('"Open with"');
    expect(activityContent).toContain('"WhatsApp is not installed"');
  });

  it('verifies that AndroidBridge declares @JavascriptInterface fun openWhatsAppUrl(url: String)', () => {
    const activityContent = fs.readFileSync(mainActivityPath, 'utf8');

    expect(activityContent).toContain('@JavascriptInterface');
    expect(activityContent).toContain('fun openWhatsAppUrl(url: String)');
  });

  it('verifies that WebViewClient intercepts all three WhatsApp deep-link URL prefixes', () => {
    const activityContent = fs.readFileSync(mainActivityPath, 'utf8');

    expect(activityContent).toContain('"https://wa.me/"');
    expect(activityContent).toContain('"https://api.whatsapp.com/"');
    expect(activityContent).toContain('"whatsapp://"');
  });
});

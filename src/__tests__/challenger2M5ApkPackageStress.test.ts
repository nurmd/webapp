import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';
import * as crypto from 'crypto';

describe('Challenger 2 Milestone 5: Empirical APK Artifact & Signature Stress Suite', () => {
  const rootDir = path.resolve(__dirname, '../..');
  const apkPath = path.join(rootDir, 'dist-android/GSTBilling-Vyapar.apk');
  const sha256Path = path.join(rootDir, 'dist-android/GSTBilling-Vyapar.apk.sha256');
  const distAssetsDir = path.join(rootDir, 'dist/assets');

  it('1. verifies APK binary existence, size bounds, and SHA-256 checksum integrity', () => {
    expect(fs.existsSync(apkPath)).toBe(true);
    const stats = fs.statSync(apkPath);
    expect(stats.size).toBeGreaterThan(1_000_000); // Greater than 1 MB
    expect(stats.size).toBeLessThan(15_000_000); // Strict upper bound < 15 MB

    expect(fs.existsSync(sha256Path)).toBe(true);
    const sha256Content = fs.readFileSync(sha256Path, 'utf8').trim();
    const expectedHash = sha256Content.split(/\s+/)[0];

    const fileBuffer = fs.readFileSync(apkPath);
    const calculatedHash = crypto.createHash('sha256').update(new Uint8Array(fileBuffer)).digest('hex');

    expect(calculatedHash).toBe(expectedHash);
  });

  it('2. verifies cryptographic signature schemes (v2 & v3) with zero warnings (-Werr)', () => {
    const apksignerCmd = `apksigner verify --verbose -Werr --min-sdk-version 24 --max-sdk-version 35 "${apkPath}"`;
    const output = execSync(apksignerCmd, { encoding: 'utf8' });

    expect(output).toContain('Verifies');
    expect(output).toContain('Verified using v2 scheme (APK Signature Scheme v2): true');
    expect(output).toContain('Verified using v3 scheme (APK Signature Scheme v3): true');
    expect(output).toContain('Number of signers: 1');
  });

  it('3. verifies Android badging metadata, SDK constraints, and launchable activity via aapt2', () => {
    const badgingOutput = execSync(`aapt2 dump badging "${apkPath}"`, { encoding: 'utf8' });

    expect(badgingOutput).toMatch(/package:\s+name='com\.gstbilling\.pos'/);
    expect(badgingOutput).toMatch(/versionCode='10115'/);
    expect(badgingOutput).toMatch(/versionName='1\.1\.15'/);
    expect(badgingOutput).toMatch(/minSdkVersion:'24'/);
    expect(badgingOutput).toMatch(/targetSdkVersion:'35'/);
    expect(badgingOutput).toMatch(/launchable-activity:\s+name='com\.gstbilling\.pos\.MainActivity'/);
    expect(badgingOutput).toMatch(/application-label:'GST Billing & Accounting'/);
  });

  it('4. verifies APK zip archive structure, classes.dex, and complete code-split asset parity', () => {
    // Test zip integrity
    const testZipOutput = execSync(`zip -T "${apkPath}"`, { encoding: 'utf8' });
    expect(testZipOutput).toContain('OK');

    // List all files in APK
    const unzipListOutput = execSync(`unzip -l "${apkPath}"`, { encoding: 'utf8' });
    const lines = unzipListOutput.split('\n');
    const archiveFiles = lines
      .map((l) => l.trim().split(/\s+/).pop())
      .filter((f): f is string => typeof f === 'string' && f.length > 0 && f !== 'Name' && !f.startsWith('--'));

    // Critical native files
    expect(archiveFiles).toContain('AndroidManifest.xml');
    expect(archiveFiles).toContain('classes.dex');
    expect(archiveFiles).toContain('resources.arsc');
    expect(archiveFiles).toContain('assets/index.html');
    expect(archiveFiles).toContain('assets/version.json');

    // Verify PWA artifacts are excluded to prevent APK bloat
    expect(archiveFiles).not.toContain('assets/sw.js');
    expect(archiveFiles).not.toContain('assets/manifest.json');
    expect(archiveFiles).not.toContain('assets/apple-touch-icon.png');

    // Compare with dist/assets
    const distAssets = fs.readdirSync(distAssetsDir);
    expect(distAssets.length).toBeGreaterThan(10);

    for (const assetFile of distAssets) {
      const expectedApkAsset = `assets/assets/${assetFile}`;
      expect(
        archiveFiles,
        `Expected ${expectedApkAsset} to be present in APK archive`
      ).toContain(expectedApkAsset);
    }
  });

  it('5. verifies classes.dex bytecode contains required activity and bridge symbols', () => {
    const dexBytes = execSync(`unzip -p "${apkPath}" classes.dex`, { maxBuffer: 10 * 1024 * 1024 });
    const dexStr = dexBytes.toString('latin1');

    expect(dexStr).toContain('com/gstbilling/pos/MainActivity');
    expect(dexStr).toContain('com/gstbilling/pos/GenericFileProvider');
    expect(dexStr).toContain('AndroidBridge');
  });
});

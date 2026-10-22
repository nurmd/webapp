# Android APK Signing & Keystore Security Specification

## 1. Vulnerability Summary & Key Compromise
The legacy Android release keystore (`android-native/keystore/app-key.keystore`) and its signing credentials are stored strictly outside version control and must be rotated. The private key must be treated as permanently compromised and burned.

## 2. Cryptographic Key Rotation & Android OS Compatibility

Vyapar Books configures `minSdkVersion 24` (Android 7.0 Nougat) and `targetSdkVersion 35` (Android 15).

### APK Signature Scheme v3 (`--lineage`)
- **API 28+ (Android 9.0 Pie and above)**: The Android Package Manager natively enforces APK Signature Scheme v3 key rotation. When an APK is signed using `--lineage lineage.proof`, devices running Android 9+ cryptographically verify that the new release signing key is a legitimate, authorized descendant of the legacy key. Sideloaded and OTA updates install seamlessly without signature mismatch errors.
- **API 24–27 (Android 7.0, 7.1, 8.0, 8.1)**: The Android Package Manager on Android 7 and 8 only supports APK Signature Schemes v1 (JAR signing) and v2 (APK Signing Block). These OS versions **do not support or inspect v3 key rotation lineage proofs**. An attempt to install an APK signed with a rotated key over an existing install signed with the old key will fail with:
  ```text
  INSTALL_FAILED_UPDATE_INCOMPATIBLE: Package com.gstbilling.pos signatures do not match previously installed version; ignoring!
  ```

> [!NOTE]
> **Current Release Status (v1.2.21)**:
> Release `v1.2.21` is signed with the legacy release keystore for update continuity across existing installs. Full key rotation with APK Signature Scheme v3 lineage proof remains required for a future release.

## 3. Explicit Migration Path for Android 7 & Android 8 (API 24–27)

Users on Android 7.0 through Android 8.1 will need to perform a local database backup before transitioning to the first rotated-key release build once key rotation is executed:

1. **Export Local Database Backup**:
   - Open **Vyapar Books** on the device.
   - Navigate to **Settings** $\rightarrow$ **Data & Sync** $\rightarrow$ **Export Full Backup**.
   - Save the `.json` backup file to a safe location (e.g., Device Downloads, SD Card, or cloud storage).
2. **Uninstall Old Application**:
   - Uninstall the legacy version from the device launcher or via:
     ```bash
     adb uninstall com.gstbilling.pos
     ```
3. **Install Rotated Release APK**:
   - Install the first rotated release build signed with the rotated key:
     ```bash
     adb install -r GSTBilling-Vyapar.apk
     ```
4. **Restore Database Backup**:
   - Launch the newly installed **Vyapar Books**.
   - Navigate to **Settings** $\rightarrow$ **Data & Sync** $\rightarrow$ **Restore Backup**.
   - Select the backup file saved in Step 1 and choose **Replace (Full Restore)**. All transactions, parties, inventory, vouchers, and settings are restored.

## 4. Inability to Revoke Sideloaded Keys

Unlike web browsers that enforce Online Certificate Status Protocol (OCSP) and Certificate Revocation Lists (CRLs) through trusted Certificate Authorities (CAs), Android's application packaging security relies entirely on self-signed certificates and Trust-on-First-Use (TOFU).

- **No OS-Level Revocation**: The Android operating system provides **no mechanism to revoke a leaked self-signed private key** for sideloaded applications.
- **Exposure Window**: Any device that retains an installation signed with the compromised debug key will continue to trust that key until the application is uninstalled or superseded by an authorized v3 lineage update (on API 28+).
- **Security Advisory**: All field deployments and retail counters must be audited to ensure legacy builds signed with the compromised key are completely replaced.

## 5. Build Environment Variables

To sign release builds, the build environment must provide:
```bash
export ANDROID_KEYSTORE_PATH="/path/to/secure/release.keystore"
export ANDROID_KS_PASS="<SecureKeystorePassword>"
export ANDROID_KEY_PASS="<SecureKeyPassword>"
export ANDROID_KEY_ALIAS="<OptionalAlias>"
export ANDROID_LINEAGE_PATH="/path/to/lineage.proof" # Optional v3 lineage proof
```
Never commit signing keys, lineage proofs, or credentials to git.

# Architecture & Language Selection: GST Billing & Accounting System

This document outlines the architectural decisions, technology stack evaluation, and platform-specific compilation workflows for the **GST Billing & Accounting Application**.

---

## 1. Language Choice & Rationale: Why TypeScript?

To simultaneously target **Web, Android, iOS, and Desktop (Linux & Windows)** with high performance, offline capabilities, and hardware printer support, **TypeScript** (with React + Vite + Capacitor + Tauri) is the optimal choice.

### Comparative Technology Evaluation

| Criteria | **TypeScript (React + Capacitor + Tauri)** | **Dart (Flutter)** | **Kotlin Multiplatform (KMP)** | **C# (.NET MAUI)** |
| :--- | :--- | :--- | :--- | :--- |
| **Cross-Platform Reach** | **Web, Android, iOS, Windows, Linux** (5/5) | Web, Android, iOS, Windows, Linux (5/5) | Android, iOS, Desktop (Web Wasm maturing) | Android, iOS, Windows (No official Linux) |
| **Shared Business Logic** | 100% Shared in pure TS (runs in browser, node, mobile & desktop) | 100% Shared in Dart | Shared via Kotlin common code | Shared via .NET C# |
| **GST Tax Engine Portability** | Runs natively in browser, service workers, cloud API & native apps | Requires Dart engine | Requires JVM/KMP runtime | Requires CLR runtime |
| **POS Thermal Printing** | Native Web Bluetooth, WebUSB, ESC/POS byte streams, serial port | Plugins available | Android/Desktop direct, Web limited | Complex desktop driver bindings |
| **Desktop Binary Size** | **~10–15 MB** (via Tauri Rust webview) | ~40–60 MB | ~50–80 MB (bundled JRE) | ~80–120 MB |
| **Local Environment Fit** | Runs natively in Linux/Termux with Node.js | Requires 2GB+ Flutter SDK download | Heavy Gradle/JDK/C++ toolchains | Heavy .NET SDK |

### Key Reasons for TypeScript:
1. **Single Source of Truth for Indian GST Rules**:
   - Indian GST rules require specific algorithms:
     - 15-digit GSTIN regex & **Luhn Mod 36 checksum verification**.
     - Intra-State (CGST + SGST) vs Inter-State (IGST) automatic determination.
     - HSN/SAC code 0%, 5%, 12%, 18%, 28% tax slabs, Cess, and reverse charge (RCM).
     - Indian numbering system amount in words conversion (Lakhs and Crores).
   - In TypeScript, this core logic is isolated in `src/core/gst/` as pure, zero-dependency functions that execute identically in offline browser IndexedDB, Android webview, Windows/Linux desktop webviews, and cloud server backends.
2. **Double-Entry Bookkeeping Synchronization**:
   - Double-entry debit/credit ledger validation occurs instantly on client devices without requiring an active internet connection.
3. **Retail Hardware & Thermal Printer Compatibility**:
   - Billing counters depend on 58mm and 80mm ESC/POS thermal printers. The application generates raw ESC/POS binary buffers via WebUSB, Web Bluetooth, and network sockets.

---

## 2. System Architecture

```
+-----------------------------------------------------------------------------------+
|                           Unified Presentation Layer (React + UI)                 |
|  - Dashboard      - POS Retail Counter     - B2B/B2C Invoices   - Stock Catalog   |
|  - Daybook/Ledger - GSTR-1 Tax Return      - Parties Directory  - Business Setup  |
+-----------------------------------------------------------------------------------+
                                          |
+-----------------------------------------------------------------------------------+
|                        Core Shared Business Engine (Pure TypeScript)              |
|  +--------------------+  +-----------------------+  +---------------------------+ |
|  |   GST Tax Engine   |  | Accounting Subsystem  |  | Hardware / Printer Engine | |
|  | - CGST/SGST/IGST   |  | - Journal Vouchers    |  | - 58mm/80mm ESC/POS layout| |
|  | - Mod 36 GSTIN     |  | - Balance Check       |  | - A4 Tax Invoice Vector   | |
|  | - 38 State Codes   |  | - Daybook Ledger      |  | - Dynamic UPI QR Code     | |
|  | - HSN/SAC Catalog  |  | - Auto Sales Vouchers |  | - Indian Number to Words  | |
|  +--------------------+  +-----------------------+  +---------------------------+ |
+-----------------------------------------------------------------------------------+
                                          |
+-----------------------------------------------------------------------------------+
|                           Offline-First Persistence Layer                         |
|  - IndexedDB (Browser)  - SQLite (Native Mobile & Desktop)  - Background Cloud Sync|
+-----------------------------------------------------------------------------------+
                                          |
      +-------------------+---------------+-------------------+
      |                   |               |                   |
      v                   v               v                   v
+------------+     +-------------+ +-------------+     +-------------+
|    Web     |     |   Android   | |     iOS     |     |   Desktop   |
| (PWA / SPA)|     | (Capacitor) | | (Capacitor) |     |(Linux & Win)|
| Responsive |     | Native APK  | | Native App  |     |   (Tauri)   |
+------------+     +-------------+ +-------------+     +-------------+
```

---

## 3. Directory Layout

```
gst-billing-app/
├── capacitor.config.ts        # Android & iOS cross-platform configuration
├── src-tauri/                 # Desktop (Windows & Linux) Tauri runner
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   └── src/main.rs
├── public/
│   ├── favicon.svg
│   └── manifest.json          # PWA offline installation manifest
├── src/
│   ├── core/                  # Pure TypeScript shared domain logic
│   │   ├── gst/
│   │   │   ├── calculator.ts  # Intra vs Inter-state, CGST, SGST, IGST, Cess
│   │   │   ├── validator.ts   # GSTIN format & Luhn Mod 36 checksum
│   │   │   ├── stateCodes.ts  # 38 Indian State & UT GST codes
│   │   │   └── hsnCatalog.ts  # Common Goods & Services HSN codes
│   │   ├── accounting/
│   │   │   ├── ledger.ts      # Automated double-entry vouchers & balancing
│   │   │   └── voucherTypes.ts# Sales, Purchase, Payment, Receipt, Journal
│   │   ├── printer/
│   │   │   └── escpos.ts      # 58mm & 80mm ESC/POS thermal command builder
│   │   └── utils/
│   │       ├── currencyWords.ts # Indian numbering format (Lakhs, Crores)
│   │       └── formatters.ts  # INR (₹) and Date formatters
│   ├── models/                # TypeScript schemas for Invoice, Party, Item, Company
│   ├── services/
│   │   └── db.ts              # Offline-first repository with seed demo data
│   ├── components/            # UI Views & Modals
│   │   ├── Dashboard/
│   │   ├── Invoicing/
│   │   ├── POS/
│   │   ├── Inventory/
│   │   ├── Parties/
│   │   ├── Reports/
│   │   └── Settings/
│   ├── App.tsx
│   ├── main.tsx
│   └── index.css
├── scripts/
│   ├── test-gst-engine.ts     # Standalone GST engine automated test suite
│   ├── build-android.sh       # Android APK compilation script
│   └── build-desktop.sh       # Linux & Windows desktop packaging script
├── package.json
├── tsconfig.json
└── vite.config.ts
```

---

## 4. Multi-Platform Build & Run Guide

### 1. Web (SPA / PWA)
- Development: `npm run dev` (Starts dev server on `http://localhost:3000`)
- Production Build: `npm run build` (Outputs optimized static files to `dist/`)
- Installable as a Progressive Web App (PWA) with offline caching.

### 2. Android
- Automated script: `./scripts/build-android.sh`
- Manual steps:
  ```bash
  npm run build
  npx cap add android   # (First time)
  npx cap sync android
  cd android && ./gradlew assembleDebug
  ```
- Resulting APK: `android/app/build/outputs/apk/debug/app-debug.apk`

### 3. iOS
- Prerequisites: macOS with Xcode installed.
- Steps:
  ```bash
  npm run build
  npx cap add ios       # (First time)
  npx cap sync ios
  npx cap open ios      # Opens project in Xcode to build/archive .ipa
  ```

### 4. Desktop (Linux & Windows)
- Automated script: `./scripts/build-desktop.sh`
- Uses Tauri 2.0 (Rust backend + Webview frontend):
  ```bash
  # Linux (.deb / .AppImage)
  npm run tauri:build

  # Windows (.exe / .msi)
  # Built on Windows host or via GitHub Actions CI/CD cross-compilation
  npm run tauri:build
  ```

### 5. Running the GST Test Suite
- Verify calculation math, Luhn Mod 36 checksums, and double-entry balancing:
  ```bash
  node --experimental-strip-types scripts/test-gst-engine.ts
  ```

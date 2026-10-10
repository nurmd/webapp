# GST Billing & Accounting Application (Cross-Platform)

An offline-first **GST Billing & Double-Entry Accounting System** built for **Web**, **Android**, **iOS**, and **Desktop (Linux & Windows)**.

Developed in **TypeScript** using **React 18**, **Vite**, **Capacitor**, and **Tauri 2.0**.

---

## Key Features

1. **Intelligent Indian GST Tax Engine**:
   - Automatic identification of **Intra-State (CGST + SGST)** vs **Inter-State (IGST)** based on supplier & customer State Codes.
   - Comprehensive **38 Indian State & Union Territory GST codes** (01 Jammu & Kashmir to 38 Ladakh).
   - Real-time **GSTIN format & Luhn Mod 36 checksum validator** (extracts State Code, PAN, and confirms authenticity).
   - Support for 0%, 5%, 12%, 18%, 28% GST slabs, Cess (ad-valorem and specific), item-level discounts, and mathematical round-off.
   - Indian currency numbering converter (**Lakhs & Crores** in words on invoices).
2. **High-Speed POS Counter Billing**:
   - Rapid retail counter sale screen with live barcode scanner & SKU search.
   - Instant cart updates and single-click checkout (Cash, UPI, Card).
   - Generates formatted **58mm / 80mm ESC/POS thermal receipt** printouts.
3. **B2B & B2C Invoicing**:
   - Generates tax-compliant A4/A5 GST Tax Invoices.
   - Dynamic UPI payment QR codes, bank details, and legal declaration terms.
   - Single-click sharing via **WhatsApp** and standard browser vector printing.
4. **Automated Double-Entry Accounting Ledger**:
   - Creates balanced double-entry Journal Vouchers automatically upon invoice creation:
     - *Debit:* Cash / Bank / Customer Account (Receivables)
     - *Credit:* GST Sales Revenue Account
     - *Credit:* Output CGST, SGST, IGST, and Cess Tax Accounts
   - Complete Daybook view with verification that Total Debits equal Total Credits.
5. **GSTR-1 Tax Return Reporting**:
   - Ready-to-file segmentation into **Table 4 (B2B)**, **Table 7 (B2C Small)**, and **Table 12 (HSN/SAC Summary)**.
   - Export reports directly to **GSTR-1 JSON** for GST Portal upload.
6. **Cross-Platform Deployments**:
   - **Web:** Progressive Web App (PWA) with offline caching.
   - **Android & iOS:** Packaged with Capacitor for native mobile distribution.
   - **Linux & Windows Desktop:** Packaged with Tauri 2.0 for lightweight (~15MB) native desktop binaries.

---

## Quick Start

### 1. Test the GST Engine
Run the automated test suite verifying tax calculations, checksums, and double-entry balance:
```bash
node --experimental-strip-types scripts/test-gst-engine.ts
```

### 2. Start the Development Server
```bash
npm install
npm run dev
```
Open `http://localhost:3000` in your browser.

### 3. Build for Production
```bash
npm run build
```

---

## Platform Builds

| Platform | Command / Script | Description |
| :--- | :--- | :--- |
| **Web (PWA)** | `npm run build` | Builds static files in `dist/` |
| **Android** | `./scripts/build-android.sh` | Builds native debug APK |
| **iOS** | `npx cap sync ios && npx cap open ios` | Opens Xcode project for packaging |
| **Desktop (Linux/Win)** | `./scripts/build-desktop.sh` | Packages desktop binary using Tauri |

See [ARCHITECTURE.md](file:///data/data/com.termux/files/home/gst-billing-app/ARCHITECTURE.md) and [CODEBASE_GUIDE.md](file:///data/data/com.termux/files/home/gst-billing-app/CODEBASE_GUIDE.md) for full technical documentation and engineering guides.

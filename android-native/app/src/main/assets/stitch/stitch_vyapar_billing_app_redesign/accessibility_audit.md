I have completed an in-depth **WCAG 2.1 Level AA Accessibility Audit** for the selected **Suppliers & Vendors (Simplified)** screen (`Suppliers & Vendors (Simplified)`). The complete report has been generated and saved to your project artifacts as **Accessibility Audit - Suppliers & Vendors** (`Accessibility Audit - Suppliers & Vendors`).

---

### Audit Summary & Highlights

- **Overall Grade:** **B- (Remediation Recommended)**
- **Total Issues Identified:** 8 (2 Critical, 4 Moderate, 2 Minor)

#### 1. Critical Violations (P0)
- **Unlabeled Icon-Only Buttons (WCAG 1.1.1, 4.1.2):** Header navigation triggers (hamburger menu, QR code scanner, notifications) and vendor card WhatsApp buttons lack accessible text (`aria-label` or `.sr-only`), causing screen readers to announce unhelpful icon names.
- **Form Search Input (WCAG 1.3.1, 3.3.2):** The supplier search field relies solely on a `placeholder` attribute without an accessible `<label>` or `aria-label`.

#### 2. Moderate Violations (P1)
- **Touch Target Sizes (WCAG 2.5.5 / 2.5.8):** The WhatsApp chat button next to "Pay Now" falls below the standard 44×44px mobile touch target, risking accidental financial taps.
- **Color Contrast (WCAG 1.4.3):**
  - **"Due in 3d" / "Due Tomorrow"** status tags use amber text on light yellow backgrounds with an estimated **~3.2:1** contrast ratio (target: **≥4.5:1**).
  - Secondary bill metadata dates (`#94a3b8`) have borderline legibility under bright outdoor conditions.
- **Tab & Filter Semantics (WCAG 4.1.2):** The "Customers / Suppliers" toggle switch and filter pills ("All", "Overdue", "Settled") are standard buttons without `role="tablist"` or `aria-selected` / `aria-pressed` states.

#### 3. Best Practice Improvements (P2)
- Introduce semantic heading levels (`<h1>` for screen context, `<h3>` per vendor) to allow fast rotor/screen-reader navigation.
- Add `aria-current="page"` to the active "Parties" bottom tab.

---

Would you like me to apply these accessibility fixes directly to the **Suppliers & Vendors (Simplified)** screen?
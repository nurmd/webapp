---
name: Vyapar Modern Fintech
colors:
  surface: '#f9f9ff'
  surface-dim: '#cfdaf2'
  surface-bright: '#f9f9ff'
  surface-container-lowest: '#ffffff'
  surface-container-low: '#f0f3ff'
  surface-container: '#e7eeff'
  surface-container-high: '#dee8ff'
  surface-container-highest: '#d8e3fb'
  on-surface: '#111c2d'
  on-surface-variant: '#44474c'
  inverse-surface: '#263143'
  inverse-on-surface: '#ecf1ff'
  outline: '#75777d'
  outline-variant: '#c5c6cd'
  surface-tint: '#525f75'
  primary: '#000000'
  on-primary: '#ffffff'
  primary-container: '#0e1c2f'
  on-primary-container: '#77849c'
  inverse-primary: '#bac7e1'
  secondary: '#006c49'
  on-secondary: '#ffffff'
  secondary-container: '#6cf8bb'
  on-secondary-container: '#00714d'
  tertiary: '#000000'
  on-tertiary: '#ffffff'
  tertiary-container: '#2a1700'
  on-tertiary-container: '#b87500'
  error: '#ba1a1a'
  on-error: '#ffffff'
  error-container: '#ffdad6'
  on-error-container: '#93000a'
  primary-fixed: '#d6e3fe'
  primary-fixed-dim: '#bac7e1'
  on-primary-fixed: '#0e1c2f'
  on-primary-fixed-variant: '#3a475c'
  secondary-fixed: '#6ffbbe'
  secondary-fixed-dim: '#4edea3'
  on-secondary-fixed: '#002113'
  on-secondary-fixed-variant: '#005236'
  tertiary-fixed: '#ffddb8'
  tertiary-fixed-dim: '#ffb95f'
  on-tertiary-fixed: '#2a1700'
  on-tertiary-fixed-variant: '#653e00'
  background: '#f9f9ff'
  on-background: '#111c2d'
  surface-variant: '#d8e3fb'
typography:
  headline-lg:
    fontFamily: Plus Jakarta Sans
    fontSize: 30px
    fontWeight: '700'
    lineHeight: 38px
  headline-lg-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 24px
    fontWeight: '700'
    lineHeight: 32px
  headline-md:
    fontFamily: Plus Jakarta Sans
    fontSize: 20px
    fontWeight: '600'
    lineHeight: 28px
  headline-sm:
    fontFamily: Plus Jakarta Sans
    fontSize: 18px
    fontWeight: '600'
    lineHeight: 24px
  currency-display:
    fontFamily: Plus Jakarta Sans
    fontSize: 28px
    fontWeight: '800'
    lineHeight: 34px
  currency-display-mobile:
    fontFamily: Plus Jakarta Sans
    fontSize: 22px
    fontWeight: '800'
    lineHeight: 28px
  body-lg:
    fontFamily: Inter
    fontSize: 16px
    fontWeight: '400'
    lineHeight: 24px
  body-md:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '400'
    lineHeight: 20px
  body-sm:
    fontFamily: Inter
    fontSize: 12px
    fontWeight: '400'
    lineHeight: 16px
  label-md:
    fontFamily: Inter
    fontSize: 13px
    fontWeight: '600'
    lineHeight: 18px
  label-sm:
    fontFamily: Inter
    fontSize: 11px
    fontWeight: '600'
    lineHeight: 14px
  tabular-data:
    fontFamily: Inter
    fontSize: 14px
    fontWeight: '500'
    lineHeight: 20px
rounded:
  sm: 0.25rem
  DEFAULT: 0.5rem
  md: 0.75rem
  lg: 1rem
  xl: 1.5rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1rem
  space-xl: 1.5rem
---

## Brand & Style

This design system blends **Modern Fintech Utility** with **Tactile Minimalism**, engineered specifically for Indian merchants, distributors, and SMB proprietors navigating fast-paced operational environments. The core ethos is hyper-legibility, tactile confidence, and low cognitive friction. 

The aesthetic discards ornamental bloat in favor of purposeful contrast: crisp white paper-like surfaces floating above subtle cool-slate backdrops, punctuated by high-signal transactional colors. Indian shopkeepers process ledger lines, tax invoices, and balance books in noisy, daylight-intensive retail counters; thus, the interface prioritizes immediate optical clarity, direct thumb-reach tap zones, and unambiguous visual statuses. The tone is sturdy, authoritative, and growth-affirming—making daily bookkeeping feel like an asset rather than a chore.

## Colors

The palette leverages a structured semantic hierarchy optimized for light mode by default, ensuring sunlight legibility on counter mobile screens:

- **Primary Canvas & Surfaces**: 
  - Background Canvas: `#F8FAFC` (Slate 50)
  - Card/Modal Surface: `#FFFFFF` (Pure White)
  - Subsurface / Input Fill: `#F1F5F9` (Slate 100)
- **Deep Navy & Ink (Primary)**:
  - Deep Navy Slate: `#0B192C` (Anchor elements, primary navigation bars, dominant headers)
  - Secondary Slate: `#1E293B` (Body copy, high-contrast labels)
  - Muted Slate: `#64748B` (Secondary text, metadata, field descriptions)
  - Hairline Border: `#E2E8F0` (Card outlines, table delimiters)
- **Financial Status & Action Semantics**:
  - **Growth Emerald (`#10B981`)**: Positive cash flow, "You'll Receive" balances, GST-compliant success marks, and primary conversion CTAs. Tint surface: `#ECFDF5`.
  - **Alert Amber (`#F59E0B`)**: Pending payments, partial settlements, low inventory alerts, and e-way bill generation dues. Tint surface: `#FFFBEB`.
  - **Payable Rose (`#EF4444`)**: "You'll Give" balances, overdue debits, tax liabilities, and critical stockouts. Tint surface: `#FEF2F2`.
  - **Informational Indigo (`#3B82F6`)**: System notices, audit logs, and sync status indicators. Tint surface: `#EFF6FF`.

## Typography

The dual-type setup combines the warm, geometric authority of **Plus Jakarta Sans** for titles, metric banners, and high-impact ledger figures with the precision of **Inter** for dense transactional content, inventory tables, and metadata.

### Tabular Formatting & Rupee Handling
- All currency numbers must explicitly utilize `font-feature-settings: "tnum" 1` (tabular figures) to guarantee vertical alignment of numeric decimals across invoice rows and credit/debit statements.
- The Indian Rupee symbol (`₹`) matches the weight of its accompanying numeric string and maintains a standard right margin of `2px` to prevent baseline collision.
- Metric values exceeding 6 figures adhere to the Indian numbering system convention (`₹1,25,000.00` rather than `₹125,000.00`).

## Layout & Spacing

The layout model is mobile-first, operating on a fluid single-column stack on hand-held devices and transitioning to an adaptive 4-to-8 column layout for inventory POS tablets.

- **Canvas & Grids**: A base unit of `4px` governs all layout spacing. Phone screens enforce an outer margin of `12px` to `16px` to maximize screen real estate for wide table rows and product line-items.
- **Rhythm & Touch Targets**: Primary interactive rows (line item entries, party selections) enforce a minimum touch height of `48px`. 
- **Reflow & Docking**: Critical actions (e.g., "Create New Bill", "Record Payment In") sit within a sticky, safe-area-compliant bottom action dock, ensuring single-thumb completion during point-of-sale interactions.

## Elevation & Depth

This design system uses a **Tactile Micro-Border & Diffused Ambient Depth** model. Deep drop shadows are avoided to prevent visual mud in dense business dashboards; hierarchy is achieved by layering pure white containers over `#F8FAFC` backgrounds with deliberate hairline outlines.

- **Level 0 (Flat / Canvas)**: `#F8FAFC`. Zero elevation. Used for app scaffolding and list view channels.
- **Level 1 (Card / Resting Surface)**: Background `#FFFFFF`, border `1px solid #E2E8F0`, shadow `0 1px 3px rgba(11, 25, 44, 0.04), 0 1px 2px rgba(11, 25, 44, 0.02)`.
- **Level 2 (Active Rows / Flyouts / Segmented Bars)**: Background `#FFFFFF`, border `1px solid #CBD5E1`, shadow `0 4px 6px -1px rgba(11, 25, 44, 0.07), 0 2px 4px -2px rgba(11, 25, 44, 0.05)`.
- **Level 3 (Sticky Bottom Trays / FABs / Modals)**: Background `#FFFFFF`, border-top `1px solid #E2E8F0`, shadow `0 -4px 16px rgba(11, 25, 44, 0.08)`.
- **Level 4 (Primary Emerald Action Button Elevation)**: Background `#10B981`, shadow `0 4px 12px rgba(16, 185, 129, 0.28)`.

## Shapes

The design system incorporates a modern, friendly geometry defined by `roundedness: 2` (0.5rem / 8px baseline) with selective larger radiuses for container cohesion:

- **Micro elements (Badges, Tags, Checkboxes)**: `rounded` (6px–8px).
- **Interactive Controls (Inputs, Buttons, Dropdowns)**: `rounded-lg` (12px) for effortless, natural thumb rest.
- **Structural Cards & Ledger Panels**: `rounded-2xl` (16px) paired with the hairline border to produce a clean, modern card aesthetic.
- **Segmented Filter Controls & Status Chips**: Pill-shaped (`rounded-full` / 9999px) to communicate toggleability and clear categorization.

## Components

### Buttons
- **Primary Action (Payment Received / Save Invoice)**: High-growth Emerald background (`#10B981`), pure white text, semi-bold weight, `rounded-lg` (12px), height `48px`. Provides a tactile micro-elevation with `rgba(16, 185, 129, 0.28)`.
- **Secondary (Add Item / Share PDF)**: Crisp white background, `1.5px` border in Deep Navy Slate (`#0B192C`), text `#0B192C`.
- **Tertiary / Utility**: Ghost surface with muted slate typography (`#64748B`), active tap state triggers `#F1F5F9`.

### Status Badges & Chips
- **Status Indicator Badges**: Pill-shaped (`rounded-full`), padding `4px 10px`, typography `label-sm`.
  - *Paid / In-Stock*: Background `#ECFDF5`, text `#065F46`, left-anchored dot in `#10B981`.
  - *Pending / Due Soon*: Background `#FFFBEB`, text `#92400E`, left-anchored dot in `#F59E0B`.
  - *Overdue / Unpaid*: Background `#FEF2F2`, text `#991B1B`, left-anchored dot in `#EF4444`.
- **Filter Segmented Pills**: Resting `#FFFFFF` border `1px solid #E2E8F0`; selected `#0B192C` with pure white text and zero border.

### Input Fields & Search Bars
- Background `#FFFFFF` or `#F8FAFC` with a `1px` border in `#CBD5E1`. Height `48px`, border radius `12px`.
- Dedicated numeric entry states activate monospace tabular styles immediately.
- Prefix and suffix containers (such as the `₹` sign or `+91` code) are rendered with a soft `#F1F5F9` background and `#475569` text, visually separated by an internal vertical divider.

### Transaction & Ledger Cards
- Surface `#FFFFFF`, border radius `16px` (`rounded-2xl`), enclosed by a `1px` hairline border in `#E2E8F0`.
- Interior consists of a two-line transactional format: Party Name & Invoice ID on the left; Net Amount and Date/Badge on the right.
- Numeric balances highlight net receivables in `#10B981` and net liabilities in `#EF4444`.

### Floating Quick-Action Bar (Bottom Bar)
- Persistent horizontal container docked `12px` above screen safe area.
- Dual-split structure: Left side for "Record Payment Out" (Rose secondary CTA), Right side for "Create Sale / Invoice" (Full Emerald primary CTA), granting rapid thumb access during peak retail hours.
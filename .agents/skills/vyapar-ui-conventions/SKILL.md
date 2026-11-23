---
name: vyapar-ui-conventions
description: >-
  Use when adding or changing screens, navigation tabs, lists, search bars, sticky headers,
  modals, drawers, or scroll behaviour in Vyapar Books.
---

# UI & Shell Conventions

## Shell
- Root: `h-screen h-[100dvh] overflow-hidden flex flex-row`.
- Global header: `flex-shrink-0 z-30`, outside the scroll hierarchy.
- Only `<main id="main-content-scroll">` scrolls
  (`flex-1 min-h-0 w-full overflow-y-auto overscroll-contain`).
- Attach scroll listeners to `document.getElementById('main-content-scroll')` with
  `{ passive: true }` inside `requestAnimationFrame`.

## Sticky search & headers
- Master lists: search/filter sticky at `top-0 z-20` with a surface backdrop.
- Show a 1-tap clear (`close`) button when the query is non-empty.
- Floating compact headers: wrap in a zero-height anchor
  (`sticky top-1.5 z-30 h-0 overflow-visible pointer-events-none`) so they add no ghost space.
- Scroll toggles use hysteresis (activate at `y > 80`, deactivate at `y < 40`); the compact
  header must include an `arrow_back` button.

## Navigation
- A new tab must be registered in `src/components/Shell/Drawer.tsx`,
  `src/components/Shell/TabletSidebar.tsx`, the `App.tsx` view routing, and
  `src/services/rbac.ts`.
- Use existing Material Symbols icons and match the label wording used elsewhere.

## Accessibility
- Icon-only buttons need `aria-label`.
- Clickable cards: `role="button"`, `tabIndex={0}`, Enter/Space handling.
- Keep focus visible and never leave focus trapped behind a modal.

## Checklist
- [ ] tab registered in drawer, sidebar, routing, RBAC.
- [ ] sticky search with a clear button.
- [ ] nothing renders behind the topbar.
- [ ] aria-labels and keyboard support present.
- [ ] `npx tsc --noEmit` clean.

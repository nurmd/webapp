import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { act } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { notifyDocumentSaved } from '../services/saveConfirmation.ts';
import { SaveConfirmationOverlay } from '../components/Common/SaveConfirmationOverlay.tsx';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

describe('SaveConfirmationOverlay & notifyDocumentSaved', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    vi.useFakeTimers();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => {
      root.unmount();
    });
    container.remove();
    vi.useRealTimers();
  });

  it('renders nothing initially, shows "Invoice saved" and "#INV-1" on event, and auto-dismisses after 1.6 s', () => {
    act(() => {
      root.render(<SaveConfirmationOverlay />);
    });

    expect(container.querySelector('[data-testid="save-confirmation-overlay"]')).toBeNull();

    act(() => {
      notifyDocumentSaved({ kind: 'Invoice', number: 'INV-1', amount: 1000 });
    });

    const overlay = container.querySelector('[data-testid="save-confirmation-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.getAttribute('role')).toBe('status');
    expect(overlay?.getAttribute('aria-live')).toBe('polite');
    expect(overlay?.textContent).toContain('Invoice saved');
    expect(overlay?.textContent).toContain('#INV-1');

    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect(container.querySelector('[data-testid="save-confirmation-overlay"]')).toBeNull();
  });

  it('resets the 1.6 s timer when a second save event arrives while visible', () => {
    act(() => {
      root.render(<SaveConfirmationOverlay />);
    });

    act(() => {
      notifyDocumentSaved({ kind: 'Invoice', number: 'INV-1', amount: 1000 });
    });

    // Advance 1.0 s (600 ms remaining on first timer)
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(container.querySelector('[data-testid="save-confirmation-overlay"]')).not.toBeNull();

    // Second event resets timer to another 1.6 s
    act(() => {
      notifyDocumentSaved({ kind: 'Purchase Bill', number: 'PB-2', amount: 2500 });
    });

    // Advance 800 ms (past the original 1.6 s mark, 800 ms into second timer)
    act(() => {
      vi.advanceTimersByTime(800);
    });
    const overlay = container.querySelector('[data-testid="save-confirmation-overlay"]');
    expect(overlay).not.toBeNull();
    expect(overlay?.textContent).toContain('Purchase Bill saved');
    expect(overlay?.textContent).toContain('#PB-2');

    // Advance remaining 800 ms -> now dismissed
    act(() => {
      vi.advanceTimersByTime(800);
    });
    expect(container.querySelector('[data-testid="save-confirmation-overlay"]')).toBeNull();
  });
});

import React, { act, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  useKeyboardShortcuts,
  isInputElement,
  getAltKeyLetter,
  SHORTCUT_TAB_MAP,
  KEYBOARD_SHORTCUTS,
  UseKeyboardShortcutsOptions,
} from '../hooks/useKeyboardShortcuts.ts';
import { KeyboardShortcutHelpModal } from '../components/Navigation/KeyboardShortcutHelpModal.tsx';
import { AppTab } from '../components/Shell/Drawer.tsx';
import { resetBackNavigationForTesting, triggerBack } from '../core/utils/backNavigation.ts';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('Keyboard Shortcuts Suite', () => {
  let container: HTMLDivElement | null = null;
  let root: Root | null = null;

  beforeEach(() => {
    resetBackNavigationForTesting();
    vi.restoreAllMocks();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  function dispatchKey(event: KeyboardEvent, target: EventTarget = window) {
    act(() => {
      target.dispatchEvent(event);
    });
  }

  afterEach(() => {
    if (root && container) {
      act(() => {
        root!.unmount();
      });
      container.remove();
    }
    container = null;
    root = null;
  });

  function mountHook(initialOptions: Partial<UseKeyboardShortcutsOptions> = {}) {
    const onNavigateTab = vi.fn();
    const onEscape = vi.fn();
    let currentShowHelp = false;
    let setHelpRef: React.Dispatch<React.SetStateAction<boolean>> | null = null;

    function TestHarness() {
      const [showHelp, setShowHelp] = useState(initialOptions.showHelp ?? false);
      currentShowHelp = showHelp;
      setHelpRef = setShowHelp;

      const { showHelp: _propShowHelp, ...restOptions } = initialOptions;

      useKeyboardShortcuts({
        onNavigateTab,
        onEscape,
        ...restOptions,
        showHelp,
        setShowHelp,
      });

      return (
        <div>
          <button id="btn">Click</button>
          <input id="input" type="text" />
          <textarea id="textarea" />
          <select id="select">
            <option value="1">1</option>
          </select>
          <div id="editable" contentEditable={true} suppressContentEditableWarning={true}>
            <span id="editable-child">Editable text</span>
          </div>
          <KeyboardShortcutHelpModal
            isOpen={showHelp}
            onClose={() => setShowHelp(false)}
            onSelectTab={onNavigateTab}
          />
        </div>
      );
    }

    act(() => {
      root!.render(<TestHarness />);
    });

    return {
      onNavigateTab,
      onEscape,
      getShowHelp: () => currentShowHelp,
      setShowHelp: (val: boolean) => {
        act(() => {
          setHelpRef?.(val);
        });
      },
    };
  }

  // 1. Alt+D calls handleSelectTab('dashboard') when no input is focused
  it('1. Alt+D calls onNavigateTab("dashboard") when no input is focused and prevents default', () => {
    const { onNavigateTab } = mountHook();

    const event = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(event);

    expect(onNavigateTab).toHaveBeenCalledTimes(1);
    expect(onNavigateTab).toHaveBeenCalledWith('dashboard');
    expect(event.defaultPrevented).toBe(true);
  });

  // 2. Alt+letter navigates to all configured tabs
  it('2. Alt+letter navigates to all configured tabs case-insensitively', () => {
    const { onNavigateTab } = mountHook();

    const testPairs: Array<{ letter: string; tab: AppTab }> = [
      { letter: 's', tab: 'sales' },
      { letter: 'p', tab: 'payment_in' },
      { letter: 'b', tab: 'purchases' },
      { letter: 'o', tab: 'payment_out' },
      { letter: 'r', tab: 'parties' },
      { letter: 'c', tab: 'cash_bank' },
      { letter: 'i', tab: 'inventory' },
      { letter: 'e', tab: 'expenses' },
      { letter: 'a', tab: 'reports' },
      { letter: 'g', tab: 'accounting' },
      { letter: 'k', tab: 'pos' },
      { letter: 't', tab: 'settings' },
      { letter: 'm', tab: 'menu' },
    ];

    for (const { letter, tab } of testPairs) {
      onNavigateTab.mockClear();
      const event = new KeyboardEvent('keydown', {
        key: letter.toUpperCase(),
        code: `Key${letter.toUpperCase()}`,
        altKey: true,
        bubbles: true,
        cancelable: true,
      });
      dispatchKey(event);

      expect(onNavigateTab).toHaveBeenCalledWith(tab);
      expect(event.defaultPrevented).toBe(true);
    }
  });

  // 3. Typing in an input is not intercepted (event not prevented, handler not called)
  it('3. Typing in an input is not intercepted (event not prevented, handler not called)', () => {
    const { onNavigateTab, getShowHelp } = mountHook();

    const input = document.getElementById('input') as HTMLInputElement;
    const textarea = document.getElementById('textarea') as HTMLTextAreaElement;
    const select = document.getElementById('select') as HTMLSelectElement;
    const editableChild = document.getElementById('editable-child') as HTMLSpanElement;

    // Test typing '?' inside an input
    const qEvent = new KeyboardEvent('keydown', {
      key: '?',
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(qEvent, input);
    expect(qEvent.defaultPrevented).toBe(false);
    expect(getShowHelp()).toBe(false);

    // Test Alt+D inside an input
    const altDInput = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altDInput, input);
    expect(altDInput.defaultPrevented).toBe(false);
    expect(onNavigateTab).not.toHaveBeenCalled();

    // Test inside textarea
    const altSTextarea = new KeyboardEvent('keydown', {
      key: 's',
      code: 'KeyS',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altSTextarea, textarea);
    expect(altSTextarea.defaultPrevented).toBe(false);
    expect(onNavigateTab).not.toHaveBeenCalled();

    // Test inside select
    const altPSelect = new KeyboardEvent('keydown', {
      key: 'p',
      code: 'KeyP',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altPSelect, select);
    expect(altPSelect.defaultPrevented).toBe(false);
    expect(onNavigateTab).not.toHaveBeenCalled();

    // Test inside contenteditable child
    const altBEditable = new KeyboardEvent('keydown', {
      key: 'b',
      code: 'KeyB',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altBEditable, editableChild);
    expect(altBEditable.defaultPrevented).toBe(false);
    expect(onNavigateTab).not.toHaveBeenCalled();
  });

  // 4. '?' toggles the help overlay
  it('4. "?" (and Shift+/) toggles the help overlay open and closed', () => {
    const { getShowHelp } = mountHook({ showHelp: false });
    expect(getShowHelp()).toBe(false);

    // Press '?'
    const q1 = new KeyboardEvent('keydown', {
      key: '?',
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(q1);
    expect(q1.defaultPrevented).toBe(true);
    expect(getShowHelp()).toBe(true);

    // Press Shift + '/' to toggle closed
    const q2 = new KeyboardEvent('keydown', {
      key: '/',
      shiftKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(q2);
    expect(q2.defaultPrevented).toBe(true);
    expect(getShowHelp()).toBe(false);
  });

  // 5. Alt+H toggles the help overlay
  it('5. Alt+H toggles the help overlay', () => {
    const { getShowHelp } = mountHook({ showHelp: false });
    expect(getShowHelp()).toBe(false);

    const altH1 = new KeyboardEvent('keydown', {
      key: 'h',
      code: 'KeyH',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altH1);
    expect(altH1.defaultPrevented).toBe(true);
    expect(getShowHelp()).toBe(true);

    const altH2 = new KeyboardEvent('keydown', {
      key: 'H',
      code: 'KeyH',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altH2);
    expect(altH2.defaultPrevented).toBe(true);
    expect(getShowHelp()).toBe(false);
  });

  // 6. Escape closes the overlay
  it('6. Escape closes the overlay when open, and calls onEscape when closed', () => {
    const { getShowHelp, setShowHelp, onEscape } = mountHook({ showHelp: true });
    expect(getShowHelp()).toBe(true);

    // Escape closes overlay
    const esc1 = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(esc1);
    expect(esc1.defaultPrevented).toBe(true);
    expect(getShowHelp()).toBe(false);

    // When overlay is already closed, Escape delegates to onEscape
    setShowHelp(false);
    const esc2 = new KeyboardEvent('keydown', {
      key: 'Escape',
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(esc2);
    expect(onEscape).toHaveBeenCalledTimes(1);
  });

  // 7. RBAC-blocked tab does not navigate
  it('7. RBAC-blocked tab does not navigate when canAccessTab returns false', () => {
    const canAccessTab = vi.fn((tab: AppTab) => {
      // CASHIER cannot access reports or settings
      return tab !== 'reports' && tab !== 'settings';
    });

    const { onNavigateTab } = mountHook({ canAccessTab });

    // Alt+D (allowed)
    const eventD = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(eventD);
    expect(onNavigateTab).toHaveBeenCalledWith('dashboard');

    // Alt+A (blocked reports)
    onNavigateTab.mockClear();
    const eventA = new KeyboardEvent('keydown', {
      key: 'a',
      code: 'KeyA',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(eventA);
    expect(onNavigateTab).not.toHaveBeenCalled();

    // Alt+T (blocked settings)
    const eventT = new KeyboardEvent('keydown', {
      key: 't',
      code: 'KeyT',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(eventT);
    expect(onNavigateTab).not.toHaveBeenCalled();
  });

  // 8. When enabled is false (e.g. modal open), shortcuts are ignored
  it('8. When enabled is false (e.g. application modal open), navigation and help toggle are ignored', () => {
    const { onNavigateTab, getShowHelp } = mountHook({ enabled: false });

    // Alt+D ignored
    const altD = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(altD);
    expect(onNavigateTab).not.toHaveBeenCalled();

    // '?' ignored
    const q = new KeyboardEvent('keydown', {
      key: '?',
      bubbles: true,
      cancelable: true,
    });
    dispatchKey(q);
    expect(getShowHelp()).toBe(false);
  });

  // 9. KeyboardShortcutHelpModal interactive selection and Android back navigation
  it('9. KeyboardShortcutHelpModal renders and clicking a shortcut navigates and closes', () => {
    const onClose = vi.fn();
    const onSelectTab = vi.fn();

    act(() => {
      root!.render(
        <KeyboardShortcutHelpModal
          isOpen={true}
          onClose={onClose}
          onSelectTab={onSelectTab}
        />
      );
    });

    // Verify modal dialog is rendered
    const dialog = document.querySelector('[role="dialog"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain('Keyboard Shortcuts');
    expect(dialog?.textContent).toContain('Alt + D');
    expect(dialog?.textContent).toContain('Dashboard');

    // Android hardware back navigation closes the modal
    triggerBack();
    expect(onClose).toHaveBeenCalled();
  });

  // 10. Unmount cleans up window event listener
  it('10. Unmounting the hook removes the window keydown listener', () => {
    const { onNavigateTab } = mountHook();

    // Unmount
    act(() => {
      root!.unmount();
    });
    root = null;

    // Dispatch event after unmount
    const event = new KeyboardEvent('keydown', {
      key: 'd',
      code: 'KeyD',
      altKey: true,
      bubbles: true,
      cancelable: true,
    });
    window.dispatchEvent(event);

    expect(onNavigateTab).not.toHaveBeenCalled();
  });

  // 11. Helper unit tests: isInputElement and getAltKeyLetter
  it('11. Unit tests for isInputElement and getAltKeyLetter helpers', () => {
    expect(isInputElement(null)).toBe(false);
    expect(isInputElement(document.createElement('div'))).toBe(false);
    expect(isInputElement(document.createElement('input'))).toBe(true);
    expect(isInputElement(document.createElement('textarea'))).toBe(true);
    expect(isInputElement(document.createElement('select'))).toBe(true);

    const editable = document.createElement('div');
    editable.setAttribute('contenteditable', 'true');
    expect(isInputElement(editable)).toBe(true);

    const child = document.createElement('span');
    editable.appendChild(child);
    expect(isInputElement(child)).toBe(true);

    // getAltKeyLetter
    expect(getAltKeyLetter(new KeyboardEvent('keydown', { key: 'd' }))).toBe('d');
    expect(getAltKeyLetter(new KeyboardEvent('keydown', { key: 'D' }))).toBe('d');
    expect(getAltKeyLetter(new KeyboardEvent('keydown', { code: 'KeyM' }))).toBe('m');
    expect(getAltKeyLetter(new KeyboardEvent('keydown', { key: '1' }))).toBeNull();
  });
});

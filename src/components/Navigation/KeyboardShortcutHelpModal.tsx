import React from 'react';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { AppTab } from '../Shell/Drawer.tsx';
import { KEYBOARD_SHORTCUTS, ShortcutItem } from '../../hooks/useKeyboardShortcuts.ts';

export interface KeyboardShortcutHelpModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectTab?: (tab: AppTab) => void;
}

export const KeyboardShortcutHelpModal: React.FC<KeyboardShortcutHelpModalProps> = ({
  isOpen,
  onClose,
  onSelectTab,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 30);

  if (!isOpen) return null;

  const navShortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === 'Navigation');
  const genShortcuts = KEYBOARD_SHORTCUTS.filter((s) => s.category === 'General');

  const handleShortcutClick = (shortcut: ShortcutItem) => {
    if (shortcut.tab && onSelectTab) {
      onSelectTab(shortcut.tab);
      onClose();
    } else if (shortcut.action === 'close_help') {
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Keyboard Shortcuts"
      data-shortcut-help="true"
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-2xl max-h-[90vh] shadow-2xl flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-outline-variant/20 bg-surface-container-low/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-primary/10 text-primary flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">keyboard</span>
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base font-bold text-on-surface">Keyboard Shortcuts</h3>
                <span className="text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-full bg-secondary-container/60 text-on-secondary-container">
                  Quick Navigation
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Press key chords anytime to jump to sections without touching the mouse or screen.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full hover:bg-surface-container-highest/60 flex items-center justify-center text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
            aria-label="Close shortcuts help"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 overflow-y-auto space-y-6">
          {/* General Shortcuts */}
          <div>
            <h4 className="text-xs font-bold text-on-surface-variant tracking-wider uppercase mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">help_outline</span>
              Help & Controls
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {genShortcuts.map((s) => (
                <div
                  key={s.keyLabel}
                  onClick={() => handleShortcutClick(s)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high/60 border border-outline-variant/20 transition-all cursor-pointer"
                >
                  <span className="text-xs font-medium text-on-surface truncate mr-2">{s.label}</span>
                  <kbd className="px-2 py-1 text-xs font-mono font-bold bg-surface-container-highest border border-outline-variant/40 rounded-md text-primary shrink-0 shadow-2xs">
                    {s.keyLabel}
                  </kbd>
                </div>
              ))}
            </div>
          </div>

          {/* Navigation Shortcuts */}
          <div>
            <h4 className="text-xs font-bold text-on-surface-variant tracking-wider uppercase mb-3 flex items-center gap-1.5">
              <span className="material-symbols-outlined text-[16px] text-primary">alt_route</span>
              Tab Navigation (Alt + Letter)
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {navShortcuts.map((s) => (
                <div
                  key={s.keyLabel}
                  onClick={() => handleShortcutClick(s)}
                  className="flex items-center justify-between p-2.5 rounded-xl bg-surface-container-low hover:bg-surface-container-high/60 border border-outline-variant/20 transition-all cursor-pointer group"
                >
                  <div className="flex flex-col min-w-0 mr-2">
                    <span className="text-xs font-bold text-on-surface group-hover:text-primary transition-colors truncate">
                      {s.label}
                    </span>
                    <span className="text-[11px] text-on-surface-variant truncate">
                      {s.description}
                    </span>
                  </div>
                  <kbd className="px-2 py-1 text-xs font-mono font-bold bg-surface-container-highest border border-outline-variant/40 rounded-md text-on-surface shrink-0 shadow-2xs group-hover:border-primary/50 group-hover:text-primary transition-colors">
                    {s.keyLabel}
                  </kbd>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-3 border-t border-outline-variant/20 bg-surface-container-low/40 shrink-0 text-xs text-on-surface-variant">
          <div className="flex items-center gap-1.5">
            <span className="material-symbols-outlined text-[16px] text-secondary">info</span>
            <span>Shortcuts are inactive while typing in text inputs or dialogs.</span>
          </div>
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-lg bg-surface-container-high hover:bg-surface-container-highest text-on-surface transition-colors cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

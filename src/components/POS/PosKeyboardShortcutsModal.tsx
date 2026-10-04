import React from 'react';

interface PosKeyboardShortcutsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PosKeyboardShortcutsModal: React.FC<PosKeyboardShortcutsModalProps> = ({
  isOpen,
  onClose,
}) => {
  if (!isOpen) return null;

  const shortcuts = [
    { key: 'F2 / /', desc: 'Focus Barcode Scanner / SKU Search' },
    { key: 'F4', desc: 'Park / Hold Current Bill' },
    { key: 'F7', desc: 'View Parked / Held Bills' },
    { key: 'F8', desc: 'Add Custom / Ad-Hoc Item' },
    { key: 'F9', desc: 'Instant Cash Checkout' },
    { key: 'F10', desc: 'Instant Dynamic UPI QR Checkout' },
    { key: 'F12', desc: 'Select / Change Customer Party' },
    { key: 'Enter', desc: 'Start Next Sale (on success screen)' },
    { key: 'Esc', desc: 'Close open dialogs / Clear search' },
  ];

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-3 sm:p-4 animate-fade-in">
      <div className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-md shadow-2xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">keyboard</span>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              POS Keyboard Shortcuts
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-surface-container hover:bg-surface-container-high flex items-center justify-center text-outline cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Shortcuts List */}
        <div className="p-4 space-y-2.5 divide-y divide-outline-variant/15 overflow-y-auto max-h-[70vh]">
          {shortcuts.map((s, idx) => (
            <div key={idx} className="flex items-center justify-between pt-2.5 first:pt-0">
              <span className="text-xs font-semibold text-on-surface">{s.desc}</span>
              <kbd className="px-2.5 py-1 bg-surface-container-high border border-outline-variant/40 rounded-lg text-xs font-mono font-bold text-secondary shadow-xs">
                {s.key}
              </kbd>
            </div>
          ))}
        </div>

        <div className="p-3 border-t border-outline-variant/20 text-center bg-surface-container-low/30">
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-1.5 bg-surface-container hover:bg-surface-container-high rounded-xl text-xs font-bold text-on-surface cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  );
};

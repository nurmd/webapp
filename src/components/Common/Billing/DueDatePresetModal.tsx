import React from 'react';

export interface DueDatePresetModalProps {
  isOpen: boolean;
  baseDate: string; // ISO date YYYY-MM-DD
  currentDueDate: string;
  onSelectDueDate: (dueDate: string) => void;
  onClose: () => void;
  accentColor?: 'secondary' | 'orange';
}

export const DueDatePresetModal: React.FC<DueDatePresetModalProps> = ({
  isOpen,
  baseDate,
  currentDueDate,
  onSelectDueDate,
  onClose,
  accentColor = 'secondary',
}) => {
  if (!isOpen) return null;

  const isOrange = accentColor === 'orange';
  const applyButtonClass = isOrange
    ? 'bg-orange-600 hover:bg-orange-700 text-white'
    : 'bg-secondary text-on-secondary';
  const focusRingClass = isOrange
    ? 'focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500'
    : 'focus:ring-2 focus:ring-secondary/40';

  const setOffsetDays = (days: number) => {
    const d = new Date(baseDate || new Date().toISOString().split('T')[0]);
    d.setDate(d.getDate() + days);
    onSelectDueDate(d.toISOString().split('T')[0]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3">
        <h3 className="font-headline-sm text-base font-bold text-on-surface">
          Payment Terms &amp; Due Date
        </h3>

        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => {
              onSelectDueDate(baseDate);
              onClose();
            }}
            className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="font-label-md text-xs font-bold block text-on-surface">Due on Receipt</span>
            <span className="font-body-sm text-[10px] text-on-surface-variant">Immediate cash/upi</span>
          </button>

          <button
            type="button"
            onClick={() => setOffsetDays(15)}
            className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="font-label-md text-xs font-bold block text-on-surface">Net 15 Days</span>
            <span className="font-body-sm text-[10px] text-on-surface-variant">Standard trade credit</span>
          </button>

          <button
            type="button"
            onClick={() => setOffsetDays(30)}
            className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="font-label-md text-xs font-bold block text-on-surface">Net 30 Days</span>
            <span className="font-body-sm text-[10px] text-on-surface-variant">Monthly settlement</span>
          </button>

          <button
            type="button"
            onClick={() => setOffsetDays(60)}
            className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="font-label-md text-xs font-bold block text-on-surface">Net 60 Days</span>
            <span className="font-body-sm text-[10px] text-on-surface-variant">Extended distributor terms</span>
          </button>
        </div>

        <div>
          <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
            Or Pick Custom Date:
          </label>
          <input
            type="date"
            value={currentDueDate}
            onChange={(e) => onSelectDueDate(e.target.value)}
            className={`w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none ${focusRingClass}`}
          />
        </div>

        <button
          type="button"
          onClick={onClose}
          className={`w-full py-2.5 rounded-xl font-label-md text-xs font-bold shadow-sm cursor-pointer mt-1 ${applyButtonClass}`}
        >
          Done
        </button>
      </div>
    </div>
  );
};

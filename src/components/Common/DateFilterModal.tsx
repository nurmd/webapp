import React, { useState, useEffect } from 'react';
import { DatePreset, getDateFilterBounds } from '../../core/utils/dateFilters.ts';

interface DateFilterModalProps {
  isOpen: boolean;
  activePreset: DatePreset;
  customStartDate?: string;
  customEndDate?: string;
  onClose: () => void;
  onSelectRange: (preset: DatePreset, customStart?: string, customEnd?: string) => void;
  accentColor?: string; // 'secondary' | 'orange-500' etc.
}

const PRESET_OPTIONS: Array<{ preset: DatePreset; label: string; icon: string }> = [
  { preset: 'ALL_TIME', label: 'All Time', icon: 'all_inclusive' },
  { preset: 'TODAY', label: 'Today', icon: 'today' },
  { preset: 'YESTERDAY', label: 'Yesterday', icon: 'history' },
  { preset: 'THIS_WEEK', label: 'This Week', icon: 'date_range' },
  { preset: 'THIS_MONTH', label: 'This Month', icon: 'calendar_month' },
  { preset: 'LAST_MONTH', label: 'Last Month', icon: 'calendar_today' },
  { preset: 'THIS_QUARTER', label: 'This Quarter', icon: 'pie_chart' },
  { preset: 'THIS_FY', label: 'Fiscal Year (FY)', icon: 'account_balance' },
  { preset: 'CUSTOM', label: 'Custom Range', icon: 'edit_calendar' },
];

export const DateFilterModal: React.FC<DateFilterModalProps> = ({
  isOpen,
  activePreset,
  customStartDate = '',
  customEndDate = '',
  onClose,
  onSelectRange,
  accentColor = 'secondary',
}) => {
  const [selectedPreset, setSelectedPreset] = useState<DatePreset>(activePreset);
  const [startInput, setStartInput] = useState<string>(customStartDate);
  const [endInput, setEndInput] = useState<string>(customEndDate);

  useEffect(() => {
    if (isOpen) {
      setSelectedPreset(activePreset);
      setStartInput(customStartDate);
      setEndInput(customEndDate);
    }
  }, [isOpen, activePreset, customStartDate, customEndDate]);

  if (!isOpen) return null;

  const handleApplyPreset = (preset: DatePreset) => {
    setSelectedPreset(preset);
    if (preset !== 'CUSTOM') {
      const bounds = getDateFilterBounds(preset);
      onSelectRange(preset, bounds.start, bounds.end);
      onClose();
    }
  };

  const handleApplyCustom = () => {
    onSelectRange('CUSTOM', startInput, endInput);
    onClose();
  };

  const isOrange = accentColor.includes('orange');
  const activeBtnClass = isOrange
    ? 'bg-orange-600 text-white shadow-sm font-bold ring-2 ring-orange-500/30'
    : 'bg-secondary text-on-secondary shadow-sm font-bold ring-2 ring-secondary/30';

  const previewBounds = getDateFilterBounds(selectedPreset, startInput, endInput);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-outline-variant/30 flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-4 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${isOrange ? 'bg-orange-500/15 text-orange-600' : 'bg-secondary/15 text-secondary'}`}>
              <span className="material-symbols-outlined text-[20px]">calendar_month</span>
            </div>
            <div>
              <h3 className="font-bold text-sm text-on-surface">Filter by Date Range</h3>
              <p className="text-[11px] text-on-surface-variant font-medium">
                Active: <span className="font-semibold text-on-surface">{previewBounds.label}</span>
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4 flex-1 overflow-y-auto">
          {/* Quick Presets Grid */}
          <div>
            <label className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider block mb-2">
              Select Preset Period
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {PRESET_OPTIONS.map(({ preset, label, icon }) => {
                const isActive = selectedPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    className={`py-2 px-2 rounded-xl text-xs flex flex-col items-center justify-center gap-1 transition-all cursor-pointer border ${
                      isActive
                        ? activeBtnClass
                        : 'bg-surface-container-low/70 border-outline-variant/20 text-on-surface-variant hover:bg-surface-container hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[18px]">{icon}</span>
                    <span className="truncate w-full text-center font-semibold text-[11px]">{label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Date Range Picker */}
          {selectedPreset === 'CUSTOM' && (
            <div className="bg-surface-container-low/60 rounded-2xl p-3 border border-outline-variant/25 space-y-3 animate-fade-in">
              <div className="flex items-center gap-1.5 text-xs font-bold text-on-surface">
                <span className="material-symbols-outlined text-[16px] text-secondary">date_range</span>
                <span>Choose Custom Dates</span>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    From (Start Date)
                  </label>
                  <input
                    type="date"
                    value={startInput}
                    onChange={(e) => setStartInput(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-2.5 py-1.5 text-xs text-on-surface font-semibold outline-none focus:ring-1 focus:ring-secondary/50"
                  />
                </div>
                <div>
                  <label className="text-[10px] font-bold text-on-surface-variant uppercase block mb-1">
                    To (End Date)
                  </label>
                  <input
                    type="date"
                    value={endInput}
                    onChange={(e) => setEndInput(e.target.value)}
                    className="w-full bg-surface-container-lowest border border-outline-variant/40 rounded-xl px-2.5 py-1.5 text-xs text-on-surface font-semibold outline-none focus:ring-1 focus:ring-secondary/50"
                  />
                </div>
              </div>

              <button
                type="button"
                onClick={handleApplyCustom}
                className={`w-full py-2 rounded-xl text-xs font-bold text-white shadow-xs cursor-pointer active:scale-98 transition-all flex items-center justify-center gap-1.5 ${
                  isOrange ? 'bg-orange-600 hover:bg-orange-700' : 'bg-secondary hover:bg-secondary/90'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">check</span>
                <span>Apply Custom Range</span>
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="p-3 bg-surface-container-low/40 border-t border-outline-variant/20 flex items-center justify-between">
          <button
            type="button"
            onClick={() => handleApplyPreset('ALL_TIME')}
            className="px-3 py-1.5 text-xs font-semibold text-outline hover:text-on-surface cursor-pointer"
          >
            Clear / Reset to All Time
          </button>
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface hover:bg-surface-container cursor-pointer"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};

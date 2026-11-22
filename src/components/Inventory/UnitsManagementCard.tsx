import React, { useState, useMemo } from 'react';
import { db } from '../../services/db.ts';
import { UnitSetting } from '../../services/db/unitSettings.ts';

export interface UnitsManagementCardProps {
  onUnitsChange?: () => void;
  className?: string;
}

export const UnitsManagementCard: React.FC<UnitsManagementCardProps> = ({
  onUnitsChange,
  className = '',
}) => {
  const [units, setUnits] = useState<UnitSetting[]>(() => db.listUnits());
  const [newUnitCode, setNewUnitCode] = useState('');
  const [newUnitLabel, setNewUnitLabel] = useState('');
  const [unitError, setUnitError] = useState('');
  const [unitSuccess, setUnitSuccess] = useState('');

  const activeUnitCount = useMemo(() => units.filter((u) => u.active).length, [units]);

  const handleAddUnit = (e: React.FormEvent) => {
    e.preventDefault();
    setUnitError('');
    setUnitSuccess('');
    try {
      const added = db.addUnit(newUnitCode, newUnitLabel);
      setUnits(db.listUnits());
      setNewUnitCode('');
      setNewUnitLabel('');
      setUnitSuccess(`Unit "${added.code}" added successfully.`);
      onUnitsChange?.();
      setTimeout(() => setUnitSuccess(''), 3000);
    } catch (err: any) {
      setUnitError(err.message || 'Failed to add unit');
    }
  };

  const handleDeactivateUnit = (code: string) => {
    setUnitError('');
    setUnitSuccess('');
    try {
      db.deactivateUnit(code);
      setUnits(db.listUnits());
      onUnitsChange?.();
    } catch (err: any) {
      setUnitError(err.message || 'Failed to deactivate unit');
    }
  };

  const handleActivateUnit = (code: string) => {
    setUnitError('');
    setUnitSuccess('');
    try {
      db.activateUnit(code);
      setUnits(db.listUnits());
      onUnitsChange?.();
    } catch (err: any) {
      setUnitError(err.message || 'Failed to activate unit');
    }
  };

  return (
    <section className={`bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex flex-col gap-3.5 ${className}`}>
      <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
        <div className="flex items-center gap-2.5">
          <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
            <span className="material-symbols-outlined text-[22px]">straighten</span>
          </div>
          <div>
            <h3 className="font-label-md text-sm font-bold text-on-surface">Units of Measurement</h3>
            <p className="font-body-sm text-[11px] text-on-surface-variant">
              Manage standard and custom units for items and line billing
            </p>
          </div>
        </div>
        <span className="px-2 py-0.5 rounded-full bg-secondary-container text-on-secondary-container text-[10px] font-bold">
          {units.length} Units ({activeUnitCount} Active)
        </span>
      </div>

      {/* Add Custom Unit Form */}
      <form onSubmit={handleAddUnit} className="bg-surface-container-low/70 rounded-xl p-3 border border-outline-variant/20 flex flex-col sm:flex-row gap-2.5 items-end">
        <div className="w-full sm:w-1/3">
          <label className="block text-[11px] font-semibold text-on-surface mb-1">
            Unit Code <span className="text-error">*</span>
          </label>
          <input
            type="text"
            value={newUnitCode}
            onChange={(e) => {
              setNewUnitCode(e.target.value.toUpperCase());
              setUnitError('');
            }}
            placeholder="e.g. DOZEN, BRL"
            className="w-full h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-xs font-mono font-bold text-on-surface focus:outline-none focus:border-secondary"
            maxLength={12}
          />
        </div>
        <div className="w-full sm:flex-1">
          <label className="block text-[11px] font-semibold text-on-surface mb-1">
            Display Label
          </label>
          <input
            type="text"
            value={newUnitLabel}
            onChange={(e) => {
              setNewUnitLabel(e.target.value);
              setUnitError('');
            }}
            placeholder="e.g. Dozen, Barrels"
            className="w-full h-9 px-2.5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 text-xs text-on-surface focus:outline-none focus:border-secondary"
            maxLength={30}
          />
        </div>
        <button
          type="submit"
          disabled={!newUnitCode.trim()}
          className="w-full sm:w-auto h-9 px-4 rounded-lg bg-secondary text-on-secondary text-xs font-bold flex items-center justify-center gap-1.5 hover:opacity-90 transition-opacity disabled:opacity-40 disabled:cursor-not-allowed flex-shrink-0 cursor-pointer"
        >
          <span className="material-symbols-outlined text-[16px]">add</span>
          <span>Add Unit</span>
        </button>
      </form>

      {unitError && (
        <div className="p-2.5 rounded-lg bg-error-container/40 text-on-error-container text-xs flex items-center gap-2 border border-error-container">
          <span className="material-symbols-outlined text-[16px] text-error">error</span>
          <span>{unitError}</span>
        </div>
      )}

      {unitSuccess && (
        <div className="p-2.5 rounded-lg bg-emerald-500/15 text-emerald-800 dark:text-emerald-300 text-xs flex items-center gap-2 border border-emerald-500/30">
          <span className="material-symbols-outlined text-[16px] text-emerald-600">check_circle</span>
          <span>{unitSuccess}</span>
        </div>
      )}

      {/* Units List */}
      <div className="max-h-64 overflow-y-auto rounded-xl border border-outline-variant/20 divide-y divide-outline-variant/20 bg-surface-container-low/40">
        {units.map((u) => {
          const isStandard = u.kind === 'STANDARD';
          return (
            <div
              key={u.code}
              className={`p-2.5 flex items-center justify-between gap-2 transition-colors ${
                !u.active ? 'opacity-60 bg-surface-container-high/30' : 'hover:bg-surface-container-low'
              }`}
            >
              <div className="flex items-center gap-2.5 min-w-0">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs font-mono text-on-surface">
                      {u.code}
                    </span>
                    <span className="text-xs text-on-surface-variant truncate">
                      {u.label}
                    </span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 flex-shrink-0">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    isStandard
                      ? 'bg-surface-container text-on-surface-variant'
                      : 'bg-primary/15 text-primary'
                  }`}
                >
                  {isStandard ? 'Standard' : 'Custom'}
                </span>
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                    u.active
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                      : 'bg-surface-container-highest text-outline'
                  }`}
                >
                  {u.active ? 'Active' : 'Inactive'}
                </span>
                {u.active ? (
                  <button
                    type="button"
                    onClick={() => handleDeactivateUnit(u.code)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-surface-container text-on-surface hover:bg-error-container hover:text-on-error-container transition-colors cursor-pointer"
                    title={`Deactivate ${u.code}`}
                  >
                    Deactivate
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={() => handleActivateUnit(u.code)}
                    className="text-[11px] px-2 py-0.5 rounded-lg bg-secondary/15 text-secondary hover:bg-secondary/25 transition-colors cursor-pointer"
                    title={`Reactivate ${u.code}`}
                  >
                    Activate
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
};

export default UnitsManagementCard;

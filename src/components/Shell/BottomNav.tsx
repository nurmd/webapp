import React from 'react';
import { AppTab } from './Drawer.tsx';

interface BottomNavProps {
  activeTab: AppTab;
  onSelectTab: (tab: AppTab) => void;
  onNewInvoice: () => void;
}

export const BottomNav: React.FC<BottomNavProps> = ({
  activeTab,
  onSelectTab,
  onNewInvoice,
}) => {
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 pb-safe shadow-[0_-2px_12px_rgba(0,0,0,0.04)]">
      <div className="h-16 px-4 flex items-center justify-around max-w-lg mx-auto relative">
        {/* Dashboard */}
        <button
          onClick={() => onSelectTab('dashboard')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
            activeTab === 'dashboard' ? 'text-secondary font-bold' : 'text-on-surface-variant'
          }`}
          type="button"
        >
          <span
            className="material-symbols-outlined text-[24px]"
            style={{ fontVariationSettings: activeTab === 'dashboard' ? "'FILL' 1" : "'FILL' 0" }}
          >
            home
          </span>
          <span className="text-[11px] font-medium mt-0.5">Home</span>
        </button>

        {/* Parties */}
        <button
          onClick={() => onSelectTab('parties')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
            activeTab === 'parties' ? 'text-secondary font-bold' : 'text-on-surface-variant'
          }`}
          type="button"
        >
          <span
            className="material-symbols-outlined text-[24px]"
            style={{ fontVariationSettings: activeTab === 'parties' ? "'FILL' 1" : "'FILL' 0" }}
          >
            group
          </span>
          <span className="text-[11px] font-medium mt-0.5">Parties</span>
        </button>

        {/* Center Floating Action Button (+ Add Bill) */}
        <div className="relative -top-5 flex items-center justify-center flex-1">
          <button
            onClick={onNewInvoice}
            aria-label="Create New Invoice"
            className="w-13 h-13 rounded-full bg-secondary text-on-secondary shadow-[0_4px_16px_rgba(0,108,73,0.35)] flex items-center justify-center active:scale-95 transition-transform cursor-pointer border-4 border-surface"
            type="button"
          >
            <span className="material-symbols-outlined text-[28px]">add</span>
          </button>
        </div>

        {/* Items / Stock */}
        <button
          onClick={() => onSelectTab('inventory')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
            activeTab === 'inventory' ? 'text-secondary font-bold' : 'text-on-surface-variant'
          }`}
          type="button"
        >
          <span
            className="material-symbols-outlined text-[24px]"
            style={{ fontVariationSettings: activeTab === 'inventory' ? "'FILL' 1" : "'FILL' 0" }}
          >
            inventory_2
          </span>
          <span className="text-[11px] font-medium mt-0.5">Items</span>
        </button>

        {/* More / Menu Hub */}
        <button
          onClick={() => onSelectTab('menu')}
          className={`flex flex-col items-center justify-center flex-1 py-1 transition-colors cursor-pointer ${
            activeTab === 'menu' ? 'text-secondary font-bold' : 'text-on-surface-variant'
          }`}
          type="button"
        >
          <span
            className="material-symbols-outlined text-[24px]"
            style={{ fontVariationSettings: activeTab === 'menu' ? "'FILL' 1" : "'FILL' 0" }}
          >
            grid_view
          </span>
          <span className="text-[11px] font-medium mt-0.5">More</span>
        </button>
      </div>
    </nav>
  );
};

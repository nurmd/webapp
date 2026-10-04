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
  const leftTabs: Array<{ id: AppTab; label: string; icon: string }> = [
    { id: 'dashboard', label: 'Home', icon: 'home' },
    { id: 'parties', label: 'Parties', icon: 'group' },
  ];

  const rightTabs: Array<{ id: AppTab; label: string; icon: string }> = [
    { id: 'inventory', label: 'Items', icon: 'inventory_2' },
    { id: 'menu', label: 'More', icon: 'grid_view' },
  ];

  const renderTab = (tab: { id: AppTab; label: string; icon: string }) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        onClick={() => onSelectTab(tab.id)}
        className={`group relative flex flex-col items-center justify-center flex-1 h-full py-1.5 px-1 transition-all duration-200 cursor-pointer select-none active:scale-90 ${
          isActive
            ? 'text-emerald-700 dark:text-emerald-400 font-bold'
            : 'text-slate-400 hover:text-slate-600 dark:text-slate-400 dark:hover:text-slate-200 font-medium'
        }`}
        type="button"
      >
        {/* Sleek Active Pill Indicator */}
        {isActive && (
          <span className="absolute inset-x-2 inset-y-1.5 bg-emerald-500/10 dark:bg-emerald-400/15 rounded-2xl -z-10 transition-all duration-300" />
        )}
        <div className="relative flex items-center justify-center">
          <span
            className={`material-symbols-outlined text-[22px] transition-transform duration-200 ${
              isActive ? 'scale-105' : 'group-hover:scale-105'
            }`}
            style={{
              fontVariationSettings: isActive ? "'FILL' 1, 'wght' 600" : "'FILL' 0, 'wght' 400",
            }}
          >
            {tab.icon}
          </span>
        </div>
        <span className="text-[10px] tracking-tight mt-0.5 leading-none">
          {tab.label}
        </span>
        {isActive && (
          <span className="w-1 h-1 rounded-full bg-emerald-600 dark:bg-emerald-400 mt-1" />
        )}
      </button>
    );
  };

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/85 dark:bg-slate-900/85 backdrop-blur-2xl border-t border-black/[0.05] dark:border-white/[0.08] pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.03)] transition-colors">
      <div className="h-16 px-2 sm:px-4 flex items-center justify-between max-w-lg mx-auto relative">
        {/* Left Tabs: Home & Parties */}
        <div className="flex items-center flex-1 h-full">
          {leftTabs.map(renderTab)}
        </div>

        {/* Center Floating Action Button (+ Add Bill) */}
        <div className="relative -top-4 flex flex-col items-center justify-center flex-shrink-0 px-2">
          <button
            onClick={onNewInvoice}
            aria-label="Create New Invoice"
            className="group relative flex items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 via-emerald-600 to-teal-500 text-white shadow-[0_8px_20px_-4px_rgba(16,185,129,0.5)] ring-4 ring-white dark:ring-slate-900 active:scale-90 hover:scale-105 transition-all duration-200 cursor-pointer"
            type="button"
          >
            <span className="material-symbols-outlined text-[26px] group-hover:rotate-90 transition-transform duration-300">
              add
            </span>
            {/* Top specular reflection */}
            <div className="absolute inset-x-2 top-1 h-[1px] bg-white/40 rounded-full pointer-events-none" />
          </button>
          <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 mt-1 leading-none tracking-tight">
            + Bill
          </span>
        </div>

        {/* Right Tabs: Items & More */}
        <div className="flex items-center flex-1 h-full">
          {rightTabs.map(renderTab)}
        </div>
      </div>
    </nav>
  );
};

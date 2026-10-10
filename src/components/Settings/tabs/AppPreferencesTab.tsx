import React from 'react';

export interface AppPreferencesTabProps {
  appLanguage: 'English (India)' | 'हिंदी (Hindi)';
  setAppLanguage: (lang: 'English (India)' | 'हिंदी (Hindi)') => void;
  isAppLockEnabled: boolean;
  setIsAppLockEnabled: (enabled: boolean) => void;
  CURRENT_APP_VERSION: string;
  updateStatusText: string | null;
  handleCheckForUpdates: () => void;
  isUpdateChecking: boolean;
  setActiveSubModal?: (modal: string | null) => void;
}

export const AppPreferencesTab: React.FC<AppPreferencesTabProps> = ({
  appLanguage,
  setAppLanguage,
  isAppLockEnabled,
  setIsAppLockEnabled,
  CURRENT_APP_VERSION,
  updateStatusText,
  handleCheckForUpdates,
  isUpdateChecking,
  setActiveSubModal,
}) => {
  return (
    <div className="flex flex-col gap-4">
      {/* 1. App Updates & OTA Channel Card */}
      <section className="bg-surface-container-lowest rounded-2xl p-4 sm:p-5 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3.5 min-w-0">
          <div className="w-10 h-10 rounded-xl bg-secondary/15 flex items-center justify-center text-secondary flex-shrink-0">
            <span className="material-symbols-outlined text-[22px]">system_update</span>
          </div>
          <div className="flex flex-col min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-headline-sm text-sm font-bold text-on-surface">App Updates &amp; OTA</span>
              <span className="bg-secondary text-on-secondary text-[10px] font-bold px-2 py-0.5 rounded-full">
                v{CURRENT_APP_VERSION}
              </span>
            </div>
            <span className="text-[11px] text-on-surface-variant truncate mt-0.5">
              {updateStatusText || 'Automatic GitHub releases OTA channel'}
            </span>
          </div>
        </div>

        <button
          type="button"
          onClick={handleCheckForUpdates}
          disabled={isUpdateChecking}
          className="px-3.5 py-2 bg-surface-container text-on-surface hover:bg-surface-container-high rounded-xl text-xs font-bold shadow-sm transition-all cursor-pointer flex-shrink-0 flex items-center gap-1 active:scale-95 disabled:opacity-50"
        >
          <span className={`material-symbols-outlined text-[16px] ${isUpdateChecking ? 'animate-spin' : ''}`}>
            {isUpdateChecking ? 'progress_activity' : 'refresh'}
          </span>
          <span>{isUpdateChecking ? 'Checking...' : 'Check Update'}</span>
        </button>
      </section>

      {/* 2. Language & Security Preferences */}
      <section className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden divide-y divide-outline-variant/20 flex flex-col">
        {/* Language Selector */}
        <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">translate</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">App Language</div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">{appLanguage}</div>
            </div>
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            {(['English (India)', 'हिंदी (Hindi)'] as const).map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => setAppLanguage(lang)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
                  appLanguage === lang
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'bg-surface-container text-on-surface hover:bg-surface-container-high'
                }`}
              >
                {lang.split(' ')[0]}
              </button>
            ))}
          </div>
        </div>

        {/* Biometric / PIN Lock Toggle */}
        <div className="w-full p-4 flex items-center justify-between hover:bg-surface-container-low transition-colors">
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">fingerprint</span>
            </div>
            <div className="flex-1 min-w-0 pr-2">
              <div className="flex items-center gap-2">
                <span className="font-label-md text-sm font-bold text-on-surface">App Lock &amp; 4-Digit PIN</span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-semibold bg-secondary-container text-on-secondary-container">
                  Security
                </span>
              </div>
              <div className="font-body-sm text-xs text-on-surface-variant mt-0.5">
                Protect invoice deletions, owner settings &amp; role switching with PIN
              </div>
            </div>
          </div>

          <label className="relative inline-flex items-center cursor-pointer flex-shrink-0">
            <input
              type="checkbox"
              checked={isAppLockEnabled}
              onChange={(e) => setIsAppLockEnabled(e.target.checked)}
              className="sr-only peer"
              aria-label="Toggle App Lock & PIN"
            />
            <div className="w-11 h-6 bg-surface-container-highest rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-surface-container-lowest after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-secondary"></div>
          </label>
        </div>

        {/* Staff Access & Roles */}
        {setActiveSubModal && (
          <button
            type="button"
            onClick={() => setActiveSubModal('staff_roles')}
            className="w-full p-4 flex items-center gap-3.5 text-left hover:bg-surface-container-low transition-colors cursor-pointer"
          >
            <div className="w-10 h-10 rounded-xl bg-surface-container flex items-center justify-center text-on-surface flex-shrink-0">
              <span className="material-symbols-outlined text-[22px]">group</span>
            </div>
            <div className="flex-1 min-w-0">
              <div className="font-label-md text-sm font-bold text-on-surface">Staff Roles &amp; Permissions</div>
              <div className="font-body-sm text-xs text-on-surface-variant truncate mt-0.5">
                3 Roles: Owner (Full PIN), Cashier (Bill Only), CA (Audit &amp; Books)
              </div>
            </div>
            <span className="material-symbols-outlined text-outline text-[20px]">chevron_right</span>
          </button>
        )}
      </section>
    </div>
  );
};

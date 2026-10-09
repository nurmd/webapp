import React from 'react';

export interface DevicePairModalsProps {
  isPairQrModalOpen: boolean;
  setIsPairQrModalOpen: (open: boolean) => void;
  allSettingsSyncPayload: string;
  copiedSyncCode: boolean;
  handleCopySyncCode: () => void;
  isImportProfileModalOpen: boolean;
  setIsImportProfileModalOpen: (open: boolean) => void;
  importProfileInput: string;
  setImportProfileInput: (val: string) => void;
  importError: string | null;
  handleImportSettings: () => void;
}

export const DevicePairModals: React.FC<DevicePairModalsProps> = ({
  isPairQrModalOpen,
  setIsPairQrModalOpen,
  allSettingsSyncPayload,
  copiedSyncCode,
  handleCopySyncCode,
  isImportProfileModalOpen,
  setIsImportProfileModalOpen,
  importProfileInput,
  setImportProfileInput,
  importError,
  handleImportSettings,
}) => {
  return (
    <>
      {/* Pair All Settings to Another Device via QR Code (Excluding Printing) */}
      {isPairQrModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 text-center flex flex-col items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[28px]">qr_code_2</span>
            </div>
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Pair All Settings
            </h3>
            <p className="text-xs text-on-surface-variant font-medium">
              Scan from any secondary device or counter to clone all business, bank, and app settings. Printing settings are preserved separately for this device.
            </p>

            {/* Dynamic QR Code */}
            <div className="w-52 h-52 rounded-2xl bg-white p-3 border border-outline-variant/20 flex flex-col items-center justify-center shadow-inner my-1">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(allSettingsSyncPayload)}`}
                alt="Settings Sync QR Code"
                className="w-44 h-44 object-contain rounded-lg"
              />
            </div>

            <div className="w-full flex flex-col gap-1.5 mt-1">
              <button
                type="button"
                onClick={handleCopySyncCode}
                className="w-full py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs flex items-center justify-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[16px]">
                  {copiedSyncCode ? 'check' : 'content_copy'}
                </span>
                <span>{copiedSyncCode ? 'Settings Sync Code Copied!' : 'Copy Pairing Code'}</span>
              </button>

              <button
                type="button"
                onClick={() => setIsPairQrModalOpen(false)}
                className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-md cursor-pointer"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import All Settings Modal (Excluding Printing) */}
      {isImportProfileModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-surface-container-lowest rounded-3xl max-w-sm w-full p-6 shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
            <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-secondary text-[22px]">download</span>
                <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                  Import All Settings
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsImportProfileModalOpen(false)}
                className="w-7 h-7 rounded-full flex items-center justify-center text-outline hover:text-on-surface cursor-pointer"
              >
                <span className="material-symbols-outlined text-[18px]">close</span>
              </button>
            </div>

            <p className="text-xs text-on-surface-variant">
              Paste the Pairing Code or JSON from master counter. All settings will update, while this device&apos;s printer settings stay preserved:
            </p>

            <textarea
              rows={4}
              value={importProfileInput}
              onChange={(e) => setImportProfileInput(e.target.value)}
              placeholder="Paste settings pairing code or JSON here..."
              className="w-full p-2.5 rounded-xl bg-surface-container border border-outline-variant/30 text-on-surface text-xs font-mono focus:outline-none focus:border-secondary"
            />

            {importError && (
              <p className="text-xs text-error font-medium">{importError}</p>
            )}

            <div className="flex items-center gap-2 mt-1">
              <button
                type="button"
                onClick={() => setIsImportProfileModalOpen(false)}
                className="flex-1 py-2.5 rounded-xl bg-surface-container text-on-surface text-xs font-bold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleImportSettings}
                className="flex-1 py-2.5 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-md cursor-pointer"
              >
                Apply &amp; Sync
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

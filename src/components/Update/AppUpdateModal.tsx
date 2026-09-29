import React, { useState } from 'react';
import { AppReleaseInfo, updateService, CURRENT_APP_VERSION } from '../../services/updateService.ts';

interface AppUpdateModalProps {
  isOpen: boolean;
  releaseInfo?: AppReleaseInfo | null;
  onClose: () => void;
}

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  isOpen,
  releaseInfo,
  onClose,
}) => {
  const [downloadProgress, setDownloadProgress] = useState<number | null>(null);
  const [isDone, setIsDone] = useState(false);

  if (!isOpen) return null;

  const info = releaseInfo || {
    version: '1.1.0',
    versionCode: 2,
    releaseDate: '2026-09-29',
    releaseTitle: 'Vyapar PRO v1.1.0 - Multi-Counter & Hardware Thermal Update',
    releaseNotes: [
      'Direct ESC/POS 58mm & 80mm Bluetooth & USB thermal receipt printing',
      'Hardware barcode scanner gun wedge listener + live camera scanner with torch',
      '4-Digit PIN Multi-Role Security (Owner, Cashier, Chartered Accountant)',
      'Official NIC E-Way Bill & IRP E-Invoice JSON v1.1 compliance generators',
      'Vernacular WhatsApp templates in English, Hindi (हिंदी), and Hinglish with dynamic UPI pay links',
      'Offline-First 2-Way CouchDB / PouchDB sync for multi-counter billing',
    ],
    apkUrl: '/GSTBilling-Vyapar.apk',
    apkSize: '8.8 MB',
  };

  const handleStartUpdate = () => {
    setDownloadProgress(10);
    const interval = setInterval(() => {
      setDownloadProgress((prev) => {
        if (prev === null) return 10;
        if (prev >= 100) {
          clearInterval(interval);
          setIsDone(true);
          updateService.installUpdate(info.apkUrl);
          return 100;
        }
        return prev + 18;
      });
    }, 200);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-outline-variant/30 flex flex-col">
        {/* Header Banner */}
        <div className="p-5 bg-gradient-to-r from-secondary/15 via-secondary/5 to-transparent border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-md">
              <span className="material-symbols-outlined text-[28px]">system_update</span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-headline-sm text-base font-bold text-on-surface">
                  App Update Available
                </h3>
                <span className="bg-secondary text-on-secondary text-[10px] font-bold px-2 py-0.5 rounded-full">
                  v{info.version}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Current: v{CURRENT_APP_VERSION} • Package: {info.apkSize}
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

        {/* Release Notes */}
        <div className="p-5 space-y-4 flex-1 overflow-y-auto max-h-[50vh]">
          <div>
            <h4 className="font-label-md text-xs font-bold text-on-surface uppercase tracking-wider mb-2">
              What's New in v{info.version}
            </h4>
            <div className="bg-surface-container-low/60 rounded-2xl p-3.5 border border-outline-variant/20 space-y-2">
              {info.releaseNotes.map((note, idx) => (
                <div key={idx} className="flex items-start gap-2 text-xs text-on-surface leading-relaxed">
                  <span className="material-symbols-outlined text-secondary text-[16px] flex-shrink-0 mt-0.5">
                    check_circle
                  </span>
                  <span>{note}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Progress Bar (if downloading) */}
          {downloadProgress !== null && (
            <div className="space-y-1.5 bg-surface p-3 rounded-2xl border border-outline-variant/30">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-on-surface">
                  {isDone ? 'Download Complete! Installing...' : 'Downloading APK Update...'}
                </span>
                <span className="text-secondary">{Math.min(100, downloadProgress)}%</span>
              </div>
              <div className="w-full bg-surface-container-high rounded-full h-2 overflow-hidden">
                <div
                  className="bg-secondary h-full transition-all duration-200"
                  style={{ width: `${Math.min(100, downloadProgress)}%` }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface transition-colors cursor-pointer"
          >
            Later
          </button>

          <button
            type="button"
            disabled={downloadProgress !== null && !isDone}
            onClick={handleStartUpdate}
            className="flex-1 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">
              {isDone ? 'install_mobile' : 'download'}
            </span>
            <span>
              {isDone ? 'Install APK Now' : downloadProgress !== null ? 'Downloading...' : 'Download & Install (8.8 MB)'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};

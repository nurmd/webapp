import React, { useState, useEffect, useRef } from 'react';
import { AppReleaseInfo, updateService, CURRENT_APP_VERSION } from '../../services/updateService.ts';

interface AppUpdateModalProps {
  isOpen: boolean;
  releaseInfo?: AppReleaseInfo | null;
  onClose: () => void;
}

type UpdateStatus = 'idle' | 'downloading' | 'verifying' | 'success' | 'error';

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  isOpen,
  releaseInfo,
  onClose,
}) => {
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [loadedBytes, setLoadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<string | null>(null);

  const cancelDownloadRef = useRef<(() => void) | null>(null);

  const [activeRelease, setActiveRelease] = useState<AppReleaseInfo | null>(releaseInfo || null);

  useEffect(() => {
    if (releaseInfo) {
      setActiveRelease(releaseInfo);
    } else if (isOpen) {
      updateService.checkForUpdates().then((res) => {
        if (res.latestRelease) {
          setActiveRelease(res.latestRelease);
        }
      }).catch(() => {});
    }
  }, [isOpen, releaseInfo]);

  useEffect(() => {
    if (!isOpen) {
      // Reset state on close
      setStatus('idle');
      setDownloadProgress(0);
      setLoadedBytes(0);
      setTotalBytes(0);
      setErrorMessage(null);
      setVerifiedHash(null);
      if (cancelDownloadRef.current) {
        cancelDownloadRef.current();
        cancelDownloadRef.current = null;
      }
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const info: AppReleaseInfo = activeRelease || {
    version: CURRENT_APP_VERSION,
    versionCode: 10008,
    releaseDate: new Date().toISOString().split('T')[0],
    releaseTitle: `Vyapar PRO v${CURRENT_APP_VERSION} - Production Release`,
    releaseNotes: [
      'Direct ESC/POS 58mm & 80mm Bluetooth & USB thermal receipt printing',
      'Hardware barcode scanner gun wedge listener + live camera scanner with torch',
      '4-Digit PIN Multi-Role Security (Owner, Cashier, Chartered Accountant)',
      'Official NIC E-Way Bill & IRP E-Invoice JSON v1.1 compliance generators',
      'Vernacular WhatsApp templates in English, Hindi (हिंदी), and Hinglish with dynamic UPI pay links',
      'Offline-First 2-Way CouchDB / PouchDB sync for multi-counter billing',
    ],
    apkUrl: 'https://github.com/nurmd/webapp/releases/latest/download/GSTBilling-Vyapar.apk',
    apkSize: '20.2 MB',
  };

  const handleStartDownload = () => {
    setStatus('downloading');
    setDownloadProgress(0);
    setLoadedBytes(0);
    setErrorMessage(null);

    const cancelFn = updateService.startInternalDownload({
      apkUrl: info.apkUrl,
      expectedSha256: info.sha256,
      onProgress: (percent, loaded, total) => {
        setLoadedBytes(loaded);
        setTotalBytes(total);
        if (percent >= 0) {
          setDownloadProgress(percent);
          if (percent >= 100) {
            setStatus('verifying');
          }
        }
      },
      onSuccess: (hash) => {
        setVerifiedHash(hash);
        setStatus('success');
      },
      onError: (msg, _canRetry) => {
        setErrorMessage(msg);
        setStatus('error');
        // Ensure temporary corrupted APK is cleared
        updateService.clearTempApk();
      },
    });

    cancelDownloadRef.current = cancelFn;
  };

  const handleRetry = () => {
    updateService.clearTempApk();
    handleStartDownload();
  };

  const handleCancelDownload = () => {
    if (cancelDownloadRef.current) {
      cancelDownloadRef.current();
      cancelDownloadRef.current = null;
    }
    updateService.clearTempApk();
    setStatus('idle');
    setDownloadProgress(0);
  };

  const formatSize = (bytes: number) => {
    if (bytes <= 0) return '0 MB';
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/70 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-outline-variant/30 flex flex-col max-h-[90vh]">
        {/* Header Banner */}
        <div className="p-5 bg-gradient-to-r from-secondary/15 via-secondary/5 to-transparent border-b border-outline-variant/20 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-2xl bg-secondary text-on-secondary flex items-center justify-center shadow-md flex-shrink-0">
              <span className="material-symbols-outlined text-[28px]">
                {status === 'success' ? 'verified' : status === 'error' ? 'error' : 'system_update'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="font-headline-sm text-base font-bold text-on-surface">
                  {status === 'success'
                    ? 'Update Verified'
                    : status === 'error'
                    ? 'Download / Checksum Error'
                    : 'App Update Available'}
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
          {status !== 'downloading' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Checksum Badge */}
        {info.sha256 && status !== 'error' && (
          <div className="px-5 py-2 bg-surface-container-low/50 border-b border-outline-variant/20 flex items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary text-[14px]">shield</span>
            <span className="font-semibold text-secondary">SHA-256 Checksum:</span>
            <span className="font-mono truncate">{info.sha256.slice(0, 12)}...{info.sha256.slice(-8)}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Status: ERROR / CHECKSUM FAILED */}
          {status === 'error' && (
            <div className="bg-error-container/20 border border-error/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-error font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">warning</span>
                <span>Verification or Download Failed</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {errorMessage || 'Cryptographic checksum verification failed. The downloaded file may have been interrupted or corrupted.'}
              </p>
              <p className="text-[11px] text-outline font-semibold">
                Corrupt temporary files have been automatically removed. Tap Retry below to re-download.
              </p>
            </div>
          )}

          {/* Status: SUCCESS */}
          {status === 'success' && (
            <div className="bg-secondary-container/20 border border-secondary/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-secondary font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">check_circle</span>
                <span>Cryptographic Checksum Verified</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                The APK package has passed SHA-256 verification. Android Package Installer has been launched.
              </p>
              {verifiedHash && (
                <div className="bg-surface-container p-2 rounded-xl text-[10px] font-mono text-outline truncate">
                  Hash: {verifiedHash}
                </div>
              )}
              <p className="text-[11px] text-secondary font-semibold">
                Temporary download files will be cleaned automatically after installation.
              </p>
            </div>
          )}

          {/* Status: DOWNLOADING / VERIFYING */}
          {(status === 'downloading' || status === 'verifying') && (
            <div className="space-y-3 bg-surface p-4 rounded-2xl border border-outline-variant/30">
              <div className="flex items-center justify-between text-xs font-bold">
                <span className="text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-secondary text-[16px] animate-spin">
                    progress_activity
                  </span>
                  {status === 'verifying'
                    ? 'Verifying SHA-256 Checksum...'
                    : 'Downloading Internal APK Update...'}
                </span>
                <span className="text-secondary font-mono">
                  {downloadProgress >= 0 ? `${Math.min(100, downloadProgress)}%` : 'Streaming...'}
                </span>
              </div>

              <div className="w-full bg-surface-container-high rounded-full h-2.5 overflow-hidden">
                <div
                  className={`bg-secondary h-full transition-all duration-200 ${
                    status === 'verifying' ? 'animate-pulse' : ''
                  }`}
                  style={{ width: `${Math.max(5, Math.min(100, downloadProgress))}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-[11px] text-outline">
                <span>
                  {totalBytes > 0
                    ? `${formatSize(loadedBytes)} of ${formatSize(totalBytes)}`
                    : `${formatSize(loadedBytes)} transferred`}
                </span>
                <span>Direct In-App Stream</span>
              </div>
            </div>
          )}

          {/* Release Notes */}
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
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2">
          {status === 'downloading' ? (
            <button
              type="button"
              onClick={handleCancelDownload}
              className="w-full py-2.5 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface transition-colors cursor-pointer text-center"
            >
              Cancel Download
            </button>
          ) : status === 'error' ? (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface transition-colors cursor-pointer"
              >
                Dismiss
              </button>
              <button
                type="button"
                onClick={handleRetry}
                className="flex-1 py-2.5 bg-error text-on-error rounded-xl text-xs font-bold shadow-md hover:bg-error/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">refresh</span>
                <span>Retry Download</span>
              </button>
            </>
          ) : status === 'success' ? (
            <button
              type="button"
              onClick={onClose}
              className="w-full py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[18px]">done</span>
              <span>Installation Prompt Opened</span>
            </button>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2.5 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface transition-colors cursor-pointer"
              >
                Later
              </button>
              <button
                type="button"
                onClick={handleStartDownload}
                className="flex-1 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">download</span>
                <span>Download & Verify ({info.apkSize})</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

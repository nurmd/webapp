import React, { useState, useEffect, useRef } from 'react';
import { AppReleaseInfo, updateService, CURRENT_APP_VERSION } from '../../services/updateService.ts';

interface AppUpdateModalProps {
  isOpen: boolean;
  releaseInfo?: AppReleaseInfo | null;
  onClose: () => void;
}

type UpdateStatus = 'idle' | 'downloading' | 'verifying' | 'applying' | 'success' | 'error';

export const AppUpdateModal: React.FC<AppUpdateModalProps> = ({
  isOpen,
  releaseInfo,
  onClose,
}) => {
  const isPwa = updateService.isPwaEnvironment();
  const [status, setStatus] = useState<UpdateStatus>('idle');
  const [downloadProgress, setDownloadProgress] = useState<number>(0);
  const [loadedBytes, setLoadedBytes] = useState<number>(0);
  const [totalBytes, setTotalBytes] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [verifiedHash, setVerifiedHash] = useState<string | null>(null);
  const [showServerDetails, setShowServerDetails] = useState(false);

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
    versionCode: 10035,
    releaseDate: new Date().toISOString().split('T')[0],
    releaseTitle: `Vyapar PRO v${CURRENT_APP_VERSION}`,
    releaseNotes: [
      'Clean Clutter-Free POS Billing Counter with fixed item table scroll',
      'Instant PWA auto-update from GitHub repository',
      'Optimized thermal receipt printing and dynamic UPI QR modal'
    ],
    apkUrl: 'https://github.com/nurmd/webapp/releases/latest',
    apkSize: isPwa ? 'PWA Web' : '20.2 MB',
    isPwa,
  };

  const handleApplyPwaUpdate = async () => {
    setStatus('applying');
    try {
      await updateService.applyPwaUpdate();
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to apply PWA update');
      setStatus('error');
    }
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
      onError: (msg) => {
        setErrorMessage(msg);
        setStatus('error');
        updateService.clearTempApk();
      },
    });

    cancelDownloadRef.current = cancelFn;
  };

  const handleRetry = () => {
    if (isPwa) {
      handleApplyPwaUpdate();
    } else {
      updateService.clearTempApk();
      handleStartDownload();
    }
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
                {status === 'success' || status === 'applying'
                  ? 'verified'
                  : status === 'error'
                  ? 'error'
                  : isPwa
                  ? 'cloud_sync'
                  : 'system_update'}
              </span>
            </div>
            <div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <h3 className="font-headline-sm text-base font-bold text-on-surface">
                  {isPwa ? 'PWA Update Available' : 'App Update Available'}
                </h3>
                <span className="bg-secondary text-on-secondary text-[10px] font-bold px-2 py-0.5 rounded-full">
                  v{info.version}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant mt-0.5">
                Current: v{CURRENT_APP_VERSION} • {isPwa ? 'GitHub Cloud Release' : `Package: ${info.apkSize}`}
              </p>
            </div>
          </div>
          {status !== 'downloading' && status !== 'applying' && (
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
            >
              <span className="material-symbols-outlined text-[18px]">close</span>
            </button>
          )}
        </div>

        {/* Checksum Badge (Android APK) */}
        {!isPwa && info.sha256 && status !== 'error' && (
          <div className="px-5 py-2 bg-surface-container-low/50 border-b border-outline-variant/20 flex items-center gap-2 text-[11px] text-on-surface-variant">
            <span className="material-symbols-outlined text-secondary text-[14px]">shield</span>
            <span className="font-semibold text-secondary">SHA-256 Checksum:</span>
            <span className="font-mono truncate">{info.sha256.slice(0, 12)}...{info.sha256.slice(-8)}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="p-5 space-y-4 flex-1 overflow-y-auto">
          {/* Status: APPLYING (PWA) */}
          {status === 'applying' && (
            <div className="bg-secondary/10 border border-secondary/30 rounded-2xl p-4 text-center space-y-3">
              <span className="material-symbols-outlined text-secondary text-[36px] animate-spin">
                sync
              </span>
              <div>
                <p className="text-sm font-bold text-on-surface">Updating Vyapar Books PRO...</p>
                <p className="text-xs text-on-surface-variant mt-1">
                  Purging outdated browser cache and hot-reloading new PWA bundle from GitHub.
                </p>
              </div>
            </div>
          )}

          {/* Status: ERROR */}
          {status === 'error' && (
            <div className="bg-error-container/20 border border-error/30 rounded-2xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-error font-bold text-sm">
                <span className="material-symbols-outlined text-[20px]">warning</span>
                <span>Update Failed</span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {errorMessage || 'Unable to complete update from GitHub repository.'}
              </p>
            </div>
          )}

          {/* Status: SUCCESS (APK only) */}
          {!isPwa && status === 'success' && (
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
            </div>
          )}

          {/* Status: DOWNLOADING (APK only) */}
          {!isPwa && (status === 'downloading' || status === 'verifying') && (
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

          {/* PWA Info Banner */}
          {isPwa && status !== 'applying' && (
            <div className="bg-primary/5 border border-primary/20 rounded-2xl p-3.5 flex items-start gap-3">
              <span className="material-symbols-outlined text-primary text-[20px] flex-shrink-0 mt-0.5">
                verified_user
              </span>
              <div className="text-xs text-on-surface space-y-1">
                <p className="font-semibold text-primary">Instant Hot-Reload Update</p>
                <p className="text-on-surface-variant leading-relaxed">
                  Your billing data, inventory, and invoices are 100% safely preserved locally in IndexedDB/PouchDB.
                </p>
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

          {/* Debian Server Admin Guide (Collapsible) */}
          {isPwa && (
            <div className="border border-outline-variant/20 rounded-2xl overflow-hidden">
              <button
                type="button"
                onClick={() => setShowServerDetails(!showServerDetails)}
                className="w-full px-3.5 py-2.5 bg-surface-container-low flex items-center justify-between text-xs text-on-surface-variant hover:bg-surface-container cursor-pointer font-medium"
              >
                <span className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">terminal</span>
                  <span>Debian Server Update Command</span>
                </span>
                <span className="material-symbols-outlined text-[16px]">
                  {showServerDetails ? 'expand_less' : 'expand_more'}
                </span>
              </button>
              {showServerDetails && (
                <div className="p-3 bg-surface text-[11px] font-mono space-y-2 text-on-surface-variant border-t border-outline-variant/20">
                  <p className="text-outline">To update your Debian Nginx web server directly from GitHub:</p>
                  <div className="p-2 bg-surface-container-highest rounded-xl text-primary select-all break-all">
                    sudo bash /var/www/vyapar/deploy/update-from-github.sh
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between gap-2">
          {status === 'applying' ? (
            <div className="w-full py-2.5 text-center text-xs font-bold text-secondary">
              Reloading app...
            </div>
          ) : status === 'downloading' ? (
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
                <span>Retry</span>
              </button>
            </>
          ) : isPwa ? (
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
                onClick={handleApplyPwaUpdate}
                className="flex-1 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-1.5"
              >
                <span className="material-symbols-outlined text-[18px]">cached</span>
                <span>Update &amp; Reload Now</span>
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
                <span>Download &amp; Verify ({info.apkSize})</span>
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};

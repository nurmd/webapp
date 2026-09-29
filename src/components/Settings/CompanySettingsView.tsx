import React, { useState, useEffect } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { validateGstin } from '../../core/gst/validator.ts';
import { pouch, PouchSyncState } from '../../services/pouchdb.ts';
import { updateService, AppReleaseInfo, CURRENT_APP_VERSION } from '../../services/updateService.ts';
import { AppUpdateModal } from '../Update/AppUpdateModal.tsx';

interface CompanySettingsViewProps {
  company: CompanyProfile;
  onSave: (updated: CompanyProfile) => void;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  company,
  onSave,
}) => {
  const [profile, setProfile] = useState<CompanyProfile>({ ...company });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  // App Update state
  const [isUpdateChecking, setIsUpdateChecking] = useState(false);
  const [updateRelease, setUpdateRelease] = useState<AppReleaseInfo | null>(null);
  const [isUpdateModalOpen, setIsUpdateModalOpen] = useState(false);
  const [updateStatusText, setUpdateStatusText] = useState<string | null>(null);

  const handleCheckForUpdates = async () => {
    setIsUpdateChecking(true);
    setUpdateStatusText('Checking update servers...');
    try {
      const res = await updateService.checkForUpdates();
      if (res.hasUpdate && res.latestRelease) {
        setUpdateRelease(res.latestRelease);
        setIsUpdateModalOpen(true);
        setUpdateStatusText(`New version v${res.latestRelease.version} is available!`);
      } else {
        setUpdateStatusText(`You are on the latest version (v${CURRENT_APP_VERSION}).`);
      }
    } catch (e: any) {
      setUpdateStatusText('Update check failed. Check internet connection.');
    } finally {
      setIsUpdateChecking(false);
    }
  };

  // Sync state
  const [syncState, setSyncState] = useState<PouchSyncState>(pouch.getSyncState());
  const [syncUrlInput, setSyncUrlInput] = useState(syncState.remoteUrl || '');
  const [isSyncStarting, setIsSyncStarting] = useState(false);

  useEffect(() => {
    const unsub = pouch.subscribeSync((state) => {
      setSyncState(state);
      if (state.remoteUrl && !syncUrlInput) {
        setSyncUrlInput(state.remoteUrl);
      }
    });
    return unsub;
  }, []);

  const handleStartSync = () => {
    if (!syncUrlInput.trim()) {
      pouch.stopSync();
      return;
    }
    setIsSyncStarting(true);
    pouch.startSync(syncUrlInput.trim());
    setTimeout(() => setIsSyncStarting(false), 800);
  };

  const handleStopSync = () => {
    pouch.stopSync();
    setSyncUrlInput('');
  };

  const handleGstinChange = (value: string) => {
    const clean = value.toUpperCase().trim();
    setProfile({ ...profile, gstin: clean });

    if (clean.length === 15) {
      const res = validateGstin(clean);
      if (res.isValid) {
        setFeedback(`Valid GSTIN: State ${res.stateName}, PAN ${res.pan}`);
        setProfile((prev) => ({
          ...prev,
          gstin: clean,
          stateCode: res.stateCode || prev.stateCode,
          pan: res.pan || prev.pan,
        }));
      } else {
        setFeedback(`Validation Error: ${res.error}`);
      }
    } else {
      setFeedback(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(profile);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div className="flex flex-col w-full pb-24 max-w-4xl mx-auto px-margin-mobile py-4 gap-space-sm">
      {/* Header Banner */}
      <div className="bg-surface-container-lowest p-space-sm rounded-xl shadow-sm border border-outline-variant/30 flex items-center justify-between">
        <div>
          <h2 className="font-headline-sm text-lg font-bold text-on-surface">
            Business Profile & GST Settings
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">
            Configures tax identification, print headers, bank accounts & UPI Dynamic QR
          </p>
        </div>
        <div className="w-10 h-10 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center">
          <span className="material-symbols-outlined text-[22px]">settings</span>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="bg-surface-container-lowest p-5 rounded-2xl border border-outline-variant/30 shadow-sm flex flex-col gap-5">
        {/* Legal Entity Details */}
        <div>
          <div className="flex items-center gap-1.5 pb-2 border-b border-outline-variant/20 mb-3">
            <span className="material-symbols-outlined text-secondary text-[18px]">domain</span>
            <h3 className="font-label-md text-sm font-bold text-on-surface">
              Legal Business Entity
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Legal Business Name *
              </label>
              <input
                type="text"
                required
                value={profile.businessName}
                onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-semibold"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Trade Name (Brand Name)
              </label>
              <input
                type="text"
                value={profile.tradeName || ''}
                onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-medium"
              />
            </div>
          </div>
        </div>

        {/* GSTIN & State */}
        <div>
          <div className="flex items-center gap-1.5 pb-2 border-b border-outline-variant/20 mb-3">
            <span className="material-symbols-outlined text-secondary text-[18px]">verified</span>
            <h3 className="font-label-md text-sm font-bold text-on-surface">
              GSTIN & Registered State
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                GSTIN (15 Digits) *
              </label>
              <input
                type="text"
                required
                maxLength={15}
                value={profile.gstin}
                onChange={(e) => handleGstinChange(e.target.value)}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-mono font-bold uppercase tracking-wider text-secondary"
              />
              {feedback && (
                <div
                  className={`text-[11px] mt-1 font-medium ${
                    feedback.startsWith('Valid') ? 'text-secondary' : 'text-error'
                  }`}
                >
                  {feedback}
                </div>
              )}
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Home State *
              </label>
              <select
                value={profile.stateCode}
                onChange={(e) => setProfile({ ...profile, stateCode: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
              >
                {getStateList().map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3">
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
              Registered Address
            </label>
            <textarea
              rows={2}
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
            />
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Contact Phone
              </label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Email
              </label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
              />
            </div>
          </div>
        </div>

        {/* Banking and UPI QR */}
        <div>
          <div className="flex items-center gap-1.5 pb-2 border-b border-outline-variant/20 mb-3">
            <span className="material-symbols-outlined text-secondary text-[18px]">account_balance</span>
            <h3 className="font-label-md text-sm font-bold text-on-surface">
              Bank Details & UPI Payment QR
            </h3>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Bank Name
              </label>
              <input
                type="text"
                value={profile.bankName || ''}
                onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                Account Number
              </label>
              <input
                type="text"
                value={profile.accountNumber || ''}
                onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-mono"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                IFSC Code
              </label>
              <input
                type="text"
                value={profile.ifscCode || ''}
                onChange={(e) => setProfile({ ...profile, ifscCode: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-mono uppercase"
              />
            </div>

            <div>
              <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
                UPI ID (Prints Dynamic QR on bills)
              </label>
              <input
                type="text"
                placeholder="merchant@okhdfcbank"
                value={profile.upiId || ''}
                onChange={(e) => setProfile({ ...profile, upiId: e.target.value })}
                className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none font-mono text-secondary"
              />
            </div>
          </div>
        </div>

        {/* Cloud & Multi-Counter Sync (CouchDB / PouchDB) */}
        <div className="p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/30 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 flex-wrap gap-2">
            <div className="flex items-center gap-1.5">
              <span className="material-symbols-outlined text-secondary text-[20px]">cloud_sync</span>
              <div>
                <h3 className="font-label-md text-sm font-bold text-on-surface">
                  Offline-First &amp; Multi-Counter Sync (CouchDB / PouchDB)
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Continuous 2-way live sync across multiple store counters or remote backup
                </p>
              </div>
            </div>

            {/* Live Status Pill */}
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold border transition-all"
              style={{
                backgroundColor:
                  syncState.status === 'synced' ? 'rgba(0,108,73,0.1)' :
                  syncState.status === 'syncing' ? 'rgba(30,136,229,0.1)' :
                  syncState.status === 'connecting' ? 'rgba(245,158,11,0.1)' :
                  syncState.status === 'error' ? 'rgba(239,68,68,0.1)' : 'rgba(100,116,139,0.1)',
                borderColor:
                  syncState.status === 'synced' ? 'rgba(0,108,73,0.3)' :
                  syncState.status === 'syncing' ? 'rgba(30,136,229,0.3)' :
                  syncState.status === 'connecting' ? 'rgba(245,158,11,0.3)' :
                  syncState.status === 'error' ? 'rgba(239,68,68,0.3)' : 'rgba(100,116,139,0.3)',
                color:
                  syncState.status === 'synced' ? '#006c49' :
                  syncState.status === 'syncing' ? '#1e88e5' :
                  syncState.status === 'connecting' ? '#d97706' :
                  syncState.status === 'error' ? '#dc2626' : '#64748b',
              }}
            >
              <span className={`w-2 h-2 rounded-full ${
                syncState.status === 'synced' ? 'bg-[#006c49] animate-pulse' :
                syncState.status === 'syncing' ? 'bg-[#1e88e5] animate-ping' :
                syncState.status === 'connecting' ? 'bg-[#d97706] animate-pulse' :
                syncState.status === 'error' ? 'bg-[#dc2626]' : 'bg-[#64748b]'
              }`} />
              <span className="uppercase text-[10px] tracking-wider">
                {syncState.status === 'synced' ? 'Live Synced' :
                 syncState.status === 'syncing' ? 'Syncing...' :
                 syncState.status === 'connecting' ? 'Connecting...' :
                 syncState.status === 'error' ? 'Sync Error' : 'Local Offline Mode'}
              </span>
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
              Remote CouchDB / Cloudant URL
            </label>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="text"
                placeholder="https://admin:password@couchdb.yourstore.com/vyapar_store"
                value={syncUrlInput}
                onChange={(e) => setSyncUrlInput(e.target.value)}
                className="flex-1 bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-xs text-on-surface font-mono outline-none focus:border-secondary"
              />
              <div className="flex items-center gap-1.5 flex-shrink-0">
                <button
                  type="button"
                  onClick={handleStartSync}
                  disabled={isSyncStarting}
                  className="px-4 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1"
                >
                  <span className="material-symbols-outlined text-[16px]">
                    {isSyncStarting ? 'sync' : 'sync_saved_locally'}
                  </span>
                  <span>{syncState.remoteUrl ? 'Re-Sync' : 'Connect'}</span>
                </button>

                {syncState.remoteUrl && (
                  <button
                    type="button"
                    onClick={handleStopSync}
                    className="px-3 py-2.5 bg-error-container text-on-error-container rounded-xl text-xs font-bold hover:bg-error-container/80 transition-all cursor-pointer flex items-center gap-1"
                  >
                    <span className="material-symbols-outlined text-[16px]">link_off</span>
                    <span>Disconnect</span>
                  </button>
                )}
              </div>
            </div>

            {syncState.error && (
              <div className="text-[11px] text-error font-medium mt-1 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                <span>{syncState.error}</span>
              </div>
            )}

            {syncState.lastSyncedAt && (
              <div className="text-[10px] text-on-surface-variant mt-1">
                Last synchronized: {new Date(syncState.lastSyncedAt).toLocaleTimeString()}
              </div>
            )}
          </div>
        </div>

        {/* Software & In-App Updates */}
        <div className="p-4 bg-surface-container-low/50 rounded-2xl border border-outline-variant/30 flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-secondary text-[22px]">system_update</span>
              <div>
                <h3 className="font-label-md text-sm font-bold text-on-surface">
                  Software Updates &amp; GitHub OTA Channel
                </h3>
                <p className="text-[11px] text-on-surface-variant">
                  Current Installed Version: <strong className="text-secondary font-mono">v{CURRENT_APP_VERSION} (PRO)</strong>
                  <span className="mx-1">•</span>
                  <span>Static Keystore Signed</span>
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={isUpdateChecking}
              onClick={handleCheckForUpdates}
              className="px-4 py-2 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">
                {isUpdateChecking ? 'sync' : 'refresh'}
              </span>
              <span>{isUpdateChecking ? 'Checking...' : 'Check GitHub Releases'}</span>
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">verified_user</span>
                <span className="text-on-surface font-semibold">Static Keystore</span>
              </div>
              <span className="text-[10px] font-mono bg-secondary-container text-on-secondary-container px-2 py-0.5 rounded-full font-bold">
                Valid to 2054
              </span>
            </div>

            <div className="p-2.5 rounded-xl bg-surface-container border border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">cloud_download</span>
                <span className="text-on-surface font-semibold">OTA Source</span>
              </div>
              <span className="text-[10px] font-mono text-on-surface-variant font-bold">
                nurmd/webapp
              </span>
            </div>
          </div>

          {updateStatusText && (
            <div className="text-xs font-medium text-secondary flex items-center gap-1.5 bg-secondary/10 p-2.5 rounded-xl border border-secondary/20">
              <span className="material-symbols-outlined text-[16px]">info</span>
              <span>{updateStatusText}</span>
            </div>
          )}
        </div>

        {/* Invoice Default Terms & Conditions */}
        <div>
          <label className="block text-[11px] font-semibold text-on-surface-variant uppercase tracking-wider mb-1">
            Invoice Default Terms & Conditions
          </label>
          <textarea
            rows={3}
            value={profile.termsAndConditions || ''}
            onChange={(e) => setProfile({ ...profile, termsAndConditions: e.target.value })}
            className="w-full bg-surface border border-outline-variant/40 rounded-xl p-2.5 text-sm text-on-surface focus:border-secondary outline-none"
          />
        </div>

        {/* Save Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-outline-variant/20 flex-wrap gap-2">
          {savedNotice ? (
            <span className="text-secondary text-xs font-semibold flex items-center gap-1">
              <span className="material-symbols-outlined text-[16px]">check_circle</span>
              <span>Company profile updated successfully!</span>
            </span>
          ) : (
            <span />
          )}

          <button
            type="submit"
            className="inline-flex items-center gap-1.5 bg-secondary text-on-secondary font-label-md text-sm font-bold px-6 py-2.5 rounded-xl shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">save</span>
            <span>Save Profile Settings</span>
          </button>
        </div>
      </form>

      {/* App Update Modal */}
      <AppUpdateModal
        isOpen={isUpdateModalOpen}
        releaseInfo={updateRelease}
        onClose={() => setIsUpdateModalOpen(false)}
      />
    </div>
  );
};

import React, { useState, useEffect, useRef } from 'react';
import { AppReleaseInfo, updateService } from '../../services/updateService.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface AppUpdatePromptProps {
  isOpen: boolean;
  releaseInfo?: AppReleaseInfo | null;
  onUpdateNow: () => void;
  onLater: () => void;
  onSkip: (version: string) => void;
  onClose?: () => void;
}

export const AppUpdatePrompt: React.FC<AppUpdatePromptProps> = ({
  isOpen,
  releaseInfo,
  onUpdateNow,
  onLater,
  onSkip,
  onClose,
}) => {
  const [dynamicNotes, setDynamicNotes] = useState<string[]>([]);
  const primaryButtonRef = useRef<HTMLButtonElement | null>(null);

  const cleanVersion = (releaseInfo?.version || '').replace(/^v/i, '');
  const isMandatory = Boolean(releaseInfo?.isMandatory);
  const isPwa = updateService.isPwaEnvironment();

  // Dismiss handler (shared by Later, Escape, and Back navigation)
  const handleDismiss = onClose || onLater;

  // Register Android back navigation at priority 25
  useBackNavigation(
    () => {
      if (!isMandatory) {
        handleDismiss();
      }
      return true;
    },
    isOpen,
    25
  );

  // Focus primary button when prompt opens
  useEffect(() => {
    if (isOpen) {
      primaryButtonRef.current?.focus();
    }
  }, [isOpen]);

  // Escape key closes prompt unless mandatory
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        if (!isMandatory) {
          handleDismiss();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, isMandatory, handleDismiss]);

  // Fetch dynamic release notes if not already provided on releaseInfo
  useEffect(() => {
    if (!isOpen) return;
    const targetVer = releaseInfo?.version;
    if (!targetVer) return;

    if (releaseInfo.releaseNotes && releaseInfo.releaseNotes.length > 0) {
      setDynamicNotes(releaseInfo.releaseNotes);
      return;
    }

    let active = true;
    updateService
      .fetchDynamicReleaseNotes(updateService.getGitHubRepo(), targetVer)
      .then((notes) => {
        if (active && notes && notes.length > 0) {
          setDynamicNotes(notes);
        }
      })
      .catch(() => {});

    return () => {
      active = false;
    };
  }, [isOpen, releaseInfo?.version, releaseInfo?.releaseNotes]);

  if (!isOpen) return null;

  const rawNotes = (releaseInfo?.releaseNotes && releaseInfo.releaseNotes.length > 0)
    ? releaseInfo.releaseNotes
    : dynamicNotes;

  const displayedNotes = rawNotes.slice(0, 3);
  const moreCount = rawNotes.length > 3 ? rawNotes.length - 3 : 0;

  const platformSubtitle = isPwa
    ? 'A new web build is ready to apply.'
    : 'A new APK download is ready to install.';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-fade-in"
      role="dialog"
      aria-modal="true"
      aria-labelledby="app-update-prompt-title"
    >
      <div className="w-full max-w-md bg-surface-container-high rounded-2xl border border-outline-variant/30 shadow-2xl p-6 text-on-surface space-y-4">
        {/* Header with Title and Platform Subtitle */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-primary">
            <span className="material-symbols-outlined text-2xl">system_update</span>
            <h2
              id="app-update-prompt-title"
              className="text-lg font-bold tracking-tight text-on-surface"
            >
              Update available — v{cleanVersion}
            </h2>
          </div>
          <p className="text-xs text-on-surface-variant font-medium">
            {platformSubtitle}
          </p>
        </div>

        {/* Release Title if specified */}
        {releaseInfo?.releaseTitle && (
          <p className="text-sm font-semibold text-secondary">
            {releaseInfo.releaseTitle}
          </p>
        )}

        {/* Dynamic Release Notes Bullets (up to 3 + more indicator) */}
        {displayedNotes.length > 0 && (
          <div className="rounded-xl bg-surface-container/60 p-3.5 border border-outline-variant/20 space-y-2">
            <ul className="space-y-1.5 text-xs text-on-surface-variant">
              {displayedNotes.map((note, index) => (
                <li key={index} className="flex items-start gap-2">
                  <span className="text-primary font-bold select-none">•</span>
                  <span className="flex-1 leading-relaxed">{note}</span>
                </li>
              ))}
            </ul>
            {moreCount > 0 && (
              <p className="text-[11px] font-semibold text-primary pl-4">
                +{moreCount} more
              </p>
            )}
          </div>
        )}

        {/* Actions */}
        <div className="flex flex-col gap-2 pt-2">
          <button
            ref={primaryButtonRef}
            type="button"
            onClick={onUpdateNow}
            className="w-full py-2.5 px-4 rounded-xl font-semibold text-sm bg-primary text-on-primary hover:bg-primary/90 active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
          >
            <span className="material-symbols-outlined text-[18px]">download</span>
            {isMandatory ? 'Update now (required)' : 'Update Now'}
          </button>

          {!isMandatory && (
            <div className="flex items-center justify-between gap-3 pt-1">
              <button
                type="button"
                onClick={() => onSkip(cleanVersion)}
                className="text-xs text-on-surface-variant/80 hover:text-on-surface underline underline-offset-2 transition-colors py-1 px-1"
              >
                Skip this version
              </button>
              <button
                type="button"
                onClick={handleDismiss}
                className="py-1.5 px-4 rounded-lg font-medium text-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest transition-colors"
              >
                Later
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

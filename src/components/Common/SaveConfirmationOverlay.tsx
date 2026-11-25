import React, { useEffect, useRef, useState } from 'react';
import { formatINR } from '../../core/utils/formatters.ts';
import { SavedDocument } from '../../services/saveConfirmation.ts';

const AUTO_DISMISS_MS = 1600;

export const SaveConfirmationOverlay: React.FC = () => {
  const [savedDoc, setSavedDoc] = useState<SavedDocument | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleSaved = (event: Event) => {
      const detail = (event as CustomEvent<SavedDocument>).detail;
      if (!detail?.kind) return;

      setSavedDoc(detail);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
      timerRef.current = setTimeout(() => {
        setSavedDoc(null);
        timerRef.current = null;
      }, AUTO_DISMISS_MS);
    };

    window.addEventListener('app_document_saved', handleSaved);
    return () => {
      window.removeEventListener('app_document_saved', handleSaved);
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };
  }, []);

  if (!savedDoc) return null;

  const hasSecondary = Boolean(savedDoc.number) || typeof savedDoc.amount === 'number';

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="save-confirmation-overlay"
      className="fixed inset-0 z-[60] pointer-events-none flex items-center justify-center px-4"
    >
      <div className="animate-save-confirm bg-surface-container-lowest/95 backdrop-blur-md border border-secondary/30 shadow-2xl rounded-2xl px-6 py-5 flex flex-col items-center gap-2.5 text-center max-w-xs w-full">
        <div className="w-14 h-14 rounded-full bg-secondary/15 ring-4 ring-secondary/10 flex items-center justify-center text-secondary">
          <span className="material-symbols-outlined text-[32px]">check_circle</span>
        </div>
        <p className="text-sm font-extrabold text-on-surface tracking-tight">
          {savedDoc.kind} saved
        </p>
        {hasSecondary && (
          <div className="flex items-center justify-center gap-2 text-xs font-semibold text-on-surface-variant font-tabular-data">
            {savedDoc.number && <span>#{savedDoc.number}</span>}
            {savedDoc.number && typeof savedDoc.amount === 'number' && <span>·</span>}
            {typeof savedDoc.amount === 'number' && <span>{formatINR(savedDoc.amount)}</span>}
          </div>
        )}
      </div>
    </div>
  );
};

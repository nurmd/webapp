import React from 'react';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

export interface ConfirmDeleteModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  recordName?: string;
  confirmText?: string;
  cancelText?: string;
  onConfirm: () => void;
  onClose: () => void;
}

export const ConfirmDeleteModal: React.FC<ConfirmDeleteModalProps> = ({
  isOpen,
  title,
  description,
  recordName,
  confirmText = 'Delete',
  cancelText = 'Cancel',
  onConfirm,
  onClose,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 30);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-surface-container-lowest text-on-surface rounded-2xl border border-outline-variant/30 w-full max-w-sm p-4 sm:p-5 shadow-2xl flex flex-col gap-3"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-error-container/30 text-error flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[24px]">delete_forever</span>
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-bold text-sm sm:text-base text-on-surface truncate">{title}</h3>
            {recordName && (
              <p className="text-xs text-on-surface-variant font-medium truncate mt-0.5">{recordName}</p>
            )}
          </div>
        </div>

        {description && (
          <p className="text-xs text-on-surface-variant leading-relaxed bg-surface-container-low/50 p-2.5 rounded-xl border border-outline-variant/15">
            {description}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 mt-1">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[44px] px-4 rounded-xl border border-outline-variant/40 text-on-surface font-bold text-xs hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
          >
            {cancelText}
          </button>
          <button
            type="button"
            onClick={() => {
              onConfirm();
              onClose();
            }}
            className="min-h-[44px] px-5 rounded-xl bg-error text-on-error font-bold text-xs shadow-xs hover:bg-error/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[16px]">delete</span>
            <span>{confirmText}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

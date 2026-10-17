import React, { useState, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import {
  buildWhatsAppMessage,
  safeOpenExternalUrl,
  WhatsAppTemplateType,
  WhatsAppLanguage,
} from '../../core/utils/upiAndShare.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { showAppToast } from '../../services/toast.ts';

export interface WhatsAppShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  company: CompanyProfile;
  invoice?: Invoice;
  party?: Party;
  initialPhone?: string;
  initialPartyName?: string;
  initialBalance?: number;
  initialTemplate?: WhatsAppTemplateType;
  overdueDays?: number;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  isOpen,
  onClose,
  company,
  invoice,
  party,
  initialPhone,
  initialPartyName,
  initialBalance,
  initialTemplate,
  overdueDays,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 35);

  const defaultPhone = initialPhone || invoice?.partyPhone || party?.phone || '';
  const [phone, setPhone] = useState<string>(defaultPhone);
  const [template, setTemplate] = useState<WhatsAppTemplateType>(
    initialTemplate || (invoice ? 'INVOICE_DELIVERY' : 'PARTY_STATEMENT')
  );
  const [language, setLanguage] = useState<WhatsAppLanguage>('EN');
  const [customNote, setCustomNote] = useState<string>('');
  const [copied, setCopied] = useState(false);

  // Re-sync phone if defaultPhone changes
  React.useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const { text, cleanPhone, whatsappUrl } = useMemo(() => {
    return buildWhatsAppMessage(
      company,
      {
        invoice,
        party,
        balanceAmount: initialBalance,
        partyName: initialPartyName,
        partyPhone: phone,
      },
      {
        template,
        language,
        customNote,
        overdueDays,
      }
    );
  }, [company, invoice, party, initialBalance, initialPartyName, phone, template, language, customNote, overdueDays]);

  if (!isOpen) return null;

  const handleSend = () => {
    if (!cleanPhone || cleanPhone.length < 10) {
      showAppToast('Please enter a valid 10-digit phone number.');
      return;
    }
    safeOpenExternalUrl(whatsappUrl);
    showAppToast('Opening WhatsApp...');
    onClose();
  };

  const handleCopy = () => {
    if (navigator?.clipboard?.writeText) {
      navigator.clipboard.writeText(text);
      setCopied(true);
      showAppToast('Message copied to clipboard!');
      setTimeout(() => setCopied(false), 2500);
    } else {
      showAppToast('Unable to access clipboard.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-200">
      <div
        className="bg-surface rounded-3xl max-w-lg w-full max-h-[92vh] flex flex-col shadow-2xl border border-outline-variant/30 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-5 py-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 flex items-center justify-center">
              <span className="material-symbols-outlined text-[24px]">chat</span>
            </div>
            <div>
              <h3 className="font-bold text-on-surface text-base">WhatsApp Share & Reminder</h3>
              <p className="text-xs text-on-surface-variant">Instant document dispatch with UPI link</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Scrollable Configuration Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-sm">
          {/* Recipient Phone */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Customer Mobile Number (WhatsApp)
            </label>
            <div className="relative flex items-center">
              <span className="absolute left-3 text-xs font-bold text-outline select-none">
                +91
              </span>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="9876543210"
                className="w-full pl-11 pr-3 py-2.5 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-on-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>
          </div>

          {/* Template & Tone Selector */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Message Template
            </label>
            <div className="grid grid-cols-2 gap-2">
              {invoice && (
                <button
                  type="button"
                  onClick={() => setTemplate('INVOICE_DELIVERY')}
                  className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center gap-2 cursor-pointer ${
                    template === 'INVOICE_DELIVERY'
                      ? 'border-secondary bg-secondary/10 text-secondary'
                      : 'border-outline-variant/30 hover:bg-surface-container text-on-surface-variant'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px]">receipt_long</span>
                  <span>Invoice Delivery</span>
                </button>
              )}

              <button
                type="button"
                onClick={() => setTemplate('GENTLE_REMINDER')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center gap-2 cursor-pointer ${
                  template === 'GENTLE_REMINDER'
                    ? 'border-secondary bg-secondary/10 text-secondary'
                    : 'border-outline-variant/30 hover:bg-surface-container text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">notifications</span>
                <span>Gentle Reminder</span>
              </button>

              <button
                type="button"
                onClick={() => setTemplate('OVERDUE_URGENT')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center gap-2 cursor-pointer ${
                  template === 'OVERDUE_URGENT'
                    ? 'border-error bg-error/10 text-error'
                    : 'border-outline-variant/30 hover:bg-surface-container text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">warning</span>
                <span>Urgent Overdue</span>
              </button>

              <button
                type="button"
                onClick={() => setTemplate('PARTY_STATEMENT')}
                className={`px-3 py-2 rounded-xl text-xs font-semibold border transition-all text-left flex items-center gap-2 cursor-pointer ${
                  template === 'PARTY_STATEMENT'
                    ? 'border-secondary bg-secondary/10 text-secondary'
                    : 'border-outline-variant/30 hover:bg-surface-container text-on-surface-variant'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">account_balance_wallet</span>
                <span>Account Statement</span>
              </button>
            </div>
          </div>

          {/* Language Toggle */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1.5">
              Language
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setLanguage('EN')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  language === 'EN'
                    ? 'bg-secondary text-on-secondary border-secondary'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('HI')}
                className={`flex-1 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                  language === 'HI'
                    ? 'bg-secondary text-on-secondary border-secondary'
                    : 'bg-surface-container-low text-on-surface-variant border-outline-variant/30'
                }`}
              >
                हिन्दी (Hindi)
              </button>
            </div>
          </div>

          {/* Custom Note */}
          <div>
            <label className="block text-xs font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Add Personal Note (Optional)
            </label>
            <input
              type="text"
              value={customNote}
              onChange={(e) => setCustomNote(e.target.value)}
              placeholder="e.g. Dispatched via Express Courier LR-1234"
              className="w-full px-3 py-2 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-on-surface text-xs focus:outline-none focus:ring-1 focus:ring-secondary"
            />
          </div>

          {/* Live Message Preview */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                Message Preview
              </label>
              <button
                type="button"
                onClick={handleCopy}
                className="text-secondary text-xs font-semibold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span className="material-symbols-outlined text-[14px]">
                  {copied ? 'check' : 'content_copy'}
                </span>
                <span>{copied ? 'Copied' : 'Copy Text'}</span>
              </button>
            </div>
            <div className="p-3.5 rounded-2xl bg-emerald-950/10 dark:bg-emerald-950/30 border border-emerald-500/20 text-xs font-mono whitespace-pre-wrap text-on-surface leading-relaxed max-h-48 overflow-y-auto">
              {text}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low flex items-center justify-end gap-2.5 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface-variant text-xs font-semibold hover:bg-surface-container cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleCopy}
            className="px-4 py-2.5 rounded-xl border border-secondary text-secondary text-xs font-bold hover:bg-secondary/10 flex items-center gap-1.5 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">content_copy</span>
            <span>Copy SMS</span>
          </button>
          <button
            type="button"
            onClick={handleSend}
            className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-transform"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            <span>Send WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};

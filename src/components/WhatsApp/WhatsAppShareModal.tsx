import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import {
  TemplateLanguage,
  MessagePurpose,
  formatWhatsAppMessage,
  openWhatsAppShare,
} from '../../services/whatsappService.ts';

interface WhatsAppShareModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
}

export const WhatsAppShareModal: React.FC<WhatsAppShareModalProps> = ({
  invoice,
  company,
  onClose,
}) => {
  const [language, setLanguage] = useState<TemplateLanguage>('en');
  const [purpose, setPurpose] = useState<MessagePurpose>('invoice');
  const [phone, setPhone] = useState('');

  const messagePreview = formatWhatsAppMessage(company, invoice, {
    language,
    purpose,
  });

  const handleSend = () => {
    openWhatsAppShare(company, invoice, {
      phoneNumber: phone,
      language,
      purpose,
    });
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl max-w-md w-full overflow-hidden border border-outline-variant/30 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-[#25D366]/10">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#25D366] text-[24px]">
              chat
            </span>
            <div>
              <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                Share via WhatsApp
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Instant digital receipt &amp; UPI payment link
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

        {/* Configuration Options */}
        <div className="p-4 space-y-3 flex-1 overflow-y-auto">
          {/* Recipient Phone */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Customer Mobile / WhatsApp Number
            </label>
            <div className="flex items-center bg-surface border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-mono">
              <span className="text-on-surface-variant font-bold mr-1">+91</span>
              <input
                type="tel"
                maxLength={10}
                placeholder="9876543210 (Optional)"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                className="w-full bg-transparent outline-none"
              />
            </div>
          </div>

          {/* Purpose Selector */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Message Template
            </label>
            <div className="grid grid-cols-3 gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setPurpose('invoice')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  purpose === 'invoice'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Sale Bill
              </button>
              <button
                type="button"
                onClick={() => setPurpose('reminder')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  purpose === 'reminder'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Due Reminder
              </button>
              <button
                type="button"
                onClick={() => setPurpose('statement')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  purpose === 'statement'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Statement
              </button>
            </div>
          </div>

          {/* Language Selector */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Vernacular Language
            </label>
            <div className="grid grid-cols-3 gap-1 bg-surface-container-low p-1 rounded-xl border border-outline-variant/30">
              <button
                type="button"
                onClick={() => setLanguage('en')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  language === 'en'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                English
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hi')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  language === 'hi'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                हिंदी (Hindi)
              </button>
              <button
                type="button"
                onClick={() => setLanguage('hinglish')}
                className={`py-1.5 text-xs font-bold rounded-lg transition-colors cursor-pointer ${
                  language === 'hinglish'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                Hinglish
              </button>
            </div>
          </div>

          {/* Preview Box */}
          <div>
            <label className="block text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1">
              Message Preview
            </label>
            <div className="bg-[#e7fedb] border border-[#25D366]/40 p-3.5 rounded-2xl text-xs font-sans text-neutral-900 whitespace-pre-wrap leading-relaxed shadow-sm">
              {messagePreview}
            </div>
          </div>
        </div>

        {/* Footer Action */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface cursor-pointer"
          >
            Cancel
          </button>

          <button
            type="button"
            onClick={handleSend}
            className="px-6 py-2.5 bg-[#25D366] text-white rounded-xl text-xs font-bold shadow-md hover:bg-[#20bd5a] active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
          >
            <span className="material-symbols-outlined text-[18px]">send</span>
            <span>Send on WhatsApp</span>
          </button>
        </div>
      </div>
    </div>
  );
};

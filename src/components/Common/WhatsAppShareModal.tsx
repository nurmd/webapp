import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import {
  buildWhatsAppMessage,
  safeOpenExternalUrl,
  WhatsAppTemplateType,
  WhatsAppLanguage,
} from '../../core/utils/upiAndShare.ts';
import {
  normalizeWhatsAppPhone,
  getWhatsAppPhoneErrorMessage,
} from '../../core/utils/whatsappIntent.ts';
import { isDemoModeActive } from '../../core/utils/demoMode.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { showAppToast } from '../../services/toast.ts';
import {
  renderThermalPreviewImage,
  renderThermalReceiptImage,
  shareReceiptImage,
} from '../../core/utils/receiptImageShare.ts';
import { buildThermalReceiptText } from '../../core/utils/thermalReceiptText.ts';
import {
  buildPaymentReceiptText,
  PaymentReceiptParams,
} from '../../core/utils/paymentReceiptText.ts';
import { ThermalReceiptPreview } from '../Printing/ThermalReceiptPreview.tsx';

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
  paymentShareText?: string;
  paymentReceiptParams?: PaymentReceiptParams;
  onPrintA4?: () => void;   // A4 / PDF
  onPrint?: () => void;     // thermal / receipt print
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
  paymentShareText,
  paymentReceiptParams,
  onPrintA4,
  onPrint,
}) => {
  useBackNavigation(() => {
    onClose();
    return true;
  }, isOpen, 35);

  const [previewMode, setPreviewMode] = useState<'text' | 'image'>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const saved =
          localStorage.getItem('whatsappPreviewMode') ||
          localStorage.getItem('whatsappShareTab');
        if (saved === 'text' || saved === 'image') return saved;
      }
    } catch {
      // Fallback
    }
    return 'text';
  });

  useEffect(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('whatsappPreviewMode', previewMode);
        localStorage.setItem('whatsappShareTab', previewMode);
      }
    } catch {
      // ignore
    }
  }, [previewMode]);

  const defaultPhone =
    (initialPhone && initialPhone.trim()) ||
    (invoice?.partyPhone && invoice.partyPhone.trim()) ||
    (party?.phone && party.phone.trim()) ||
    '';
  const [phone, setPhone] = useState<string>(defaultPhone);
  const [template, setTemplate] = useState<WhatsAppTemplateType>(
    initialTemplate || (invoice ? 'INVOICE_DELIVERY' : 'PARTY_STATEMENT')
  );
  const [language, setLanguage] = useState<WhatsAppLanguage>('EN');
  const [customNote, setCustomNote] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [phoneError, setPhoneError] = useState<string>('');
  const [isSharingImage, setIsSharingImage] = useState(false);
  const [paperWidth, setPaperWidth] = useState<32 | 48>(() => {
    try {
      if (typeof localStorage !== 'undefined') {
        const val = Number(localStorage.getItem('printer_paper_width'));
        if (val === 32 || val === 48) return val;
      }
    } catch {
      // Fallback
    }
    return 32;
  });
  const thermalPreviewRef = useRef<HTMLDivElement>(null);

  // Re-sync phone if defaultPhone changes
  useEffect(() => {
    if (defaultPhone) setPhone(defaultPhone);
  }, [defaultPhone]);

  const { text: builtInvoiceText, whatsappUrl: defaultWhatsappUrl } = useMemo(() => {
    return buildWhatsAppMessage(
      company,
      {
        invoice,
        party,
        balanceAmount: initialBalance,
        totalBalanceDue: initialBalance,
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

  const text = paymentShareText || builtInvoiceText;

  const activeWhatsappUrl = useMemo(() => {
    if (paymentShareText) {
      const validation = normalizeWhatsAppPhone(phone);
      const digits = validation.valid ? validation.e164 : phone.replace(/\D/g, '');
      const encoded = encodeURIComponent(text);
      return digits ? `https://wa.me/${digits}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
    }
    return defaultWhatsappUrl;
  }, [paymentShareText, phone, text, defaultWhatsappUrl]);

  if (!isOpen) return null;

  const hasImageShare = Boolean(invoice || paymentReceiptParams);
  const isImageMode = Boolean(hasImageShare && previewMode === 'image');

  const handleSend = () => {
    const trimmedPhone = phone.trim();
    if (trimmedPhone) {
      const validation = normalizeWhatsAppPhone(trimmedPhone);
      if (!validation.valid) {
        const errorMsg = getWhatsAppPhoneErrorMessage(validation);
        setPhoneError(errorMsg);
        showAppToast(errorMsg);
        return;
      }
    } else {
      const validation = normalizeWhatsAppPhone(phone);
      if (!validation.valid) {
        const errorMsg = getWhatsAppPhoneErrorMessage(validation);
        setPhoneError(errorMsg);
        showAppToast(errorMsg);
        return;
      }
    }
    setPhoneError('');
    safeOpenExternalUrl(activeWhatsappUrl);
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

  const handleShareImage = async () => {
    if (!invoice && !paymentReceiptParams) return;
    setIsSharingImage(true);
    try {
      const trimmedPhone = phone.trim();
      if (trimmedPhone) {
        const validation = normalizeWhatsAppPhone(trimmedPhone);
        if (!validation.valid) {
          const err = getWhatsAppPhoneErrorMessage(validation);
          setPhoneError(err);
          showAppToast(err);
          setIsSharingImage(false);
          return;
        }
      }

      let width: 32 | 48 = 32;
      try {
        if (typeof localStorage !== 'undefined') {
          const val = Number(localStorage.getItem('printer_paper_width'));
          if (val === 32 || val === 48) {
            width = val;
          }
        }
      } catch {
        // Fallback to 32
      }
      setPaperWidth(width);

      let blob: Blob | null = null;
      let fileName = 'Receipt-Document.png';
      let captionText = text;

      if (invoice) {
        const receiptText = buildThermalReceiptText(invoice, company, width);
        if (thermalPreviewRef.current) {
          try {
            blob = await renderThermalPreviewImage(thermalPreviewRef.current, receiptText, width);
          } catch (err: any) {
            console.warn('[share] dom capture failed:', err);
            blob = null;
          }
        }
        if (!blob) {
          blob = await renderThermalReceiptImage(receiptText, width);
        }

        const grandTotalVal = invoice.grandTotal ?? 0;
        const totalBalanceDue =
          typeof initialBalance === 'number' && Number.isFinite(initialBalance)
            ? initialBalance
            : (invoice.balanceAmount ?? 0);

        const totalsHeader = `Bill Amount: ₹${grandTotalVal}\nTotal Balance Due: ₹${totalBalanceDue}`;
        captionText = text ? `${totalsHeader}\n\n${text}` : totalsHeader;
        fileName = `Receipt-${invoice.invoiceNumber || 'Document'}.png`;
      } else if (paymentReceiptParams) {
        const receiptText = buildPaymentReceiptText(paymentReceiptParams, width);
        blob = await renderThermalReceiptImage(receiptText, width);
        fileName = `Receipt-${paymentReceiptParams.docNumber || 'Payment'}.png`;

        if (paymentShareText) {
          captionText = paymentShareText;
          if (
            paymentReceiptParams.amount !== undefined &&
            !captionText.includes(String(paymentReceiptParams.amount))
          ) {
            captionText = `Amount: ₹${paymentReceiptParams.amount}\n${captionText}`;
          }
          if (
            paymentReceiptParams.partyBalance !== undefined &&
            !captionText.includes(String(paymentReceiptParams.partyBalance))
          ) {
            captionText = `Total Balance Due: ₹${paymentReceiptParams.partyBalance}\n${captionText}`;
          }
        } else {
          const parts: string[] = [];
          if (paymentReceiptParams.amount !== undefined) {
            parts.push(`Amount: ₹${paymentReceiptParams.amount}`);
          }
          if (paymentReceiptParams.partyBalance !== undefined) {
            parts.push(`Total Balance Due: ₹${paymentReceiptParams.partyBalance}`);
          }
          captionText = parts.length > 0 ? (text ? `${parts.join('\n')}\n\n${text}` : parts.join('\n')) : text;
        }
      }

      if (!blob) {
        showAppToast('Could not create the receipt image.');
        return;
      }

      const res = await shareReceiptImage(blob, fileName, {
        text: captionText,
        phone: trimmedPhone || undefined,
      });

      if (res === 'shared') {
        showAppToast('Receipt image shared.');
      } else if (res === 'downloaded') {
        showAppToast('Receipt image saved. Attach it in the WhatsApp chat.');
      } else if (res === 'cancelled') {
        showAppToast('Share cancelled.');
      } else {
        showAppToast('Could not create the receipt image.');
      }
    } catch (err: any) {
      console.warn('[share] dom capture failed:', err);
      const detail = err?.message ? `: ${err.message}` : '';
      showAppToast(`Could not create the receipt image${detail}.`);
    } finally {
      setIsSharingImage(false);
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
            aria-label="Close share modal"
            className="w-9 h-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>


        {/* Scrollable Configuration Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-sm">
          {/* Demo Mode Guardrail Warning */}
          {isDemoModeActive() && (
            <div
              data-testid="whatsapp-demo-warning"
              className="p-3 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-900 dark:text-amber-200 text-xs flex items-start gap-2.5"
            >
              <span className="material-symbols-outlined text-amber-600 dark:text-amber-400 text-[18px] shrink-0 mt-0.5">
                info
              </span>
              <p className="leading-relaxed">
                Demo Mode: this message uses demo data. Sending opens your real WhatsApp app; no production records are changed.
              </p>
            </div>
          )}

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
                data-testid="whatsapp-phone-input"
                type="tel"
                value={phone}
                onChange={(e) => {
                  setPhone(e.target.value);
                  if (phoneError) setPhoneError('');
                }}
                placeholder="9876543210"
                className="w-full pl-11 pr-3 py-2.5 rounded-xl border border-outline-variant/50 bg-surface-container-lowest text-on-surface text-sm font-mono focus:outline-none focus:ring-2 focus:ring-secondary"
              />
            </div>
            {phoneError && (
              <p data-testid="whatsapp-phone-error" className="text-xs text-error mt-1.5 font-medium">
                {phoneError}
              </p>
            )}
          </div>

              {!paymentShareText && (
                <>
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
                </>
              )}

          {/* Preview Area (below selectors) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
                {isImageMode ? 'Receipt Preview' : 'Message Preview'}
              </label>

              <div className="flex items-center gap-2">
                {/* Small toggle Text | Image (only when invoice or paymentReceiptParams present) */}
                {hasImageShare && (
                  <div
                    data-testid="whatsapp-preview-toggle"
                    className="inline-flex bg-surface-container-low p-0.5 rounded-xl border border-outline-variant/30"
                  >
                    <button
                      type="button"
                      data-testid="whatsapp-tab-text"
                      onClick={() => setPreviewMode('text')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        previewMode === 'text'
                          ? 'bg-surface text-on-surface shadow-xs font-extrabold'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">chat</span>
                      <span>Text</span>
                    </button>
                    <button
                      type="button"
                      data-testid="whatsapp-tab-image"
                      onClick={() => setPreviewMode('image')}
                      className={`px-3 py-1 text-xs font-bold rounded-lg transition-all cursor-pointer flex items-center gap-1.5 ${
                        previewMode === 'image'
                          ? 'bg-surface text-on-surface shadow-xs font-extrabold'
                          : 'text-on-surface-variant hover:text-on-surface'
                      }`}
                    >
                      <span className="material-symbols-outlined text-[14px]">image</span>
                      <span>Image</span>
                    </button>
                  </div>
                )}

                {isImageMode ? (
                  <span className="text-xs text-on-surface-variant font-mono">
                    {paperWidth} cols
                  </span>
                ) : (
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
                )}
              </div>
            </div>

            {/* Toggle swaps Text preview ↔ Thermal receipt image */}
            {isImageMode ? (
              invoice ? (
                <div className="max-h-[40vh] overflow-y-auto border border-outline-variant/30 rounded-2xl p-3 bg-surface-container-low/50 flex justify-center shadow-inner">
                  <ThermalReceiptPreview
                    ref={thermalPreviewRef}
                    previewText={buildThermalReceiptText(invoice, company, paperWidth)}
                    width={paperWidth}
                  />
                </div>
              ) : (
                <div
                  data-testid="payment-receipt-placeholder"
                  className="p-6 border border-outline-variant/30 rounded-2xl bg-surface-container-low/50 text-center text-xs text-on-surface-variant flex flex-col items-center justify-center gap-2"
                >
                  <span className="material-symbols-outlined text-[28px] text-emerald-600">receipt_long</span>
                  <span className="font-bold text-on-surface text-sm">Payment receipt</span>
                  <p className="text-[11px] text-on-surface-variant">Thermal receipt image will be generated on share</p>
                </div>
              )
            ) : (
              <div
                data-testid="whatsapp-message-preview-box"
                className="p-3.5 rounded-2xl bg-emerald-950/10 dark:bg-emerald-950/30 border border-emerald-500/20 text-xs font-mono whitespace-pre-wrap text-on-surface leading-relaxed max-h-48 overflow-y-auto"
              >
                {text}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low flex flex-col gap-2.5 shrink-0">
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-outline-variant/40 text-on-surface-variant text-xs font-semibold hover:bg-surface-container cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              data-testid="whatsapp-copy-button"
              onClick={handleCopy}
              className="px-4 py-2.5 rounded-xl border border-secondary text-secondary text-xs font-bold hover:bg-secondary/10 flex items-center gap-1.5 cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">content_copy</span>
              <span>Copy SMS</span>
            </button>
            <button
              type="button"
              data-testid="whatsapp-send-button"
              disabled={isSharingImage}
              onClick={() => {
                if (isImageMode) {
                  handleShareImage();
                } else {
                  handleSend();
                }
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 active:scale-95 text-white text-xs font-bold flex items-center gap-2 shadow-md cursor-pointer transition-transform"
            >
              {isSharingImage ? (
                <>
                  <span className="material-symbols-outlined text-[16px] animate-spin">
                    progress_activity
                  </span>
                  <span>Generating...</span>
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-[18px]">
                    {isImageMode ? 'share' : 'send'}
                  </span>
                  <span>Share on WhatsApp</span>
                </>
              )}
            </button>
          </div>

          {(onPrintA4 || onPrint) && (
            <div
              data-testid="share-hub-secondary-actions"
              className="flex items-center gap-2 pt-2.5 border-t border-outline-variant/20"
            >
              {onPrintA4 && (
                <button
                  type="button"
                  data-testid="btn-share-hub-a4"
                  onClick={() => {
                    onPrintA4();
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 rounded-xl border border-outline-variant/40 bg-surface hover:bg-surface-container flex items-center justify-center gap-2 text-xs font-bold text-on-surface transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">picture_as_pdf</span>
                  <span>A4 / PDF</span>
                </button>
              )}
              {onPrint && (
                <button
                  type="button"
                  data-testid="btn-share-hub-print"
                  onClick={() => {
                    onPrint();
                    onClose();
                  }}
                  className="flex-1 py-2 px-3 rounded-xl border border-outline-variant/40 bg-surface hover:bg-surface-container flex items-center justify-center gap-2 text-xs font-bold text-on-surface transition-all cursor-pointer shadow-xs active:scale-95"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">print</span>
                  <span>Print</span>
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

import React, { useState, useMemo } from 'react';
import { PassbookEntry } from './usePartyPassbook.ts';
import { Party } from '../../models/party.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InvoiceDocumentModal } from '../Invoicing/InvoiceDocumentModal.tsx';
import { ConfirmDeleteModal } from '../Common/ConfirmDeleteModal.tsx';
import { WhatsAppShareModal } from '../Common/WhatsAppShareModal.tsx';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import {
  buildPaymentReceiptText,
  PaymentReceiptParams,
} from '../../core/utils/paymentReceiptText.ts';
import { printAccountingVoucher } from '../../core/utils/voucherDocumentPrinter.ts';
import { Voucher } from '../../core/accounting/voucherTypes.ts';

export interface PartyPaymentPreviewModalProps {
  entry: PassbookEntry | null;
  party: Party;
  company: CompanyProfile;
  isOpen?: boolean;
  onClose: () => void;
  onEdit?: (entry: PassbookEntry) => void;
  onDelete?: (entry: PassbookEntry) => void;
  onRefresh?: () => void;
}

interface PartyPaymentPreviewModalContentProps extends PartyPaymentPreviewModalProps {
  entry: PassbookEntry;
}

const PartyPaymentPreviewModalContent: React.FC<PartyPaymentPreviewModalContentProps> = ({
  entry,
  party,
  company,
  isOpen = true,
  onClose,
  onEdit,
  onDelete,
  onRefresh: _onRefresh,
}) => {
  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isWhatsAppOpen, setIsWhatsAppOpen] = useState(false);

  const isReceipt = entry.type === 'PAYMENT_IN';
  const isPayment = entry.type === 'PAYMENT_OUT';
  const isOpening = entry.type === 'OPENING' || Boolean(entry.isOpening);

  const amountVal = isReceipt
    ? (entry.credit || 0)
    : isPayment
    ? (entry.debit || 0)
    : (entry.debit || entry.credit || Math.abs(party.openingBalance || 0));

  const docNumber = entry.docNumber || (isOpening ? 'OPENING' : 'VOUCHER');

  const voucherTitle = isReceipt
    ? `Payment In #${docNumber}`
    : isPayment
    ? `Payment Out #${docNumber}`
    : `Opening Balance`;

  const titleNode = (
    <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar py-0.5">
      <h3 className="font-bold text-sm text-on-surface truncate shrink-0">
        {voucherTitle}
      </h3>
      {entry.status && (
        <span
          className={`text-[9px] font-bold px-1.5 py-0.2 rounded-full whitespace-nowrap shrink-0 ${
            entry.status === 'PAID'
              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
              : entry.status === 'PARTIAL'
              ? 'bg-amber-50 text-amber-700 border border-amber-200'
              : entry.status === 'OPENING'
              ? 'bg-slate-100 text-slate-700 border border-slate-200'
              : 'bg-rose-50 text-rose-700 border border-rose-200'
          }`}
        >
          {entry.status}
        </span>
      )}
    </div>
  );

  const leadingAction = onDelete ? (
    <button
      type="button"
      data-testid="delete-payment-btn"
      onClick={() => setIsDeleteModalOpen(true)}
      className="w-8 h-8 rounded-xl bg-error/15 text-error hover:bg-error/25 flex items-center justify-center flex-shrink-0 cursor-pointer transition-colors"
      title="Delete / Reverse Transaction"
      aria-label="Delete transaction"
    >
      <span className="material-symbols-outlined text-[18px]">delete</span>
    </button>
  ) : (
    <div
      className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${
        isReceipt
          ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
          : isPayment
          ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
          : 'bg-indigo-500/15 text-indigo-600 dark:text-indigo-400'
      }`}
    >
      <span className="material-symbols-outlined text-[18px]">
        {isReceipt ? 'call_received' : isPayment ? 'call_made' : 'account_balance_wallet'}
      </span>
    </div>
  );

  const trailingAction = onEdit ? (
    <button
      type="button"
      data-testid="edit-payment-btn"
      onClick={() => {
        onClose();
        onEdit(entry);
      }}
      className="py-1 px-2.5 rounded-xl bg-surface-container hover:bg-surface-container-high text-on-surface font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
      title="Edit Transaction"
    >
      <span className="material-symbols-outlined text-[16px]">edit</span>
      <span>Edit</span>
    </button>
  ) : undefined;

  const linkedDocs = useMemo(() => {
    const list: { number: string; type: string; amount: number }[] = [];
    if (entry.rawVoucher?.paymentAllocations && entry.rawVoucher.paymentAllocations.length > 0) {
      for (const a of entry.rawVoucher.paymentAllocations) {
        list.push({
          number: a.documentNumber || a.documentId,
          type: a.documentType === 'INVOICE' ? 'Sales Invoice' : a.documentType === 'PURCHASE' ? 'Purchase Bill' : 'Document',
          amount: a.amount,
        });
      }
    } else if (entry.rawInvoice) {
      list.push({
        number: `#${entry.rawInvoice.invoiceNumber}`,
        type: 'Sales Invoice',
        amount: entry.credit,
      });
    } else if (entry.rawPurchase) {
      list.push({
        number: `#${entry.rawPurchase.billNumber}`,
        type: 'Purchase Bill',
        amount: entry.debit,
      });
    }
    return list;
  }, [entry]);

  const notes = entry.description || entry.rawVoucher?.narration || '';

  const paymentParams: PaymentReceiptParams = useMemo(() => {
    return {
      companyName: company?.tradeName || company?.businessName || 'Business',
      heading: isReceipt ? 'Payment In Receipt' : isOpening ? 'Opening Balance' : 'Payment Out Voucher',
      docNumber: entry.docNumber,
      date: formatDate(entry.date),
      partyName: party.name,
      amount: amountVal,
      paymentMode: entry.paymentMode || 'CASH',
      notes,
      partyBalance: getPartyTotalBalanceDue(party) ?? party.currentBalance,
    };
  }, [company, isReceipt, isOpening, entry, party, amountVal, notes]);

  const paymentShareText = useMemo(() => {
    return buildPaymentReceiptText(paymentParams);
  }, [paymentParams]);

  const handlePrint = () => {
    if (entry.rawVoucher) {
      printAccountingVoucher(company, entry.rawVoucher);
      return;
    }
    const syntheticVoucher: Voucher = {
      id: entry.id,
      voucherNumber: entry.docNumber || 'PAYMENT',
      voucherType: isReceipt ? 'RECEIPT' : isOpening ? 'JOURNAL' : 'PAYMENT',
      date: entry.date,
      entries: [
        {
          accountId: party.id,
          accountName: party.name,
          debit: entry.debit || 0,
          credit: entry.credit || 0,
        },
      ],
      narration: notes,
      totalAmount: amountVal,
      createdAt: new Date().toISOString(),
      partyId: party.id,
      partyName: party.name,
    };
    printAccountingVoucher(company, syntheticVoucher);
  };

  const footerNode = (
    <div className="flex items-center justify-end gap-2">
      {/* Print Button */}
      <button
        type="button"
        data-testid="print-payment-btn"
        onClick={handlePrint}
        className="flex-1 min-w-[100px] py-2 px-3.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs active:scale-95 cursor-pointer flex items-center justify-center gap-1.5 hover:bg-secondary/90 transition-all"
        title="Print Voucher"
      >
        <span className="material-symbols-outlined text-[16px]">print</span>
        <span>Print</span>
      </button>

      {/* WhatsApp Share Button */}
      <button
        type="button"
        data-testid="whatsapp-payment-btn"
        onClick={() => setIsWhatsAppOpen(true)}
        className="flex-1 min-w-[100px] py-2 px-3 rounded-xl bg-[#25D366]/15 hover:bg-[#25D366]/25 text-[#25D366] font-bold text-xs cursor-pointer flex items-center justify-center gap-1 active:scale-95 transition-all"
        title="Share via WhatsApp"
      >
        <span className="material-symbols-outlined text-[16px]">send</span>
        <span>WhatsApp</span>
      </button>
    </div>
  );

  return (
    <>
      <InvoiceDocumentModal
        isOpen={isOpen}
        onClose={onClose}
        title={titleNode}
        headerLeading={leadingAction}
        headerTrailing={trailingAction}
        closeAriaLabel="Close transaction details"
        maxWidth="xl"
        customFooter={footerNode}
        backNavPriority={25}
      >
        {/* Party Summary */}
        <div className="flex items-center justify-between text-xs bg-surface-container-low/70 py-2 px-3 rounded-xl border border-outline-variant/20">
          <div className="flex items-center gap-2 min-w-0">
            <div className="w-7 h-7 rounded-lg bg-surface-container flex items-center justify-center text-on-surface-variant shrink-0 font-bold text-xs">
              {party.name.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <span className="font-bold text-slate-900 dark:text-on-surface truncate block">
                {party.name}
              </span>
              <span className="text-[10px] text-slate-500 font-medium">
                {party.phone ? `Phone: ${party.phone}` : party.type === 'SUPPLIER' ? 'Supplier' : 'Customer'}
              </span>
            </div>
          </div>
          {party.gstin && (
            <div className="text-right shrink-0">
              <span className="text-[10px] text-slate-500 uppercase tracking-wider block font-medium">GSTIN</span>
              <span className="text-xs font-mono font-semibold text-slate-700 dark:text-slate-300">{party.gstin}</span>
            </div>
          )}
        </div>

        {/* Main Amount Card */}
        <div className="p-4 rounded-2xl bg-surface-container-lowest border border-outline-variant/30 shadow-xs flex flex-col items-center justify-center gap-1 text-center">
          <span className="text-xs font-bold text-on-surface-variant uppercase tracking-wider">
            {isReceipt ? 'Amount Received' : isPayment ? 'Amount Paid' : 'Opening Amount'}
          </span>
          <span
            className={`font-currency-display-mobile text-2xl sm:text-3xl font-black ${
              isReceipt
                ? 'text-emerald-700 dark:text-emerald-400'
                : isPayment
                ? 'text-rose-700 dark:text-rose-400'
                : 'text-slate-900 dark:text-on-surface'
            }`}
          >
            {isReceipt ? '+' : isPayment ? '−' : ''} {formatINR(amountVal)}
          </span>
          <div className="flex items-center gap-2 mt-1 flex-wrap justify-center text-xs text-on-surface-variant font-medium">
            <span className="flex items-center gap-1 bg-surface-container px-2 py-0.5 rounded-full text-[11px] font-semibold text-on-surface">
              <span className="material-symbols-outlined text-[13px]">
                {entry.paymentMode === 'BANK' ? 'account_balance' : entry.paymentMode === 'UPI' ? 'qr_code_2' : 'payments'}
              </span>
              <span>{entry.paymentMode || 'Cash'}</span>
            </span>
            <span>•</span>
            <span>Date: {formatDate(entry.date)}</span>
            {entry.docNumber && (
              <>
                <span>•</span>
                <span className="font-mono">#{entry.docNumber}</span>
              </>
            )}
          </div>
        </div>

        {/* Linked Documents (if any) */}
        {linkedDocs.length > 0 && (
          <div className="p-3 rounded-2xl bg-surface-container-low/60 border border-outline-variant/20 flex flex-col gap-2">
            <div className="flex items-center justify-between text-xs font-bold text-on-surface">
              <span className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[15px] text-secondary">link</span>
                <span>Linked Documents ({linkedDocs.length})</span>
              </span>
            </div>
            <div className="flex flex-col gap-1.5 max-h-[25vh] overflow-y-auto divide-y divide-outline-variant/15 text-xs">
              {linkedDocs.map((doc, idx) => (
                <div key={idx} className="pt-1.5 pb-0.5 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <span className="font-bold text-on-surface truncate block font-mono">
                      {doc.number}
                    </span>
                    <span className="text-[10px] text-on-surface-variant">
                      {doc.type}
                    </span>
                  </div>
                  <span className="font-extrabold text-on-surface whitespace-nowrap tabular-nums">
                    {formatINR(doc.amount)}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Notes / Narration */}
        {notes && (
          <div className="p-3 rounded-xl bg-surface-container-low/50 border border-outline-variant/20 text-xs text-on-surface-variant">
            <span className="font-bold text-[10px] uppercase text-outline block mb-0.5">Notes / Narration</span>
            <p className="whitespace-pre-wrap">{notes}</p>
          </div>
        )}

        {/* Running Balance Impact Bar */}
        <div className="flex items-center justify-between px-3 py-2 rounded-xl bg-surface-container text-xs border border-outline-variant/15">
          <div className="flex items-center gap-1.5 min-w-0">
            <span className="material-symbols-outlined text-secondary text-[16px]">account_balance_wallet</span>
            <span className="text-[11px] font-medium text-on-surface-variant truncate">
              Party Ledger Balance after Entry
            </span>
          </div>
          <span className="font-extrabold text-xs text-slate-900 dark:text-on-surface whitespace-nowrap tabular-nums">
            {formatINR(Math.abs(entry.runningBalance))} {entry.runningBalance > 0 ? (party.type === 'SUPPLIER' ? 'Payable' : 'Receivable') : entry.runningBalance < 0 ? (party.type === 'SUPPLIER' ? 'Advance' : 'Credit') : 'Settled'}
          </span>
        </div>
      </InvoiceDocumentModal>

      {/* Delete / Reversal Confirmation Dialog */}
      {isDeleteModalOpen && (
        <ConfirmDeleteModal
          isOpen={isDeleteModalOpen}
          title={isOpening ? 'Clear Opening Balance?' : 'Delete Transaction?'}
          recordName={`${voucherTitle}`}
          description={
            isOpening
              ? 'Are you sure you want to clear the opening balance for this party? Ledger balances will be recalculated.'
              : 'Are you sure you want to reverse/delete this transaction? Related payment allocations and party balances will be adjusted.'
          }
          confirmText={isOpening ? 'Clear Opening Balance' : 'Delete Transaction'}
          onConfirm={() => {
            setIsDeleteModalOpen(false);
            onDelete?.(entry);
            onClose();
          }}
          onClose={() => setIsDeleteModalOpen(false)}
        />
      )}

      {/* WhatsApp Share Modal */}
      {isWhatsAppOpen && (
        <WhatsAppShareModal
          isOpen={isWhatsAppOpen}
          onClose={() => setIsWhatsAppOpen(false)}
          company={company}
          party={party}
          initialPhone={party.phone}
          initialBalance={party.currentBalance}
          initialTotalBalanceDue={getPartyTotalBalanceDue(party) ?? undefined}
          paymentShareText={paymentShareText}
          paymentReceiptParams={paymentParams}
          onPrint={handlePrint}
        />
      )}
    </>
  );
};

export const PartyPaymentPreviewModal: React.FC<PartyPaymentPreviewModalProps> = ({
  isOpen = true,
  entry,
  ...props
}) => {
  if (!isOpen || !entry) return null;
  return <PartyPaymentPreviewModalContent isOpen={isOpen} entry={entry} {...props} />;
};

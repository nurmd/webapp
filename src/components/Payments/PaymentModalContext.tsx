import React, { createContext, useContext, useState, useCallback, useMemo, useEffect } from 'react';
import { Party } from '../../models/party.ts';
import { Invoice, PaymentSplit } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { BankAccount } from '../../models/bankAccount.ts';
import { PaymentAllocation } from '../../core/accounting/voucherTypes.ts';
import { RecordPaymentModal } from '../Parties/RecordPaymentModal.tsx';
import { db } from '../../services/db.ts';

export interface OpenPaymentModalOptions {
  flow?: 'IN' | 'OUT';
  party?: Party;
  partyId?: string;
  onSuccess?: () => void;
}

export interface PaymentModalContextType {
  openPaymentModal: (options?: OpenPaymentModalOptions) => void;
  closePaymentModal: () => void;
  isOpen: boolean;
  flow: 'IN' | 'OUT';
  party?: Party;
  isAvailable: boolean;
}

const PaymentModalContext = createContext<PaymentModalContextType | undefined>(undefined);

let globalOpenPaymentModal: ((options?: OpenPaymentModalOptions) => void) | null = null;
let globalClosePaymentModal: (() => void) | null = null;

export const openPaymentModal = (options?: OpenPaymentModalOptions) => {
  if (globalOpenPaymentModal) {
    globalOpenPaymentModal(options);
  } else {
    window.dispatchEvent(new CustomEvent('open_payment_modal', { detail: options }));
  }
};

export const closePaymentModal = () => {
  if (globalClosePaymentModal) {
    globalClosePaymentModal();
  } else {
    window.dispatchEvent(new CustomEvent('close_payment_modal'));
  }
};

export const usePaymentModal = (): PaymentModalContextType => {
  const context = useContext(PaymentModalContext);
  if (!context) {
    return {
      openPaymentModal,
      closePaymentModal,
      isOpen: false,
      flow: 'IN',
      party: undefined,
      isAvailable: globalOpenPaymentModal !== null,
    };
  }
  return context;
};

export interface PaymentModalProviderProps {
  children: React.ReactNode;
  onRecordPartyPayment?: (
    party: Party,
    amount: number,
    paymentMode: string,
    notes: string,
    paymentType?: 'IN' | 'OUT',
    paymentSplits?: PaymentSplit[],
    discount?: number,
    bankAccountId?: string,
    allocations?: PaymentAllocation[],
    allocationMode?: 'MANUAL' | 'AUTO_FIFO' | 'UNALLOCATED' | 'SOURCE_DOCUMENT',
    paymentDate?: string
  ) => boolean | void;
  parties?: Party[];
  invoices?: Invoice[];
  purchases?: PurchaseBill[];
  bankAccounts?: BankAccount[];
  onRefresh?: () => void;
}

export const PaymentModalProvider: React.FC<PaymentModalProviderProps> = ({
  children,
  onRecordPartyPayment,
  parties,
  invoices,
  purchases,
  bankAccounts,
  onRefresh,
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [modalOptions, setModalOptions] = useState<OpenPaymentModalOptions>({});
  const [openCount, setOpenCount] = useState(0);

  const openModal = useCallback((options?: OpenPaymentModalOptions) => {
    setModalOptions(options || {});
    setOpenCount((c) => c + 1);
    setIsOpen(true);
  }, []);

  const closeModal = useCallback(() => {
    setIsOpen(false);
  }, []);

  useEffect(() => {
    globalOpenPaymentModal = openModal;
    globalClosePaymentModal = closeModal;

    const handleOpenEvent = (e: Event) => {
      const detail = (e as CustomEvent<OpenPaymentModalOptions>).detail;
      openModal(detail);
    };

    const handleCloseEvent = () => {
      closeModal();
    };

    window.addEventListener('open_payment_modal', handleOpenEvent);
    window.addEventListener('close_payment_modal', handleCloseEvent);

    return () => {
      globalOpenPaymentModal = null;
      globalClosePaymentModal = null;
      window.removeEventListener('open_payment_modal', handleOpenEvent);
      window.removeEventListener('close_payment_modal', handleCloseEvent);
    };
  }, [openModal, closeModal]);

  const resolvedParty = useMemo(() => {
    if (modalOptions.party) return modalOptions.party;
    if (modalOptions.partyId) {
      const allParties = parties && parties.length > 0 ? parties : db.getParties();
      return allParties.find((p) => p.id === modalOptions.partyId);
    }
    return undefined;
  }, [modalOptions.party, modalOptions.partyId, parties]);

  const resolvedFlow: 'IN' | 'OUT' =
    modalOptions.flow || (resolvedParty?.type === 'SUPPLIER' ? 'OUT' : 'IN');

  const contextValue: PaymentModalContextType = useMemo(
    () => ({
      openPaymentModal: openModal,
      closePaymentModal: closeModal,
      isOpen,
      flow: resolvedFlow,
      party: resolvedParty,
      isAvailable: true,
    }),
    [openModal, closeModal, isOpen, resolvedFlow, resolvedParty]
  );

  return (
    <PaymentModalContext.Provider value={contextValue}>
      {children}
      {isOpen && (
        <RecordPaymentModal
          key={`${resolvedFlow}-${resolvedParty?.id || 'all'}-${openCount}`}
          isOpen={isOpen}
          asDialog={true}
          onClose={closeModal}
          party={resolvedParty}
          parties={parties && parties.length > 0 ? parties : db.getParties()}
          invoices={invoices && invoices.length > 0 ? invoices : db.getInvoices()}
          purchases={purchases && purchases.length > 0 ? purchases : db.getPurchases()}
          bankAccounts={bankAccounts && bankAccounts.length > 0 ? bankAccounts : db.getBankAccounts()}
          initialPaymentType={resolvedFlow}
          onRecordPayment={(
            party,
            amount,
            paymentMode,
            notes,
            paymentType,
            paymentSplits,
            discount,
            bankAccountId,
            allocations,
            allocationMode,
            paymentDate
          ) => {
            const handler = onRecordPartyPayment;
            if (!handler) {
              return false;
            }
            const res = handler(
              party,
              amount,
              paymentMode,
              notes,
              paymentType,
              paymentSplits,
              discount,
              bankAccountId,
              allocations,
              allocationMode,
              paymentDate
            );
            if (res === false) {
              return false;
            }
            closeModal();
            modalOptions.onSuccess?.();
            return true;
          }}
          onRefresh={onRefresh}
        />
      )}
    </PaymentModalContext.Provider>
  );
};

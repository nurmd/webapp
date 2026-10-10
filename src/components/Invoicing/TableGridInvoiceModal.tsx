import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, PaymentMode, PaymentStatus, PaymentSplit } from '../../models/invoice.ts';
import { parseSplitsFromInvoice, formatSplitNotes } from '../../core/accounting/paymentSplitUtils.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { SelectPartyModal } from '../Parties/SelectPartyModal.tsx';
import { AddEditPartyModal } from '../Parties/AddEditPartyModal.tsx';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { ThermalPrintModal } from '../Printing/ThermalPrintModal.tsx';
import { WhatsAppShareModal } from '../WhatsApp/WhatsAppShareModal.tsx';
import { audioService } from '../../services/barcodeService.ts';
import { InvoiceItemModal, InvoiceItemData } from './InvoiceItemModal.tsx';
import { db } from '../../services/db.ts';
import {
  generateNextInvoiceNumber,
  findConflictingInvoice,
} from '../../core/utils/invoiceNumber.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { InvoiceHeaderMeta } from './components/InvoiceHeaderMeta.tsx';
import { InvoiceLineItemsGrid, GridRow } from './components/InvoiceLineItemsGrid.tsx';
import { DocumentTotalsSummary } from '../Common/Billing/DocumentTotalsSummary.tsx';
import { PaymentSettlementDock } from '../Common/Billing/PaymentSettlementDock.tsx';
import { InvoiceActionDock } from './components/InvoiceActionDock.tsx';
import { InvoiceNumberDateModal } from './components/InvoiceNumberDateModal.tsx';
import { DueDatePresetModal } from '../Common/Billing/DueDatePresetModal.tsx';
import { BillDiscountModal } from '../Common/Billing/BillDiscountModal.tsx';

export type { GridRow };

interface TableGridInvoiceModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  initialInvoice?: Invoice | null;
  initialParty?: Party | null;
  existingInvoices?: Invoice[];
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  onAddNewParty?: () => void;
  onPartyCreated?: (party: Party) => void;
}

export const TableGridInvoiceModal: React.FC<TableGridInvoiceModalProps> = ({
  company,
  parties,
  itemsCatalog,
  initialInvoice,
  initialParty,
  existingInvoices,
  onClose,
  onSave,
  onAddNewParty,
  onPartyCreated,
}) => {
  // Parties synchronized with direct additions
  const [localParties, setLocalParties] = useState<Party[]>(parties);
  useEffect(() => {
    setLocalParties(parties);
    if (selectedParty?.id) {
      const fresh = parties.find((p) => p.id === selectedParty.id) || db.getParties().find((p) => p.id === selectedParty.id);
      if (fresh) {
        setSelectedParty(fresh);
      }
    }
  }, [parties]);

  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);

  // Items catalog synchronized with direct additions
  const [catalog, setCatalog] = useState<InventoryItem[]>(itemsCatalog);
  useEffect(() => {
    setCatalog(itemsCatalog);
  }, [itemsCatalog]);

  const handleItemCreated = (newItem: InventoryItem) => {
    setCatalog((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
  };

  const handlePartyCreated = (newParty: Party) => {
    db.saveParty(newParty);
    setLocalParties((prev) => [newParty, ...prev.filter((p) => p.id !== newParty.id)]);
    setSelectedParty(newParty);
    setPosStateCode(newParty.stateCode);
    setIsAddPartyModalOpen(false);
    setIsPartyModalOpen(false);
    onPartyCreated?.(newParty);
  };

  // All invoices in database for uniqueness verification
  const allInvoices = useMemo(() => {
    return existingInvoices && existingInvoices.length > 0 ? existingInvoices : db.getInvoices();
  }, [existingInvoices]);

  // Party selection
  const [selectedParty, setSelectedParty] = useState<Party | null>(() => {
    if (initialInvoice) {
      const dbParties = db.getParties();
      const allKnownParties = [...parties, ...dbParties.filter((dp) => !parties.some((p) => p.id === dp.id))];
      const found = allKnownParties.find(
        (p) =>
          (initialInvoice.partyId && p.id === initialInvoice.partyId) ||
          (p.name && initialInvoice.partyName && p.name.trim().toLowerCase() === initialInvoice.partyName.trim().toLowerCase())
      );
      if (found) return found;
      return {
        id: initialInvoice.partyId || 'CUSTOM_PARTY',
        name: initialInvoice.partyName,
        gstin: initialInvoice.partyGstin,
        phone: '',
        email: '',
        billingAddress: initialInvoice.partyAddress,
        stateCode: initialInvoice.partyStateCode,
        type: 'CUSTOMER',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (initialParty) {
      const dbParty = initialParty.id ? db.getParties().find((p) => p.id === initialParty.id) : null;
      return dbParty || initialParty;
    }
    return null;
  });

  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  // Invoice numbers & dates (Sequential & Guaranteed Unique)
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    if (initialInvoice?.invoiceNumber) return initialInvoice.invoiceNumber;
    const invs = existingInvoices && existingInvoices.length > 0 ? existingInvoices : db.getInvoices();
    return generateNextInvoiceNumber(company.invoicePrefix || 'INV-', invs);
  });
  const [isInvoiceNumberModalOpen, setIsInvoiceNumberModalOpen] = useState(false);
  const [invoiceConflictError, setInvoiceConflictError] = useState<string | null>(null);

  // Real-time conflict checks against all invoices
  const currentConflict = useMemo(() => {
    return findConflictingInvoice(invoiceNumber, initialInvoice?.id, allInvoices);
  }, [invoiceNumber, initialInvoice, allInvoices]);

  const [invoiceDate, setInvoiceDate] = useState<string>(
    initialInvoice ? initialInvoice.date : new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState<string>(
    initialInvoice?.dueDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 15);
        return d.toISOString().split('T')[0];
      })()
  );
  const [isDueDateModalOpen, setIsDueDateModalOpen] = useState(false);

  // Place of supply
  const isGstActive = company.isGstEnabled !== false;
  const [posStateCode, setPosStateCode] = useState<string>(
    initialInvoice?.placeOfSupplyStateCode || selectedParty?.stateCode || company.stateCode
  );

  // Overall Discount & Shipping
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number>(0);
  const [shippingAmount, setShippingAmount] = useState<number>(initialInvoice?.shippingAmount || 0);
  const [isExtraDiscountModalOpen, setIsExtraDiscountModalOpen] = useState(false);

  // Scanner modal
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Preview & WhatsApp Modals
  const [previewInvoiceData, setPreviewInvoiceData] = useState<Invoice | null>(null);
  const [whatsAppInvoiceData, setWhatsAppInvoiceData] = useState<Invoice | null>(null);

  // Detailed Tax info modal
  const [isTaxDetailsOpen, setIsTaxDetailsOpen] = useState(false);

  // Dedicated Add/Edit Item Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  // Sub-modal back navigation (priority 20 closes inner modals before main invoice modal)
  const isAnySubModalOpen =
    isItemModalOpen ||
    isAddPartyModalOpen ||
    isPartyModalOpen ||
    isScannerOpen ||
    !!previewInvoiceData ||
    !!whatsAppInvoiceData ||
    isInvoiceNumberModalOpen ||
    isDueDateModalOpen ||
    isExtraDiscountModalOpen ||
    isTaxDetailsOpen;

  useBackNavigation(() => {
    if (isItemModalOpen) {
      setIsItemModalOpen(false);
      setEditingRowIndex(null);
      return true;
    }
    if (isAddPartyModalOpen) {
      setIsAddPartyModalOpen(false);
      return true;
    }
    if (isPartyModalOpen) {
      setIsPartyModalOpen(false);
      return true;
    }
    if (isScannerOpen) {
      setIsScannerOpen(false);
      return true;
    }
    if (previewInvoiceData) {
      setPreviewInvoiceData(null);
      return true;
    }
    if (whatsAppInvoiceData) {
      setWhatsAppInvoiceData(null);
      return true;
    }
    if (isInvoiceNumberModalOpen) {
      setIsInvoiceNumberModalOpen(false);
      return true;
    }
    if (isDueDateModalOpen) {
      setIsDueDateModalOpen(false);
      return true;
    }
    if (isExtraDiscountModalOpen) {
      setIsExtraDiscountModalOpen(false);
      return true;
    }
    if (isTaxDetailsOpen) {
      setIsTaxDetailsOpen(false);
      return true;
    }
    return false;
  }, isAnySubModalOpen, 20);

  const handleOpenAddItem = useCallback(() => {
    setEditingRowIndex(null);
    setIsItemModalOpen(true);
  }, []);

  const handleOpenEditItem = (index: number) => {
    setEditingRowIndex(index);
    setIsItemModalOpen(true);
  };

  const handleSaveItemModal = (itemData: GridRow) => {
    if (editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length) {
      const updated = [...rows];
      updated[editingRowIndex] = itemData;
      setRows(updated);
    } else {
      setRows([...rows, itemData]);
    }
    setEditingRowIndex(null);
  };

  const handleDeleteItemModal = () => {
    if (editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length) {
      setRows(rows.filter((_, idx) => idx !== editingRowIndex));
    }
    setEditingRowIndex(null);
  };

  // Grid rows
  const [rows, setRows] = useState<GridRow[]>(() => {
    if (initialInvoice && initialInvoice.items.length > 0) {
      return initialInvoice.items.map((it) => ({
        itemId: it.itemId,
        name: it.name,
        description: it.description || '',
        hsnSacCode: it.hsnSacCode,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        mrp: it.mrp,
        discountPercent: it.discountPercent || 0,
        gstRate: it.gstRate,
      }));
    }
    return [];
  });

  // Calculate taxes and items
  const calcInputs = useMemo(() => {
    return rows.map((r) => {
      const itemDisc = Number(r.discountPercent) || 0;
      const combinedDisc = overallDiscountPercent > 0
        ? Number((100 * (1 - (1 - itemDisc / 100) * (1 - overallDiscountPercent / 100))).toFixed(4))
        : itemDisc;

      return {
        quantity: Number(r.quantity) || 1,
        unitPrice: Number(r.unitPrice) || 0,
        discountPercent: combinedDisc,
        gstRate: isGstActive ? (Number(r.gstRate) || 0) : 0,
      };
    });
  }, [rows, isGstActive, overallDiscountPercent]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(company.stateCode, posStateCode, calcInputs);
  }, [company.stateCode, posStateCode, calcInputs]);

  // Overall discount deduction amount
  const overallDiscountAmount = useMemo(() => {
    if (overallDiscountPercent <= 0) return 0;
    const rawTaxable = rows.reduce((sum, r) => {
      const gross = (Number(r.quantity) || 1) * (Number(r.unitPrice) || 0);
      const itemDisc = (gross * (Number(r.discountPercent) || 0)) / 100;
      return sum + (gross - itemDisc);
    }, 0);
    return Number(((rawTaxable * overallDiscountPercent) / 100).toFixed(2));
  }, [rows, overallDiscountPercent]);

  const finalGrandTotal = useMemo(() => {
    const preRound = calcSummary.netAmount + (Number(shippingAmount) || 0);
    return Math.max(0, Math.round(preRound));
  }, [calcSummary.netAmount, shippingAmount]);

  const finalRoundOff = useMemo(() => {
    const preRound = calcSummary.netAmount + (Number(shippingAmount) || 0);
    return Number((finalGrandTotal - preRound).toFixed(2));
  }, [calcSummary.netAmount, shippingAmount, finalGrandTotal]);

  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>(() => {
    return parseSplitsFromInvoice(initialInvoice, finalGrandTotal);
  });

  const [isManualAmount, setIsManualAmount] = useState<boolean>(() => {
    if (!initialInvoice) return false;
    const initialSplits = parseSplitsFromInvoice(initialInvoice, finalGrandTotal);
    return Boolean(
      initialSplits.length > 1 ||
      initialInvoice.paymentStatus === 'PARTIAL' ||
      (initialInvoice.paymentSplits && initialInvoice.paymentSplits.length > 1) ||
      (initialInvoice.notes && (initialInvoice.notes.includes('Split Payment') || initialInvoice.notes.includes('Split:')))
    );
  });

  // Auto-sync single non-credit payment with finalGrandTotal
  useEffect(() => {
    if (!isManualAmount && paymentSplits.length === 1) {
      if (paymentSplits[0].mode === 'CREDIT') {
        if (paymentSplits[0].amount !== 0) {
          setPaymentSplits([{ id: paymentSplits[0].id, mode: 'CREDIT', amount: 0 }]);
        }
      } else {
        if (paymentSplits[0].amount !== finalGrandTotal) {
          setPaymentSplits([{ id: paymentSplits[0].id, mode: paymentSplits[0].mode, amount: finalGrandTotal }]);
        }
      }
    }
  }, [finalGrandTotal, isManualAmount, paymentSplits]);

  const totalPaid = useMemo(() => {
    return paymentSplits.reduce((sum, s) => {
      if (s.mode === 'CREDIT') return sum;
      return sum + (Number(s.amount) || 0);
    }, 0);
  }, [paymentSplits]);

  const balanceDue = useMemo(() => {
    return Math.max(0, Number((finalGrandTotal - totalPaid).toFixed(2)));
  }, [finalGrandTotal, totalPaid]);

  const autoPaymentStatus: PaymentStatus = useMemo(() => {
    if (finalGrandTotal <= 0) {
      return 'PAID';
    }
    if (totalPaid >= finalGrandTotal) {
      return 'PAID';
    }
    if (totalPaid > 0) {
      return 'PARTIAL';
    }
    return 'UNPAID';
  }, [totalPaid, finalGrandTotal]);

  const handleUpdateSplitMode = (id: string, newMode: PaymentMode) => {
    if (newMode === 'SPLIT') {
      handleAddSplitMode();
      return;
    }
    setPaymentSplits((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (newMode === 'CREDIT') {
          return { ...s, mode: newMode, amount: 0 };
        }
        return {
          ...s,
          mode: newMode,
          amount: prev.length === 1 && !isManualAmount ? finalGrandTotal : s.mode === 'CREDIT' ? (balanceDue || finalGrandTotal) : s.amount,
        };
      })
    );
  };

  const handleUpdateSplitAmount = (id: string, newAmount: number) => {
    setIsManualAmount(true);
    setPaymentSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, amount: Math.max(0, newAmount) } : s))
    );
  };

  const handleAddSplitMode = () => {
    setIsManualAmount(true);
    const existingModes = new Set(paymentSplits.map((s) => s.mode));
    const candidateModes: PaymentMode[] = ['UPI', 'CASH', 'NET_BANKING', 'CARD', 'CHEQUE'];
    const nextMode = candidateModes.find((m) => !existingModes.has(m)) || 'UPI';

    const currentNonCreditTotal = paymentSplits.reduce(
      (acc, s) => (s.mode === 'CREDIT' ? acc : acc + (Number(s.amount) || 0)),
      0
    );
    const remaining = Math.max(0, Number((finalGrandTotal - currentNonCreditTotal).toFixed(2)));

    if (paymentSplits.length === 1 && paymentSplits[0].mode === 'CREDIT') {
      setPaymentSplits([
        { id: '1', mode: 'CASH', amount: 0 },
        { id: String(Date.now()), mode: 'CREDIT', amount: 0 },
      ]);
      return;
    }

    setPaymentSplits([
      ...paymentSplits,
      {
        id: String(Date.now()),
        mode: nextMode,
        amount: remaining,
      },
    ]);
  };

  const handleRemoveSplit = (id: string) => {
    const updated = paymentSplits.filter((s) => s.id !== id);
    if (updated.length === 1 && (updated[0].amount >= finalGrandTotal || updated[0].mode === 'CREDIT')) {
      setIsManualAmount(false);
    }
    setPaymentSplits(updated);
  };

  // Barcode scan handler
  const handleBarcodeScanned = (scannedCode: string) => {
    const code = scannedCode.trim().toLowerCase();
    const words = code.split(/\s+/).filter(Boolean);
    const found =
      itemsCatalog.find(
        (it) =>
          (it.barcode && it.barcode.toLowerCase() === code) ||
          (it.sku && it.sku.toLowerCase() === code) ||
          it.name.toLowerCase() === code
      ) ||
      itemsCatalog.find(
        (it) =>
          it.name.toLowerCase().includes(code) ||
          (it.barcode && it.barcode.toLowerCase().includes(code)) ||
          (it.sku && it.sku.toLowerCase().includes(code))
      ) ||
      (words.length > 1
        ? itemsCatalog.find((it) =>
            words.every(
              (w) =>
                it.name.toLowerCase().includes(w) ||
                (it.barcode && it.barcode.toLowerCase().includes(w)) ||
                (it.sku && it.sku.toLowerCase().includes(w))
            )
          )
        : undefined);

    if (found) {
      audioService.playScanSuccess();
      const existingIdx = rows.findIndex((r) => r.itemId === found.id);
      if (existingIdx !== -1) {
        const updated = [...rows];
        updated[existingIdx] = {
          ...updated[existingIdx],
          quantity: updated[existingIdx].quantity + 1,
        };
        setRows(updated);
      } else {
        setRows([
          ...rows,
          {
            itemId: found.id,
            name: found.name,
            description: '',
            hsnSacCode: found.hsnSacCode || '998313',
            quantity: 1,
            unit: found.unit || 'PCS',
            unitPrice: found.salePrice || 0,
            mrp: found.mrp || found.salePrice,
            discountPercent: 0,
            gstRate: found.gstRate ?? 18,
          },
        ]);
      }
      setIsScannerOpen(false);
    } else {
      alert(`No product found in catalog matching barcode: ${scannedCode}`);
    }
  };

  // Compile full invoice object
  const constructInvoiceObject = (): Invoice => {
    const invoiceItems: InvoiceItemEntry[] = rows.map((r, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: r.itemId || `CUSTOM-${Date.now()}-${idx}`,
        name: r.name || 'Billed Product / Service',
        description: r.description,
        hsnSacCode: isGstActive ? (r.hsnSacCode || '998313') : '',
        unit: (r.unit as any) || 'PCS',
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        mrp: r.mrp,
        discountPercent: r.discountPercent,
        discountAmount: calcItem?.discountAmount || 0,
        taxableAmount: calcItem?.taxableAmount || 0,
        gstRate: isGstActive ? (r.gstRate || 0) : 0,
        cgstAmount: isGstActive ? (calcItem?.cgstAmount || 0) : 0,
        sgstAmount: isGstActive ? (calcItem?.sgstAmount || 0) : 0,
        igstAmount: isGstActive ? (calcItem?.igstAmount || 0) : 0,
        cessAmount: isGstActive ? (calcItem?.cessAmount || 0) : 0,
        totalAmount: calcItem?.totalAmount || 0,
      };
    });

    const isB2B = Boolean(selectedParty?.gstin && selectedParty.gstin.length === 15);
    const nonCreditSplits = paymentSplits.filter((s) => s.mode !== 'CREDIT' && (Number(s.amount) || 0) > 0);
    let resolvedPaymentMode: PaymentMode;
    if (autoPaymentStatus === 'UNPAID' || nonCreditSplits.length === 0) {
      resolvedPaymentMode = 'CREDIT';
    } else if (nonCreditSplits.length === 1 && balanceDue <= 0.01) {
      resolvedPaymentMode = nonCreditSplits[0].mode;
    } else {
      resolvedPaymentMode = 'SPLIT';
    }

    const splitNote = formatSplitNotes(paymentSplits, balanceDue);
    const savedSplits: PaymentSplit[] = paymentSplits.map((s) => ({
      id: s.id,
      mode: s.mode,
      amount: s.mode === 'CREDIT' ? balanceDue : Number(s.amount) || 0,
    }));

    return {
      id: initialInvoice ? initialInvoice.id : `INV-${Date.now()}`,
      invoiceNumber: invoiceNumber.trim(),
      invoiceType: isB2B && isGstActive ? 'B2B' : 'B2CS',
      isGstInvoice: isGstActive,
      date: invoiceDate,
      dueDate: dueDate || undefined,
      partyId: selectedParty?.id,
      partyName: selectedParty?.name || 'Cash Counter Customer',
      partyGstin: isGstActive ? selectedParty?.gstin : undefined,
      partyAddress: selectedParty?.billingAddress || 'Local Counter',
      partyStateCode: posStateCode,
      placeOfSupplyStateCode: posStateCode,
      isIntraState: calcSummary.isIntraState,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: isGstActive ? calcSummary.totalCgst : 0,
      totalSgst: isGstActive ? calcSummary.totalSgst : 0,
      totalIgst: isGstActive ? calcSummary.totalIgst : 0,
      totalCess: isGstActive ? calcSummary.totalCess : 0,
      totalTax: isGstActive ? calcSummary.totalTax : 0,
      roundOff: finalRoundOff,
      shippingAmount: Number(shippingAmount) || 0,
      grandTotal: finalGrandTotal,
      amountInWords: amountInWords(finalGrandTotal),
      paymentMode: resolvedPaymentMode,
      paymentStatus: autoPaymentStatus,
      paidAmount: totalPaid,
      balanceAmount: balanceDue,
      paymentSplits: savedSplits,
      notes: splitNote || initialInvoice?.notes,
      createdAt: initialInvoice ? initialInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const handleSaveInvoice = useCallback((andShareWhatsApp = false) => {
    if (rows.length === 0) {
      alert('Please add at least one line item to the invoice.');
      return;
    }
    const hasEmpty = rows.some((r) => !r.name.trim());
    if (hasEmpty) {
      alert('Please provide item names for all line items.');
      return;
    }

    const trimmedNumber = invoiceNumber.trim();
    if (!trimmedNumber) {
      setInvoiceConflictError('Please enter a valid invoice number.');
      setIsInvoiceNumberModalOpen(true);
      return;
    }

    const conflict = findConflictingInvoice(trimmedNumber, initialInvoice?.id, allInvoices);
    if (conflict) {
      const errMsg = `Cannot issue invoice: Invoice number "${trimmedNumber}" already exists for ${conflict.partyName || 'Customer'} (${conflict.date || 'prior bill'}). Only unique invoice numbers are allowed under GST compliance.`;
      setInvoiceConflictError(errMsg);
      setIsInvoiceNumberModalOpen(true);
      return;
    }

    const newInvoice = constructInvoiceObject();
    onSave(newInvoice);

    if (andShareWhatsApp) {
      setWhatsAppInvoiceData(newInvoice);
    }
  }, [rows, invoiceNumber, initialInvoice, allInvoices, constructInvoiceObject, onSave]);

  // Global POS Keyboard Shortcuts (F2: Scanner, F8: Add Item, F9: Save, F10: Save & WhatsApp, F12: Party Selector)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isAnySubModalOpen) return;
      if (e.key === 'F2') {
        e.preventDefault();
        setIsScannerOpen(true);
      } else if (e.key === 'F8') {
        e.preventDefault();
        handleOpenAddItem();
      } else if (e.key === 'F9') {
        e.preventDefault();
        handleSaveInvoice(false);
      } else if (e.key === 'F10') {
        e.preventDefault();
        handleSaveInvoice(true);
      } else if (e.key === 'F12') {
        e.preventDefault();
        setIsPartyModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnySubModalOpen, handleOpenAddItem, handleSaveInvoice]);

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col min-h-screen overflow-x-hidden antialiased">
      {/* Main Full-Width Scrollable Workstation */}
      <main className="flex-1 flex flex-col relative w-full pt-14 pb-36 sm:pb-32 bg-surface overflow-y-auto">
        <div className="px-3 sm:px-6 py-3 flex flex-col gap-3 w-full">
          <InvoiceHeaderMeta
            onClose={onClose}
            initialInvoice={initialInvoice}
            invoiceNumber={invoiceNumber}
            invoiceDate={invoiceDate}
            dueDate={dueDate}
            posStateCode={posStateCode}
            isGstActive={isGstActive}
            isIntraState={calcSummary.isIntraState}
            selectedParty={selectedParty}
            currentConflict={currentConflict || null}
            invoiceConflictError={invoiceConflictError}
            allInvoices={allInvoices}
            onSelectPartyClick={() => setIsPartyModalOpen(true)}
            onClearParty={() => setSelectedParty(null)}
            onAddPartyClick={() => setIsAddPartyModalOpen(true)}
            onOpenInvoiceNumberModal={() => setIsInvoiceNumberModalOpen(true)}
            onOpenDueDateModal={() => setIsDueDateModalOpen(true)}
            onAutoFixConflict={(newNum) => {
              setInvoiceNumber(newNum);
              setInvoiceConflictError(null);
            }}
          />

          <InvoiceLineItemsGrid
            rows={rows}
            calcItems={calcSummary.items}
            isGstActive={isGstActive}
            onAddItem={handleOpenAddItem}
            onEditItem={handleOpenEditItem}
            onOpenScanner={() => setIsScannerOpen(true)}
          />

          <DocumentTotalsSummary
            title="Invoice Summary"
            totalGrossAmount={calcSummary.totalGrossAmount}
            totalTax={calcSummary.totalTax}
            totalCgst={calcSummary.totalCgst}
            totalSgst={calcSummary.totalSgst}
            totalIgst={calcSummary.totalIgst}
            totalTaxableAmount={calcSummary.totalTaxableAmount}
            isIntraState={calcSummary.isIntraState}
            isGstActive={isGstActive}
            roundOff={finalRoundOff}
            shippingAmount={shippingAmount}
            onChangeShipping={setShippingAmount}
            overallDiscountAmount={overallDiscountAmount}
            overallDiscountPercent={overallDiscountPercent}
            onOpenDiscountModal={() => setIsExtraDiscountModalOpen(true)}
            onRemoveDiscount={() => setOverallDiscountPercent(0)}
            isTaxDetailsOpen={isTaxDetailsOpen}
            onToggleTaxDetails={() => setIsTaxDetailsOpen(!isTaxDetailsOpen)}
            totalUnits={rows.reduce((sum, r) => sum + (Number(r.quantity) || 1), 0)}
            finalGrandTotal={finalGrandTotal}
            accentColor="secondary"
          />

          <PaymentSettlementDock
            paymentSplits={paymentSplits}
            autoPaymentStatus={autoPaymentStatus}
            balanceDue={balanceDue}
            onUpdateSplitMode={handleUpdateSplitMode}
            onUpdateSplitAmount={handleUpdateSplitAmount}
            onAddSplitMode={handleAddSplitMode}
            onRemoveSplit={handleRemoveSplit}
          />

          <div className="h-8" aria-hidden="true" />
        </div>
      </main>

      <InvoiceActionDock
        finalGrandTotal={finalGrandTotal}
        onPrintThermal={() => setPreviewInvoiceData(constructInvoiceObject())}
        onSaveInvoice={handleSaveInvoice}
      />

      {/* Select Party Modal */}
      {isPartyModalOpen && (
        <SelectPartyModal
          parties={localParties}
          onSelectParty={(p) => {
            const fresh = (p.id ? db.getParties().find((item) => item.id === p.id) : null) || p;
            setSelectedParty(fresh);
            setPosStateCode(fresh.stateCode);
            setIsPartyModalOpen(false);
          }}
          onClose={() => setIsPartyModalOpen(false)}
          onAddNewParty={() => {
            setIsPartyModalOpen(false);
            setIsAddPartyModalOpen(true);
          }}
        />
      )}

      {/* Add New Customer Modal directly in Invoice workflow */}
      {isAddPartyModalOpen && (
        <AddEditPartyModal
          isOpen={isAddPartyModalOpen}
          onClose={() => setIsAddPartyModalOpen(false)}
          editingParty={null}
          initialType="CUSTOMER"
          parties={localParties}
          onSave={handlePartyCreated}
        />
      )}

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      {/* Thermal POS Receipt Print Modal */}
      {previewInvoiceData && (
        <ThermalPrintModal
          invoice={previewInvoiceData}
          company={company}
          onClose={() => setPreviewInvoiceData(null)}
        />
      )}

      {/* WhatsApp Share Modal */}
      {whatsAppInvoiceData && (
        <WhatsAppShareModal
          invoice={whatsAppInvoiceData}
          company={company}
          onClose={() => {
            setWhatsAppInvoiceData(null);
            onClose();
          }}
        />
      )}

      {/* Edit Invoice Number Dialog */}
      <InvoiceNumberDateModal
        isOpen={isInvoiceNumberModalOpen}
        invoiceNumber={invoiceNumber}
        invoiceDate={invoiceDate}
        posStateCode={posStateCode}
        allInvoices={allInvoices}
        initialInvoiceId={initialInvoice?.id}
        onApply={({ invoiceNumber: newNum, invoiceDate: newDate, posStateCode: newPos }) => {
          setInvoiceNumber(newNum);
          setInvoiceDate(newDate);
          setPosStateCode(newPos);
          setInvoiceConflictError(null);
        }}
        onClose={() => setIsInvoiceNumberModalOpen(false)}
      />

      {/* Due Date Presets Dialog */}
      <DueDatePresetModal
        isOpen={isDueDateModalOpen}
        baseDate={invoiceDate}
        currentDueDate={dueDate}
        onSelectDueDate={setDueDate}
        onClose={() => setIsDueDateModalOpen(false)}
        accentColor="secondary"
      />

      {/* Extra Discount Modal */}
      <BillDiscountModal
        isOpen={isExtraDiscountModalOpen}
        overallDiscountPercent={overallDiscountPercent}
        overallDiscountAmount={overallDiscountAmount}
        taxableBaseAmount={calcSummary.totalTaxableAmount}
        onApplyDiscountPercent={setOverallDiscountPercent}
        onClose={() => setIsExtraDiscountModalOpen(false)}
      />

      {/* Add / Edit Bill Item Modal */}
      <InvoiceItemModal
        isOpen={isItemModalOpen}
        onClose={() => {
          setIsItemModalOpen(false);
          setEditingRowIndex(null);
        }}
        initialItem={
          editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length
            ? rows[editingRowIndex]
            : null
        }
        onSaveItem={handleSaveItemModal}
        onDeleteItem={editingRowIndex !== null ? handleDeleteItemModal : undefined}
        itemsCatalog={catalog}
        onItemCreated={handleItemCreated}
        isIntraState={calcSummary.isIntraState}
        isGstActive={isGstActive}
      />
    </div>
  );
};

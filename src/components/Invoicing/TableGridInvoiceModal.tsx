import React, { useState, useMemo, useEffect } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, PaymentMode, PaymentStatus, PaymentSplit } from '../../models/invoice.ts';
import { parseSplitsFromInvoice, formatSplitNotes } from '../../core/accounting/paymentSplitUtils.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
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
  suggestNextUniqueInvoiceNumber,
} from '../../core/utils/invoiceNumber.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';

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

export type GridRow = InvoiceItemData;

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

  // Party selection - clean start without dummy selection
  const [selectedParty, setSelectedParty] = useState<Party | null>(() => {
    if (initialInvoice) {
      const found = parties.find(
        (p) => p.id === initialInvoice.partyId || p.name === initialInvoice.partyName
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
      return initialParty;
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
  const [customInvoiceNumberInput, setCustomInvoiceNumberInput] = useState(invoiceNumber);
  const [invoiceConflictError, setInvoiceConflictError] = useState<string | null>(null);

  // Real-time conflict checks against all invoices
  const currentConflict = useMemo(() => {
    return findConflictingInvoice(invoiceNumber, initialInvoice?.id, allInvoices);
  }, [invoiceNumber, initialInvoice, allInvoices]);

  const dialogConflict = useMemo(() => {
    return findConflictingInvoice(customInvoiceNumberInput, initialInvoice?.id, allInvoices);
  }, [customInvoiceNumberInput, initialInvoice, allInvoices]);

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

  const handleOpenAddItem = () => {
    setEditingRowIndex(null);
    setIsItemModalOpen(true);
  };

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

  // Grid rows - Clean start with no dummy placeholder rows!
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

  // Calculate taxes and items (zero GST if company.isGstEnabled is false)
  // Incorporates overall bill discount into line-item tax calculations
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

  // Overall discount deduction amount across raw taxable value
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

  // Available Payment Modes
  const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
    { value: 'CASH', label: 'Cash' },
    { value: 'UPI', label: 'UPI / QR' },
    { value: 'NET_BANKING', label: 'Bank Transfer' },
    { value: 'CARD', label: 'Card' },
    { value: 'CHEQUE', label: 'Cheque' },
    { value: 'CREDIT', label: 'Credit (Unpaid)' },
    { value: 'SPLIT', label: 'Split Payment' },
  ];

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

  // Auto-sync single non-credit payment with finalGrandTotal if user hasn't explicitly entered a partial amount
  React.useEffect(() => {
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

  // Auto-identify payment status: 'PAID' | 'PARTIAL' | 'UNPAID'
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

    // If single CREDIT row exists, convert row 1 to CASH (or nextMode) and add CREDIT row
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

  // Add row
  const addRow = (presetItem?: InventoryItem) => {
    if (presetItem) {
      setRows([
        ...rows,
        {
          itemId: presetItem.id,
          name: presetItem.name,
          hsnSacCode: presetItem.hsnSacCode || '998313',
          quantity: 1,
          unit: presetItem.unit || 'PCS',
          unitPrice: presetItem.salePrice || 0,
          discountPercent: 0,
          gstRate: presetItem.gstRate ?? 18,
        },
      ]);
    } else {
      setRows([
        ...rows,
        {
          itemId: '',
          name: '',
          hsnSacCode: '0902',
          quantity: 1,
          unit: 'PCS',
          unitPrice: 0,
          discountPercent: 0,
          gstRate: 18,
        },
      ]);
    }
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, idx) => idx !== index));
  };

  const updateRow = (index: number, field: keyof GridRow, value: any) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  };

  // Barcode scan handler
  const handleBarcodeScanned = (scannedCode: string) => {
    const code = scannedCode.trim().toLowerCase();
    const found = itemsCatalog.find(
      (it) =>
        (it.barcode && it.barcode.toLowerCase() === code) ||
        (it.sku && it.sku.toLowerCase() === code) ||
        it.name.toLowerCase().includes(code)
    );

    if (found) {
      audioService.playScanSuccess();
      // Check if item already exists in rows
      const existingIdx = rows.findIndex((r) => r.itemId === found.id);
      if (existingIdx !== -1) {
        updateRow(existingIdx, 'quantity', rows[existingIdx].quantity + 1);
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

    const paymentStatus: PaymentStatus = autoPaymentStatus;

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
      paymentStatus,
      paidAmount: totalPaid,
      balanceAmount: balanceDue,
      paymentSplits: savedSplits,
      notes: splitNote || initialInvoice?.notes,
      createdAt: initialInvoice ? initialInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const handleSaveInvoice = (andShareWhatsApp = false) => {
    // Validate rows
    if (rows.length === 0) {
      alert('Please add at least one line item to the invoice.');
      return;
    }
    const hasEmpty = rows.some((r) => !r.name.trim());
    if (hasEmpty) {
      alert('Please provide item names for all line items.');
      return;
    }

    // Validate invoice number uniqueness under GST compliance
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
  };

  // Format date helper
  const formatDateDisplay = (isoStr: string): string => {
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString('en-IN', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return isoStr;
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col min-h-screen overflow-x-hidden antialiased">
      {/* Fixed Top Shell Header - Full Width */}
      <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-xs border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-3 sm:px-6 flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <button
              onClick={onClose}
              aria-label="Go Back"
              type="button"
              className="w-9 h-9 flex items-center justify-center text-on-surface hover:bg-surface-container active:scale-95 rounded-xl transition-all cursor-pointer flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[22px]">arrow_back</span>
            </button>

            <div className="w-8 h-8 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0">
              ₹
            </div>

            <div className="flex items-center gap-2 min-w-0">
              <h1 className="font-bold text-sm sm:text-base text-on-surface truncate">
                {initialInvoice ? `Edit Invoice #${invoiceNumber}` : `New Invoice`}
              </h1>
              {isGstActive && (
                <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/10 text-secondary border border-secondary/20">
                  {calcSummary.isIntraState ? 'Intra-State GST' : 'Inter-State IGST'}
                </span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-9 h-9 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Full-Width Scrollable Workstation */}
      <main className="flex-1 flex flex-col relative w-full pt-14 pb-36 sm:pb-32 bg-surface overflow-y-auto">
        <div className="px-3 sm:px-6 py-3 flex flex-col gap-3 w-full">
          {/* Ultra-Compact Document Header Bar */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3 py-2 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            {/* Customer Pill / Selector */}
            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsPartyModalOpen(true)}
                className="flex items-center gap-2 hover:bg-surface-container-low px-2 py-1 rounded-lg transition-colors cursor-pointer group min-w-0 text-left"
                title="Select or Change Customer"
              >
                <div className="w-7 h-7 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center flex-shrink-0 group-hover:bg-secondary group-hover:text-on-secondary transition-colors">
                  <span className="material-symbols-outlined text-[17px]">person</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-secondary">
                      {selectedParty ? selectedParty.name : 'Walk-in Customer'}
                    </span>
                    <span className="material-symbols-outlined text-[14px] text-outline group-hover:text-secondary shrink-0">
                      swap_horiz
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate">
                    {selectedParty?.gstin && isGstActive ? (
                      <span className="font-mono font-semibold text-secondary">
                        GSTIN: {selectedParty.gstin}
                      </span>
                    ) : (
                      <span className="text-outline">Cash Sale / Retail</span>
                    )}
                    {posStateCode && (
                      <span>· PoS: {posStateCode}</span>
                    )}
                  </div>
                </div>
              </button>

              {selectedParty && (
                <div className="flex items-center gap-1 shrink-0">
                  {(selectedParty.currentBalance || 0) > 0 ? (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300/60">
                      Due: {formatINR(selectedParty.currentBalance || 0)}
                    </span>
                  ) : null}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedParty(null);
                    }}
                    title="Clear customer (revert to Walk-in)"
                    className="w-6 h-6 rounded-md flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">close</span>
                  </button>
                </div>
              )}

              {/* Direct Add New Customer Button */}
              <button
                type="button"
                onClick={() => setIsAddPartyModalOpen(true)}
                className="px-2 py-1 rounded-lg bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold text-[11px] flex items-center gap-1 transition-all cursor-pointer shrink-0 active:scale-95"
                title="Add New Customer Directly"
              >
                <span className="material-symbols-outlined text-[15px]">person_add</span>
                <span className="hidden sm:inline">+ New</span>
              </button>
            </div>

            {/* Invoice Metadata Pills (Invoice No, Dates, Billing Mode) */}
            <div className="flex items-center flex-wrap gap-1.5">
              {/* Invoice Number */}
              <button
                type="button"
                onClick={() => {
                  setCustomInvoiceNumberInput(invoiceNumber);
                  setInvoiceConflictError(null);
                  setIsInvoiceNumberModalOpen(true);
                }}
                className={`h-7 px-2 rounded-lg font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer border ${
                  currentConflict
                    ? 'bg-error/15 text-error border-error/50 hover:bg-error/25 animate-pulse'
                    : 'bg-surface-container-low hover:bg-surface-container text-on-surface border-outline-variant/20'
                }`}
                title={
                  currentConflict
                    ? `Conflicting invoice number! #${invoiceNumber} is already used by ${currentConflict.partyName || 'Customer'}`
                    : 'Change Invoice Number'
                }
              >
                <span className="text-[9px] uppercase font-bold text-outline">No:</span>
                <span className="font-bold truncate max-w-[120px]">#{invoiceNumber}</span>
                <span className={`material-symbols-outlined text-[12px] ${currentConflict ? 'text-error font-bold' : 'text-outline'}`}>
                  {currentConflict ? 'warning' : 'edit'}
                </span>
              </button>

              {/* Invoice Date */}
              <button
                type="button"
                onClick={() => setIsInvoiceNumberModalOpen(true)}
                className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
                title="Change Invoice Date"
              >
                <span className="material-symbols-outlined text-[13px] text-outline">calendar_today</span>
                <span>{formatDateDisplay(invoiceDate)}</span>
              </button>

              {/* Due Date */}
              <button
                type="button"
                onClick={() => setIsDueDateModalOpen(true)}
                className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
                title="Change Due Date"
              >
                <span className="text-[9px] uppercase font-bold text-outline">Due:</span>
                <span>{formatDateDisplay(dueDate)}</span>
                <span className="material-symbols-outlined text-[12px] text-outline">event</span>
              </button>

              {/* Mode & PoS */}
              {isGstActive && (
                <div className="h-7 px-2 rounded-lg bg-secondary/10 text-secondary font-bold text-[11px] flex items-center gap-1 border border-secondary/20">
                  <span>GST</span>
                  <span className="text-[10px] font-mono opacity-80">({posStateCode})</span>
                </div>
              )}
            </div>
          </div>

          {/* Conflicting Invoice Alert Banner */}
          {(currentConflict || invoiceConflictError) && (
            <div className="bg-error-container/40 border border-error/40 text-error rounded-xl p-2.5 sm:p-3 flex items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[20px] shrink-0 text-error">warning</span>
                <div className="min-w-0">
                  <span className="font-bold block">Conflicting Invoice Number: #{invoiceNumber}</span>
                  <span className="text-[11px] opacity-90 truncate block">
                    {invoiceConflictError || `Already issued to ${currentConflict?.partyName || 'Customer'} (${currentConflict?.date || 'earlier'}). Only unique invoice numbers are allowed.`}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  const autoNext = suggestNextUniqueInvoiceNumber(invoiceNumber, initialInvoice?.id, allInvoices);
                  setInvoiceNumber(autoNext);
                  setCustomInvoiceNumberInput(autoNext);
                  setInvoiceConflictError(null);
                }}
                className="shrink-0 px-2.5 py-1.5 rounded-lg bg-error text-on-error font-bold text-xs hover:bg-error/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1 shadow-xs"
              >
                <span className="material-symbols-outlined text-[14px]">auto_fix_high</span>
                <span>Auto-Fix</span>
              </button>
            </div>
          )}

          {/* Full-Width Line Items Table Sheet */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs overflow-hidden">
            {/* Sheet Title Bar */}
            <div className="px-3 sm:px-4 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-secondary">receipt</span>
                <span className="font-bold text-xs sm:text-sm text-on-surface">
                  Line Items ({rows.length})
                </span>
                {rows.length > 0 && (
                  <span className="text-xs text-on-surface-variant font-medium">
                    · {rows.reduce((sum, r) => sum + (Number(r.quantity) || 1), 0)} units total
                  </span>
                )}
              </div>

              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="w-8 h-8 rounded-lg bg-surface-container-lowest hover:bg-surface-container text-on-surface flex items-center justify-center transition-colors cursor-pointer border border-outline-variant/30 shadow-2xs active:scale-95"
                  title="Scan Barcode"
                  aria-label="Scan Barcode"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">barcode_scanner</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddItem}
                  className="w-8 h-8 rounded-lg bg-secondary text-on-secondary flex items-center justify-center hover:bg-secondary/90 transition-all cursor-pointer shadow-2xs active:scale-95"
                  title="Add Item"
                  aria-label="Add Item"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </div>
            </div>

            {/* If No Items */}
            {rows.length === 0 ? (
              <div className="py-12 px-4 text-center flex flex-col items-center justify-center gap-2.5">
                <div className="w-12 h-12 rounded-xl bg-surface-container-low text-secondary flex items-center justify-center">
                  <span className="material-symbols-outlined text-[26px]">add_shopping_cart</span>
                </div>
                <h3 className="font-bold text-sm text-on-surface">No line items on this invoice</h3>
                <p className="text-xs text-on-surface-variant max-w-sm">
                  Add products or services from your catalog or create custom billed items.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleOpenAddItem}
                    className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-xs hover:bg-secondary/90 transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    <span>+ Add First Item</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">barcode_scanner</span>
                    <span>Scan Barcode</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Desktop / Tablet Ledger Table (sm & up) */}
                <div className="hidden sm:block overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="bg-surface-container-low text-on-surface-variant text-[11px] font-bold uppercase tracking-wider border-b border-outline-variant/20">
                        <th className="py-2.5 px-3 w-10 text-center">#</th>
                        <th className="py-2.5 px-3">Item &amp; Description</th>
                        {isGstActive && <th className="py-2.5 px-3 w-28">HSN/SAC</th>}
                        <th className="py-2.5 px-3 w-28 text-center">Qty / Unit</th>
                        <th className="py-2.5 px-3 w-28 text-right">Rate (₹)</th>
                        <th className="py-2.5 px-3 w-24 text-right">Discount</th>
                        {isGstActive && <th className="py-2.5 px-3 w-24 text-right">GST Rate</th>}
                        <th className="py-2.5 px-4 w-32 text-right">Amount (₹)</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15 text-xs">
                      {rows.map((row, idx) => {
                        const itemCalc = calcSummary.items[idx];
                        return (
                          <tr
                            key={idx}
                            onClick={() => handleOpenEditItem(idx)}
                            className="hover:bg-surface-container-low/40 active:bg-surface-container-low cursor-pointer transition-colors group"
                          >
                            <td className="py-2.5 px-3 text-center text-on-surface-variant font-mono font-medium">
                              {idx + 1}
                            </td>
                            <td className="py-2.5 px-3 min-w-48">
                              <span className="font-bold text-on-surface block group-hover:text-secondary transition-colors">
                                {row.name}
                              </span>
                              {row.description && (
                                <span className="text-[11px] text-on-surface-variant block mt-0.5 truncate max-w-md">
                                  {row.description}
                                </span>
                              )}
                            </td>
                            {isGstActive && (
                              <td className="py-2.5 px-3 font-mono text-[11px] text-on-surface-variant">
                                {row.hsnSacCode || '-'}
                              </td>
                            )}
                            <td className="py-2.5 px-3 text-center font-tabular-data font-bold text-on-surface">
                              {row.quantity} <span className="text-[10px] font-normal uppercase text-on-surface-variant">{row.unit}</span>
                            </td>
                            <td className="py-2.5 px-3 text-right font-tabular-data font-semibold text-on-surface">
                              {formatINR(row.unitPrice)}
                            </td>
                            <td className="py-2.5 px-3 text-right font-tabular-data">
                              {row.discountPercent > 0 ? (
                                <span className="text-secondary font-bold">
                                  {row.discountPercent}%
                                </span>
                              ) : (
                                <span className="text-outline">-</span>
                              )}
                            </td>
                            {isGstActive && (
                              <td className="py-2.5 px-3 text-right font-tabular-data text-on-surface-variant font-medium">
                                {row.gstRate}%
                              </td>
                            )}
                            <td className="py-2.5 px-4 text-right font-tabular-data font-bold text-on-surface text-sm">
                              {formatINR(itemCalc?.totalAmount || 0)}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* Mobile High-Density Sheet List (sm:hidden) */}
                <div className="sm:hidden divide-y divide-outline-variant/15">
                  {rows.map((row, idx) => {
                    const itemCalc = calcSummary.items[idx];
                    return (
                      <div
                        key={idx}
                        onClick={() => handleOpenEditItem(idx)}
                        className="p-3 hover:bg-surface-container-low/50 active:bg-surface-container-low cursor-pointer transition-colors group"
                      >
                        {/* Top Line: Name & Total Amount */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs sm:text-sm text-on-surface block leading-snug group-hover:text-secondary transition-colors">
                              {idx + 1}. {row.name}
                            </span>
                            {row.description && (
                              <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">
                                {row.description}
                              </p>
                            )}
                          </div>
                          <div className="text-right shrink-0">
                            <span className="font-tabular-data text-sm font-black text-on-surface block">
                              {formatINR(itemCalc?.totalAmount || 0)}
                            </span>
                            {isGstActive && (
                              <span className="text-[10px] text-outline block">
                                incl. {row.gstRate}% tax
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Bottom Line: Qty, Rate, Discount, HSN */}
                        <div className="flex items-center justify-between gap-2 mt-1.5 pt-1.5 border-t border-outline-variant/10 text-xs text-on-surface-variant">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <span className="font-tabular-data font-bold text-on-surface">
                              {row.quantity} {row.unit}
                            </span>
                            <span className="text-outline">×</span>
                            <span className="font-tabular-data font-semibold text-on-surface">
                              {formatINR(row.unitPrice)}
                            </span>
                            {row.discountPercent > 0 && (
                              <span className="px-1 py-0.2 rounded bg-secondary/15 text-secondary text-[10px] font-bold">
                                {row.discountPercent}% off
                              </span>
                            )}
                          </div>

                          {isGstActive && row.hsnSacCode && (
                            <span className="font-mono text-[10px] text-on-surface-variant">
                              HSN {row.hsnSacCode}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Bottom Add Item Bar (Visible when items are present) */}
                <div className="p-2 sm:p-2.5 bg-surface-container-low/40 border-t border-outline-variant/20 flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={handleOpenAddItem}
                    className="flex-1 py-2 px-3 rounded-lg border border-dashed border-secondary/40 hover:border-secondary hover:bg-secondary/10 text-secondary font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-99"
                  >
                    <span className="material-symbols-outlined text-[17px]">add_circle</span>
                    <span>+ Add Item</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="py-2 px-3 rounded-lg border border-dashed border-outline-variant/40 hover:border-outline hover:bg-surface-container-low text-on-surface-variant font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Camera Barcode Scanner"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">barcode_scanner</span>
                    <span className="hidden sm:inline">Scan</span>
                  </button>
                </div>
              </>
            )}
          </div>

          {/* Financial Ledger Summary (Subtotal, Taxes, Roundoff, Shipping, Discount, Grand Total) */}
          <div className="flex justify-end w-full">
            <div className="w-full lg:max-w-md bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 sm:p-4 shadow-xs flex flex-col gap-2">
              <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20">
                <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                  Invoice Summary
                </span>
                {isGstActive && (
                  <span className="text-[11px] font-bold text-secondary">
                    GST Compliant
                  </span>
                )}
              </div>

              {/* Subtotal */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>{isGstActive ? 'Subtotal (Items gross)' : 'Subtotal'}</span>
                <span className="font-tabular-data font-semibold text-on-surface">
                  {formatINR(calcSummary.totalGrossAmount)}
                </span>
              </div>

              {/* Taxes - only if GST is active */}
              {isGstActive && (
                <>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant">
                    <button
                      type="button"
                      onClick={() => setIsTaxDetailsOpen(!isTaxDetailsOpen)}
                      className="flex items-center gap-1 text-left hover:text-on-surface cursor-pointer"
                    >
                      <span>{calcSummary.isIntraState ? 'Taxes (CGST + SGST)' : 'Taxes (IGST)'}</span>
                      <span className="material-symbols-outlined text-[13px] text-outline">info</span>
                    </button>
                    <span className="font-tabular-data font-semibold text-on-surface">
                      +{formatINR(calcSummary.totalTax)}
                    </span>
                  </div>

                  {isTaxDetailsOpen && (
                    <div className="p-2 rounded-lg bg-surface-container-low text-[11px] flex flex-col gap-1 border border-outline-variant/20 animate-fade-in">
                      {calcSummary.isIntraState ? (
                        <>
                          <div className="flex items-center justify-between text-on-surface-variant">
                            <span>Central GST (CGST)</span>
                            <span className="font-tabular-data font-bold">{formatINR(calcSummary.totalCgst)}</span>
                          </div>
                          <div className="flex items-center justify-between text-on-surface-variant">
                            <span>State GST (SGST)</span>
                            <span className="font-tabular-data font-bold">{formatINR(calcSummary.totalSgst)}</span>
                          </div>
                        </>
                      ) : (
                        <div className="flex items-center justify-between text-on-surface-variant">
                          <span>Integrated GST (IGST)</span>
                          <span className="font-tabular-data font-bold">{formatINR(calcSummary.totalIgst)}</span>
                        </div>
                      )}
                      <div className="flex items-center justify-between text-on-surface-variant pt-1 border-t border-outline-variant/20">
                        <span>Taxable Base</span>
                        <span className="font-tabular-data font-bold">{formatINR(calcSummary.totalTaxableAmount)}</span>
                      </div>
                    </div>
                  )}
                </>
              )}

              {/* Round Off */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>Round Off</span>
                <span className="font-tabular-data font-semibold text-on-surface">
                  {calcSummary.roundOff >= 0 ? `+₹${calcSummary.roundOff}` : `-₹${Math.abs(calcSummary.roundOff)}`}
                </span>
              </div>

              {/* Shipping Charges */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant py-0.5">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-outline">local_shipping</span>
                  <span>Shipping Charges</span>
                </div>
                <div className="relative w-28 flex items-center">
                  <span className="absolute left-2 text-xs font-semibold text-outline pointer-events-none">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="any"
                    value={shippingAmount || ''}
                    onChange={(e) => setShippingAmount(Math.max(0, Number(e.target.value) || 0))}
                    placeholder="0.00"
                    className="w-full pl-5 pr-2 py-0.5 rounded bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                  />
                </div>
              </div>

              {/* Overall Discount (Below Roundoff) */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant py-0.5">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-outline">percent</span>
                  <span>Bill Discount</span>
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setIsExtraDiscountModalOpen(true)}
                    className={`px-2 py-0.5 rounded text-xs font-bold flex items-center gap-1 transition-all cursor-pointer border ${
                      overallDiscountAmount > 0
                        ? 'bg-secondary/15 text-secondary border-secondary/30'
                        : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container border-outline-variant/30'
                    }`}
                  >
                    {overallDiscountAmount > 0 ? (
                      <>
                        <span>-{formatINR(overallDiscountAmount)}</span>
                        <span className="text-[10px] opacity-80">({overallDiscountPercent}%)</span>
                        <span className="material-symbols-outlined text-[12px]">edit</span>
                      </>
                    ) : (
                      <>
                        <span className="material-symbols-outlined text-[13px]">add</span>
                        <span>Add Discount</span>
                      </>
                    )}
                  </button>
                  {overallDiscountAmount > 0 && (
                    <button
                      type="button"
                      onClick={() => setOverallDiscountPercent(0)}
                      title="Remove discount"
                      className="w-5 h-5 rounded flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                    >
                      <span className="material-symbols-outlined text-[13px]">close</span>
                    </button>
                  )}
                </div>
              </div>

              <div className="h-px bg-outline-variant/20 my-1"></div>

              {/* Grand Total Ledger Highlight Box */}
              <div className="p-3 rounded-lg bg-surface-container text-on-surface flex items-center justify-between border border-outline-variant/30">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block">
                    Grand Total Amount
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {rows.reduce((sum, r) => sum + (Number(r.quantity) || 1), 0)} Total Units
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-tabular-data text-xl sm:text-2xl font-black text-secondary tracking-tight block">
                    {formatINR(finalGrandTotal)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Payment Settlement (Moved to Bottom) */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-2.5 sm:p-3 shadow-2xs flex flex-col gap-2">
            {/* Header with Title and Auto-Identified Status */}
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">payments</span>
                <span className="font-bold text-xs text-on-surface">Payment Settlement</span>
              </div>

              {/* Auto-identified Payment Status Badge */}
              <div>
                {autoPaymentStatus === 'PAID' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-secondary/15 text-secondary border border-secondary/30 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    <span>Paid</span>
                  </span>
                )}
                {autoPaymentStatus === 'PARTIAL' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-500/15 text-amber-700 dark:text-amber-300 border border-amber-500/30 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">timelapse</span>
                    <span>Partial · Due: {formatINR(balanceDue)}</span>
                  </span>
                )}
                {autoPaymentStatus === 'UNPAID' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-error/15 text-error border border-error/30 flex items-center gap-1">
                    <span className="material-symbols-outlined text-[13px]">schedule</span>
                    <span>Unpaid · Due: {formatINR(balanceDue)}</span>
                  </span>
                )}
              </div>
            </div>

            {/* Payment Splits (Payment Type + Amount + Plus Button for Split) */}
            <div className="flex flex-col gap-2 pt-1 border-t border-outline-variant/15">
              {paymentSplits.map((split, index) => (
                <div key={split.id} className="flex items-center gap-2">
                  {/* Payment Type Selector */}
                  <div className="relative flex-1 sm:max-w-[170px]">
                    <select
                      value={split.mode}
                      onChange={(e) => handleUpdateSplitMode(split.id, e.target.value as PaymentMode)}
                      className="w-full h-8 pl-2 pr-6 rounded-lg bg-surface-container-low text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-colors cursor-pointer appearance-none"
                    >
                      {PAYMENT_MODES.map((pm) => (
                        <option key={pm.value} value={pm.value}>
                          {pm.label}
                        </option>
                      ))}
                    </select>
                    <span className="material-symbols-outlined text-[16px] text-outline absolute right-1.5 top-1/2 -translate-y-1/2 pointer-events-none">
                      arrow_drop_down
                    </span>
                  </div>

                  {/* Amount Input (or ledger banner if Credit) */}
                  {split.mode !== 'CREDIT' ? (
                    <div className="relative flex-1 flex items-center">
                      <span className="absolute left-2 text-xs font-semibold text-outline pointer-events-none">₹</span>
                      <input
                        type="number"
                        min="0"
                        step="any"
                        value={split.amount === 0 ? '' : split.amount}
                        onChange={(e) => handleUpdateSplitAmount(split.id, e.target.value === '' ? 0 : Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full h-8 pl-5 pr-2 rounded-lg bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-secondary transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 h-8 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 font-medium flex items-center justify-between">
                      <span className="truncate">Ledger Balance (Udhaar)</span>
                      <span className="font-tabular-data font-bold shrink-0">{formatINR(balanceDue)}</span>
                    </div>
                  )}

                  {/* Plus button next to it for split payment modes */}
                  {index === 0 && (
                    <button
                      type="button"
                      onClick={handleAddSplitMode}
                      title="Add split payment mode"
                      className="h-8 px-2 sm:px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-bold text-xs flex items-center gap-1 border border-outline-variant/30 transition-all cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px] text-secondary">add</span>
                      <span className="hidden sm:inline">Split</span>
                    </button>
                  )}

                  {/* Remove button for secondary splits */}
                  {index > 0 && (
                    <button
                      type="button"
                      onClick={() => handleRemoveSplit(split.id)}
                      title="Remove split"
                      className="h-8 w-8 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px]">close</span>
                    </button>
                  )}
                </div>
              ))}
              {paymentSplits.length > 1 && paymentSplits.length < 5 && (
                <div className="flex justify-end pt-0.5">
                  <button
                    type="button"
                    onClick={handleAddSplitMode}
                    className="text-[11px] font-bold text-secondary hover:text-secondary/80 flex items-center gap-1 cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[14px]">add_circle</span>
                    <span>Add another tender mode</span>
                  </button>
                </div>
              )}
            </div>
          </div>
          {/* Bottom spacing clearance to prevent overlap with sticky action dock */}
          <div className="h-8" aria-hidden="true" />
        </div>
      </main>

      {/* Sticky Bottom Full-Width Action Dock */}
      <aside
        aria-label="Invoice Actions"
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-lg pb-safe"
      >
        <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 w-full">
          {/* Left Total Info */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const inv = constructInvoiceObject();
                setPreviewInvoiceData(inv);
              }}
              className="h-10 px-3.5 rounded-xl bg-surface-container font-bold text-xs text-on-surface flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30 active:scale-95"
              title="Print Thermal POS Receipt"
            >
              <span className="material-symbols-outlined text-[18px]">print</span>
              <span>Print</span>
            </button>
            <div className="hidden sm:flex flex-col pl-2 border-l border-outline-variant/30">
              <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">Net Payable</span>
              <span className="font-tabular-data font-black text-sm text-secondary">{formatINR(finalGrandTotal)}</span>
            </div>
          </div>

          {/* Right Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => handleSaveInvoice(false)}
              className="h-10 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>Save Invoice</span>
            </button>

            <button
              type="button"
              onClick={() => handleSaveInvoice(true)}
              className="h-10 px-4 sm:px-5 rounded-xl bg-secondary text-on-secondary font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">send</span>
              <span>Save &amp; WhatsApp</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Select Party Modal */}
      {isPartyModalOpen && (
        <SelectPartyModal
          parties={localParties}
          onSelectParty={(p) => {
            setSelectedParty(p);
            setPosStateCode(p.stateCode);
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
      {isInvoiceNumberModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3.5">
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Edit Invoice Number &amp; Date
            </h3>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[11px] font-bold text-on-surface-variant block">
                  Invoice Number Series
                </label>
                {dialogConflict ? (
                  <span className="text-[10px] font-bold text-error flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">cancel</span>
                    Number in use
                  </span>
                ) : (
                  <span className="text-[10px] font-bold text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                    <span className="material-symbols-outlined text-[13px]">check_circle</span>
                    Available
                  </span>
                )}
              </div>
              <input
                type="text"
                value={customInvoiceNumberInput}
                onChange={(e) => {
                  setCustomInvoiceNumberInput(e.target.value);
                  setInvoiceConflictError(null);
                }}
                placeholder="e.g. INV-2024-001"
                className={`w-full bg-surface-container-low border rounded-xl px-3 py-2 text-sm font-semibold outline-none transition-colors ${
                  dialogConflict
                    ? 'border-error text-error focus:ring-2 focus:ring-error/40'
                    : 'border-outline-variant/40 text-on-surface focus:ring-2 focus:ring-secondary/40'
                }`}
              />

              {dialogConflict && (
                <div className="mt-1.5 p-2.5 rounded-lg bg-error-container/30 border border-error/40 text-error text-[11px] flex flex-col gap-1.5 animate-shake">
                  <div className="flex items-start gap-1.5">
                    <span className="material-symbols-outlined text-[16px] shrink-0 text-error mt-0.5">error</span>
                    <span>
                      <strong>#{customInvoiceNumberInput.trim()}</strong> is already issued to <strong>{dialogConflict.partyName || 'Customer'}</strong> ({dialogConflict.date || 'prior bill'}). Duplicate invoice numbers are not allowed under GST compliance.
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nextUnique = suggestNextUniqueInvoiceNumber(customInvoiceNumberInput, initialInvoice?.id, allInvoices);
                      setCustomInvoiceNumberInput(nextUnique);
                      setInvoiceConflictError(null);
                    }}
                    className="self-start px-2 py-1 rounded bg-error text-on-error font-bold text-[10px] hover:bg-error/90 active:scale-95 transition-all flex items-center gap-1 cursor-pointer shadow-2xs"
                  >
                    <span className="material-symbols-outlined text-[13px]">auto_fix_high</span>
                    <span>Use Next Available Unique ({suggestNextUniqueInvoiceNumber(customInvoiceNumberInput, initialInvoice?.id, allInvoices)})</span>
                  </button>
                </div>
              )}
            </div>

            <div>
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                Invoice Issue Date
              </label>
              <input
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>

            <div>
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                Place of Supply State
              </label>
              <select
                value={posStateCode}
                onChange={(e) => setPosStateCode(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
              >
                {getStateList().map((s) => (
                  <option key={s.code} value={s.code}>
                    {s.code} - {s.name}
                  </option>
                ))}
              </select>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsInvoiceNumberModalOpen(false)}
                className="flex-1 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={Boolean(dialogConflict) || !customInvoiceNumberInput.trim()}
                onClick={() => {
                  if (dialogConflict || !customInvoiceNumberInput.trim()) return;
                  setInvoiceNumber(customInvoiceNumberInput.trim());
                  setInvoiceConflictError(null);
                  setIsInvoiceNumberModalOpen(false);
                }}
                className={`flex-1 py-2 rounded-xl font-label-md text-xs font-bold shadow-sm cursor-pointer transition-all ${
                  dialogConflict || !customInvoiceNumberInput.trim()
                    ? 'bg-outline-variant/30 text-outline cursor-not-allowed'
                    : 'bg-secondary text-on-secondary hover:bg-secondary/90'
                }`}
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Due Date Presets Dialog */}
      {isDueDateModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3">
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Payment Terms &amp; Due Date
            </h3>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDueDate(invoiceDate);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Due on Receipt</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Immediate cash/upi</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date(invoiceDate);
                  d.setDate(d.getDate() + 15);
                  setDueDate(d.toISOString().split('T')[0]);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Net 15 Days</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Standard trade credit</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date(invoiceDate);
                  d.setDate(d.getDate() + 30);
                  setDueDate(d.toISOString().split('T')[0]);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Net 30 Days</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Monthly settlement</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const d = new Date(invoiceDate);
                  d.setDate(d.getDate() + 60);
                  setDueDate(d.toISOString().split('T')[0]);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Net 60 Days</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Extended distributor terms</span>
              </button>
            </div>

            <div>
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                Or Pick Custom Date:
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>

            <button
              type="button"
              onClick={() => setIsDueDateModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm cursor-pointer mt-1"
            >
              Done
            </button>
          </div>
        </div>
      )}

      {/* Extra Discount Modal */}
      {isExtraDiscountModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3">
            <h3 className="font-headline-sm text-base font-bold text-on-surface">
              Overall Bill Discount
            </h3>

            <div className="flex items-center gap-2">
              {[0, 2, 5, 10, 15, 20].map((pct) => (
                <button
                  key={pct}
                  type="button"
                  onClick={() => setOverallDiscountPercent(pct)}
                  className={`flex-1 py-1.5 rounded-xl font-label-md text-xs font-bold cursor-pointer transition-colors ${
                    overallDiscountPercent === pct
                      ? 'bg-secondary text-on-secondary'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  {pct}%
                </button>
              ))}
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                  Discount (%):
                </label>
                <div className="relative">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.1"
                    value={overallDiscountPercent || ''}
                    onChange={(e) => setOverallDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value))))}
                    className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl pl-3 pr-7 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40 text-right"
                    placeholder="0"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline pointer-events-none">
                    %
                  </span>
                </div>
              </div>

              <div>
                <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                  Discount (₹):
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-outline pointer-events-none">
                    ₹
                  </span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={overallDiscountAmount || ''}
                    onChange={(e) => {
                      const amt = Number(e.target.value) || 0;
                      if (calcSummary.totalTaxableAmount > 0) {
                        const pct = Math.min(100, Math.round(((amt / calcSummary.totalTaxableAmount) * 100) * 100) / 100);
                        setOverallDiscountPercent(pct);
                      }
                    }}
                    className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl pl-7 pr-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40 text-right"
                    placeholder="0.00"
                  />
                </div>
              </div>
            </div>

            <div className="p-2.5 rounded-xl bg-secondary-container/40 text-on-secondary-container text-xs font-semibold flex items-center justify-between">
              <span>Discount Deduction:</span>
              <span className="font-tabular-data font-bold">{formatINR(overallDiscountAmount)}</span>
            </div>

            <button
              type="button"
              onClick={() => setIsExtraDiscountModalOpen(false)}
              className="w-full py-2.5 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm cursor-pointer mt-1"
            >
              Apply Discount
            </button>
          </div>
        </div>
      )}

      {/* Add / Edit Bill Item Modal with Catalog Search & Real-Time Total Estimation */}
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

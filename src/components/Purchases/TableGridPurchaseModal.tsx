import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { PurchaseBill, PurchaseItemEntry, ItcEligibility } from '../../models/purchase.ts';
import { PaymentMode, PaymentStatus, PaymentSplit } from '../../models/invoice.ts';
import { parseSplitsFromPurchase, formatSplitNotes } from '../../core/accounting/paymentSplitUtils.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { SelectPartyModal } from '../Parties/SelectPartyModal.tsx';
import { AddEditPartyModal } from '../Parties/AddEditPartyModal.tsx';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { audioService } from '../../services/barcodeService.ts';
import { InvoiceItemModal, InvoiceItemData } from '../Invoicing/InvoiceItemModal.tsx';
import { db } from '../../services/db.ts';
import { generateNextInvoiceNumber, generateNextDocumentNumber } from '../../core/utils/invoiceNumber.ts';
import { roundQuantity } from '../../core/utils/formatters.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { PurchaseHeaderMeta } from './components/PurchaseHeaderMeta.tsx';
import { PurchaseLineItemsGrid, PurchaseGridRow } from './components/PurchaseLineItemsGrid.tsx';
import { DocumentTotalsSummary } from '../Common/Billing/DocumentTotalsSummary.tsx';
import { PaymentSettlementDock } from '../Common/Billing/PaymentSettlementDock.tsx';
import { PurchaseActionDock } from './components/PurchaseActionDock.tsx';
import { PurchaseBillNumberModal } from './components/PurchaseBillNumberModal.tsx';
import { DueDatePresetModal } from '../Common/Billing/DueDatePresetModal.tsx';
import { draftService, PurchaseDraft } from '../../services/draftService.ts';
import { showAppToast } from '../../services/toast.ts';

interface TableGridPurchaseModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  initialBill?: PurchaseBill | null;
  initialSupplier?: Party | null;
  defaultPurchaseType?: 'BILL' | 'PO' | 'RETURN';
  onClose: () => void;
  onSave: (bill: PurchaseBill) => void;
  onAddNewParty?: () => void;
  onPartyCreated?: (party: Party) => void;
}

const PURCHASE_PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'NET_BANKING', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI / QR' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CREDIT', label: 'Credit (Payable)' },
  { value: 'SPLIT', label: 'Split Payment' },
];

export const TableGridPurchaseModal: React.FC<TableGridPurchaseModalProps> = ({
  company,
  parties,
  itemsCatalog,
  initialBill,
  initialSupplier,
  defaultPurchaseType,
  onClose,
  onSave,
  onAddNewParty,
  onPartyCreated,
}) => {
  // Draft state for new purchase bill restoration
  const initialDraft = useMemo(
    () => (!initialBill ? draftService.getPurchaseDraft(defaultPurchaseType) : null),
    [initialBill, defaultPurchaseType]
  );
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(() => Boolean(initialDraft));
  const effectivePurchaseType: 'BILL' | 'PO' | 'RETURN' = initialBill?.purchaseType || defaultPurchaseType || 'BILL';

  const [suppliers, setSuppliers] = useState<Party[]>(parties);
  useEffect(() => {
    setSuppliers(parties);
  }, [parties]);

  const [isAddPartyModalOpen, setIsAddPartyModalOpen] = useState(false);

  // Synchronized catalog
  const [catalog, setCatalog] = useState<InventoryItem[]>(itemsCatalog);
  useEffect(() => {
    setCatalog(itemsCatalog);
  }, [itemsCatalog]);

  const handleItemCreated = (newItem: InventoryItem) => {
    setCatalog((prev) => [newItem, ...prev.filter((i) => i.id !== newItem.id)]);
  };

  const handleSupplierCreated = (newParty: Party) => {
    db.saveParty(newParty);
    setSuppliers((prev) => [newParty, ...prev.filter((p) => p.id !== newParty.id)]);
    setSelectedSupplier(newParty);
    setSupplierStateCode(newParty.stateCode);
    if (newParty.isComposition) {
      setItcEligibility('INELIGIBLE_OTHERS');
    }
    setIsAddPartyModalOpen(false);
    setIsPartyModalOpen(false);
    onPartyCreated?.(newParty);
  };

  // Supplier state
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(() => {
    if (initialBill) {
      const found = parties.find(
        (p) => p.id === initialBill.supplierId || p.name === initialBill.supplierName
      );
      if (found) return found;
      return {
        id: initialBill.supplierId || 'CUSTOM_SUPPLIER',
        name: initialBill.supplierName,
        gstin: initialBill.supplierGstin,
        phone: '',
        email: '',
        billingAddress: initialBill.supplierAddress,
        stateCode: initialBill.supplierStateCode,
        type: 'SUPPLIER',
        currentBalance: 0,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    }
    if (initialSupplier) {
      return initialSupplier;
    }
    if (initialDraft?.selectedSupplier) {
      return initialDraft.selectedSupplier;
    }
    return null;
  });

  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  // Bill metadata
  const [billNumber, setBillNumber] = useState<string>(() => {
    if (initialBill?.billNumber) return initialBill.billNumber;
    if (initialDraft?.billNumber) return initialDraft.billNumber;
    const purchaseList = db.getPurchases().map((p) => ({ id: p.id, invoiceNumber: p.billNumber }));
    const docSeries: any =
      defaultPurchaseType === 'PO'
        ? 'PURCHASE_ORDER'
        : defaultPurchaseType === 'RETURN'
        ? 'DEBIT_NOTE'
        : 'PURCHASE_BILL';
    return generateNextDocumentNumber(docSeries, company, purchaseList);
  });
  const [billDate, setBillDate] = useState<string>(
    initialBill ? initialBill.date : (initialDraft?.billDate || new Date().toISOString().split('T')[0])
  );
  const [dueDate, setDueDate] = useState<string>(
    initialBill?.dueDate ||
      initialDraft?.dueDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
      })()
  );

  const isGstActive = company.isGstEnabled !== false;
  const [supplierStateCode, setSupplierStateCode] = useState<string>(
    initialBill?.supplierStateCode || initialDraft?.supplierStateCode || selectedSupplier?.stateCode || company.stateCode
  );

  const [itcEligibility, setItcEligibility] = useState<ItcEligibility>(() => {
    if (initialBill?.itcEligibility) return initialBill.itcEligibility;
    if (initialDraft?.itcEligibility) return initialDraft.itcEligibility;
    if (initialSupplier?.isComposition) return 'INELIGIBLE_OTHERS';
    return 'ELIGIBLE_INPUTS';
  });

  const [isRcm, setIsRcm] = useState<boolean>(() => Boolean(initialBill?.isRcm ?? initialDraft?.isRcm));

  // Return / Reference states for Debit Notes
  const [originalBillNumber, setOriginalBillNumber] = useState<string>(
    () => initialBill?.originalBillNumber || initialDraft?.originalBillNumber || ''
  );
  const [originalBillDate, setOriginalBillDate] = useState<string>(
    () => initialBill?.originalBillDate || initialDraft?.originalBillDate || ''
  );
  const [returnReason, setReturnReason] = useState<string>(
    () => initialBill?.returnReason || initialDraft?.returnReason || '01-Defective Goods'
  );

  // Dedicated Add/Edit item modal
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  const handleOpenAddItem = useCallback(() => {
    setEditingRowIndex(null);
    setIsItemModalOpen(true);
  }, []);

  const handleOpenEditItem = (index: number) => {
    setEditingRowIndex(index);
    setIsItemModalOpen(true);
  };

  const handleSaveItemModal = (itemData: InvoiceItemData) => {
    const purchaseRow: PurchaseGridRow = {
      itemId: itemData.itemId,
      name: itemData.name,
      description: itemData.description,
      hsnSacCode: itemData.hsnSacCode,
      quantity: roundQuantity(itemData.quantity, 4),
      unit: itemData.unit,
      unitPrice: itemData.unitPrice,
      mrp: itemData.mrp,
      discountPercent: itemData.discountPercent,
      discountAmount: itemData.discountAmount,
      gstRate: itemData.gstRate,
    };

    if (editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length) {
      const updated = [...rows];
      updated[editingRowIndex] = purchaseRow;
      setRows(updated);
    } else {
      setRows([...rows, purchaseRow]);
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
  const [rows, setRows] = useState<PurchaseGridRow[]>(() => {
    if (initialBill && initialBill.items.length > 0) {
      return initialBill.items.map((it) => ({
        itemId: it.itemId || it.id || '',
        name: it.name,
        description: it.description || '',
        hsnSacCode: it.hsnSacCode,
        quantity: it.quantity,
        unit: it.unit,
        unitPrice: it.unitPrice,
        mrp: (it as any).mrp,
        discountPercent: it.discountPercent || 0,
        discountAmount: it.discountAmount,
        gstRate: it.gstRate,
      }));
    }
    if (initialDraft?.rows && initialDraft.rows.length > 0) {
      return initialDraft.rows;
    }
    return [];
  });

  const removeRow = (index: number) => {
    setRows(rows.filter((_, idx) => idx !== index));
  };

  // Calculations
  const calcInputs = useMemo(() => {
    return rows.map((r) => ({
      quantity: Number(r.quantity) || 0,
      unitPrice: Number(r.unitPrice) || 0,
      discountPercent: Number(r.discountPercent) || 0,
      discountAmount: r.discountAmount,
      gstRate: isGstActive ? (Number(r.gstRate) || 0) : 0,
    }));
  }, [rows, isGstActive]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(supplierStateCode, company.stateCode, calcInputs);
  }, [supplierStateCode, company.stateCode, calcInputs]);

  const [shippingAmount, setShippingAmount] = useState<number>(initialBill?.shippingAmount || initialDraft?.shippingAmount || 0);

  const finalGrandTotal = useMemo(() => {
    const preRound = calcSummary.netAmount + (Number(shippingAmount) || 0);
    return Math.max(0, Math.round(preRound));
  }, [calcSummary.netAmount, shippingAmount]);

  const finalRoundOff = useMemo(() => {
    const preRound = calcSummary.netAmount + (Number(shippingAmount) || 0);
    return Number((finalGrandTotal - preRound).toFixed(2));
  }, [calcSummary.netAmount, shippingAmount, finalGrandTotal]);

  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>(() => {
    if (initialDraft?.paymentSplits && initialDraft.paymentSplits.length > 0) {
      return initialDraft.paymentSplits;
    }
    return parseSplitsFromPurchase(initialBill, finalGrandTotal);
  });

  const [isManualAmount, setIsManualAmount] = useState<boolean>(() => {
    if (!initialBill) return false;
    const initialSplits = parseSplitsFromPurchase(initialBill, finalGrandTotal);
    return Boolean(
      initialSplits.length > 1 ||
      initialBill.paymentStatus === 'PARTIAL' ||
      (initialBill.paymentSplits && initialBill.paymentSplits.length > 1)
    );
  });

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

  const handleUpdateSplitAccount = (id: string, accountId: string, accountName: string) => {
    setPaymentSplits((prev) =>
      prev.map((s) => (s.id === id ? { ...s, accountId, accountName } : s))
    );
  };

  const handleAddSplitMode = () => {
    setIsManualAmount(true);
    const existingModes = new Set(paymentSplits.map((s) => s.mode));
    const candidateModes: PaymentMode[] = ['NET_BANKING', 'UPI', 'CASH', 'CARD', 'CHEQUE'];
    const nextMode = candidateModes.find((m) => !existingModes.has(m)) || 'NET_BANKING';

    const currentNonCreditTotal = paymentSplits.reduce(
      (acc, s) => (s.mode === 'CREDIT' ? acc : acc + (Number(s.amount) || 0)),
      0
    );
    const remaining = Math.max(0, Number((finalGrandTotal - currentNonCreditTotal).toFixed(2)));

    if (paymentSplits.length === 1 && paymentSplits[0].mode === 'CREDIT') {
      setPaymentSplits([
        { id: '1', mode: 'NET_BANKING', amount: 0 },
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

  // Barcode scanner
  const [isScannerOpen, setIsScannerOpen] = useState(false);
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
            hsnSacCode: isGstActive ? (found.hsnSacCode || '844332') : '',
            quantity: 1,
            unit: found.unit || 'PCS',
            unitPrice: found.purchasePrice || found.salePrice || 100,
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

  // Save bill
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSaveBill = useCallback(() => {
    if (rows.length === 0) {
      alert('Please add at least one line item to record a purchase bill.');
      return;
    }
    const hasEmpty = rows.some((r) => !r.name.trim());
    if (hasEmpty) {
      alert('Please provide item names for all line items.');
      return;
    }

    const purchaseItems: PurchaseItemEntry[] = rows.map((r, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: r.itemId || `CUSTOM-${Date.now()}-${idx}`,
        name: r.name || 'Purchased Item',
        description: r.description,
        hsnSacCode: isGstActive ? (r.hsnSacCode || '844332') : '',
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
        utgstAmount: isGstActive ? (calcItem?.utgstAmount || 0) : 0,
        igstAmount: isGstActive ? (calcItem?.igstAmount || 0) : 0,
        cessAmount: 0,
        totalAmount: calcItem?.totalAmount || (r.quantity * r.unitPrice * (1 - (r.discountPercent || 0) / 100)),
      };
    });

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
      accountId: s.accountId,
      accountName: s.accountName,
      reference: s.reference || s.referenceNo,
      referenceNo: s.referenceNo || s.reference,
    }));

    const newBill: PurchaseBill = {
      id: initialBill ? initialBill.id : `PUR-${Date.now()}`,
      billNumber: billNumber.trim() || `PB-${Date.now().toString().slice(-4)}`,
      purchaseType: effectivePurchaseType,
      supplierId: selectedSupplier?.id || '',
      supplierName: selectedSupplier?.name || 'General Supplier',
      supplierGstin: isGstActive ? selectedSupplier?.gstin : undefined,
      supplierAddress: selectedSupplier?.billingAddress || '',
      supplierStateCode,
      placeOfSupplyStateCode: company.stateCode,
      isIntraState: calcSummary.isIntraState,
      date: billDate,
      dueDate: dueDate || undefined,
      items: purchaseItems,
      itcEligibility,
      isRcm: isRcm,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: isGstActive ? calcSummary.totalCgst : 0,
      totalSgst: isGstActive ? calcSummary.totalSgst : 0,
      totalUtgst: isGstActive ? (calcSummary.totalUtgst || 0) : 0,
      isUtgst: isGstActive ? Boolean(calcSummary.isUtgst) : false,
      totalIgst: isGstActive ? calcSummary.totalIgst : 0,
      totalCess: 0,
      totalTax: isGstActive ? calcSummary.totalTax : 0,
      roundOff: finalRoundOff,
      shippingAmount: Number(shippingAmount) || 0,
      grandTotal: finalGrandTotal,
      paidAmount: totalPaid,
      balanceAmount: balanceDue,
      paymentMode: resolvedPaymentMode,
      paymentStatus: autoPaymentStatus,
      paymentSplits: savedSplits,
      notes: splitNote || initialBill?.notes,
      orderStatus: effectivePurchaseType === 'PO' ? (initialBill?.orderStatus || 'PENDING') : undefined,
      noteType: effectivePurchaseType === 'RETURN' ? 'D' : undefined,
      originalBillNumber: effectivePurchaseType === 'RETURN' ? (originalBillNumber.trim() || undefined) : undefined,
      originalBillDate: effectivePurchaseType === 'RETURN' ? (originalBillDate || undefined) : undefined,
      returnReason: effectivePurchaseType === 'RETURN' ? returnReason : undefined,
      createdAt: initialBill ? initialBill.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (!initialBill) {
      draftService.clearPurchaseDraft(effectivePurchaseType);
    }

    setIsSubmitting(true);
    onSave(newBill);
  }, [rows, calcSummary, isGstActive, paymentSplits, autoPaymentStatus, balanceDue, initialBill, billNumber, selectedSupplier, supplierStateCode, company.stateCode, billDate, dueDate, itcEligibility, isRcm, finalRoundOff, shippingAmount, finalGrandTotal, totalPaid, onSave, effectivePurchaseType, originalBillNumber, originalBillDate, returnReason]);

  // Auto-save draft on purchase bill edits when creating a new bill
  useEffect(() => {
    if (initialBill) return;
    draftService.savePurchaseDraft({
      billNumber,
      billDate,
      dueDate,
      selectedSupplier,
      supplierStateCode,
      itcEligibility,
      isRcm,
      shippingAmount,
      rows,
      paymentSplits,
      originalBillNumber,
      originalBillDate,
      returnReason,
      orderStatus: effectivePurchaseType === 'PO' ? 'PENDING' : undefined,
    }, effectivePurchaseType);
  }, [
    initialBill,
    billNumber,
    billDate,
    dueDate,
    selectedSupplier,
    supplierStateCode,
    itcEligibility,
    isRcm,
    shippingAmount,
    rows,
    paymentSplits,
    originalBillNumber,
    originalBillDate,
    returnReason,
    effectivePurchaseType,
  ]);

  // Safe close handler saving draft if unsaved progress exists
  const handleClose = useCallback(() => {
    if (!initialBill) {
      const draftData = {
        billNumber,
        billDate,
        dueDate,
        selectedSupplier,
        supplierStateCode,
        itcEligibility,
        isRcm,
        shippingAmount,
        rows,
        paymentSplits,
        originalBillNumber,
        originalBillDate,
        returnReason,
        orderStatus: effectivePurchaseType === 'PO' ? 'PENDING' : undefined,
      };
      if (draftService.isPurchaseDraftNotEmpty(draftData)) {
        draftService.savePurchaseDraft(draftData, effectivePurchaseType);
        showAppToast('Progress saved as draft');
      }
    }
    onClose();
  }, [
    initialBill,
    billNumber,
    billDate,
    dueDate,
    selectedSupplier,
    supplierStateCode,
    itcEligibility,
    isRcm,
    shippingAmount,
    rows,
    paymentSplits,
    originalBillNumber,
    originalBillDate,
    returnReason,
    effectivePurchaseType,
    onClose,
  ]);

  // Manual save draft handler
  const handleSaveDraft = useCallback(() => {
    const draftData = {
      billNumber,
      billDate,
      dueDate,
      selectedSupplier,
      supplierStateCode,
      itcEligibility,
      isRcm,
      shippingAmount,
      rows,
      paymentSplits,
      originalBillNumber,
      originalBillDate,
      returnReason,
      orderStatus: effectivePurchaseType === 'PO' ? 'PENDING' : undefined,
    };
    draftService.savePurchaseDraft(draftData, effectivePurchaseType);
    showAppToast('Progress saved as draft');
  }, [
    billNumber,
    billDate,
    dueDate,
    selectedSupplier,
    supplierStateCode,
    itcEligibility,
    isRcm,
    shippingAmount,
    rows,
    paymentSplits,
    originalBillNumber,
    originalBillDate,
    returnReason,
    effectivePurchaseType,
  ]);

  // Discard draft and reset form
  const handleDiscardDraft = useCallback(() => {
    draftService.clearPurchaseDraft(effectivePurchaseType);
    setRows([]);
    if (!initialSupplier) {
      setSelectedSupplier(null);
    }
    setShippingAmount(0);
    setOriginalBillNumber('');
    setOriginalBillDate('');
    setReturnReason('01-Defective Goods');
    setHasRestoredDraft(false);
    showAppToast('Draft discarded');
  }, [initialSupplier, effectivePurchaseType]);

  // Restore draft from storage
  const handleRestoreDraft = useCallback(() => {
    const draft = draftService.getPurchaseDraft(effectivePurchaseType);
    if (!draft) {
      showAppToast('No saved draft found');
      return;
    }
    if (draft.selectedSupplier) setSelectedSupplier(draft.selectedSupplier);
    if (draft.supplierStateCode) setSupplierStateCode(draft.supplierStateCode);
    if (draft.itcEligibility) setItcEligibility(draft.itcEligibility);
    if (typeof draft.isRcm === 'boolean') setIsRcm(draft.isRcm);
    if (typeof draft.shippingAmount === 'number') setShippingAmount(draft.shippingAmount);
    if (draft.originalBillNumber) setOriginalBillNumber(draft.originalBillNumber);
    if (draft.originalBillDate) setOriginalBillDate(draft.originalBillDate);
    if (draft.returnReason) setReturnReason(draft.returnReason);
    if (draft.rows && draft.rows.length > 0) {
      setRows(draft.rows);
    }
    if (draft.paymentSplits && draft.paymentSplits.length > 0) {
      setPaymentSplits(draft.paymentSplits);
    }
    setHasRestoredDraft(true);
    showAppToast('Draft restored');
  }, [effectivePurchaseType]);

  // Modals for editing dates/numbers
  const [isBillNoModalOpen, setIsBillNoModalOpen] = useState(false);
  const [isDueDateModalOpen, setIsDueDateModalOpen] = useState(false);
  const [isTaxDetailsOpen, setIsTaxDetailsOpen] = useState(false);

  // Sub-modal back navigation (priority 20)
  const isAnySubModalOpen =
    isItemModalOpen ||
    isAddPartyModalOpen ||
    isPartyModalOpen ||
    isScannerOpen ||
    isBillNoModalOpen ||
    isDueDateModalOpen ||
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
    if (isBillNoModalOpen) {
      setIsBillNoModalOpen(false);
      return true;
    }
    if (isDueDateModalOpen) {
      setIsDueDateModalOpen(false);
      return true;
    }
    if (isTaxDetailsOpen) {
      setIsTaxDetailsOpen(false);
      return true;
    }
    return false;
  }, isAnySubModalOpen, 20);

  // Global POS Keyboard Shortcuts
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
        handleSaveBill();
      } else if (e.key === 'F12') {
        e.preventDefault();
        setIsPartyModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnySubModalOpen, handleOpenAddItem, handleSaveBill]);

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col min-h-screen overflow-x-hidden antialiased">
      {/* Main Full-Width Scrollable Workstation */}
      <main className="flex-1 flex flex-col relative w-full pt-14 pb-36 sm:pb-32 bg-surface overflow-y-auto">
        <div className="px-3 sm:px-6 py-3 flex flex-col gap-3 w-full">
          <PurchaseHeaderMeta
            onClose={handleClose}
            isEditing={Boolean(initialBill)}
            selectedSupplier={selectedSupplier}
            billNumber={billNumber}
            billDate={billDate}
            dueDate={dueDate}
            supplierStateCode={supplierStateCode}
            itcEligibility={itcEligibility}
            isGstActive={isGstActive}
            isRcm={isRcm}
            onRcmChange={setIsRcm}
            onSelectSupplierClick={() => setIsPartyModalOpen(true)}
            onAddSupplierClick={() => setIsAddPartyModalOpen(true)}
            onClearSupplier={() => setSelectedSupplier(null)}
            onOpenBillNoModal={() => setIsBillNoModalOpen(true)}
            onOpenDueDateModal={() => setIsDueDateModalOpen(true)}
            purchaseType={effectivePurchaseType}
            originalBillNumber={originalBillNumber}
            onOriginalBillNumberChange={setOriginalBillNumber}
            originalBillDate={originalBillDate}
            onOriginalBillDateChange={setOriginalBillDate}
            returnReason={returnReason}
            onReturnReasonChange={setReturnReason}
            orderStatus={initialBill?.orderStatus || 'PENDING'}
            hasRestoredDraft={hasRestoredDraft}
            hasDraftInStorage={!initialBill && draftService.hasPurchaseDraft(effectivePurchaseType)}
            onSaveDraft={!initialBill ? handleSaveDraft : undefined}
            onRestoreDraft={!initialBill ? handleRestoreDraft : undefined}
            onDiscardDraft={!initialBill ? handleDiscardDraft : undefined}
          />

          {/* Composition Dealer Warning Alert Banner */}
          {selectedSupplier?.isComposition && (
            <div
              data-testid="purchase-composition-warning-banner"
              className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs flex items-center justify-between gap-2"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="material-symbols-outlined text-[18px] text-amber-600 dark:text-amber-400 flex-shrink-0">
                  warning
                </span>
                <div className="min-w-0">
                  <span className="font-bold block">Composition Dealer — ITC Ineligible</span>
                  <span className="text-[11px] block text-on-surface-variant truncate">
                    {selectedSupplier.name} is registered under the GST Composition Scheme. Inward supplies from composition dealers cannot claim Input Tax Credit (ITC).
                  </span>
                </div>
              </div>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-800 dark:text-amber-200 border border-amber-500/30 shrink-0">
                ITC Blocked
              </span>
            </div>
          )}

          <PurchaseLineItemsGrid
            rows={rows}
            calcItems={calcSummary.items}
            isGstActive={isGstActive}
            onAddItem={handleOpenAddItem}
            onEditItem={handleOpenEditItem}
            onRemoveItem={removeRow}
            onOpenScanner={() => setIsScannerOpen(true)}
          />

          <DocumentTotalsSummary
            title="Purchase Bill Summary"
            totalGrossAmount={calcSummary.totalGrossAmount}
            totalTax={calcSummary.totalTax}
            totalCgst={calcSummary.totalCgst}
            totalSgst={calcSummary.totalSgst}
            totalUtgst={calcSummary.totalUtgst}
            totalIgst={calcSummary.totalIgst}
            totalTaxableAmount={calcSummary.totalTaxableAmount}
            isIntraState={calcSummary.isIntraState}
            isGstActive={isGstActive}
            roundOff={finalRoundOff}
            shippingAmount={shippingAmount}
            onChangeShipping={setShippingAmount}
            isTaxDetailsOpen={isTaxDetailsOpen}
            onToggleTaxDetails={() => setIsTaxDetailsOpen(!isTaxDetailsOpen)}
            totalUnits={Number(rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0).toFixed(4))}
            finalGrandTotal={finalGrandTotal}
            accentColor="orange"
          />

          <PaymentSettlementDock
            paymentSplits={paymentSplits}
            autoPaymentStatus={autoPaymentStatus}
            balanceDue={balanceDue}
            onUpdateSplitMode={handleUpdateSplitMode}
            onUpdateSplitAmount={handleUpdateSplitAmount}
            onUpdateSplitAccount={handleUpdateSplitAccount}
            onAddSplitMode={handleAddSplitMode}
            onRemoveSplit={handleRemoveSplit}
            paymentModes={PURCHASE_PAYMENT_MODES}
          />

          <div className="h-8" aria-hidden="true" />
        </div>
      </main>

      <PurchaseActionDock
        finalGrandTotal={finalGrandTotal}
        isSubmitting={isSubmitting}
        onClose={handleClose}
        onSaveBill={handleSaveBill}
        purchaseType={effectivePurchaseType}
      />

      {/* Select Supplier Modal */}
      {isPartyModalOpen && (
        <SelectPartyModal
          parties={suppliers}
          onSelectParty={(p) => {
            setSelectedSupplier(p);
            setSupplierStateCode(p.stateCode);
            if (p.isComposition) {
              setItcEligibility('INELIGIBLE_OTHERS');
            }
            setIsPartyModalOpen(false);
          }}
          onClose={() => setIsPartyModalOpen(false)}
          onAddNewParty={() => {
            setIsPartyModalOpen(false);
            setIsAddPartyModalOpen(true);
          }}
        />
      )}

      {/* Add New Supplier Modal */}
      {isAddPartyModalOpen && (
        <AddEditPartyModal
          isOpen={isAddPartyModalOpen}
          onClose={() => setIsAddPartyModalOpen(false)}
          editingParty={null}
          initialType="SUPPLIER"
          parties={suppliers}
          onSave={handleSupplierCreated}
        />
      )}

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      {/* Edit Bill Number & Date Dialog */}
      <PurchaseBillNumberModal
        isOpen={isBillNoModalOpen}
        billNumber={billNumber}
        billDate={billDate}
        supplierStateCode={supplierStateCode}
        onApply={({ billNumber: newNum, billDate: newDate, supplierStateCode: newState }) => {
          setBillNumber(newNum);
          setBillDate(newDate);
          setSupplierStateCode(newState);
        }}
        onClose={() => setIsBillNoModalOpen(false)}
      />

      {/* Due Date Presets Dialog */}
      <DueDatePresetModal
        isOpen={isDueDateModalOpen}
        baseDate={billDate}
        currentDueDate={dueDate}
        onSelectDueDate={setDueDate}
        onClose={() => setIsDueDateModalOpen(false)}
        accentColor="orange"
      />

      {/* Add / Edit Purchase Item Modal */}
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
        mode="purchase"
      />
    </div>
  );
};

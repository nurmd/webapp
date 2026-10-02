import React, { useState, useMemo } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { PurchaseBill, PurchaseItemEntry, ItcEligibility } from '../../models/purchase.ts';
import { PaymentMode, PaymentStatus } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { SelectPartyModal } from '../Parties/SelectPartyModal.tsx';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { audioService } from '../../services/barcodeService.ts';
import { InvoiceItemModal, InvoiceItemData } from '../Invoicing/InvoiceItemModal.tsx';
import { db } from '../../services/db.ts';
import { generateNextInvoiceNumber } from '../../core/utils/invoiceNumber.ts';

interface TableGridPurchaseModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  initialBill?: PurchaseBill | null;
  initialSupplier?: Party | null;
  onClose: () => void;
  onSave: (bill: PurchaseBill) => void;
  onAddNewParty: () => void;
}

interface PurchaseGridRow {
  itemId: string;
  name: string;
  description?: string;
  hsnSacCode: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  mrp?: number;
  discountPercent: number;
  gstRate: number;
}

interface PaymentSplit {
  id: string;
  mode: PaymentMode;
  amount: number;
}

const PAYMENT_MODES: { value: PaymentMode; label: string }[] = [
  { value: 'NET_BANKING', label: 'Bank Transfer' },
  { value: 'UPI', label: 'UPI / QR' },
  { value: 'CASH', label: 'Cash' },
  { value: 'CARD', label: 'Card' },
  { value: 'CHEQUE', label: 'Cheque' },
  { value: 'CREDIT', label: 'Credit (Unpaid)' },
];

export const TableGridPurchaseModal: React.FC<TableGridPurchaseModalProps> = ({
  company,
  parties,
  itemsCatalog,
  initialBill,
  initialSupplier,
  onClose,
  onSave,
  onAddNewParty,
}) => {
  // Supplier selection
  const suppliers = parties.filter((p) => p.type === 'SUPPLIER' || p.type === 'CUSTOMER');
  const [selectedSupplier, setSelectedSupplier] = useState<Party | null>(() => {
    if (initialBill) {
      return (
        parties.find((p) => p.id === initialBill.supplierId) || {
          id: initialBill.supplierId,
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
        }
      );
    }
    if (initialSupplier) {
      return initialSupplier;
    }
    return suppliers[0] || null;
  });

  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  // Bill metadata (Sequential & Unique)
  const [billNumber, setBillNumber] = useState<string>(() => {
    if (initialBill?.billNumber) return initialBill.billNumber;
    const purchases = db.getPurchases();
    return generateNextInvoiceNumber(
      'PB-',
      purchases.map((p) => ({ id: p.id, invoiceNumber: p.billNumber }))
    );
  });
  const [billDate, setBillDate] = useState<string>(
    initialBill ? initialBill.date : new Date().toISOString().split('T')[0]
  );
  const [dueDate, setDueDate] = useState<string>(
    initialBill?.dueDate ||
      (() => {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        return d.toISOString().split('T')[0];
      })()
  );
  const [itcEligibility, setItcEligibility] = useState<ItcEligibility>(
    initialBill?.itcEligibility || 'ELIGIBLE_INPUTS'
  );
  const isGstActive = company.isGstEnabled !== false;
  const [supplierStateCode, setSupplierStateCode] = useState<string>(
    initialBill?.supplierStateCode || selectedSupplier?.stateCode || company.stateCode
  );

  // Discount & Shipping
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number>(0);
  const [shippingAmount, setShippingAmount] = useState<number>(initialBill?.shippingAmount || 0);

  // Dedicated Add/Edit Item Modal State
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingRowIndex, setEditingRowIndex] = useState<number | null>(null);

  const handleOpenAddItem = () => {
    setEditingRowIndex(null);
    setIsItemModalOpen(true);
  };

  const handleOpenEditItem = (index: number) => {
    setEditingRowIndex(index);
    setIsItemModalOpen(true);
  };

  const handleSaveItemModal = (itemData: InvoiceItemData) => {
    const gridItem: PurchaseGridRow = {
      itemId: itemData.itemId,
      name: itemData.name,
      description: itemData.description,
      hsnSacCode: itemData.hsnSacCode,
      quantity: itemData.quantity,
      unit: itemData.unit,
      unitPrice: itemData.unitPrice,
      mrp: itemData.mrp,
      discountPercent: itemData.discountPercent,
      gstRate: itemData.gstRate,
    };
    if (editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length) {
      const updated = [...rows];
      updated[editingRowIndex] = gridItem;
      setRows(updated);
    } else {
      setRows([...rows, gridItem]);
    }
    setEditingRowIndex(null);
  };

  const handleDeleteItemModal = () => {
    if (editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length) {
      setRows(rows.filter((_, idx) => idx !== editingRowIndex));
    }
    setEditingRowIndex(null);
  };

  // Line items
  const [rows, setRows] = useState<PurchaseGridRow[]>(() => {
    if (initialBill && initialBill.items.length > 0) {
      return initialBill.items.map((it) => ({
        itemId: it.itemId || '',
        name: it.name,
        description: '',
        hsnSacCode: it.hsnSacCode || '844332',
        quantity: it.quantity,
        unit: it.unit || 'PCS',
        unitPrice: it.unitPrice,
        discountPercent: it.discountPercent || 0,
        gstRate: it.gstRate,
      }));
    }
    return [];
  });

  // Calculate invoice
  const calcInputs = useMemo(() => {
    return rows.map((r) => ({
      quantity: Number(r.quantity) || 1,
      unitPrice: Number(r.unitPrice) || 0,
      discountPercent: Number(r.discountPercent) || 0,
      gstRate: isGstActive ? Number(r.gstRate) || 0 : 0,
    }));
  }, [rows, isGstActive]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(company.stateCode, supplierStateCode, calcInputs);
  }, [company.stateCode, supplierStateCode, calcInputs]);

  const overallDiscountAmount = useMemo(() => {
    if (overallDiscountPercent <= 0) return 0;
    return Number(((calcSummary.totalTaxableAmount * overallDiscountPercent) / 100).toFixed(2));
  }, [calcSummary.totalTaxableAmount, overallDiscountPercent]);

  const finalGrandTotal = useMemo(() => {
    return Math.max(0, Math.round(calcSummary.grandTotal - overallDiscountAmount + (Number(shippingAmount) || 0)));
  }, [calcSummary.grandTotal, overallDiscountAmount, shippingAmount]);

  // Payment splits state
  const [paymentSplits, setPaymentSplits] = useState<PaymentSplit[]>(() => {
    if (initialBill) {
      if (initialBill.paymentStatus === 'UNPAID' || initialBill.paymentMode === 'CREDIT') {
        return [{ id: '1', mode: 'CREDIT', amount: 0 }];
      }
      return [{ id: '1', mode: initialBill.paymentMode || 'NET_BANKING', amount: initialBill.paidAmount }];
    }
    return [{ id: '1', mode: 'NET_BANKING', amount: finalGrandTotal }];
  });

  const [isManualAmount, setIsManualAmount] = useState<boolean>(() => {
    return Boolean(initialBill && initialBill.paymentStatus === 'PARTIAL');
  });

  // Auto-sync single non-credit payment with finalGrandTotal
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
    if (paymentSplits.length === 1 && paymentSplits[0].mode === 'CREDIT') {
      return 0;
    }
    return paymentSplits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0);
  }, [paymentSplits]);

  const balanceDue = useMemo(() => {
    return Math.max(0, finalGrandTotal - totalPaid);
  }, [finalGrandTotal, totalPaid]);

  const autoPaymentStatus: PaymentStatus = useMemo(() => {
    if (paymentSplits.length === 1 && paymentSplits[0].mode === 'CREDIT') {
      return 'UNPAID';
    }
    if (finalGrandTotal <= 0) {
      return 'PAID';
    }
    if (totalPaid >= finalGrandTotal) {
      return 'PAID';
    }
    if (totalPaid > 0 && totalPaid < finalGrandTotal) {
      return 'PARTIAL';
    }
    return 'UNPAID';
  }, [paymentSplits, totalPaid, finalGrandTotal]);

  const handleUpdateSplitMode = (id: string, newMode: PaymentMode) => {
    setPaymentSplits((prev) =>
      prev.map((s) => {
        if (s.id !== id) return s;
        if (newMode === 'CREDIT') {
          return { ...s, mode: newMode, amount: 0 };
        }
        return {
          ...s,
          mode: newMode,
          amount: prev.length === 1 && !isManualAmount ? finalGrandTotal : s.amount,
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
    const nextMode: PaymentMode = !existingModes.has('UPI')
      ? 'UPI'
      : !existingModes.has('CASH')
      ? 'CASH'
      : !existingModes.has('CARD')
      ? 'CARD'
      : 'NET_BANKING';

    const currentTotal = paymentSplits.reduce((acc, s) => acc + (Number(s.amount) || 0), 0);
    const remaining = Math.max(0, finalGrandTotal - currentTotal);

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
    if (updated.length === 1 && updated[0].amount >= finalGrandTotal) {
      setIsManualAmount(false);
    }
    setPaymentSplits(updated);
  };

  // Row management
  const addRow = (presetItem?: InventoryItem) => {
    if (presetItem) {
      setRows([
        ...rows,
        {
          itemId: presetItem.id,
          name: presetItem.name,
          hsnSacCode: presetItem.hsnSacCode || '844332',
          quantity: 1,
          unit: presetItem.unit || 'PCS',
          unitPrice: presetItem.purchasePrice || presetItem.salePrice || 100,
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
          hsnSacCode: '844332',
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

  const updateRow = (index: number, field: keyof PurchaseGridRow, value: any) => {
    const updated = [...rows];
    (updated[index] as any)[field] = value;
    setRows(updated);
  };

  // Scanner modal
  const [isScannerOpen, setIsScannerOpen] = useState(false);
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
            hsnSacCode: found.hsnSacCode || '844332',
            quantity: 1,
            unit: found.unit || 'PCS',
            unitPrice: found.purchasePrice || found.salePrice || 0,
            mrp: found.mrp || found.salePrice,
            discountPercent: 0,
            gstRate: found.gstRate ?? 18,
          },
        ]);
      }
      setIsScannerOpen(false);
    } else {
      audioService.playScanError();
      alert(`No product found with barcode: ${scannedCode}`);
    }
  };

  // Save bill
  const handleSaveBill = () => {
    if (rows.length === 0) {
      alert('Please add at least one line item.');
      return;
    }
    const hasEmpty = rows.some((r) => !r.name.trim());
    if (hasEmpty) {
      alert('Please provide item names for all lines.');
      return;
    }

    const supState = supplierStateCode || selectedSupplier?.stateCode || company.stateCode;
    const isIntra = supState === company.stateCode;

    let resolvedPaymentMode: PaymentMode = paymentSplits[0]?.mode || 'NET_BANKING';
    if (autoPaymentStatus === 'UNPAID' && paymentSplits[0]?.mode === 'CREDIT') {
      resolvedPaymentMode = 'CREDIT';
    } else if (paymentSplits.length > 1) {
      const nonCredit = paymentSplits.find((s) => s.mode !== 'CREDIT');
      resolvedPaymentMode = nonCredit ? nonCredit.mode : paymentSplits[0].mode;
    }

    const purchaseItems: PurchaseItemEntry[] = rows.map((r, idx) => {
      const calcItem = calcSummary.items[idx];
      return {
        itemId: r.itemId || undefined,
        name: r.name || 'Purchased Stock',
        hsnSacCode: isGstActive ? r.hsnSacCode || '844332' : '',
        unit: (r.unit as any) || 'PCS',
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        discountPercent: r.discountPercent,
        taxableAmount: calcItem?.taxableAmount || r.quantity * r.unitPrice,
        gstRate: isGstActive ? r.gstRate || 0 : 0,
        cgstAmount: isGstActive ? calcItem?.cgstAmount || 0 : 0,
        sgstAmount: isGstActive ? calcItem?.sgstAmount || 0 : 0,
        igstAmount: isGstActive ? calcItem?.igstAmount || 0 : 0,
        cessAmount: 0,
        totalAmount: calcItem?.totalAmount || 0,
      };
    });

    const newBill: PurchaseBill = {
      id: initialBill ? initialBill.id : `PUR-${Date.now()}`,
      billNumber: billNumber.trim(),
      supplierId: selectedSupplier?.id || 'SUP-001',
      supplierName: selectedSupplier?.name || 'Local Vendor',
      supplierGstin: isGstActive ? selectedSupplier?.gstin : undefined,
      supplierAddress: selectedSupplier?.billingAddress || 'Local Vendor',
      supplierStateCode: supState,
      placeOfSupplyStateCode: company.stateCode,
      isIntraState: isIntra,
      date: billDate,
      dueDate: dueDate || undefined,
      items: purchaseItems,
      itcEligibility,
      isRcm: false,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount + overallDiscountAmount,
      totalTaxableAmount: Math.max(0, calcSummary.totalTaxableAmount - overallDiscountAmount),
      totalCgst: isGstActive ? calcSummary.totalCgst : 0,
      totalSgst: isGstActive ? calcSummary.totalSgst : 0,
      totalIgst: isGstActive ? calcSummary.totalIgst : 0,
      totalCess: 0,
      totalTax: isGstActive ? calcSummary.totalTax : 0,
      roundOff: calcSummary.roundOff,
      shippingAmount: Number(shippingAmount) || 0,
      grandTotal: finalGrandTotal,
      paidAmount: totalPaid,
      balanceAmount: balanceDue,
      paymentMode: resolvedPaymentMode,
      paymentStatus: autoPaymentStatus,
      createdAt: initialBill ? initialBill.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(newBill);
  };

  // Modals for editing dates/numbers
  const [isBillNoModalOpen, setIsBillNoModalOpen] = useState(false);
  const [customBillNo, setCustomBillNo] = useState(billNumber);
  const [isDueDateModalOpen, setIsDueDateModalOpen] = useState(false);
  const [isTaxDetailsOpen, setIsTaxDetailsOpen] = useState(false);

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
              <span className="material-symbols-outlined text-[20px]">arrow_back</span>
            </button>
            <div className="w-8 h-8 rounded-xl bg-orange-600 text-white flex items-center justify-center font-black text-sm shadow-xs flex-shrink-0">
              <span className="material-symbols-outlined text-[19px]">shopping_bag</span>
            </div>
            <div className="min-w-0 flex items-center gap-2">
              <span className="font-bold text-sm sm:text-base text-on-surface truncate">
                {initialBill ? 'Edit Purchase Bill' : 'Record Purchase Bill'}
              </span>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-orange-500/10 text-orange-600 dark:text-orange-400 border border-orange-500/20 shrink-0">
                Purchase (Inward)
              </span>
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
          {/* Ultra-Compact Supplier & Purchase Metadata Bar */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl px-3 py-2 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-2 text-xs">
            {/* Supplier Selector Pill */}
            <div className="flex items-center justify-between sm:justify-start gap-2 min-w-0">
              <button
                type="button"
                onClick={() => setIsPartyModalOpen(true)}
                className="flex items-center gap-2 hover:bg-surface-container-low px-2 py-1 rounded-lg transition-colors cursor-pointer group min-w-0 text-left"
                title="Select or Change Supplier"
              >
                <div className="w-7 h-7 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center flex-shrink-0 group-hover:bg-orange-600 group-hover:text-white transition-colors">
                  <span className="material-symbols-outlined text-[17px]">store</span>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-xs sm:text-sm text-on-surface truncate group-hover:text-orange-600">
                      {selectedSupplier ? selectedSupplier.name : 'Select Supplier / Vendor'}
                    </span>
                    <span className="material-symbols-outlined text-[14px] text-outline group-hover:text-orange-600 shrink-0">
                      swap_horiz
                    </span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px] text-on-surface-variant truncate">
                    {selectedSupplier?.gstin && isGstActive ? (
                      <span className="font-mono font-semibold text-orange-600 dark:text-orange-400">
                        GSTIN: {selectedSupplier.gstin}
                      </span>
                    ) : (
                      <span className="text-outline">Unregistered Vendor</span>
                    )}
                    {supplierStateCode && <span>· State: {supplierStateCode}</span>}
                  </div>
                </div>
              </button>

              {selectedSupplier && (
                <div className="flex items-center gap-1 shrink-0">
                  {(selectedSupplier.currentBalance || 0) > 0 ? (
                    <span className="text-[10px] font-bold text-amber-800 bg-amber-100 dark:bg-amber-950/60 dark:text-amber-300 px-2 py-0.5 rounded-full border border-amber-300/60">
                      Payable: {formatINR(selectedSupplier.currentBalance || 0)}
                    </span>
                  ) : null}
                </div>
              )}
            </div>

            {/* Bill Metadata Pills */}
            <div className="flex items-center flex-wrap gap-1.5">
              {/* Bill Number */}
              <button
                type="button"
                onClick={() => setIsBillNoModalOpen(true)}
                className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-semibold text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
                title="Change Bill Number"
              >
                <span className="text-[9px] uppercase font-bold text-outline">Bill #:</span>
                <span className="font-bold text-on-surface truncate max-w-[120px]">{billNumber}</span>
                <span className="material-symbols-outlined text-[12px] text-outline">edit</span>
              </button>

              {/* Bill Date */}
              <button
                type="button"
                onClick={() => setIsBillNoModalOpen(true)}
                className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
                title="Change Bill Date"
              >
                <span className="material-symbols-outlined text-[13px] text-outline">calendar_today</span>
                <span>{billDate}</span>
              </button>

              {/* Due Date */}
              <button
                type="button"
                onClick={() => setIsDueDateModalOpen(true)}
                className="h-7 px-2 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-medium text-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
                title="Change Payment Due Date"
              >
                <span className="text-[9px] uppercase font-bold text-outline">Due:</span>
                <span>{dueDate}</span>
                <span className="material-symbols-outlined text-[12px] text-outline">event</span>
              </button>

              {/* ITC Eligibility Selector */}
              <div className="h-7 px-2 rounded-lg bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-[11px] flex items-center gap-1 border border-orange-500/20">
                <span className="material-symbols-outlined text-[14px]">verified</span>
                <span>
                  {itcEligibility === 'ELIGIBLE_INPUTS'
                    ? 'ITC: Inputs'
                    : itcEligibility === 'ELIGIBLE_CAPITAL_GOODS'
                    ? 'ITC: Capital'
                    : itcEligibility === 'ELIGIBLE_SERVICES'
                    ? 'ITC: Services'
                    : 'No ITC'}
                </span>
              </div>
            </div>
          </div>

          {/* Full-Width Line Items Table Sheet */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs overflow-hidden">
            <div className="px-3 sm:px-4 py-2.5 bg-surface-container-low/60 border-b border-outline-variant/20 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[18px] text-orange-600 dark:text-orange-400">inventory_2</span>
                <span className="font-bold text-xs sm:text-sm text-on-surface">
                  Purchased Items ({rows.length})
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
                  title="Scan Product Barcode"
                  aria-label="Scan Product Barcode"
                >
                  <span className="material-symbols-outlined text-[18px] text-orange-600 dark:text-orange-400">barcode_scanner</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddItem}
                  className="w-8 h-8 rounded-lg bg-orange-600 text-white flex items-center justify-center hover:bg-orange-700 transition-all cursor-pointer shadow-2xs shadow-orange-600/20 active:scale-95"
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
                <div className="w-12 h-12 rounded-xl bg-orange-500/10 text-orange-600 dark:text-orange-400 flex items-center justify-center">
                  <span className="material-symbols-outlined text-[26px]">inventory_2</span>
                </div>
                <h3 className="font-bold text-sm text-on-surface">No purchased items added yet</h3>
                <p className="text-xs text-on-surface-variant max-w-sm">
                  Add products to inward stock from your catalog or enter custom supplier items.
                </p>
                <div className="flex items-center gap-2 mt-2">
                  <button
                    type="button"
                    onClick={handleOpenAddItem}
                    className="px-4 py-2 rounded-xl bg-orange-600 text-white font-bold text-xs shadow-xs hover:bg-orange-700 transition-all cursor-pointer flex items-center gap-1.5 shadow-orange-600/20"
                  >
                    <span className="material-symbols-outlined text-[16px]">add_circle</span>
                    <span>+ Add First Item</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="px-3.5 py-2 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-all cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">barcode_scanner</span>
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
                        <th className="py-2.5 px-3 w-28 text-right">Purchase Rate (₹)</th>
                        <th className="py-2.5 px-3 w-24 text-right">Discount</th>
                        {isGstActive && <th className="py-2.5 px-3 w-24 text-right">GST Rate</th>}
                        <th className="py-2.5 px-4 w-32 text-right">Amount (₹)</th>
                        <th className="py-2.5 px-2 w-10 text-center"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-outline-variant/15 text-xs">
                      {rows.map((row, idx) => {
                        const itemCalc = calcSummary.items[idx];
                        const rowTotal = itemCalc?.totalAmount || (row.quantity * row.unitPrice * (1 - (row.discountPercent || 0) / 100));
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
                              <span className="font-bold text-on-surface block group-hover:text-orange-600 transition-colors">
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
                                <span className="text-orange-600 dark:text-orange-400 font-bold">
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
                              {formatINR(rowTotal)}
                            </td>
                            <td className="py-2.5 px-2 text-center" onClick={(e) => e.stopPropagation()}>
                              <button
                                type="button"
                                onClick={() => removeRow(idx)}
                                title="Remove item"
                                className="w-7 h-7 rounded flex items-center justify-center text-outline hover:text-error hover:bg-error-container/30 transition-colors cursor-pointer"
                              >
                                <span className="material-symbols-outlined text-[16px]">delete</span>
                              </button>
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
                    const rowTotal = itemCalc?.totalAmount || (row.quantity * row.unitPrice * (1 - (row.discountPercent || 0) / 100));
                    return (
                      <div
                        key={idx}
                        onClick={() => handleOpenEditItem(idx)}
                        className="p-3 hover:bg-surface-container-low/50 active:bg-surface-container-low cursor-pointer transition-colors group"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0 flex-1">
                            <span className="font-bold text-xs sm:text-sm text-on-surface block leading-snug group-hover:text-orange-600 transition-colors">
                              {idx + 1}. {row.name}
                            </span>
                            {row.description && (
                              <p className="text-[11px] text-on-surface-variant mt-0.5 line-clamp-1">
                                {row.description}
                              </p>
                            )}
                          </div>
                          <span className="font-tabular-data font-black text-sm text-orange-600 dark:text-orange-400 shrink-0">
                            {formatINR(rowTotal)}
                          </span>
                        </div>
                        <div className="flex items-center justify-between text-[11px] text-on-surface-variant mt-2 pt-1.5 border-t border-outline-variant/10">
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-on-surface">
                              {row.quantity} {row.unit}
                            </span>
                            <span>×</span>
                            <span>{formatINR(row.unitPrice)}</span>
                            {row.discountPercent > 0 && (
                              <span className="text-orange-600 dark:text-orange-400 font-semibold">(-{row.discountPercent}%)</span>
                            )}
                          </div>
                          {isGstActive && (
                            <span className="font-medium">
                              GST {row.gstRate}% {row.hsnSacCode ? `· HSN ${row.hsnSacCode}` : ''}
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
                    className="flex-1 py-2 px-3 rounded-lg border border-dashed border-orange-500/40 hover:border-orange-500 hover:bg-orange-500/10 text-orange-600 dark:text-orange-400 font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer active:scale-99"
                  >
                    <span className="material-symbols-outlined text-[17px]">add_circle</span>
                    <span>+ Add Item</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="py-2 px-3 rounded-lg border border-dashed border-outline-variant/40 hover:border-outline hover:bg-surface-container-low text-on-surface-variant font-semibold text-xs flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                    title="Scan Product Barcode"
                  >
                    <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">barcode_scanner</span>
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
                  Purchase Bill Summary
                </span>
                <span className="text-[11px] font-bold text-orange-600 dark:text-orange-400">
                  {isGstActive ? 'GST Compliant' : 'Non-GST'}
                </span>
              </div>

              {/* Subtotal */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant">
                <span>Subtotal (Items gross)</span>
                <span className="font-tabular-data font-semibold text-on-surface">
                  {formatINR(calcSummary.totalGrossAmount)}
                </span>
              </div>

              {/* Taxes */}
              {isGstActive && (
                <>
                  <div className="flex items-center justify-between text-xs text-on-surface-variant">
                    <button
                      type="button"
                      onClick={() => setIsTaxDetailsOpen(!isTaxDetailsOpen)}
                      className="flex items-center gap-1 text-left hover:text-on-surface cursor-pointer"
                    >
                      <span>{calcSummary.isIntraState ? 'Input Taxes (CGST + SGST)' : 'Input Taxes (IGST)'}</span>
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

              {/* Freight / Shipping Charges */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant py-0.5">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-outline">local_shipping</span>
                  <span>Freight / Delivery</span>
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
                    className="w-full pl-5 pr-2 py-0.5 rounded bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-orange-500 transition-all"
                  />
                </div>
              </div>

              {/* Bill Discount */}
              <div className="flex items-center justify-between text-xs text-on-surface-variant py-0.5">
                <div className="flex items-center gap-1">
                  <span className="material-symbols-outlined text-[15px] text-outline">percent</span>
                  <span>Vendor Discount</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="relative w-20 flex items-center">
                    <input
                      type="number"
                      min="0"
                      max="100"
                      value={overallDiscountPercent || ''}
                      onChange={(e) => setOverallDiscountPercent(Math.min(100, Math.max(0, Number(e.target.value) || 0)))}
                      placeholder="0"
                      className="w-full pr-5 pl-2 py-0.5 rounded bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-orange-500 transition-all"
                    />
                    <span className="absolute right-2 text-xs font-semibold text-outline pointer-events-none">%</span>
                  </div>
                </div>
              </div>

              <div className="h-px bg-outline-variant/20 my-1"></div>

              {/* Grand Total Ledger Highlight Box */}
              <div className="p-3 rounded-lg bg-surface-container text-on-surface flex items-center justify-between border border-outline-variant/30">
                <div>
                  <span className="text-[10px] uppercase font-bold tracking-wider text-on-surface-variant block">
                    Total Inward Bill Value
                  </span>
                  <span className="text-[11px] text-on-surface-variant">
                    {rows.reduce((sum, r) => sum + (Number(r.quantity) || 1), 0)} Total Units
                  </span>
                </div>
                <div className="text-right">
                  <span className="font-tabular-data text-xl sm:text-2xl font-black text-orange-600 dark:text-orange-400 tracking-tight block">
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
                <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">payments</span>
                <span className="font-bold text-xs text-on-surface">Payment Settlement</span>
              </div>

              {/* Auto-identified Payment Status Badge */}
              <div>
                {autoPaymentStatus === 'PAID' && (
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-orange-500/15 text-orange-700 dark:text-orange-300 border border-orange-500/30 flex items-center gap-1">
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
                      className="w-full h-8 pl-2 pr-6 rounded-lg bg-surface-container-low text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-orange-500 transition-colors cursor-pointer appearance-none"
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
                        value={split.amount || ''}
                        onChange={(e) => handleUpdateSplitAmount(split.id, Number(e.target.value) || 0)}
                        placeholder="0.00"
                        className="w-full h-8 pl-5 pr-2 rounded-lg bg-surface-container-low text-right font-tabular-data text-xs font-bold text-on-surface border border-outline-variant/30 outline-none focus:border-orange-500 transition-all"
                      />
                    </div>
                  ) : (
                    <div className="flex-1 h-8 px-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-800 dark:text-amber-300 font-medium flex items-center justify-between">
                      <span className="truncate">Vendor Payable Balance</span>
                      <span className="font-tabular-data font-bold shrink-0">{formatINR(finalGrandTotal)}</span>
                    </div>
                  )}

                  {/* Plus button next to it for split payment modes */}
                  {index === 0 && split.mode !== 'CREDIT' && (
                    <button
                      type="button"
                      onClick={handleAddSplitMode}
                      title="Add split payment mode"
                      className="h-8 px-2 sm:px-2.5 rounded-lg bg-surface-container-low hover:bg-surface-container text-on-surface font-bold text-xs flex items-center gap-1 border border-outline-variant/30 transition-all cursor-pointer shrink-0"
                    >
                      <span className="material-symbols-outlined text-[16px] text-orange-600 dark:text-orange-400">add</span>
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
            </div>
          </div>
          {/* Bottom spacing clearance to prevent overlap with sticky action dock */}
          <div className="h-8" aria-hidden="true" />
        </div>
      </main>

      {/* Sticky Bottom Full-Width Action Dock */}
      <aside
        aria-label="Purchase Actions"
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-lg pb-safe"
      >
        <div className="px-3 sm:px-6 py-2.5 flex items-center justify-between gap-3 w-full">
          <div className="flex flex-col">
            <span className="text-[10px] text-on-surface-variant uppercase font-bold tracking-wider">
              Total Inward Bill
            </span>
            <span className="font-tabular-data font-black text-sm text-orange-600 dark:text-orange-400">
              {formatINR(finalGrandTotal)}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="h-10 px-4 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs sm:text-sm flex items-center gap-1.5 transition-all cursor-pointer border border-outline-variant/40"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSaveBill}
              className="h-10 px-5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-bold text-xs sm:text-sm flex items-center gap-1.5 shadow-sm shadow-orange-600/30 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[18px]">save</span>
              <span>Save Purchase Bill</span>
            </button>
          </div>
        </div>
      </aside>

      {/* Select Supplier Modal */}
      {isPartyModalOpen && (
        <SelectPartyModal
          parties={suppliers}
          onSelectParty={(p) => {
            setSelectedSupplier(p);
            setSupplierStateCode(p.stateCode);
            setIsPartyModalOpen(false);
          }}
          onClose={() => setIsPartyModalOpen(false)}
          onAddNewParty={() => {
            setIsPartyModalOpen(false);
            onAddNewParty();
          }}
        />
      )}

      {/* Camera Barcode Scanner Modal */}
      <CameraBarcodeScannerModal
        isOpen={isScannerOpen}
        onClose={() => setIsScannerOpen(false)}
        onScan={handleBarcodeScanned}
      />

      {/* Bill Number & Date Modal */}
      {isBillNoModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3">
            <h3 className="font-headline-sm text-base font-bold text-on-surface">Bill Identification</h3>
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                Vendor Bill / Invoice Number
              </label>
              <input
                type="text"
                value={customBillNo}
                onChange={(e) => setCustomBillNo(e.target.value)}
                placeholder="e.g. PB-2024-001"
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Bill Date</label>
              <input
                type="date"
                value={billDate}
                onChange={(e) => setBillDate(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
              />
            </div>
            <div>
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Supplier State</label>
              <select
                value={supplierStateCode}
                onChange={(e) => setSupplierStateCode(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
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
                onClick={() => setIsBillNoModalOpen(false)}
                className="flex-1 py-2 rounded-xl border border-outline-variant/40 text-on-surface font-label-md text-xs font-semibold cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => {
                  setBillNumber(customBillNo.trim() || billNumber);
                  setIsBillNoModalOpen(false);
                }}
                className="flex-1 py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-label-md text-xs font-bold shadow-sm cursor-pointer"
              >
                Apply
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Due Date Modal */}
      {isDueDateModalOpen && (
        <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-2xl p-5 shadow-2xl border border-outline-variant/30 max-w-sm w-full animate-fade-in flex flex-col gap-3">
            <h3 className="font-headline-sm text-base font-bold text-on-surface">Payment Due Terms</h3>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  setDueDate(billDate);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Immediate</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Due on receipt</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(billDate);
                  d.setDate(d.getDate() + 15);
                  setDueDate(d.toISOString().split('T')[0]);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Net 15 Days</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Standard 15 days</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(billDate);
                  d.setDate(d.getDate() + 30);
                  setDueDate(d.toISOString().split('T')[0]);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Net 30 Days</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Monthly term</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  const d = new Date(billDate);
                  d.setDate(d.getDate() + 60);
                  setDueDate(d.toISOString().split('T')[0]);
                  setIsDueDateModalOpen(false);
                }}
                className="p-2.5 rounded-xl bg-surface-container-low text-left hover:bg-surface-container cursor-pointer transition-colors"
              >
                <span className="font-label-md text-xs font-bold block text-on-surface">Net 60 Days</span>
                <span className="font-body-sm text-[10px] text-on-surface-variant">Extended credit</span>
              </button>
            </div>
            <div className="pt-2">
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">Custom Due Date</label>
              <input
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-orange-500/40 focus:border-orange-500"
              />
            </div>
            <button
              type="button"
              onClick={() => setIsDueDateModalOpen(false)}
              className="py-2 rounded-xl bg-orange-600 hover:bg-orange-700 text-white font-label-md text-xs font-bold cursor-pointer mt-1"
            >
              Done
            </button>
          </div>
        </div>
      )}
      {/* Add / Edit Purchase Item Modal with Catalog Search & Real-Time Estimation */}
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
        itemsCatalog={itemsCatalog}
        isIntraState={calcSummary.isIntraState}
        isGstActive={isGstActive}
        mode="purchase"
      />
    </div>
  );
};

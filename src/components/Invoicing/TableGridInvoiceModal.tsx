import React, { useState, useMemo } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, PaymentMode } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { SelectPartyModal } from '../Parties/SelectPartyModal.tsx';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { InvoicePreviewModal } from './InvoicePreviewModal.tsx';
import { WhatsAppShareModal } from '../WhatsApp/WhatsAppShareModal.tsx';
import { audioService } from '../../services/barcodeService.ts';
import { InvoiceItemModal, InvoiceItemData } from './InvoiceItemModal.tsx';

interface TableGridInvoiceModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  initialInvoice?: Invoice | null;
  onClose: () => void;
  onSave: (invoice: Invoice) => void;
  onAddNewParty: () => void;
}

export type GridRow = InvoiceItemData;

export const TableGridInvoiceModal: React.FC<TableGridInvoiceModalProps> = ({
  company,
  parties,
  itemsCatalog,
  initialInvoice,
  onClose,
  onSave,
  onAddNewParty,
}) => {
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
    return null;
  });

  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  // Invoice numbers & dates
  const [invoiceNumber, setInvoiceNumber] = useState<string>(
    initialInvoice?.invoiceNumber ||
      `${company.invoicePrefix || 'INV-'}${new Date().getFullYear()}-${Math.floor(100 + Math.random() * 900)}`
  );
  const [isInvoiceNumberModalOpen, setIsInvoiceNumberModalOpen] = useState(false);
  const [customInvoiceNumberInput, setCustomInvoiceNumberInput] = useState(invoiceNumber);

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
  const calcInputs = useMemo(() => {
    return rows.map((r) => ({
      quantity: Number(r.quantity) || 1,
      unitPrice: Number(r.unitPrice) || 0,
      discountPercent: Number(r.discountPercent) || 0,
      gstRate: isGstActive ? (Number(r.gstRate) || 0) : 0,
    }));
  }, [rows, isGstActive]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(company.stateCode, posStateCode, calcInputs);
  }, [company.stateCode, posStateCode, calcInputs]);

  // Overall discount deduction
  const overallDiscountAmount = useMemo(() => {
    if (overallDiscountPercent <= 0) return 0;
    return Number(((calcSummary.totalTaxableAmount * overallDiscountPercent) / 100).toFixed(2));
  }, [calcSummary.totalTaxableAmount, overallDiscountPercent]);

  const finalGrandTotal = useMemo(() => {
    return Math.max(0, Math.round(calcSummary.grandTotal - overallDiscountAmount + (Number(shippingAmount) || 0)));
  }, [calcSummary.grandTotal, overallDiscountAmount, shippingAmount]);

  // Payment status & split
  const [cashAmount, setCashAmount] = useState<number>(() => {
    if (initialInvoice) {
      return initialInvoice.paymentMode === 'CASH' ? initialInvoice.paidAmount : 0;
    }
    return finalGrandTotal;
  });

  const [bankAmount, setBankAmount] = useState<number>(() => {
    if (initialInvoice && initialInvoice.paymentMode !== 'CASH' && initialInvoice.paymentMode !== 'CREDIT') {
      return initialInvoice.paidAmount;
    }
    return 0;
  });

  const [paymentModeTab, setPaymentModeTab] = useState<'paid' | 'credit'>(() => {
    if (initialInvoice && initialInvoice.paymentStatus === 'UNPAID') return 'credit';
    return 'paid';
  });

  // Auto-sync cash amount when total changes and user hasn't chosen credit
  React.useEffect(() => {
    if (paymentModeTab === 'paid') {
      if (bankAmount > 0) {
        setCashAmount(Math.max(0, finalGrandTotal - bankAmount));
      } else {
        setCashAmount(finalGrandTotal);
      }
    } else {
      setCashAmount(0);
      setBankAmount(0);
    }
  }, [finalGrandTotal, paymentModeTab]);

  const totalPaid = useMemo(() => {
    if (paymentModeTab === 'credit') return 0;
    return Number(cashAmount) + Number(bankAmount);
  }, [paymentModeTab, cashAmount, bankAmount]);

  const balanceDue = useMemo(() => {
    return Math.max(0, finalGrandTotal - totalPaid);
  }, [finalGrandTotal, totalPaid]);

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
    let resolvedPaymentMode: PaymentMode = 'CASH';
    if (paymentModeTab === 'credit') {
      resolvedPaymentMode = 'CREDIT';
    } else if (bankAmount > 0 && cashAmount > 0) {
      resolvedPaymentMode = 'UPI'; // Split / hybrid
    } else if (bankAmount > 0) {
      resolvedPaymentMode = 'UPI';
    } else {
      resolvedPaymentMode = 'CASH';
    }

    const paymentStatus =
      paymentModeTab === 'credit' || balanceDue > 0
        ? totalPaid > 0
          ? 'PARTIAL'
          : 'UNPAID'
        : 'PAID';

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
      totalDiscount: calcSummary.totalDiscount + overallDiscountAmount,
      totalTaxableAmount: Math.max(0, calcSummary.totalTaxableAmount - overallDiscountAmount),
      totalCgst: isGstActive ? calcSummary.totalCgst : 0,
      totalSgst: isGstActive ? calcSummary.totalSgst : 0,
      totalIgst: isGstActive ? calcSummary.totalIgst : 0,
      totalCess: isGstActive ? calcSummary.totalCess : 0,
      totalTax: isGstActive ? calcSummary.totalTax : 0,
      roundOff: calcSummary.roundOff,
      shippingAmount: Number(shippingAmount) || 0,
      grandTotal: finalGrandTotal,
      amountInWords: amountInWords(finalGrandTotal),
      paymentMode: resolvedPaymentMode,
      paymentStatus,
      paidAmount: totalPaid,
      balanceAmount: balanceDue,
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
              <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider bg-secondary/10 text-secondary border border-secondary/20">
                {isGstActive
                  ? (calcSummary.isIntraState ? 'Intra-State GST' : 'Inter-State IGST')
                  : 'Retail Mode (Non-GST)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="h-8 px-2.5 bg-surface-container rounded-lg font-bold text-xs text-on-surface flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30"
              title="Camera Barcode Scanner"
            >
              <span className="material-symbols-outlined text-[17px] text-secondary">barcode_scanner</span>
              <span className="hidden sm:inline">Scan</span>
            </button>

            <button
              type="button"
              onClick={handleOpenAddItem}
              className="h-8 px-3 bg-secondary text-on-secondary rounded-lg font-bold text-xs flex items-center gap-1.5 shadow-xs hover:bg-secondary/90 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[17px]">add</span>
              <span>Add Item</span>
            </button>

            <div className="w-px h-6 bg-outline-variant/30 mx-0.5"></div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-xl flex items-center justify-center text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Full-Width Scrollable Workstation */}
      <main className="flex-1 flex flex-col relative w-full pt-14 pb-24 bg-surface overflow-y-auto">
        <div className="px-3 sm:px-6 py-3 flex flex-col gap-3 w-full">
          {/* Document Header Band: Billed To Customer & Invoice Metadata */}
          <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl shadow-xs overflow-hidden flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-outline-variant/20">
            {/* Customer / Billed To Section */}
            <div className="p-3 sm:p-4 flex-1 flex flex-col justify-between gap-2">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-secondary"></span>
                  <span className="text-[10px] sm:text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Billed To (Customer)
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => setIsPartyModalOpen(true)}
                  className="inline-flex items-center gap-1 text-secondary font-bold text-xs hover:underline cursor-pointer"
                >
                  <span>{selectedParty ? 'Change Customer' : '+ Select Customer'}</span>
                  <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
                </button>
              </div>

              <div className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <h2 className="font-bold text-sm sm:text-base text-on-surface truncate">
                    {selectedParty ? selectedParty.name : 'Cash Sale / Walk-in Customer'}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-on-surface-variant">
                    {selectedParty?.gstin && isGstActive ? (
                      <span className="font-mono text-[11px] font-semibold bg-surface-container px-1.5 py-0.5 rounded border border-outline-variant/20">
                        GSTIN: {selectedParty.gstin}
                      </span>
                    ) : (
                      <span className="text-[11px] bg-surface-container px-1.5 py-0.5 rounded font-medium">
                        Unregistered / Retail
                      </span>
                    )}
                    <span>· Place of Supply: <strong className="text-on-surface">{posStateCode}</strong></span>
                    {selectedParty?.billingAddress && (
                      <span className="truncate max-w-xs">· {selectedParty.billingAddress}</span>
                    )}
                  </div>
                </div>

                {selectedParty && (
                  <div className="text-right shrink-0">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold ${
                        (selectedParty?.currentBalance || 0) > 0
                          ? 'bg-amber-100 text-amber-900 border border-amber-300'
                          : (selectedParty?.currentBalance || 0) < 0
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {(selectedParty?.currentBalance || 0) > 0
                        ? `Balance Due: ${formatINR(selectedParty?.currentBalance || 0)}`
                        : 'Balance: Settled'}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Invoice Meta Grid Section (Invoice No, Dates, Mode) */}
            <div className="p-3 sm:p-4 md:w-80 lg:w-96 bg-surface-container-low/30 flex flex-col justify-between gap-2.5">
              <div className="grid grid-cols-2 gap-2">
                {/* Invoice Number */}
                <button
                  type="button"
                  onClick={() => setIsInvoiceNumberModalOpen(true)}
                  className="text-left p-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                    Invoice No.
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="font-bold text-xs sm:text-sm text-on-surface group-hover:text-secondary truncate">
                      #{invoiceNumber}
                    </span>
                    <span className="material-symbols-outlined text-[13px] text-outline group-hover:text-secondary">edit</span>
                  </div>
                </button>

                {/* Invoice Date */}
                <button
                  type="button"
                  onClick={() => setIsInvoiceNumberModalOpen(true)}
                  className="text-left p-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                    Invoice Date
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="font-semibold text-xs sm:text-sm text-on-surface group-hover:text-secondary truncate">
                      {formatDateDisplay(invoiceDate)}
                    </span>
                    <span className="material-symbols-outlined text-[13px] text-outline group-hover:text-secondary">calendar_today</span>
                  </div>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-outline-variant/20">
                {/* Due Date */}
                <button
                  type="button"
                  onClick={() => setIsDueDateModalOpen(true)}
                  className="text-left p-1.5 rounded-lg hover:bg-surface-container transition-colors cursor-pointer group"
                >
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                    Due Date
                  </span>
                  <div className="flex items-center gap-1 mt-0.5">
                    <span className="font-semibold text-xs text-on-surface group-hover:text-secondary truncate">
                      {formatDateDisplay(dueDate)}
                    </span>
                    <span className="material-symbols-outlined text-[13px] text-outline group-hover:text-secondary">event</span>
                  </div>
                </button>

                {/* Tax / Retail Mode Status */}
                <div className="p-1.5">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-on-surface-variant block">
                    Billing Mode
                  </span>
                  <span className="font-bold text-xs text-secondary truncate block mt-0.5">
                    {isGstActive ? 'GST Invoice' : 'Non-GST Bill'}
                  </span>
                </div>
              </div>
            </div>
          </div>

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

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="h-7 px-2.5 bg-surface-container-lowest rounded-lg text-xs font-semibold text-on-surface flex items-center gap-1 hover:bg-surface-container transition-colors cursor-pointer border border-outline-variant/30 shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[15px] text-secondary">barcode_scanner</span>
                  <span>Scan</span>
                </button>
                <button
                  type="button"
                  onClick={handleOpenAddItem}
                  className="h-7 px-2.5 bg-secondary text-on-secondary rounded-lg text-xs font-bold flex items-center gap-1 hover:bg-secondary/90 transition-colors cursor-pointer shadow-2xs"
                >
                  <span className="material-symbols-outlined text-[15px]">add</span>
                  <span>Add Item</span>
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
              </>
            )}
          </div>

          {/* Lower Workstation Section: Left Payment & Terms, Right Financial Ledger */}
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
            {/* Left Column: Payment Settlement Details */}
            <div className="lg:col-span-7 flex flex-col gap-3">
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 sm:p-4 shadow-xs flex flex-col gap-2.5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[18px] text-secondary">payments</span>
                    <span className="font-bold text-xs sm:text-sm text-on-surface">
                      Payment &amp; Settlement
                    </span>
                  </div>
                  <span className="text-[11px] text-on-surface-variant">
                    {paymentModeTab === 'paid' ? 'Immediate Settlement' : 'Party Ledger Credit'}
                  </span>
                </div>

                {/* Paid vs Credit Segmented Control */}
                <div className="flex rounded-lg bg-surface-container-low p-1 gap-1 border border-outline-variant/20">
                  <button
                    type="button"
                    onClick={() => setPaymentModeTab('paid')}
                    className={`flex-1 py-1.5 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentModeTab === 'paid'
                        ? 'bg-surface-container-lowest text-secondary shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px]">check_circle</span>
                    <span>Paid / Cash Counter</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setPaymentModeTab('credit')}
                    className={`flex-1 py-1.5 rounded-md font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      paymentModeTab === 'credit'
                        ? 'bg-surface-container-lowest text-error shadow-xs'
                        : 'text-on-surface-variant hover:text-on-surface'
                    }`}
                  >
                    <span className="material-symbols-outlined text-[16px] text-error">schedule</span>
                    <span>Credit / Ledger Due</span>
                  </button>
                </div>

                {/* Payment Split Inputs */}
                {paymentModeTab === 'paid' ? (
                  <div className="rounded-lg bg-surface-container-low/40 p-2.5 flex flex-col gap-2 border border-outline-variant/20">
                    <div className="space-y-1.5">
                      {/* Cash Received */}
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface-container-lowest shadow-2xs border border-outline-variant/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[16px] text-on-surface-variant">payments</span>
                          <span className="font-bold text-xs text-on-surface">Cash Received</span>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-tabular-data text-on-surface-variant text-xs">₹</span>
                          <input
                            type="number"
                            min="0"
                            value={cashAmount}
                            onChange={(e) => setCashAmount(Math.max(0, Number(e.target.value)))}
                            className="w-24 text-right font-tabular-data font-bold text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded text-xs sm:text-sm outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                      </div>

                      {/* Bank / Online UPI */}
                      <div className="flex items-center justify-between gap-2 p-1.5 rounded-lg bg-surface-container-lowest shadow-2xs border border-outline-variant/20">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="material-symbols-outlined text-[16px] text-secondary">account_balance</span>
                          <div className="min-w-0">
                            <span className="font-bold text-xs text-on-surface block truncate">Bank / UPI Transfer</span>
                            <span className="text-[10px] text-on-surface-variant block truncate">
                              {company.bankName ? `${company.bankName} (${company.accountNumber || ''})` : 'Digital Bank Account'}
                            </span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="font-tabular-data text-on-surface-variant text-xs">₹</span>
                          <input
                            type="number"
                            min="0"
                            value={bankAmount}
                            onChange={(e) => setBankAmount(Math.max(0, Number(e.target.value)))}
                            className="w-24 text-right font-tabular-data font-bold text-on-surface bg-surface-container-low px-1.5 py-0.5 rounded text-xs sm:text-sm outline-none focus:ring-1 focus:ring-secondary"
                          />
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1 text-xs text-on-surface-variant border-t border-outline-variant/15">
                      <span>Total Paid: <strong className="text-on-surface font-bold">{formatINR(totalPaid)}</strong></span>
                      <span>Balance Due: <strong className={balanceDue > 0 ? 'text-error font-bold' : 'text-secondary font-bold'}>{formatINR(balanceDue)}</strong></span>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-lg bg-amber-500/10 border border-amber-500/20 p-2.5 text-xs text-amber-900 dark:text-amber-200 flex items-center gap-2">
                    <span className="material-symbols-outlined text-[18px] text-amber-600">info</span>
                    <span>
                      Full invoice amount of <strong>{formatINR(finalGrandTotal)}</strong> will be credited directly to <strong>{selectedParty?.name || 'Customer'}</strong>'s ledger.
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Right Column: Condensed Accounting Ledger Summary */}
            <div className="lg:col-span-5">
              <div className="bg-surface-container-lowest border border-outline-variant/30 rounded-xl p-3 sm:p-4 shadow-xs flex flex-col gap-2">
                <div className="flex items-center justify-between pb-1.5 border-b border-outline-variant/20">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                    Invoice Summary
                  </span>
                  <span className="text-[11px] font-bold text-secondary">
                    {isGstActive ? 'GST Compliant' : 'Non-GST'}
                  </span>
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
          </div>
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
              className="h-10 px-3.5 rounded-xl bg-surface-container font-bold text-xs text-on-surface flex items-center gap-1.5 hover:bg-surface-container-high transition-colors cursor-pointer border border-outline-variant/30"
            >
              <span className="material-symbols-outlined text-[18px]">visibility</span>
              <span>Preview</span>
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
          parties={parties}
          onSelectParty={(p) => {
            setSelectedParty(p);
            setPosStateCode(p.stateCode);
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

      {/* Invoice Preview Modal */}
      {previewInvoiceData && (
        <InvoicePreviewModal
          invoice={previewInvoiceData}
          company={company}
          onClose={() => setPreviewInvoiceData(null)}
          onEditInvoice={() => setPreviewInvoiceData(null)}
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
              <label className="text-[11px] font-bold text-on-surface-variant block mb-1">
                Invoice Number Series
              </label>
              <input
                type="text"
                value={customInvoiceNumberInput}
                onChange={(e) => setCustomInvoiceNumberInput(e.target.value)}
                placeholder="e.g. INV-2024-001"
                className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-sm text-on-surface font-semibold outline-none focus:ring-2 focus:ring-secondary/40"
              />
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
                onClick={() => {
                  setInvoiceNumber(customInvoiceNumberInput.trim() || invoiceNumber);
                  setIsInvoiceNumberModalOpen(false);
                }}
                className="flex-1 py-2 rounded-xl bg-secondary text-on-secondary font-label-md text-xs font-bold shadow-sm cursor-pointer"
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
        itemsCatalog={itemsCatalog}
        isIntraState={calcSummary.isIntraState}
        isGstActive={isGstActive}
      />
    </div>
  );
};

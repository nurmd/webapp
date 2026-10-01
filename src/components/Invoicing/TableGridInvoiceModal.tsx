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
  const [posStateCode, setPosStateCode] = useState<string>(
    initialInvoice?.placeOfSupplyStateCode || selectedParty?.stateCode || company.stateCode
  );

  // Overall Discount
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number>(0);
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

  // Calculate taxes and items
  const calcInputs = useMemo(() => {
    return rows.map((r) => ({
      quantity: Number(r.quantity) || 1,
      unitPrice: Number(r.unitPrice) || 0,
      discountPercent: Number(r.discountPercent) || 0,
      gstRate: Number(r.gstRate) || 0,
    }));
  }, [rows]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(company.stateCode, posStateCode, calcInputs);
  }, [company.stateCode, posStateCode, calcInputs]);

  // Overall discount deduction
  const overallDiscountAmount = useMemo(() => {
    if (overallDiscountPercent <= 0) return 0;
    return Number(((calcSummary.totalTaxableAmount * overallDiscountPercent) / 100).toFixed(2));
  }, [calcSummary.totalTaxableAmount, overallDiscountPercent]);

  const finalGrandTotal = useMemo(() => {
    return Math.max(0, Math.round(calcSummary.grandTotal - overallDiscountAmount));
  }, [calcSummary.grandTotal, overallDiscountAmount]);

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
        hsnSacCode: r.hsnSacCode || '998313',
        unit: (r.unit as any) || 'PCS',
        quantity: r.quantity,
        unitPrice: r.unitPrice,
        mrp: r.mrp,
        discountPercent: r.discountPercent,
        taxableAmount: calcItem?.taxableAmount || 0,
        gstRate: r.gstRate,
        cgstAmount: calcItem?.cgstAmount || 0,
        sgstAmount: calcItem?.sgstAmount || 0,
        igstAmount: calcItem?.igstAmount || 0,
        cessAmount: calcItem?.cessAmount || 0,
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
      invoiceType: isB2B ? 'B2B' : 'B2CS',
      date: invoiceDate,
      dueDate: dueDate || undefined,
      partyId: selectedParty?.id,
      partyName: selectedParty?.name || 'Cash Counter Customer',
      partyGstin: selectedParty?.gstin,
      partyAddress: selectedParty?.billingAddress || 'Local Counter',
      partyStateCode: posStateCode,
      placeOfSupplyStateCode: posStateCode,
      isIntraState: calcSummary.isIntraState,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount + overallDiscountAmount,
      totalTaxableAmount: Math.max(0, calcSummary.totalTaxableAmount - overallDiscountAmount),
      totalCgst: calcSummary.totalCgst,
      totalSgst: calcSummary.totalSgst,
      totalIgst: calcSummary.totalIgst,
      totalCess: calcSummary.totalCess,
      totalTax: calcSummary.totalTax,
      roundOff: calcSummary.roundOff,
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
      {/* Fixed Top Shell Header (Stitch mobile_stack standard) */}
      <header className="fixed top-0 w-full z-40 bg-surface-container-lowest/95 backdrop-blur-xl shadow-[0_1px_8px_rgba(0,0,0,0.06)] border-b border-outline-variant/30 pt-safe">
        <div className="h-14 px-3 sm:px-4 flex items-center justify-between gap-2 max-w-4xl mx-auto w-full">
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <button
              onClick={onClose}
              aria-label="Go Back"
              type="button"
              className="w-10 h-10 flex items-center justify-center text-on-surface active:bg-surface-container-low rounded-full transition-colors cursor-pointer flex-shrink-0"
            >
              <span className="material-symbols-outlined text-[24px]">arrow_back</span>
            </button>

            <div className="w-8 h-8 rounded-xl bg-secondary text-on-secondary flex items-center justify-center font-bold text-sm shadow-sm flex-shrink-0">
              ₹
            </div>

            <div className="flex flex-col min-w-0 ml-1">
              <h1 className="font-headline-sm text-base sm:text-lg font-bold text-on-surface truncate">
                {initialInvoice ? `Edit Invoice` : 'Create Invoice'}
              </h1>
              <span className="text-[11px] text-secondary font-medium truncate">
                {calcSummary.isIntraState ? 'Intra-State GST (CGST+SGST)' : 'Inter-State GST (IGST)'}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-1.5 flex-shrink-0">
            <button
              type="button"
              onClick={() => setIsScannerOpen(true)}
              className="h-8 px-2.5 bg-surface-container rounded-xl font-label-sm text-xs font-semibold text-secondary flex items-center gap-1 hover:bg-surface-container-high transition-colors cursor-pointer"
              title="Camera Barcode Scanner"
            >
              <span className="material-symbols-outlined text-[17px]">barcode_scanner</span>
              <span className="hidden sm:inline">Scan</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">close</span>
            </button>
          </div>
        </div>
      </header>

      {/* Main Scrollable Canvas */}
      <main className="flex-1 flex flex-col relative w-full pt-14 pb-28 bg-surface overflow-y-auto">
        <div className="px-3 sm:px-4 pt-3 flex flex-col gap-3 max-w-4xl mx-auto w-full">
          {/* Compact Meta Strip: Invoice No, Date & Terms */}
          <div className="bg-surface-container-lowest rounded-2xl p-3 shadow-sm border border-outline-variant/30 flex items-center justify-between gap-2">
            {/* Invoice Number & Date Button */}
            <button
              type="button"
              onClick={() => setIsInvoiceNumberModalOpen(true)}
              className="flex items-center gap-2 text-left min-w-0 flex-1 hover:opacity-85 transition-opacity cursor-pointer group"
            >
              <div className="w-9 h-9 rounded-xl bg-surface-container-low flex items-center justify-center text-secondary flex-shrink-0 group-hover:bg-secondary-container transition-colors">
                <span className="material-symbols-outlined text-[20px]">receipt_long</span>
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1">
                  <span className="font-label-md text-xs sm:text-sm font-bold text-on-surface truncate">
                    #{invoiceNumber}
                  </span>
                  <span className="material-symbols-outlined text-[14px] text-outline">edit</span>
                </div>
                <p className="font-body-sm text-[11px] text-on-surface-variant truncate">
                  {formatDateDisplay(invoiceDate)}
                </p>
              </div>
            </button>

            <div className="w-px h-8 bg-outline-variant/30 flex-shrink-0"></div>

            {/* Due Date & Terms Button */}
            <button
              type="button"
              onClick={() => setIsDueDateModalOpen(true)}
              className="flex items-center gap-2 flex-shrink-0 text-right hover:opacity-85 transition-opacity cursor-pointer"
            >
              <div className="text-right min-w-0">
                <span className="font-label-sm text-[10px] text-on-surface-variant uppercase tracking-wider block">
                  Due Date
                </span>
                <span className="font-label-md text-xs sm:text-sm font-bold text-on-surface truncate block">
                  {formatDateDisplay(dueDate)}
                </span>
              </div>
              <div className="w-8 h-8 rounded-xl bg-surface-container-low flex items-center justify-center text-on-surface flex-shrink-0">
                <span className="material-symbols-outlined text-[16px]">calendar_today</span>
              </div>
            </button>
          </div>

          {/* Party Selector (Compact Ledger Style) */}
          <div className="bg-surface-container-lowest rounded-2xl p-3 shadow-sm border border-outline-variant/30">
            <div className="flex items-center justify-between gap-2 pb-1.5 border-b border-outline-variant/20 mb-2">
              <div className="flex items-center gap-1.5 min-w-0">
                <span className="w-2 h-2 rounded-full bg-secondary flex-shrink-0"></span>
                <span className="font-label-sm text-[10px] sm:text-xs text-on-surface-variant uppercase tracking-wider font-bold">
                  Billed To (Party)
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsPartyModalOpen(true)}
                className="flex items-center gap-0.5 text-secondary font-label-sm text-xs font-bold hover:underline cursor-pointer"
              >
                <span>Change</span>
                <span className="material-symbols-outlined text-[15px]">swap_horiz</span>
              </button>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <h2 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface truncate">
                  {selectedParty ? selectedParty.name : 'Cash Sale / Walk-in Customer'}
                </h2>
                <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                  <span className="font-label-sm text-[10px] sm:text-[11px] bg-surface-container-low px-1.5 py-0.5 rounded text-on-surface-variant font-mono">
                    {selectedParty?.gstin ? selectedParty.gstin : 'Retail / Unregistered'}
                  </span>
                  <span className="font-body-sm text-xs text-on-surface-variant truncate">
                    · Place of Supply: {posStateCode}
                  </span>
                </div>
              </div>

              <div className="text-right flex-shrink-0 pl-1">
                {selectedParty ? (
                  <>
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded-full font-label-sm text-[11px] font-semibold ${
                        (selectedParty?.currentBalance || 0) > 0
                          ? 'bg-amber-100 text-amber-900'
                          : (selectedParty?.currentBalance || 0) < 0
                          ? 'bg-error-container text-on-error-container'
                          : 'bg-secondary-container text-on-secondary-container'
                      }`}
                    >
                      {(selectedParty?.currentBalance || 0) > 0
                        ? `Due ${formatINR(selectedParty?.currentBalance || 0)}`
                        : 'Settled'}
                    </span>
                    <span className="font-body-sm text-[10px] text-on-surface-variant block mt-0.5">
                      Party Ledger
                    </span>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setIsPartyModalOpen(true)}
                    className="px-2.5 py-1 rounded-xl bg-secondary/10 hover:bg-secondary/20 text-secondary font-bold text-xs transition-colors cursor-pointer"
                  >
                    + Select Party
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Core Items Section */}
          {rows.length === 0 ? (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden p-6 text-center flex flex-col items-center justify-center gap-3">
              <div className="w-14 h-14 rounded-2xl bg-secondary/10 text-secondary flex items-center justify-center">
                <span className="material-symbols-outlined text-[30px]">add_shopping_cart</span>
              </div>
              <div className="flex flex-col gap-1 max-w-sm">
                <h3 className="font-bold text-sm sm:text-base text-on-surface">No items on this bill yet</h3>
                <p className="text-xs text-on-surface-variant">
                  Add items from your inventory catalog or create custom products with live tax & total estimation.
                </p>
              </div>
              <div className="flex items-center gap-2 mt-1">
                <button
                  type="button"
                  onClick={handleOpenAddItem}
                  className="px-4 py-2.5 rounded-xl bg-secondary text-on-secondary font-bold text-xs shadow-sm hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px]">add_circle</span>
                  <span>+ Add Item</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="px-3.5 py-2.5 rounded-xl bg-surface-container-low text-on-surface font-bold text-xs border border-outline-variant/30 hover:bg-surface-container active:scale-95 transition-all cursor-pointer flex items-center gap-1.5"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">barcode_scanner</span>
                  <span>Scan Barcode</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="bg-surface-container-lowest rounded-2xl shadow-sm border border-outline-variant/30 overflow-hidden">
              {/* Section Header */}
              <div className="p-3 bg-surface-container-low flex items-center justify-between border-b border-outline-variant/20">
                <div className="flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[20px] text-secondary">inventory_2</span>
                  <span className="font-headline-sm text-sm font-bold text-on-surface">
                    Items ({rows.length})
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsScannerOpen(true)}
                    className="h-7 px-2.5 bg-surface-container-lowest rounded-lg font-label-sm text-xs text-on-surface flex items-center gap-1 shadow-xs hover:bg-surface-container transition-colors cursor-pointer border border-outline-variant/20"
                  >
                    <span className="material-symbols-outlined text-[16px] text-secondary">barcode_scanner</span>
                    <span>Scan</span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenAddItem}
                    className="h-7 px-2.5 bg-secondary text-on-secondary rounded-lg font-label-sm text-xs font-bold flex items-center gap-1 shadow-xs hover:bg-secondary/90 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">add</span>
                    <span>Add Item</span>
                  </button>
                </div>
              </div>

              {/* Table Header */}
              <div className="grid grid-cols-12 px-3 py-2 bg-surface-container text-on-surface-variant font-label-sm text-[11px] font-bold border-b border-outline-variant/20">
                <div className="col-span-5 sm:col-span-6 truncate">Item / Description</div>
                <div className="col-span-2 text-center">Qty</div>
                <div className="col-span-2 text-right">Price</div>
                <div className="col-span-3 sm:col-span-2 text-right">Total</div>
              </div>

              {/* Items Rows */}
              <div className="divide-y divide-outline-variant/20">
                {rows.map((row, idx) => {
                  const itemCalc = calcSummary.items[idx];
                  return (
                    <div
                      key={idx}
                      onClick={() => handleOpenEditItem(idx)}
                      className="grid grid-cols-12 px-3 py-2.5 items-center hover:bg-surface-container-low/50 active:bg-surface-container-low cursor-pointer transition-colors group"
                    >
                      {/* Name & Subtitle */}
                      <div className="col-span-5 sm:col-span-6 min-w-0 pr-2">
                        <span className="font-bold text-xs sm:text-sm text-on-surface block truncate group-hover:text-secondary transition-colors">
                          {row.name}
                        </span>
                        {row.description && (
                          <span className="text-[10px] text-on-surface-variant block truncate">
                            {row.description}
                          </span>
                        )}
                        <div className="flex items-center gap-1 text-[10px] sm:text-[11px] text-on-surface-variant truncate mt-0.5">
                          <span className="font-mono">HSN {row.hsnSacCode}</span>
                          <span>·</span>
                          <span className="text-secondary font-semibold">{row.gstRate}% GST</span>
                          {row.mrp && row.mrp > row.unitPrice && (
                            <>
                              <span>·</span>
                              <span className="line-through text-outline">MRP {formatINR(row.mrp)}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Qty & Unit */}
                      <div className="col-span-2 text-center min-w-0">
                        <span className="font-tabular-data text-xs font-bold text-on-surface block">
                          {row.quantity}
                        </span>
                        <span className="text-[10px] text-on-surface-variant block uppercase font-medium">
                          {row.unit}
                        </span>
                      </div>

                      {/* Price */}
                      <div className="col-span-2 text-right min-w-0">
                        <span className="font-tabular-data text-xs sm:text-sm font-semibold text-on-surface block">
                          {formatINR(row.unitPrice)}
                        </span>
                        {row.discountPercent > 0 && (
                          <span className="text-[10px] text-secondary font-semibold block">
                            {row.discountPercent}% off
                          </span>
                        )}
                      </div>

                      {/* Total & Action */}
                      <div className="col-span-3 sm:col-span-2 text-right flex items-center justify-end gap-1">
                        <div className="min-w-0 text-right">
                          <span className="font-tabular-data text-xs sm:text-sm text-on-surface font-black block truncate">
                            {formatINR(itemCalc?.totalAmount || 0)}
                          </span>
                          <span className="text-[10px] text-outline block">tax incl.</span>
                        </div>

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            removeRow(idx);
                          }}
                          title="Remove item"
                          className="w-7 h-7 rounded-lg flex items-center justify-center text-outline hover:text-error hover:bg-error-container/40 transition-colors ml-1 cursor-pointer flex-shrink-0"
                        >
                          <span className="material-symbols-outlined text-[16px]">delete</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Action Bar below Table */}
              <div className="p-2.5 bg-surface-container-low flex items-center gap-2 border-t border-outline-variant/20">
                <button
                  type="button"
                  onClick={handleOpenAddItem}
                  className="flex-1 py-2 px-3 rounded-xl bg-surface-container-lowest font-label-md text-xs sm:text-sm text-on-surface font-semibold shadow-xs hover:bg-surface-container flex items-center justify-center gap-1.5 transition-colors cursor-pointer border border-outline-variant/20"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">add_circle</span>
                  <span>+ Add Item</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsScannerOpen(true)}
                  className="py-2 px-3 rounded-xl bg-surface-container-lowest text-on-surface-variant hover:text-on-surface font-label-md text-xs sm:text-sm shadow-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20"
                >
                  <span className="material-symbols-outlined text-[18px] text-secondary">barcode_scanner</span>
                  <span>Barcode</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsExtraDiscountModalOpen(true)}
                  className={`py-2 px-3 rounded-xl font-label-md text-xs sm:text-sm shadow-xs flex items-center gap-1 transition-colors cursor-pointer border border-outline-variant/20 ${
                    overallDiscountPercent > 0
                      ? 'bg-secondary-container text-on-secondary-container font-bold'
                      : 'bg-surface-container-lowest text-on-surface-variant hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">percent</span>
                  <span>{overallDiscountPercent > 0 ? `${overallDiscountPercent}% Disc` : 'Discount'}</span>
                </button>
              </div>
            </div>
          )}

          {/* Condensed Bill Calculation & GST Summary */}
          <div className="bg-surface-container-lowest rounded-2xl p-3.5 shadow-sm border border-outline-variant/30 flex flex-col gap-2">
            {/* Subtotal */}
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-xs">
              <span>Subtotal (Items gross)</span>
              <span className="font-tabular-data text-on-surface font-medium">
                {formatINR(calcSummary.totalGrossAmount)}
              </span>
            </div>

            {/* Overall Discount */}
            {overallDiscountPercent > 0 && (
              <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-xs py-0.5">
                <div className="flex items-center gap-1.5">
                  <span className="text-on-surface font-medium">Overall Discount</span>
                  <button
                    type="button"
                    onClick={() => setIsExtraDiscountModalOpen(true)}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-surface-container text-on-secondary-container font-label-sm text-[11px] hover:bg-surface-container-high transition-colors cursor-pointer"
                  >
                    <span className="font-semibold">{overallDiscountPercent}% off</span>
                    <span className="material-symbols-outlined text-[12px]">edit</span>
                  </button>
                </div>
                <span className="font-tabular-data text-secondary font-semibold">
                  - {formatINR(overallDiscountAmount)}
                </span>
              </div>
            )}

            {/* Taxes */}
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-xs">
              <button
                type="button"
                onClick={() => setIsTaxDetailsOpen(!isTaxDetailsOpen)}
                className="flex items-center gap-1 text-left hover:text-on-surface cursor-pointer"
              >
                <span>
                  {calcSummary.isIntraState
                    ? 'Taxes (CGST + SGST)'
                    : 'Taxes (Inter-State IGST)'}
                </span>
                <span className="material-symbols-outlined text-[14px] text-outline">info</span>
              </button>
              <span className="font-tabular-data text-on-surface font-medium">
                + {formatINR(calcSummary.totalTax)}
              </span>
            </div>

            {/* Collapsible Tax Breakdown */}
            {isTaxDetailsOpen && (
              <div className="p-2.5 rounded-xl bg-surface-container-low text-xs flex flex-col gap-1 animate-fade-in border border-outline-variant/20">
                {calcSummary.isIntraState ? (
                  <>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span>Central GST (CGST)</span>
                      <span className="font-tabular-data font-semibold">{formatINR(calcSummary.totalCgst)}</span>
                    </div>
                    <div className="flex items-center justify-between text-on-surface-variant">
                      <span>State GST (SGST)</span>
                      <span className="font-tabular-data font-semibold">{formatINR(calcSummary.totalSgst)}</span>
                    </div>
                  </>
                ) : (
                  <div className="flex items-center justify-between text-on-surface-variant">
                    <span>Integrated GST (IGST)</span>
                    <span className="font-tabular-data font-semibold">{formatINR(calcSummary.totalIgst)}</span>
                  </div>
                )}
                <div className="flex items-center justify-between text-on-surface-variant pt-1 border-t border-outline-variant/20">
                  <span>Total Taxable Base</span>
                  <span className="font-tabular-data font-semibold">{formatINR(calcSummary.totalTaxableAmount)}</span>
                </div>
              </div>
            )}

            {/* Round Off */}
            <div className="flex items-center justify-between text-on-surface-variant font-body-sm text-xs">
              <span>Round Off</span>
              <span className="font-tabular-data text-on-surface font-medium">
                {calcSummary.roundOff >= 0 ? `+ ₹${calcSummary.roundOff}` : `- ₹${Math.abs(calcSummary.roundOff)}`}
              </span>
            </div>

            <div className="h-px bg-outline-variant/20 my-0.5"></div>

            {/* Grand Total */}
            <div className="flex items-baseline justify-between pt-0.5">
              <div>
                <span className="font-label-sm text-[11px] uppercase tracking-wide text-on-surface-variant block font-bold">
                  Grand Invoice Total
                </span>
                <span className="font-body-sm text-xs text-on-surface-variant">
                  {rows.reduce((sum, r) => sum + (Number(r.quantity) || 1), 0)} Total units
                </span>
              </div>
              <div className="text-right">
                <span className="font-currency-display-mobile text-xl sm:text-2xl font-extrabold text-secondary tracking-tight">
                  {formatINR(finalGrandTotal)}
                </span>
              </div>
            </div>

            {/* Payment Status & Split Segment */}
            <div className="mt-1 flex flex-col gap-2">
              {/* Payment Mode Pills */}
              <div className="flex items-center gap-1.5 p-1 rounded-xl bg-surface-container-low">
                <button
                  type="button"
                  onClick={() => setPaymentModeTab('paid')}
                  className={`flex-1 py-1.5 rounded-lg font-label-md text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentModeTab === 'paid'
                      ? 'bg-surface-container-lowest text-on-surface shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-secondary">
                    check_circle
                  </span>
                  <span>Paid / Cash</span>
                </button>

                <button
                  type="button"
                  onClick={() => setPaymentModeTab('credit')}
                  className={`flex-1 py-1.5 rounded-lg font-label-md text-xs font-semibold flex items-center justify-center gap-1 transition-all cursor-pointer ${
                    paymentModeTab === 'credit'
                      ? 'bg-surface-container-lowest text-error shadow-sm font-bold'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  <span className="material-symbols-outlined text-[16px] text-error">
                    schedule
                  </span>
                  <span>Credit / Ledger Due</span>
                </button>
              </div>

              {/* Payment Split Inputs */}
              {paymentModeTab === 'paid' && (
                <div className="rounded-xl bg-surface-container-low p-2.5 flex flex-col gap-2">
                  <div className="flex items-center justify-between text-on-surface-variant font-label-sm text-xs">
                    <span className="font-bold uppercase tracking-wide text-on-surface flex items-center gap-1">
                      <span className="material-symbols-outlined text-[15px] text-secondary">
                        account_balance_wallet
                      </span>
                      Payment Split &amp; Methods
                    </span>
                    <span className="text-[11px] text-secondary font-medium">
                      Auto-balanced
                    </span>
                  </div>

                  <div className="space-y-1.5">
                    {/* Cash Received */}
                    <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-surface-container-low flex items-center justify-center text-on-surface flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px]">payments</span>
                        </div>
                        <div className="min-w-0">
                          <span className="font-label-md text-xs text-on-surface block font-bold">
                            Cash Received
                          </span>
                          <span className="font-body-sm text-on-surface-variant text-[10px] block truncate">
                            Direct drawer balance
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-tabular-data text-on-surface-variant font-medium text-xs">
                          ₹
                        </span>
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
                    <div className="flex items-center justify-between gap-2 p-1.5 rounded-xl bg-surface-container-lowest shadow-sm border border-outline-variant/20">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-7 h-7 rounded-lg bg-secondary-container text-on-secondary-container flex items-center justify-center flex-shrink-0">
                          <span className="material-symbols-outlined text-[16px]">account_balance</span>
                        </div>
                        <div className="min-w-0">
                          <span className="font-label-md text-xs text-on-surface font-bold truncate block">
                            Bank / UPI QR
                          </span>
                          <span className="font-body-sm text-on-surface-variant text-[10px] block truncate">
                            {company.bankName ? `${company.bankName} · ${company.accountNumber || ''}` : 'Online Transfer'}
                          </span>
                        </div>
                      </div>
                      <div className="flex items-center gap-1">
                        <span className="font-tabular-data text-on-surface-variant font-medium text-xs">
                          ₹
                        </span>
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

                  <div className="flex items-center justify-between pt-0.5 text-xs text-on-surface-variant">
                    <span>
                      Paid: <strong className="text-on-surface font-bold">{formatINR(totalPaid)}</strong>
                    </span>
                    <span>
                      Due:{' '}
                      <strong className={balanceDue > 0 ? 'text-error font-bold' : 'text-secondary font-bold'}>
                        {formatINR(balanceDue)}
                      </strong>
                    </span>
                  </div>
                </div>
              )}

              {paymentModeTab === 'credit' && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-2.5 text-xs text-amber-900 flex items-center gap-2">
                  <span className="material-symbols-outlined text-[18px] text-amber-700">
                    info
                  </span>
                  <span>
                    Full invoice amount of <strong>{formatINR(finalGrandTotal)}</strong> will be credited directly to{' '}
                    <strong>{selectedParty?.name || 'Customer'}</strong>'s ledger account.
                  </span>
                </div>
              )}
            </div>
          </div>

          {/* Quick Visual Feedback Micro-Banner (Stitch standard) */}
          <div className="bg-surface-container-low rounded-2xl p-3 flex items-center justify-between border border-outline-variant/20">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center flex-shrink-0">
                <span className="material-symbols-outlined text-[18px]">verified</span>
              </div>
              <div className="min-w-0">
                <span className="font-label-md text-xs font-bold text-on-surface block">
                  E-Way &amp; GST Validated
                </span>
                <span className="font-body-sm text-[11px] text-on-surface-variant">
                  Ready for instant ITC claiming &amp; CA export
                </span>
              </div>
            </div>
            <span className="material-symbols-outlined text-[18px] text-outline">chevron_right</span>
          </div>
        </div>
      </main>

      {/* Sticky Bottom Quick-Action Bar (Stitch create_invoice_table_view) */}
      <aside
        aria-label="Invoice Actions"
        className="fixed bottom-0 left-0 right-0 z-40 bg-surface-container-lowest/95 backdrop-blur-xl border-t border-outline-variant/30 shadow-[0_-4px_16px_rgba(0,0,0,0.06)] pb-safe"
      >
        <div className="px-3 sm:px-4 py-2.5 flex items-center gap-2 max-w-4xl mx-auto w-full">
          {/* Preview Button */}
          <button
            type="button"
            onClick={() => {
              const inv = constructInvoiceObject();
              setPreviewInvoiceData(inv);
            }}
            className="h-12 px-4 rounded-2xl bg-surface-container font-label-md text-xs sm:text-sm font-bold text-on-surface flex items-center justify-center gap-1.5 active:bg-surface-container-high transition-colors flex-shrink-0 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">visibility</span>
            <span>Preview</span>
          </button>

          {/* Primary Save & Share WhatsApp Button */}
          <button
            type="button"
            onClick={() => handleSaveInvoice(true)}
            className="h-12 flex-1 rounded-2xl bg-secondary text-on-secondary font-label-md text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-[0_4px_16px_rgba(0,108,73,0.3)] active:scale-98 transition-all cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">send</span>
            <span>Save &amp; Share WhatsApp</span>
          </button>
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
      />
    </div>
  );
};

import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { Party } from '../../models/party.ts';
import { InventoryItem } from '../../models/item.ts';
import { Invoice, InvoiceItemEntry, InvoiceType, PaymentMode, PaymentStatus, PaymentSplit } from '../../models/invoice.ts';
import { exclusiveFromInclusive, inclusiveFromExclusive } from '../../core/gst/pricing.ts';
import { parseSplitsFromInvoice, formatSplitNotes } from '../../core/accounting/paymentSplitUtils.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { validateSingleInvoice } from '../../core/gst/gstrValidator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { roundQuantity } from '../../core/utils/formatters.ts';
import { getPartyTotalBalanceDue } from '../../core/utils/upiAndShare.ts';
import { SelectPartyModal } from '../Parties/SelectPartyModal.tsx';
import { AddEditPartyModal } from '../Parties/AddEditPartyModal.tsx';
import { CameraBarcodeScannerModal } from '../Scanner/CameraBarcodeScannerModal.tsx';
import { WhatsAppShareModal } from '../WhatsApp/WhatsAppShareModal.tsx';

const ThermalPrintModal = React.lazy(() =>
  import('../Printing/ThermalPrintModal.tsx').then((m) => ({ default: m.ThermalPrintModal }))
);
import { audioService } from '../../services/barcodeService.ts';
import { InvoiceItemModal, InvoiceItemData } from './InvoiceItemModal.tsx';
import { db } from '../../services/db.ts';
import {
  generateNextInvoiceNumber,
  generateNextDocumentNumber,
  findConflictingInvoice,
} from '../../core/utils/invoiceNumber.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { InvoiceHeaderMeta } from './components/InvoiceHeaderMeta.tsx';
import { InvoiceLineItemsGrid, GridRow } from './components/InvoiceLineItemsGrid.tsx';
import { DocumentTotalsSummary } from '../Common/Billing/DocumentTotalsSummary.tsx';
import { InvoicePaymentModal } from './components/InvoicePaymentModal.tsx';
import { InvoiceActionDock } from './components/InvoiceActionDock.tsx';
import { InvoiceNumberDateModal } from './components/InvoiceNumberDateModal.tsx';
import { DueDatePresetModal } from '../Common/Billing/DueDatePresetModal.tsx';
import { BillDiscountModal } from '../Common/Billing/BillDiscountModal.tsx';
import { draftService, InvoiceDraft } from '../../services/draftService.ts';
import { showAppToast } from '../../services/toast.ts';

export type { GridRow };

interface TableGridInvoiceModalProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  initialInvoice?: Invoice | null;
  initialParty?: Party | null;
  existingInvoices?: Invoice[];
  defaultInvoiceType?: InvoiceType;
  onClose: () => void;
  onSave: (invoice: Invoice, options?: { openPrint?: boolean }) => void;
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
  defaultInvoiceType,
  onClose,
  onSave,
  onAddNewParty,
  onPartyCreated,
}) => {
  // Draft state for new invoice restoration
  const initialDraft = useMemo(
    () => (!initialInvoice ? draftService.getInvoiceDraft(defaultInvoiceType) : null),
    [initialInvoice, defaultInvoiceType]
  );
  const [hasRestoredDraft, setHasRestoredDraft] = useState<boolean>(() => Boolean(initialDraft));

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
    if (!shippingAddress && newParty.shippingAddress) {
      setShippingAddress(newParty.shippingAddress);
    }
    if (!shippingPincode && newParty.pincode) {
      setShippingPincode(newParty.pincode);
    }
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
    if (initialDraft?.selectedParty) {
      return initialDraft.selectedParty;
    }
    return null;
  });

  const [isPartyModalOpen, setIsPartyModalOpen] = useState(false);

  // Invoice numbers & dates (Sequential & Guaranteed Unique)
  const [invoiceNumber, setInvoiceNumber] = useState<string>(() => {
    if (initialInvoice?.invoiceNumber) return initialInvoice.invoiceNumber;
    const invs = existingInvoices && existingInvoices.length > 0 ? existingInvoices : db.getInvoices();
    if (initialDraft?.invoiceNumber && !findConflictingInvoice(initialDraft.invoiceNumber, undefined, invs)) {
      return initialDraft.invoiceNumber;
    }
    const docSeries: any =
      defaultInvoiceType === 'ESTIMATE'
        ? 'ESTIMATE'
        : defaultInvoiceType === 'SALES_ORDER'
        ? 'SALES_ORDER'
        : defaultInvoiceType === 'DELIVERY_CHALLAN'
        ? 'DELIVERY_CHALLAN'
        : defaultInvoiceType === 'CREDIT_NOTE'
        ? 'CREDIT_NOTE'
        : defaultInvoiceType === 'DEBIT_NOTE'
        ? 'DEBIT_NOTE'
        : 'SALES_INVOICE';
    return generateNextDocumentNumber(docSeries, company, invs);
  });
  const [isInvoiceNumberModalOpen, setIsInvoiceNumberModalOpen] = useState(false);
  const [invoiceConflictError, setInvoiceConflictError] = useState<string | null>(null);

  // Real-time conflict checks against all invoices
  const currentConflict = useMemo(() => {
    return findConflictingInvoice(invoiceNumber, initialInvoice?.id, allInvoices);
  }, [invoiceNumber, initialInvoice, allInvoices]);

  const [invoiceDate, setInvoiceDate] = useState<string>(
    initialInvoice ? initialInvoice.date : (initialDraft?.invoiceDate || new Date().toISOString().split('T')[0])
  );
  const isDefaultDC = (initialInvoice?.invoiceType || initialDraft?.manualInvoiceType || defaultInvoiceType) === 'DELIVERY_CHALLAN';
  const [dueDate, setDueDate] = useState<string>(
    initialInvoice?.dueDate ||
      initialDraft?.dueDate ||
      (() => {
        const d = new Date();
        if (isDefaultDC) {
          return d.toISOString().split('T')[0];
        }
        const offset = typeof db.getDefaultDueDays === 'function' ? db.getDefaultDueDays() : 15;
        d.setDate(d.getDate() + offset);
        return d.toISOString().split('T')[0];
      })()
  );
  const [isDueDateModalOpen, setIsDueDateModalOpen] = useState(false);

  // Place of supply
  const isGstActive = company.isGstEnabled !== false;
  const [posStateCode, setPosStateCode] = useState<string>(
    initialInvoice?.placeOfSupplyStateCode || initialDraft?.posStateCode || selectedParty?.stateCode || company.stateCode
  );

  // Invoice Type manual override state (null defaults to auto-detected)
  const [manualInvoiceType, setManualInvoiceType] = useState<InvoiceType | null>(
    () => initialInvoice?.invoiceType || initialDraft?.manualInvoiceType || defaultInvoiceType || null
  );

  // Reverse Charge Mechanism (RCM) state
  const [isRcm, setIsRcm] = useState<boolean>(
    () => Boolean(initialInvoice?.isRcm ?? initialDraft?.isRcm)
  );

  // Overall Discount & Shipping
  const [overallDiscountPercent, setOverallDiscountPercent] = useState<number>(initialDraft?.overallDiscountPercent || 0);
  const [shippingAmount, setShippingAmount] = useState<number>(initialInvoice?.shippingAmount || initialDraft?.shippingAmount || 0);
  const [shippingAddress, setShippingAddress] = useState<string>(() => initialInvoice?.shippingAddress || initialDraft?.shippingAddress || '');
  const [shippingPincode, setShippingPincode] = useState<string>(() => initialInvoice?.shippingPincode || initialDraft?.shippingPincode || '');
  const [isExtraDiscountModalOpen, setIsExtraDiscountModalOpen] = useState(false);

  // Credit Note / Return References
  const [originalInvoiceNumber, setOriginalInvoiceNumber] = useState<string>(
    () => initialInvoice?.originalInvoiceNumber || initialDraft?.originalInvoiceNumber || ''
  );
  const [originalInvoiceDate, setOriginalInvoiceDate] = useState<string>(
    () => initialInvoice?.originalInvoiceDate || initialDraft?.originalInvoiceDate || ''
  );
  const [returnReason, setReturnReason] = useState<string>(
    () => initialInvoice?.returnReason || initialDraft?.returnReason || '01-Sales Return'
  );

  // Delivery Challan & Transportation fields
  const [consigneeName, setConsigneeName] = useState<string>(
    () => initialInvoice?.consigneeName || (initialDraft as any)?.consigneeName || ''
  );
  const [vehicleNumber, setVehicleNumber] = useState<string>(
    () => initialInvoice?.vehicleNumber || (initialDraft as any)?.vehicleNumber || ''
  );
  const [transporterName, setTransporterName] = useState<string>(
    () => initialInvoice?.transporterName || (initialDraft as any)?.transporterName || ''
  );
  const [transporterId, setTransporterId] = useState<string>(
    () => initialInvoice?.transporterId || (initialDraft as any)?.transporterId || ''
  );
  const [ewayBillNumber, setEwayBillNumber] = useState<string>(
    () => initialInvoice?.ewayBillNumber || (initialDraft as any)?.ewayBillNumber || ''
  );
  const [challanStatus, setChallanStatus] = useState<'DRAFT' | 'DISPATCHED' | 'DELIVERED' | 'CANCELLED'>(
    () => initialInvoice?.challanStatus || (initialDraft as any)?.challanStatus || 'DISPATCHED'
  );
  const [challanType, setChallanType] = useState<'SUPPLY_ON_APPROVAL' | 'JOB_WORK' | 'FOR_REMOVAL' | 'OTHERS'>(
    () => initialInvoice?.challanType || (initialDraft as any)?.challanType || 'FOR_REMOVAL'
  );

  // Scanner modal
  const [isScannerOpen, setIsScannerOpen] = useState(false);

  // Preview & Payment Modals
  const [previewInvoiceData, setPreviewInvoiceData] = useState<Invoice | null>(null);
  const [whatsAppInvoiceData, setWhatsAppInvoiceData] = useState<Invoice | null>(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);

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
    isPaymentModalOpen ||
    !!previewInvoiceData ||
    !!whatsAppInvoiceData ||
    isInvoiceNumberModalOpen ||
    isDueDateModalOpen ||
    isExtraDiscountModalOpen ||
    isTaxDetailsOpen;

  useBackNavigation(() => {
    if (isPaymentModalOpen) {
      setIsPaymentModalOpen(false);
      return true;
    }
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

  const handleSaveItemModal = (itemData: GridRow | InvoiceItemData) => {
    const mode = (!isGstActive || company.isCompositionScheme) ? 'EXCLUSIVE' : (itemData.priceMode ?? 'EXCLUSIVE');
    let excl = Number(itemData.unitPrice) || 0;
    const gst = isGstActive && !company.isCompositionScheme ? (Number((itemData as any).gstRate) || 0) : 0;
    let incl = itemData.unitPriceInclusive !== undefined ? Number(itemData.unitPriceInclusive) : undefined;

    if (!isGstActive || company.isCompositionScheme) {
      incl = excl;
    } else if (mode === 'EXCLUSIVE') {
      incl = inclusiveFromExclusive(excl, gst);
    } else {
      if (incl === undefined || !Number.isFinite(incl) || incl <= 0) {
        incl = inclusiveFromExclusive(excl, gst);
      }
      excl = exclusiveFromInclusive(incl, gst);
    }

    const cleanedRow: GridRow = {
      ...itemData,
      quantity: roundQuantity(Number(itemData.quantity) || 0, 4),
      unitPrice: excl,
      unitPriceInclusive: incl,
      priceMode: mode,
      cessRate: itemData.cessRate ?? 0,
    };
    if (editingRowIndex !== null && editingRowIndex >= 0 && editingRowIndex < rows.length) {
      const updated = [...rows];
      updated[editingRowIndex] = cleanedRow;
      setRows(updated);
    } else {
      setRows([...rows, cleanedRow]);
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
      return initialInvoice.items.map((it) => {
        const mode = it.priceMode ?? 'EXCLUSIVE';
        const gst = it.gstRate ?? 18;
        const excl = it.unitPrice || 0;
        const storedIncl = Number(it.unitPriceInclusive);
        const incl =
          mode === 'INCLUSIVE'
            ? (Number.isFinite(storedIncl) && storedIncl > 0
                ? storedIncl
                : inclusiveFromExclusive(excl, gst))
            : inclusiveFromExclusive(excl, gst);
        return {
          itemId: it.itemId,
          name: it.name,
          description: it.description || '',
          hsnSacCode: it.hsnSacCode,
          quantity: it.quantity,
          unit: it.unit,
          unitPrice: excl,
          unitPriceInclusive: incl,
          priceMode: mode,
          cessRate: it.cessRate ?? 0,
          mrp: it.mrp,
          discountPercent: it.discountPercent || 0,
          discountAmount: it.discountAmount,
          gstRate: it.gstRate,
        };
      });
    }
    if (initialDraft?.rows && initialDraft.rows.length > 0) {
      return initialDraft.rows.map((r: any) => {
        const mode = (!isGstActive || company.isCompositionScheme) ? 'EXCLUSIVE' : (r.priceMode ?? 'EXCLUSIVE');
        const gst = isGstActive && !company.isCompositionScheme ? (Number(r.gstRate) || 0) : 0;
        let excl = Number(r.unitPrice) || 0;
        let incl = Number(r.unitPriceInclusive);
        if (!isGstActive || company.isCompositionScheme) {
          incl = excl;
        } else if (mode === 'EXCLUSIVE') {
          incl = inclusiveFromExclusive(excl, gst);
        } else {
          if (!Number.isFinite(incl) || incl <= 0) {
            incl = inclusiveFromExclusive(excl, gst);
          }
          excl = exclusiveFromInclusive(incl, gst);
        }
        return {
          ...r,
          unitPrice: excl,
          unitPriceInclusive: incl,
          priceMode: mode,
          cessRate: Number(r.cessRate) || 0,
        };
      });
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
        quantity: Number(r.quantity) || 0,
        unitPrice: Number(r.unitPrice) || 0,
        unitPriceInclusive: Number(r.unitPriceInclusive) || 0,
        priceMode: r.priceMode ?? 'EXCLUSIVE',
        discountPercent: combinedDisc,
        discountAmount: overallDiscountPercent > 0 ? undefined : r.discountAmount,
        gstRate: isGstActive && !company.isCompositionScheme ? (Number(r.gstRate) || 0) : 0,
        cessPercent: isGstActive && !company.isCompositionScheme ? (Number(r.cessRate) || 0) : 0,
      };
    });
  }, [rows, isGstActive, company.isCompositionScheme, overallDiscountPercent]);

  const calcSummary = useMemo(() => {
    return calculateInvoice(company.stateCode, posStateCode, calcInputs);
  }, [company.stateCode, posStateCode, calcInputs]);

  // Overall discount deduction amount
  const overallDiscountAmount = useMemo(() => {
    if (overallDiscountPercent <= 0) return 0;
    const rawTaxable = rows.reduce((sum, r) => {
      const activeRate = r.priceMode === 'INCLUSIVE' && r.unitPriceInclusive !== undefined
        ? Number(r.unitPriceInclusive) || 0
        : Number(r.unitPrice) || 0;
      const gross = (Number(r.quantity) || 0) * activeRate;
      const itemDisc = r.discountAmount && r.discountAmount > 0 ? r.discountAmount : (gross * (Number(r.discountPercent) || 0)) / 100;
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

  // Memoized auto-detected type: B2B if party has 15-char GSTIN, B2CL if inter-state unregistered > ₹2.5L, else B2CS
  const autoDetectedInvoiceType = useMemo<InvoiceType>(() => {
    if (!isGstActive || company.isCompositionScheme) return 'B2CS';
    const isB2B = Boolean(selectedParty?.gstin && selectedParty.gstin.trim().length === 15);
    if (isB2B) return 'B2B';
    if (!calcSummary.isIntraState && finalGrandTotal > 250000) {
      return 'B2CL';
    }
    return 'B2CS';
  }, [isGstActive, company.isCompositionScheme, selectedParty?.gstin, calcSummary.isIntraState, finalGrandTotal]);

  const effectiveInvoiceType = manualInvoiceType || autoDetectedInvoiceType;

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
        const mode = found.salePriceMode ?? 'EXCLUSIVE';
        const gst = found.gstRate ?? 18;
        let excl = found.salePrice || 0;
        let incl = found.salePriceInclusive !== undefined
          ? found.salePriceInclusive
          : inclusiveFromExclusive(excl, gst);
        if (mode === 'INCLUSIVE' && found.salePriceInclusive !== undefined) {
          incl = found.salePriceInclusive;
          excl = exclusiveFromInclusive(incl, gst);
        }
        setRows([
          ...rows,
          {
            itemId: found.id,
            name: found.name,
            description: '',
            hsnSacCode: isGstActive ? (found.hsnSacCode || '998313') : '',
            quantity: 1,
            unit: found.unit || 'PCS',
            unitPrice: excl,
            unitPriceInclusive: incl,
            priceMode: mode,
            cessRate: isGstActive ? (found.cessRate ?? 0) : 0,
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
  const constructInvoiceObject = (paymentOverride?: {
    paymentMode: PaymentMode;
    paymentStatus: PaymentStatus;
    paidAmount: number;
    balanceAmount: number;
    paymentSplits: PaymentSplit[];
    paymentNotes?: string;
  }): Invoice => {
    const invoiceItems: InvoiceItemEntry[] = rows.map((r, idx) => {
      const calcItem = calcSummary.items[idx];
      const mode = (!isGstActive || company.isCompositionScheme) ? 'EXCLUSIVE' : (r.priceMode ?? 'EXCLUSIVE');
      const gst = isGstActive && !company.isCompositionScheme ? (r.gstRate || 0) : 0;
      let excl = Number(r.unitPrice) || 0;
      let incl = Number(r.unitPriceInclusive);
      if (!isGstActive || company.isCompositionScheme) {
        incl = excl;
      } else if (mode === 'EXCLUSIVE') {
        incl = inclusiveFromExclusive(excl, gst);
      } else {
        if (!Number.isFinite(incl) || incl <= 0) {
          incl = inclusiveFromExclusive(excl, gst);
        }
        excl = exclusiveFromInclusive(incl, gst);
      }
      return {
        itemId: r.itemId || `CUSTOM-${Date.now()}-${idx}`,
        name: r.name || 'Billed Product / Service',
        description: r.description,
        hsnSacCode: isGstActive ? (r.hsnSacCode || '998313') : '',
        unit: (r.unit as any) || 'PCS',
        quantity: r.quantity,
        unitPrice: excl,
        unitPriceInclusive: incl,
        priceMode: mode,
        mrp: r.mrp,
        discountPercent: r.discountPercent,
        discountAmount: calcItem?.discountAmount || 0,
        taxableAmount: calcItem?.taxableAmount || 0,
        gstRate: gst,
        cgstAmount: isGstActive ? (calcItem?.cgstAmount || 0) : 0,
        sgstAmount: isGstActive ? (calcItem?.sgstAmount || 0) : 0,
        utgstAmount: isGstActive ? (calcItem?.utgstAmount || 0) : 0,
        igstAmount: isGstActive ? (calcItem?.igstAmount || 0) : 0,
        cessRate: isGstActive ? (Number(r.cessRate) || 0) : 0,
        cessAmount: isGstActive ? (calcItem?.cessAmount || 0) : 0,
        totalAmount: calcItem?.totalAmount || 0,
      };
    });

    const hasPaymentOverride = paymentOverride !== undefined;
    const resolvedPaymentMode: PaymentMode = hasPaymentOverride
      ? paymentOverride.paymentMode
      : 'CREDIT';
    const autoPaymentStatus: PaymentStatus = hasPaymentOverride
      ? paymentOverride.paymentStatus
      : 'UNPAID';
    const totalPaid = hasPaymentOverride ? paymentOverride.paidAmount : 0;
    const balanceDue = hasPaymentOverride ? paymentOverride.balanceAmount : finalGrandTotal;
    const savedSplits: PaymentSplit[] = hasPaymentOverride
      ? paymentOverride.paymentSplits
      : [{ id: 'split-credit', mode: 'CREDIT', amount: finalGrandTotal }];
    const finalNotes = hasPaymentOverride
      ? (paymentOverride.paymentNotes || initialInvoice?.notes)
      : initialInvoice?.notes;

    const isSpecialDoc = ['SALES_ORDER', 'ESTIMATE', 'DELIVERY_CHALLAN', 'CREDIT_NOTE', 'DEBIT_NOTE'].includes(effectiveInvoiceType);
    const resolvedInvoiceType = (company.isCompositionScheme && !isSpecialDoc) ? 'B2CS' : effectiveInvoiceType;

    return {
      id: initialInvoice ? initialInvoice.id : `INV-${Date.now()}`,
      invoiceNumber: invoiceNumber.trim(),
      invoiceType: resolvedInvoiceType,
      isRcm: isRcm,
      isGstInvoice: isGstActive,
      date: invoiceDate,
      dueDate: dueDate || undefined,
      partyId: selectedParty?.id,
      partyName: selectedParty?.name || 'Cash Counter Customer',
      partyPhone: selectedParty?.phone || undefined,
      partyGstin: isGstActive ? selectedParty?.gstin : undefined,
      partyAddress: selectedParty?.billingAddress || 'Local Counter',
      partyPincode: selectedParty?.pincode,
      shippingAddress: shippingAddress.trim() || undefined,
      shippingPincode: shippingPincode.trim() || undefined,
      partyStateCode: posStateCode,
      placeOfSupplyStateCode: posStateCode,
      isIntraState: calcSummary.isIntraState,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: calcSummary.totalDiscount,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: isGstActive ? calcSummary.totalCgst : 0,
      totalSgst: isGstActive ? calcSummary.totalSgst : 0,
      totalUtgst: isGstActive ? (calcSummary.totalUtgst || 0) : 0,
      isUtgst: isGstActive ? Boolean(calcSummary.isUtgst) : false,
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
      notes: finalNotes,
      originalInvoiceNumber: (effectiveInvoiceType === 'CREDIT_NOTE' || effectiveInvoiceType === 'DEBIT_NOTE')
        ? (originalInvoiceNumber.trim() || undefined)
        : undefined,
      originalInvoiceDate: (effectiveInvoiceType === 'CREDIT_NOTE' || effectiveInvoiceType === 'DEBIT_NOTE')
        ? (originalInvoiceDate || undefined)
        : undefined,
      noteType: effectiveInvoiceType === 'CREDIT_NOTE' ? 'C' : effectiveInvoiceType === 'DEBIT_NOTE' ? 'D' : undefined,
      returnReason: (effectiveInvoiceType === 'CREDIT_NOTE' || effectiveInvoiceType === 'DEBIT_NOTE')
        ? returnReason
        : undefined,
      orderStatus: effectiveInvoiceType === 'SALES_ORDER'
        ? (initialInvoice?.orderStatus || 'PENDING')
        : undefined,
      challanStatus: effectiveInvoiceType === 'DELIVERY_CHALLAN'
        ? (challanStatus || initialInvoice?.challanStatus || 'DISPATCHED')
        : undefined,
      challanType: effectiveInvoiceType === 'DELIVERY_CHALLAN'
        ? (challanType || initialInvoice?.challanType || 'FOR_REMOVAL')
        : undefined,
      consigneeName: consigneeName.trim() || undefined,
      vehicleNumber: vehicleNumber.trim() || undefined,
      transporterName: transporterName.trim() || undefined,
      transporterId: transporterId.trim() || undefined,
      ewayBillNumber: ewayBillNumber.trim() || undefined,
      createdAt: initialInvoice ? initialInvoice.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  };

  const validateInvoice = useCallback((): boolean => {
    if (rows.length === 0) {
      alert('Please add at least one line item to the invoice.');
      return false;
    }
    const hasEmpty = rows.some((r) => !r.name.trim());
    if (hasEmpty) {
      alert('Please provide item names for all line items.');
      return false;
    }

    const trimmedNumber = invoiceNumber.trim();
    if (!trimmedNumber) {
      setInvoiceConflictError('Please enter a valid invoice number.');
      setIsInvoiceNumberModalOpen(true);
      return false;
    }

    const conflict = findConflictingInvoice(trimmedNumber, initialInvoice?.id, allInvoices);
    if (conflict) {
      const errMsg = `Cannot issue invoice: Invoice number "${trimmedNumber}" already exists for ${conflict.partyName || 'Customer'} (${conflict.date || 'prior bill'}). Only unique invoice numbers are allowed under GST compliance.`;
      setInvoiceConflictError(errMsg);
      setIsInvoiceNumberModalOpen(true);
      return false;
    }

    // Statutory GST Pre-Save Validation Gate
    const draftInvoice = constructInvoiceObject();
    const gstCheck = validateSingleInvoice(draftInvoice, company.stateCode, isGstActive);
    if (!gstCheck.isValid && gstCheck.errors.length > 0) {
      alert(`GST Compliance Alert:\n• ${gstCheck.errors.join('\n• ')}`);
      return false;
    }

    return true;
  }, [rows, invoiceNumber, initialInvoice, allInvoices, constructInvoiceObject, company.stateCode, isGstActive]);

  // Auto-save draft on invoice edits when creating a new invoice
  useEffect(() => {
    if (initialInvoice) return;
    draftService.saveInvoiceDraft({
      invoiceNumber,
      invoiceDate,
      dueDate,
      selectedParty,
      posStateCode,
      manualInvoiceType,
      isRcm,
      overallDiscountPercent,
      shippingAmount,
      shippingAddress,
      shippingPincode,
      rows,
      originalInvoiceNumber,
      originalInvoiceDate,
      returnReason,
      orderStatus: effectiveInvoiceType === 'SALES_ORDER' ? 'PENDING' : undefined,
      challanStatus: effectiveInvoiceType === 'DELIVERY_CHALLAN' ? challanStatus : undefined,
      challanType: effectiveInvoiceType === 'DELIVERY_CHALLAN' ? challanType : undefined,
      consigneeName,
      vehicleNumber,
      transporterName,
      transporterId,
      ewayBillNumber,
    }, effectiveInvoiceType);
  }, [
    initialInvoice,
    invoiceNumber,
    invoiceDate,
    dueDate,
    selectedParty,
    posStateCode,
    manualInvoiceType,
    isRcm,
    overallDiscountPercent,
    shippingAmount,
    shippingAddress,
    shippingPincode,
    rows,
    originalInvoiceNumber,
    originalInvoiceDate,
    returnReason,
    effectiveInvoiceType,
    challanStatus,
    challanType,
    consigneeName,
    vehicleNumber,
    transporterName,
    transporterId,
    ewayBillNumber,
  ]);

  // Safe close handler saving draft if unsaved progress exists
  const handleClose = useCallback(() => {
    if (!initialInvoice) {
      const draftData = {
        invoiceNumber,
        invoiceDate,
        dueDate,
        selectedParty,
        posStateCode,
        manualInvoiceType,
        isRcm,
        overallDiscountPercent,
        shippingAmount,
        shippingAddress,
        shippingPincode,
        rows,
        originalInvoiceNumber,
        originalInvoiceDate,
        returnReason,
        orderStatus: effectiveInvoiceType === 'SALES_ORDER' ? 'PENDING' : undefined,
        challanStatus: effectiveInvoiceType === 'DELIVERY_CHALLAN' ? challanStatus : undefined,
        challanType: effectiveInvoiceType === 'DELIVERY_CHALLAN' ? challanType : undefined,
        consigneeName,
        vehicleNumber,
        transporterName,
        transporterId,
        ewayBillNumber,
      };
      if (draftService.isInvoiceDraftNotEmpty(draftData)) {
        draftService.saveInvoiceDraft(draftData, effectiveInvoiceType);
        showAppToast('Progress saved as draft');
      }
    }
    onClose();
  }, [
    initialInvoice,
    invoiceNumber,
    invoiceDate,
    dueDate,
    selectedParty,
    posStateCode,
    manualInvoiceType,
    isRcm,
    overallDiscountPercent,
    shippingAmount,
    shippingAddress,
    shippingPincode,
    rows,
    originalInvoiceNumber,
    originalInvoiceDate,
    returnReason,
    effectiveInvoiceType,
    onClose,
  ]);

  // Manual save draft handler
  const handleSaveDraft = useCallback(() => {
    const draftData = {
      invoiceNumber,
      invoiceDate,
      dueDate,
      selectedParty,
      posStateCode,
      manualInvoiceType,
      isRcm,
      overallDiscountPercent,
      shippingAmount,
      shippingAddress,
      shippingPincode,
      rows,
      originalInvoiceNumber,
      originalInvoiceDate,
      returnReason,
      orderStatus: effectiveInvoiceType === 'SALES_ORDER' ? 'PENDING' : undefined,
      challanStatus: effectiveInvoiceType === 'DELIVERY_CHALLAN' ? challanStatus : undefined,
      challanType: effectiveInvoiceType === 'DELIVERY_CHALLAN' ? challanType : undefined,
      consigneeName,
      vehicleNumber,
      transporterName,
      transporterId,
      ewayBillNumber,
    };
    draftService.saveInvoiceDraft(draftData, effectiveInvoiceType);
    showAppToast('Progress saved as draft');
  }, [
    invoiceNumber,
    invoiceDate,
    dueDate,
    selectedParty,
    posStateCode,
    manualInvoiceType,
    isRcm,
    overallDiscountPercent,
    shippingAmount,
    shippingAddress,
    shippingPincode,
    rows,
    originalInvoiceNumber,
    originalInvoiceDate,
    returnReason,
    effectiveInvoiceType,
    challanStatus,
    challanType,
    consigneeName,
    vehicleNumber,
    transporterName,
    transporterId,
    ewayBillNumber,
  ]);

  // Discard draft and reset form
  const handleDiscardDraft = useCallback(() => {
    draftService.clearInvoiceDraft(effectiveInvoiceType);
    setRows([]);
    if (!initialParty) {
      setSelectedParty(null);
    }
    setShippingAmount(0);
    setShippingAddress('');
    setShippingPincode('');
    setConsigneeName('');
    setVehicleNumber('');
    setTransporterName('');
    setTransporterId('');
    setEwayBillNumber('');
    setChallanStatus('DISPATCHED');
    setChallanType('FOR_REMOVAL');
    setOverallDiscountPercent(0);
    setOriginalInvoiceNumber('');
    setOriginalInvoiceDate('');
    setReturnReason('01-Sales Return');
    setHasRestoredDraft(false);
    showAppToast('Draft discarded');
  }, [initialParty, effectiveInvoiceType]);

  // Restore draft from storage
  const handleRestoreDraft = useCallback(() => {
    const draft = draftService.getInvoiceDraft(effectiveInvoiceType) as any;
    if (!draft) {
      showAppToast('No saved draft found');
      return;
    }
    if (draft.selectedParty) setSelectedParty(draft.selectedParty);
    if (draft.posStateCode) setPosStateCode(draft.posStateCode);
    if (draft.manualInvoiceType) setManualInvoiceType(draft.manualInvoiceType);
    if (typeof draft.isRcm === 'boolean') setIsRcm(draft.isRcm);
    if (typeof draft.overallDiscountPercent === 'number') setOverallDiscountPercent(draft.overallDiscountPercent);
    if (typeof draft.shippingAmount === 'number') setShippingAmount(draft.shippingAmount);
    if (draft.shippingAddress) setShippingAddress(draft.shippingAddress);
    if (draft.shippingPincode) setShippingPincode(draft.shippingPincode);
    if (draft.consigneeName) setConsigneeName(draft.consigneeName);
    if (draft.vehicleNumber) setVehicleNumber(draft.vehicleNumber);
    if (draft.transporterName) setTransporterName(draft.transporterName);
    if (draft.transporterId) setTransporterId(draft.transporterId);
    if (draft.ewayBillNumber) setEwayBillNumber(draft.ewayBillNumber);
    if (draft.challanStatus) setChallanStatus(draft.challanStatus);
    if (draft.challanType) setChallanType(draft.challanType);
    if (draft.originalInvoiceNumber) setOriginalInvoiceNumber(draft.originalInvoiceNumber);
    if (draft.originalInvoiceDate) setOriginalInvoiceDate(draft.originalInvoiceDate);
    if (draft.returnReason) setReturnReason(draft.returnReason);
    if (draft.rows && draft.rows.length > 0) {
      setRows(
        draft.rows.map((r: any) => {
          const mode = (!isGstActive || company.isCompositionScheme) ? 'EXCLUSIVE' : (r.priceMode ?? 'EXCLUSIVE');
          const gst = isGstActive && !company.isCompositionScheme ? (Number(r.gstRate) || 0) : 0;
          let excl = Number(r.unitPrice) || 0;
          let incl = Number(r.unitPriceInclusive);
          if (!isGstActive || company.isCompositionScheme) {
            incl = excl;
          } else if (mode === 'EXCLUSIVE') {
            incl = inclusiveFromExclusive(excl, gst);
          } else {
            if (!Number.isFinite(incl) || incl <= 0) {
              incl = inclusiveFromExclusive(excl, gst);
            }
            excl = exclusiveFromInclusive(incl, gst);
          }
          return {
            ...r,
            unitPrice: excl,
            unitPriceInclusive: incl,
            priceMode: mode,
            cessRate: Number(r.cessRate) || 0,
          };
        })
      );
    }
    setHasRestoredDraft(true);
    showAppToast('Draft restored');
  }, [effectiveInvoiceType]);

  // "Save & Print" from Action Dock: saves bill as UNPAID and triggers print
  const handleSaveAndPrint = useCallback(() => {
    if (!validateInvoice()) return;
    const unpaidInvoice = constructInvoiceObject();
    if (!initialInvoice) {
      draftService.clearInvoiceDraft(effectiveInvoiceType);
    }
    onSave(unpaidInvoice, { openPrint: true });
    setPreviewInvoiceData(unpaidInvoice);
  }, [validateInvoice, constructInvoiceObject, onSave, initialInvoice, effectiveInvoiceType]);

  // "Save Invoice" from Action Dock: saves bill directly as UNPAID (Credit)
  const handleSaveInvoiceDirect = useCallback(() => {
    if (!validateInvoice()) return;
    const unpaidInvoice = constructInvoiceObject();
    if (!initialInvoice) {
      draftService.clearInvoiceDraft(effectiveInvoiceType);
    }
    onSave(unpaidInvoice);
  }, [validateInvoice, constructInvoiceObject, onSave, initialInvoice, effectiveInvoiceType]);

  // "Pay & Save" from Action Dock: opens Payment Modal
  const handleOpenPaymentModal = useCallback(() => {
    if (!validateInvoice()) return;
    setIsPaymentModalOpen(true);
  }, [validateInvoice]);

  // Confirm payment callback from InvoicePaymentModal
  const handleConfirmPayment = useCallback(
    (
      paymentData: {
        paymentMode: PaymentMode;
        paymentStatus: PaymentStatus;
        paidAmount: number;
        balanceAmount: number;
        paymentSplits: PaymentSplit[];
        paymentNotes?: string;
      },
      andPrint = false
    ) => {
      const paidInvoice = constructInvoiceObject(paymentData);
      if (!initialInvoice) {
        draftService.clearInvoiceDraft(effectiveInvoiceType);
      }
      setIsPaymentModalOpen(false);
      onSave(paidInvoice, { openPrint: andPrint });
      if (andPrint) {
        setPreviewInvoiceData(paidInvoice);
      }
    },
    [constructInvoiceObject, onSave, initialInvoice, effectiveInvoiceType]
  );

  // Global POS Keyboard Shortcuts (F2: Scanner, F8: Add Item, F9: Save, F10: Pay & Save, F12: Party Selector)
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
        handleSaveInvoiceDirect();
      } else if (e.key === 'F10') {
        e.preventDefault();
        handleOpenPaymentModal();
      } else if (e.key === 'F12') {
        e.preventDefault();
        setIsPartyModalOpen(true);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isAnySubModalOpen, handleOpenAddItem, handleSaveInvoiceDirect, handleOpenPaymentModal]);

  const whatsAppPartyTotalDue = useMemo(() => {
    if (!whatsAppInvoiceData) return undefined;
    const found = parties.find(
      (p) =>
        (whatsAppInvoiceData.partyId && p.id === whatsAppInvoiceData.partyId) ||
        (p.name && p.name.trim().toLowerCase() === (whatsAppInvoiceData.partyName || '').trim().toLowerCase())
    );
    return getPartyTotalBalanceDue(found) ?? whatsAppInvoiceData.balanceAmount;
  }, [whatsAppInvoiceData, parties]);

  return (
    <div className="fixed inset-0 z-50 bg-surface flex flex-col min-h-screen overflow-x-hidden antialiased">
      {/* Main Full-Width Scrollable Workstation */}
      <main className="flex-1 flex flex-col relative w-full pt-14 pb-36 sm:pb-32 bg-surface overflow-y-auto">
        <div className="px-3 sm:px-6 py-3 flex flex-col gap-3 w-full">
          <InvoiceHeaderMeta
            onClose={handleClose}
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
            invoiceType={effectiveInvoiceType}
            autoDetectedInvoiceType={autoDetectedInvoiceType}
            isManualTypeOverride={Boolean(manualInvoiceType)}
            onInvoiceTypeChange={(val) => {
              setManualInvoiceType(val);
              if (val === 'DELIVERY_CHALLAN') {
                setDueDate(new Date().toISOString().split('T')[0]);
              }
            }}
            isRcm={isRcm}
            onRcmChange={setIsRcm}
            isCompositionScheme={company.isCompositionScheme}
            shippingAddress={shippingAddress}
            shippingPincode={shippingPincode}
            onShippingAddressChange={setShippingAddress}
            onShippingPincodeChange={setShippingPincode}
            onSelectPartyClick={() => setIsPartyModalOpen(true)}
            onClearParty={() => {
              setSelectedParty(null);
              setShippingAddress('');
              setShippingPincode('');
            }}
            onAddPartyClick={() => setIsAddPartyModalOpen(true)}
            onOpenInvoiceNumberModal={() => setIsInvoiceNumberModalOpen(true)}
            onOpenDueDateModal={() => setIsDueDateModalOpen(true)}
            onAutoFixConflict={(newNum) => {
              setInvoiceNumber(newNum);
              setInvoiceConflictError(null);
            }}
            originalInvoiceNumber={originalInvoiceNumber}
            onOriginalInvoiceNumberChange={setOriginalInvoiceNumber}
            originalInvoiceDate={originalInvoiceDate}
            onOriginalInvoiceDateChange={setOriginalInvoiceDate}
            returnReason={returnReason}
            onReturnReasonChange={setReturnReason}
            orderStatus={initialInvoice?.orderStatus || 'PENDING'}
            challanStatus={challanStatus}
            onChallanStatusChange={setChallanStatus}
            challanType={challanType}
            onChallanTypeChange={setChallanType}
            consigneeName={consigneeName}
            onConsigneeNameChange={setConsigneeName}
            vehicleNumber={vehicleNumber}
            onVehicleNumberChange={setVehicleNumber}
            transporterName={transporterName}
            onTransporterNameChange={setTransporterName}
            transporterId={transporterId}
            onTransporterIdChange={setTransporterId}
            ewayBillNumber={ewayBillNumber}
            onEwayBillNumberChange={setEwayBillNumber}
            hasRestoredDraft={hasRestoredDraft}
            hasDraftInStorage={!initialInvoice && draftService.hasInvoiceDraft(effectiveInvoiceType)}
            onSaveDraft={!initialInvoice ? handleSaveDraft : undefined}
            onRestoreDraft={!initialInvoice ? handleRestoreDraft : undefined}
            onDiscardDraft={!initialInvoice ? handleDiscardDraft : undefined}
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
            totalUtgst={calcSummary.totalUtgst}
            totalIgst={calcSummary.totalIgst}
            totalCess={isGstActive ? calcSummary.totalCess : 0}
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
            totalUnits={Number(rows.reduce((sum, r) => sum + (Number(r.quantity) || 0), 0).toFixed(4))}
            finalGrandTotal={finalGrandTotal}
            accentColor="secondary"
          />

          <div className="h-28 sm:h-32" aria-hidden="true" />
        </div>
      </main>

      <InvoiceActionDock
        finalGrandTotal={finalGrandTotal}
        onSaveAndPrint={handleSaveAndPrint}
        onSaveInvoice={handleSaveInvoiceDirect}
        onPayAndSave={handleOpenPaymentModal}
        invoiceType={effectiveInvoiceType}
      />

      {/* Select Party Modal */}
      {isPartyModalOpen && (
        <SelectPartyModal
          parties={localParties}
          onSelectParty={(p) => {
            const fresh = (p.id ? db.getParties().find((item) => item.id === p.id) : null) || p;
            setSelectedParty(fresh);
            setPosStateCode(fresh.stateCode);
            if (!shippingAddress && fresh.shippingAddress) {
              setShippingAddress(fresh.shippingAddress);
            }
            if (!shippingPincode && fresh.pincode) {
              setShippingPincode(fresh.pincode);
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

      {/* Payment Settlement Modal */}
      {isPaymentModalOpen && (
        <InvoicePaymentModal
          isOpen={isPaymentModalOpen}
          onClose={() => setIsPaymentModalOpen(false)}
          finalGrandTotal={finalGrandTotal}
          invoiceNumber={invoiceNumber}
          partyName={selectedParty?.name || 'Cash Customer'}
          initialSplits={initialInvoice ? parseSplitsFromInvoice(initialInvoice, finalGrandTotal) : undefined}
          onConfirmPayment={handleConfirmPayment}
        />
      )}

      {/* Thermal POS Receipt Print Modal */}
      {previewInvoiceData && (
        <React.Suspense fallback={null}>
          <ThermalPrintModal
            invoice={previewInvoiceData}
            company={company}
            onClose={() => setPreviewInvoiceData(null)}
          />
        </React.Suspense>
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
          totalBalanceDue={whatsAppPartyTotalDue}
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

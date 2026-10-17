import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import { db } from '../../services/db.ts';
import { useBackNavigation } from '../../core/utils/backNavigation.ts';
import { showAppToast } from '../../services/toast.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import {
  EWAY_BILL_STATUTORY_THRESHOLD,
  isValidVehicleNumber,
  downloadEWayBillJson,
  EWayBillTransportOptions,
} from '../../core/gst/eWayBillExport.ts';
import { printEWayBillSlip } from '../../core/gst/eWayBillSlipPrinter.ts';

export interface EWayBillModalProps {
  isOpen: boolean;
  onClose: () => void;
  invoice: Invoice;
  company: CompanyProfile;
  onInvoiceUpdated?: (updatedInvoice: Invoice) => void;
}

export const EWayBillModal: React.FC<EWayBillModalProps> = ({
  isOpen,
  onClose,
  invoice,
  company,
  onInvoiceUpdated,
}) => {
  useBackNavigation(onClose, isOpen, 40);

  const [transporterId, setTransporterId] = useState(invoice.transporterId || '');
  const [transporterName, setTransporterName] = useState(invoice.transporterName || '');
  const [transportMode, setTransportMode] = useState<'1' | '2' | '3' | '4'>(invoice.transportMode || '1');
  const [transportDistance, setTransportDistance] = useState<number>(invoice.transportDistance || 50);
  const [vehicleNumber, setVehicleNumber] = useState(invoice.vehicleNumber || '');
  const [vehicleType, setVehicleType] = useState<'R' | 'O'>(invoice.vehicleType || 'R');
  const [transDocNo, setTransDocNo] = useState(invoice.transDocNo || '');
  const [transDocDate, setTransDocDate] = useState(invoice.transDocDate || invoice.date);

  if (!isOpen || !invoice) return null;

  const isAboveThreshold = (invoice.grandTotal || 0) >= EWAY_BILL_STATUTORY_THRESHOLD;
  const isVehValid = !vehicleNumber || isValidVehicleNumber(vehicleNumber);

  const currentOptions: EWayBillTransportOptions = {
    transDistance: transportDistance,
    transporterId: transporterId.trim().toUpperCase(),
    transporterName: transporterName.trim(),
    vehicleNumber: vehicleNumber.trim().toUpperCase(),
    vehicleType,
    transMode: transportMode,
  };

  const handleSaveTransportDetails = async () => {
    if (vehicleNumber && !isValidVehicleNumber(vehicleNumber)) {
      showAppToast('Please enter a valid vehicle registration number (e.g. MH12AB1234)');
      return;
    }

    const updatedInvoice: Invoice = {
      ...invoice,
      transporterId: transporterId.trim().toUpperCase() || undefined,
      transporterName: transporterName.trim() || undefined,
      transportMode,
      transportDistance: Number(transportDistance) || 50,
      vehicleNumber: vehicleNumber.trim().toUpperCase() || undefined,
      vehicleType,
      transDocNo: transDocNo.trim() || undefined,
      transDocDate: transDocDate || undefined,
      updatedAt: new Date().toISOString(),
    };

    try {
      await db.saveInvoice(updatedInvoice);
      if (onInvoiceUpdated) {
        onInvoiceUpdated(updatedInvoice);
      }
      showAppToast('Transport & E-Way details saved successfully.');
    } catch (err) {
      console.error('Failed to save transport details:', err);
      showAppToast('Failed to save details. Please try again.');
    }
  };

  const handleDownloadJson = () => {
    try {
      downloadEWayBillJson(company, invoice, currentOptions);
      showAppToast(`E-Way Bill JSON downloaded for #${invoice.invoiceNumber}`);
    } catch (err) {
      console.error('Failed to generate E-Way Bill JSON:', err);
      showAppToast('Error generating E-Way Bill JSON.');
    }
  };

  const handlePrintSlip = () => {
    try {
      printEWayBillSlip(company, invoice, currentOptions);
    } catch (err) {
      console.error('Failed to print E-Way slip:', err);
      showAppToast('Error opening print slip.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-scrim/60 backdrop-blur-sm animate-fade-in">
      <div
        className="bg-surface-container-lowest text-on-surface rounded-2xl max-w-xl w-full max-h-[92vh] flex flex-col shadow-2xl border border-outline-variant/30 overflow-hidden"
        role="dialog"
        aria-modal="true"
        aria-labelledby="eway-modal-title"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-outline-variant/20 flex items-center justify-between gap-3 bg-surface-container-low/60">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-secondary/15 text-secondary flex items-center justify-center flex-shrink-0">
              <span className="material-symbols-outlined text-[24px]">local_shipping</span>
            </div>
            <div>
              <h2 id="eway-modal-title" className="font-bold text-base text-on-surface">
                E-Way Bill &amp; Transit Details
              </h2>
              <p className="text-xs text-on-surface-variant">
                Rule 138 CGST • Portal JSON &amp; Transit Slip
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container-high transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </div>

        {/* Modal Scrollable Body */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-4 text-xs">
          {/* Statutory Threshold Alert Banner */}
          {isAboveThreshold ? (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 dark:border-emerald-800 text-emerald-900 dark:text-emerald-200 flex items-start gap-2.5">
              <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-[20px] flex-shrink-0 mt-0.5">
                verified
              </span>
              <div>
                <span className="font-bold block text-sm">
                  Statutory Threshold Exceeded ({formatINR(invoice.grandTotal)})
                </span>
                <span className="text-[11px] leading-relaxed">
                  Consignment value exceeds ₹50,000. Generating Part-A &amp; Part-B is required by law prior to goods movement.
                </span>
              </div>
            </div>
          ) : (
            <div className="p-3 rounded-xl bg-surface-container-low border border-outline-variant/30 text-on-surface-variant flex items-start gap-2.5">
              <span className="material-symbols-outlined text-[20px] text-on-surface-variant flex-shrink-0 mt-0.5">
                info
              </span>
              <div>
                <span className="font-bold block text-on-surface">
                  Exempt / Sub-Threshold ({formatINR(invoice.grandTotal)})
                </span>
                <span className="text-[11px]">
                  Consignment value is under ₹50,000. E-Way Bill generation is optional.
                </span>
              </div>
            </div>
          )}

          {/* Invoice Summary Strip */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-surface-container-low/50 p-3 rounded-xl border border-outline-variant/20">
            <div>
              <span className="text-[10px] text-on-surface-variant block uppercase font-bold">Doc No</span>
              <span className="font-bold text-on-surface truncate block">{invoice.invoiceNumber}</span>
            </div>
            <div>
              <span className="text-[10px] text-on-surface-variant block uppercase font-bold">Party</span>
              <span className="font-bold text-on-surface truncate block">{invoice.partyName}</span>
            </div>
            <div>
              <span className="text-[10px] text-on-surface-variant block uppercase font-bold">GSTIN</span>
              <span className="font-bold text-on-surface truncate block">{invoice.partyGstin || 'URP'}</span>
            </div>
            <div>
              <span className="text-[10px] text-on-surface-variant block uppercase font-bold">Total Amount</span>
              <span className="font-bold text-secondary truncate block">{formatINR(invoice.grandTotal)}</span>
            </div>
          </div>

          {/* Form: Part B Transport Information */}
          <div className="space-y-3 pt-1">
            <h3 className="font-bold text-on-surface text-xs flex items-center gap-1.5 border-b border-outline-variant/20 pb-1">
              <span className="material-symbols-outlined text-[16px] text-secondary">commute</span>
              <span>Part-B: Transporter &amp; Vehicle Details</span>
            </h3>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Transport Mode */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Mode of Transport
                </label>
                <select
                  value={transportMode}
                  onChange={(e) => setTransportMode(e.target.value as any)}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                >
                  <option value="1">1 - Road (Truck / Lorry / Tempo)</option>
                  <option value="2">2 - Rail</option>
                  <option value="3">3 - Air</option>
                  <option value="4">4 - Ship</option>
                </select>
              </div>

              {/* Approximate Distance */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Approx Distance (KM) *
                </label>
                <input
                  type="number"
                  min="1"
                  max="4000"
                  value={transportDistance}
                  onChange={(e) => setTransportDistance(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  placeholder="Distance in KM"
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                />
              </div>

              {/* Vehicle Number */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Vehicle Number {transportMode === '1' && '*'}
                </label>
                <input
                  type="text"
                  value={vehicleNumber}
                  onChange={(e) => setVehicleNumber(e.target.value.toUpperCase())}
                  placeholder="e.g. MH12AB1234"
                  className={`w-full bg-surface-container-low border rounded-xl px-3 py-2 text-xs text-on-surface outline-none uppercase font-mono ${
                    !isVehValid ? 'border-error focus:border-error' : 'border-outline-variant/40 focus:border-secondary'
                  }`}
                />
                {!isVehValid && (
                  <span className="text-[10px] text-error mt-0.5 block">
                    Format: State(2) RTO(2) Series(1-3) Digits(4)
                  </span>
                )}
              </div>

              {/* Vehicle Type */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Vehicle Type
                </label>
                <select
                  value={vehicleType}
                  onChange={(e) => setVehicleType(e.target.value as any)}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                >
                  <option value="R">Regular (Standard Cargo)</option>
                  <option value="O">Over Dimensional Cargo (ODC)</option>
                </select>
              </div>

              {/* Transporter ID (GSTIN / TRANSIN) */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Transporter ID (GSTIN / TRANSIN)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  value={transporterId}
                  onChange={(e) => setTransporterId(e.target.value.toUpperCase())}
                  placeholder="15-digit Transporter ID"
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary uppercase font-mono"
                />
              </div>

              {/* Transporter Name */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Transporter / Agency Name
                </label>
                <input
                  type="text"
                  value={transporterName}
                  onChange={(e) => setTransporterName(e.target.value)}
                  placeholder="Transport agency name"
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                />
              </div>

              {/* Transporter Doc / LR Number */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Doc / Bilty / LR / RR No
                </label>
                <input
                  type="text"
                  value={transDocNo}
                  onChange={(e) => setTransDocNo(e.target.value)}
                  placeholder="Lorry Receipt / GR No"
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                />
              </div>

              {/* Transporter Doc Date */}
              <div>
                <label className="block font-bold text-on-surface-variant mb-1 text-[11px]">
                  Transport Doc Date
                </label>
                <input
                  type="date"
                  value={transDocDate}
                  onChange={(e) => setTransDocDate(e.target.value)}
                  className="w-full bg-surface-container-low border border-outline-variant/40 rounded-xl px-3 py-2 text-xs text-on-surface outline-none focus:border-secondary"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Modal Action Footer */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/70 flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={handleSaveTransportDetails}
            className="px-3.5 py-2 rounded-xl bg-surface-container-high hover:bg-surface-container-highest text-on-surface font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">save</span>
            <span>Save Details</span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handlePrintSlip}
              className="px-3 py-2 rounded-xl border border-secondary text-secondary hover:bg-secondary/10 font-bold text-xs flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>Print Part A &amp; B Slip</span>
            </button>

            <button
              type="button"
              onClick={handleDownloadJson}
              className="px-4 py-2 rounded-xl bg-secondary text-on-secondary font-bold text-xs flex items-center gap-1.5 shadow-sm hover:opacity-95 active:scale-95 transition-all cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Download Portal JSON</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

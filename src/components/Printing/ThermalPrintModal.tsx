import React, { useState, useEffect } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';
import {
  formatThermalReceiptText,
  ThermalReceiptData,
} from '../../core/printer/escpos.ts';
import {
  buildThermalReceiptBinary,
  printViaWebBluetooth,
} from '../../core/printer/escposBinary.ts';

interface ThermalPrintModalProps {
  invoice: Invoice;
  company: CompanyProfile;
  onClose: () => void;
}

export const ThermalPrintModal: React.FC<ThermalPrintModalProps> = ({
  invoice,
  company,
  onClose,
}) => {
  const [width, setWidth] = useState<32 | 48>(
    () => (Number(localStorage.getItem('printer_paper_width')) as 32 | 48) || 32
  );
  const [kickDrawer, setKickDrawer] = useState(() => {
    const val = localStorage.getItem('printer_kick_drawer');
    return val !== null ? val === 'true' : true;
  });
  const [includeQr, setIncludeQr] = useState(() => {
    const val = localStorage.getItem('printer_include_qr');
    return val !== null ? val === 'true' : true;
  });
  const [isPrinting, setIsPrinting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    localStorage.setItem('printer_paper_width', width.toString());
    localStorage.setItem('printer_kick_drawer', kickDrawer.toString());
    localStorage.setItem('printer_include_qr', includeQr.toString());
  }, [width, kickDrawer, includeQr]);

  const receiptData: ThermalReceiptData = {
    companyName: company.tradeName || company.businessName,
    companyAddress: company.address,
    gstin: company.gstin,
    phone: company.phone,
    invoiceNo: invoice.invoiceNumber,
    date: invoice.date,
    customerName: invoice.partyName,
    items: invoice.items.map((i) => ({
      name: i.name,
      qty: i.quantity,
      rate: i.unitPrice,
      amount: i.totalAmount,
    })),
    taxableAmount: invoice.totalTaxableAmount,
    cgstAmount: invoice.totalCgst,
    sgstAmount: invoice.totalSgst,
    igstAmount: invoice.totalIgst,
    grandTotal: invoice.grandTotal,
    upiId: company.upiId,
    terms: company.termsAndConditions,
  };

  const previewText = formatThermalReceiptText(receiptData, width);

  const handleBluetoothPrint = async () => {
    // Check if running inside Android wrapper
    const androidBridge = (window as any).AndroidBridge;
    if (androidBridge && typeof androidBridge.checkBluetoothStatus === 'function') {
      const btStatus = androidBridge.checkBluetoothStatus();
      if (btStatus === 'DISABLED') {
        androidBridge.enableBluetooth();
        setStatusMessage('Please enable Bluetooth and try again.');
        setIsError(true);
        return;
      }
    }

    setIsPrinting(true);
    setStatusMessage('Scanning for nearby Bluetooth thermal printers...');
    setIsError(false);

    try {
      const binary = buildThermalReceiptBinary(receiptData, {
        width,
        kickDrawer,
        printQr: includeQr,
      });

      const res = await printViaWebBluetooth(binary);
      if (res.success) {
        setStatusMessage('Receipt printed successfully!');
        setTimeout(() => onClose(), 1500);
      } else {
        setIsError(true);
        setStatusMessage(res.error || 'Failed to print. Try downloading raw file or system print.');
      }
    } catch (err: any) {
      setIsError(true);
      setStatusMessage(err.message || 'Bluetooth printing error.');
    } finally {
      setIsPrinting(false);
    }
  };

  const handleDownloadEscPos = () => {
    const binary = buildThermalReceiptBinary(receiptData, {
      width,
      kickDrawer,
      printQr: includeQr,
    });
    const blob = new Blob([binary as any], { type: 'application/octet-stream' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `receipt_${invoice.invoiceNumber}.bin`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleSystemPrint = () => {
    window.print();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-on-surface/40 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] flex flex-col border border-outline-variant/30 overflow-hidden">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/40">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[24px]">print</span>
            <div>
              <h3 className="font-headline-sm text-base font-bold text-on-surface">
                Thermal POS Receipt
              </h3>
              <p className="text-[11px] text-on-surface-variant">
                Bill #{invoice.invoiceNumber} • ₹{invoice.grandTotal.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-4 flex-1 overflow-y-auto space-y-4">
          {/* Controls */}
          <div className="grid grid-cols-2 gap-2 bg-surface-container-low p-2 rounded-xl border border-outline-variant/20">
            <div>
              <label className="block text-[10px] font-bold text-on-surface-variant uppercase mb-1">
                Paper Width
              </label>
              <div className="flex rounded-lg overflow-hidden border border-outline-variant/30">
                <button
                  type="button"
                  onClick={() => setWidth(32)}
                  className={`flex-1 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    width === 32 ? 'bg-secondary text-on-secondary' : 'bg-surface text-on-surface'
                  }`}
                >
                  58mm (2-Inch)
                </button>
                <button
                  type="button"
                  onClick={() => setWidth(48)}
                  className={`flex-1 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                    width === 48 ? 'bg-secondary text-on-secondary' : 'bg-surface text-on-surface'
                  }`}
                >
                  80mm (3-Inch)
                </button>
              </div>
            </div>

            <div className="flex flex-col justify-center space-y-1 pl-2">
              <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={kickDrawer}
                  onChange={(e) => setKickDrawer(e.target.checked)}
                  className="rounded text-secondary focus:ring-secondary w-4 h-4"
                />
                <span>Kick Drawer Pulse</span>
              </label>

              <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
                <input
                  type="checkbox"
                  checked={includeQr}
                  onChange={(e) => setIncludeQr(e.target.checked)}
                  className="rounded text-secondary focus:ring-secondary w-4 h-4"
                />
                <span>Print Dynamic UPI QR</span>
              </label>
            </div>
          </div>

          {/* Feedback Alert */}
          {statusMessage && (
            <div
              className={`p-3 rounded-xl text-xs font-medium flex items-center gap-2 ${
                isError
                  ? 'bg-error-container text-on-error-container border border-error/30'
                  : 'bg-secondary-container text-on-secondary-container border border-secondary/30'
              }`}
            >
              <span className="material-symbols-outlined text-[16px]">
                {isError ? 'warning' : 'info'}
              </span>
              <span className="flex-1">{statusMessage}</span>
            </div>
          )}

          {/* Thermal Slip Preview */}
          <div>
            <div className="text-[11px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>Receipt Preview</span>
              <span className="text-[10px] font-mono text-secondary">
                {width === 32 ? '32 Columns' : '48 Columns'}
              </span>
            </div>
            <div className="bg-[#fcfbf9] p-4 rounded-xl border border-outline-variant/30 font-mono text-[11px] leading-tight text-neutral-900 shadow-inner overflow-x-auto whitespace-pre">
              {previewText}
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-outline-variant/20 bg-surface-container-low/40 flex flex-col sm:flex-row gap-2 items-center justify-between">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={handleDownloadEscPos}
              className="px-3 py-2 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface transition-colors cursor-pointer flex items-center gap-1.5"
              title="Download raw ESC/POS binary file for USB / OTG printer apps"
            >
              <span className="material-symbols-outlined text-[16px]">download</span>
              <span>Raw .bin</span>
            </button>

            <button
              type="button"
              onClick={handleSystemPrint}
              className="px-3 py-2 border border-outline-variant/40 rounded-xl text-xs font-bold text-on-surface hover:bg-surface transition-colors cursor-pointer flex items-center gap-1.5"
            >
              <span className="material-symbols-outlined text-[16px]">print</span>
              <span>System Spooler</span>
            </button>
          </div>

          <button
            type="button"
            disabled={isPrinting}
            onClick={handleBluetoothPrint}
            className="w-full sm:w-auto px-5 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">bluetooth</span>
            <span>{isPrinting ? 'Printing...' : 'Direct Bluetooth Print'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

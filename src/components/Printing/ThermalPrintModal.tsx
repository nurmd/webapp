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
import { printSettingsService } from '../../services/printSettingsService.ts';

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
  const [isPrinting, setIsPrinting] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    localStorage.setItem('printer_paper_width', width.toString());
  }, [width]);

  const thermalSettings = printSettingsService.getSettings().thermal;

  const receiptData: ThermalReceiptData = {
    companyName: thermalSettings.customStoreName || company.tradeName || company.businessName,
    companyAddress: thermalSettings.showAddress ? company.address : '',
    gstin: thermalSettings.showGstin ? company.gstin : '',
    phone: thermalSettings.showPhone ? company.phone : '',
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
    totalDiscount: thermalSettings.showItemDiscount ? invoice.totalDiscount : 0,
    cgstAmount: thermalSettings.showTaxBreakdown ? invoice.totalCgst : 0,
    sgstAmount: thermalSettings.showTaxBreakdown ? invoice.totalSgst : 0,
    igstAmount: thermalSettings.showTaxBreakdown ? invoice.totalIgst : 0,
    shippingAmount: invoice.shippingAmount,
    roundOff: invoice.roundOff,
    grandTotal: invoice.grandTotal,
    upiId: thermalSettings.showUpiQr ? company.upiId : undefined,
    terms: thermalSettings.greetingText || company.termsAndConditions,
  };

  const previewText = formatThermalReceiptText(receiptData, width);

  const [printersList, setPrintersList] = useState<{ name: string; address: string }[]>([]);

  const handleBluetoothPrint = async (macAddress?: string) => {
    const androidBridge = (window as any).AndroidBridge;

    // Check if running inside Android native wrapper
    if (androidBridge && typeof androidBridge.checkBluetoothStatus === 'function') {
      const btStatus = androidBridge.checkBluetoothStatus();
      if (btStatus === 'DISABLED') {
        androidBridge.enableBluetooth();
        setStatusMessage('Please enable Bluetooth and try again.');
        setIsError(true);
        return;
      }

      // Native Android Printing Logic
      if (!macAddress) {
        try {
          const printersJson = androidBridge.getPairedPrinters();
          const printers = JSON.parse(printersJson);
          if (printers.length === 0) {
            setStatusMessage('No paired Bluetooth printers found. Pair one in OS settings.');
            setIsError(true);
            return;
          }
          if (printers.length === 1) {
            // Auto connect if only 1 printer
            macAddress = printers[0].address;
          } else {
            // Show picker UI
            setPrintersList(printers);
            return;
          }
        } catch (e) {
          setStatusMessage('Failed to read paired printers.');
          setIsError(true);
          return;
        }
      }

      setIsPrinting(true);
      setStatusMessage('Sending print job to printer...');
      setIsError(false);

      try {
        const binary = buildThermalReceiptBinary(receiptData, {
          width,
          kickDrawer: thermalSettings.kickDrawer,
          printQr: thermalSettings.showUpiQr && !!company.upiId,
          autoCut: thermalSettings.autoCut,
          extraFeedLines: thermalSettings.extraFeedLines,
        });
        const base64Data = btoa(String.fromCharCode.apply(null, binary as unknown as number[]));

        const res = androidBridge.printToBluetoothDevice(macAddress, base64Data);
        if (res === 'SUCCESS') {
          setStatusMessage('Receipt printed successfully!');
          setTimeout(() => onClose(), 1500);
        } else {
          setIsError(true);
          setStatusMessage(res || 'Failed to print.');
        }
      } catch (err: any) {
        setIsError(true);
        setStatusMessage(err.message || 'Bluetooth printing error.');
      } finally {
        setIsPrinting(false);
        setPrintersList([]);
      }
      return;
    }

    // Web Bluetooth API Fallback (for Chrome/Edge)
    if (typeof navigator !== 'undefined' && 'bluetooth' in navigator) {
      setIsPrinting(true);
      setStatusMessage('Scanning for nearby Bluetooth thermal printers...');
      setIsError(false);

      try {
        const binary = buildThermalReceiptBinary(receiptData, {
          width,
          kickDrawer: thermalSettings.kickDrawer,
          printQr: thermalSettings.showUpiQr && !!company.upiId,
          autoCut: thermalSettings.autoCut,
          extraFeedLines: thermalSettings.extraFeedLines,
        });

        const res = await printViaWebBluetooth(binary);
        if (res.success) {
          setStatusMessage('Receipt printed successfully!');
          setTimeout(() => onClose(), 1500);
        } else {
          setIsError(true);
          setStatusMessage(res.error || 'Failed to print.');
        }
      } catch (err: any) {
        setIsError(true);
        setStatusMessage(err.message || 'Bluetooth printing error.');
      } finally {
        setIsPrinting(false);
      }
      return;
    }

    // Default fallback: window.print()
    window.print();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl shadow-2xl max-w-md w-full max-h-[92vh] flex flex-col border border-outline-variant/30 overflow-hidden">
        {/* Header */}
        <div className="p-3 sm:p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low/50">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">print</span>
            <div>
              <h3 className="font-headline-sm text-sm sm:text-base font-bold text-on-surface">
                Thermal POS Receipt
              </h3>
              <p className="text-[10px] sm:text-[11px] text-on-surface-variant">
                Bill #{invoice.invoiceNumber} • ₹{invoice.grandTotal.toFixed(2)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container transition-colors cursor-pointer"
            aria-label="Close"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Content Body */}
        <div className="p-3 sm:p-4 flex-1 overflow-y-auto space-y-3">
          {/* Single Paper Size Toggle */}
          <div className="flex items-center justify-between bg-surface-container-low px-3 py-2 rounded-xl border border-outline-variant/20">
            <span className="text-xs font-bold text-on-surface-variant">Paper Size</span>
            <div className="flex bg-surface-container rounded-lg p-0.5 border border-outline-variant/30 text-xs font-bold">
              <button
                type="button"
                onClick={() => setWidth(32)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  width === 32
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                58mm (2")
              </button>
              <button
                type="button"
                onClick={() => setWidth(48)}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${
                  width === 48
                    ? 'bg-secondary text-on-secondary shadow-xs'
                    : 'text-on-surface-variant hover:text-on-surface'
                }`}
              >
                80mm (3")
              </button>
            </div>
          </div>

          {/* Feedback Alert */}
          {statusMessage && (
            <div
              className={`p-2.5 rounded-xl text-xs font-medium flex items-center gap-2 ${
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

          {/* Thermal Slip Preview or Printer Picker */}
          <div>
            <div className="text-[10px] font-bold text-on-surface-variant uppercase tracking-wider mb-1 flex items-center justify-between">
              <span>{printersList.length > 0 ? 'Select Printer' : 'Receipt Preview'}</span>
              {!printersList.length && (
                <span className="text-[10px] font-mono text-secondary">
                  {width === 32 ? '32 Columns' : '48 Columns'}
                </span>
              )}
            </div>

            {printersList.length > 0 ? (
              <div className="bg-surface-container-low p-2 rounded-xl border border-outline-variant/30 flex flex-col gap-2 max-h-[300px] overflow-y-auto">
                {printersList.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleBluetoothPrint(p.address)}
                    className="text-left px-4 py-3 rounded-lg bg-surface hover:bg-surface-container-high transition-colors flex items-center justify-between border border-outline-variant/20 shadow-sm cursor-pointer"
                  >
                    <div>
                      <div className="font-bold text-sm text-on-surface">{p.name}</div>
                      <div className="text-[10px] text-on-surface-variant font-mono">{p.address}</div>
                    </div>
                    <span className="material-symbols-outlined text-secondary">print</span>
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setPrintersList([])}
                  className="mt-2 text-xs font-bold text-on-surface-variant text-center py-2 cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            ) : (
              <div
                className={`bg-[#fcfbf9] p-3 rounded-xl border border-outline-variant/30 font-mono ${
                  width === 32 ? 'text-[11px]' : 'text-[10px]'
                } leading-tight text-neutral-900 shadow-inner overflow-x-auto whitespace-pre`}
              >
                {previewText}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-3 sm:p-4 border-t border-outline-variant/20 bg-surface-container-low/50 flex items-center justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl border border-outline-variant/30 text-xs font-bold text-on-surface-variant hover:text-on-surface hover:bg-surface-container transition-all cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={isPrinting}
            onClick={() => handleBluetoothPrint()}
            className="flex-1 sm:flex-initial px-5 py-2.5 bg-secondary text-on-secondary rounded-xl text-xs font-bold shadow-md hover:bg-secondary/90 active:scale-95 transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <span className="material-symbols-outlined text-[18px]">print</span>
            <span>{isPrinting ? 'Printing...' : 'Print Receipt'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

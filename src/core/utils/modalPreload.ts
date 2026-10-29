import React from 'react';

export type PreloadableComponent<T extends React.ComponentType<any>> = React.LazyExoticComponent<T> & {
  preload: () => Promise<{ default: T }>;
};

/**
 * Creates a React.lazy component equipped with a `.preload()` method.
 * Calling `.preload()` initiates the dynamic import immediately and caches the promise.
 */
export function lazyWithPreload<T extends React.ComponentType<any>>(
  factory: () => Promise<{ default: T }>
): PreloadableComponent<T> {
  let loadedPromise: Promise<{ default: T }> | null = null;
  const load = () => {
    if (!loadedPromise) {
      loadedPromise = factory();
    }
    return loadedPromise;
  };

  const Component = React.lazy(load) as PreloadableComponent<T>;
  Component.preload = load;
  return Component;
}

// ── Explicit Modal Preloaders ──────────────────────────────────────────

let invoicePreviewPromise: Promise<any> | null = null;
export function preloadInvoicePreviewModal() {
  if (!invoicePreviewPromise) {
    invoicePreviewPromise = import('../../components/Invoicing/InvoicePreviewModal.tsx');
  }
  return invoicePreviewPromise;
}

let tableGridInvoicePromise: Promise<any> | null = null;
export function preloadTableGridInvoiceModal() {
  if (!tableGridInvoicePromise) {
    tableGridInvoicePromise = import('../../components/Invoicing/TableGridInvoiceModal.tsx');
  }
  return tableGridInvoicePromise;
}

let simplifiedInvoicePromise: Promise<any> | null = null;
export function preloadSimplifiedInvoiceModal() {
  if (!simplifiedInvoicePromise) {
    simplifiedInvoicePromise = import('../../components/Invoicing/SimplifiedInvoiceModal.tsx');
  }
  return simplifiedInvoicePromise;
}

let simplifiedPurchasePromise: Promise<any> | null = null;
export function preloadSimplifiedPurchaseModal() {
  if (!simplifiedPurchasePromise) {
    simplifiedPurchasePromise = import('../../components/Purchases/SimplifiedPurchaseModal.tsx');
  }
  return simplifiedPurchasePromise;
}

let tableGridPurchasePromise: Promise<any> | null = null;
export function preloadTableGridPurchaseModal() {
  if (!tableGridPurchasePromise) {
    tableGridPurchasePromise = import('../../components/Purchases/TableGridPurchaseModal.tsx');
  }
  return tableGridPurchasePromise;
}

let cashBankDetailPromise: Promise<any> | null = null;
export function preloadCashBankTransactionDetailModal() {
  if (!cashBankDetailPromise) {
    cashBankDetailPromise = import('../../components/CashBank/CashBankTransactionDetailModal.tsx');
  }
  return cashBankDetailPromise;
}

let voucherEditorPromise: Promise<any> | null = null;
export function preloadVoucherEditorModal() {
  if (!voucherEditorPromise) {
    voucherEditorPromise = import('../../components/Parties/VoucherEditorModal.tsx');
  }
  return voucherEditorPromise;
}

let reportPdfPreviewPromise: Promise<any> | null = null;
export function preloadReportPdfPreviewModal() {
  if (!reportPdfPreviewPromise) {
    reportPdfPreviewPromise = import('../../components/Reports/ReportPdfPreviewModal.tsx');
  }
  return reportPdfPreviewPromise;
}

let thermalPrintPromise: Promise<any> | null = null;
export function preloadThermalPrintModal() {
  if (!thermalPrintPromise) {
    thermalPrintPromise = import('../../components/Printing/ThermalPrintModal.tsx');
  }
  return thermalPrintPromise;
}

let bulkPrintPromise: Promise<any> | null = null;
export function preloadBulkPrintModal() {
  if (!bulkPrintPromise) {
    bulkPrintPromise = import('../../components/Printing/BulkPrintModal.tsx');
  }
  return bulkPrintPromise;
}

/**
 * Preloads all 11 heavy modal chunks in the background during idle periods.
 * This primes the ServiceWorker cache and browser module cache without blocking main thread.
 */
export function preloadAllModalsOnIdle(): void {
  const allPreloaders = [
    preloadSimplifiedInvoiceModal,
    preloadSimplifiedPurchaseModal,
    preloadInvoicePreviewModal,
    preloadTableGridInvoiceModal,
    preloadTableGridPurchaseModal,
    preloadCashBankTransactionDetailModal,
    preloadVoucherEditorModal,
    preloadReportPdfPreviewModal,
    preloadThermalPrintModal,
    preloadBulkPrintModal,
  ];

  const scheduleIdle =
    typeof window !== 'undefined' && 'requestIdleCallback' in window
      ? (window as any).requestIdleCallback
      : (cb: () => void) => setTimeout(cb, 2000);

  scheduleIdle(() => {
    // Run sequentially with microtask pauses to prevent CPU spike
    let index = 0;
    function next() {
      if (index >= allPreloaders.length) return;
      try {
        const p = allPreloaders[index++]();
        if (p && typeof p.then === 'function') {
          p.then(() => setTimeout(next, 50)).catch(() => setTimeout(next, 50));
        } else {
          setTimeout(next, 50);
        }
      } catch {
        setTimeout(next, 50);
      }
    }
    next();
  });
}

/**
 * Hook to preload specified modals on view mount.
 */
export function useModalPreloadOnMount(preloaders: Array<() => Promise<any>>): void {
  React.useEffect(() => {
    preloaders.forEach((p) => {
      try {
        p();
      } catch {
        // Safe ignore
      }
    });
  }, []);
}

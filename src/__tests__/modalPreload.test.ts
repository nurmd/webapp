import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import {
  lazyWithPreload,
  preloadAllModalsOnIdle,
  useModalPreloadOnMount,
  preloadInvoicePreviewModal,
  preloadInvoiceDocumentModal,
  preloadSimplifiedInvoiceModal,
  preloadTableGridInvoiceModal,
  preloadSimplifiedPurchaseModal,
  preloadPurchaseDocumentModal,
  preloadTableGridPurchaseModal,
  preloadCashBankTransactionDetailModal,
  preloadVoucherEditorModal,
  preloadReportPdfPreviewModal,
  preloadThermalPrintModal,
  preloadBulkPrintModal,
} from '../core/utils/modalPreload.ts';

describe('modalPreload utility suite', () => {
  it('lazyWithPreload attaches a working preload() function that caches promise', async () => {
    const mockComponent = () => React.createElement('div', null, 'ModalContent');
    const factory = vi.fn(async () => ({ default: mockComponent }));

    const Preloadable = lazyWithPreload(factory);
    expect(typeof Preloadable.preload).toBe('function');
    expect(factory).not.toHaveBeenCalled();

    const p1 = Preloadable.preload();
    const p2 = Preloadable.preload();
    expect(p1).toBe(p2);
    expect(factory).toHaveBeenCalledTimes(1);

    const res = await p1;
    expect(res.default).toBe(mockComponent);
  });

  it('named preloaders return promises and do not crash', () => {
    const preloaders = [
      preloadInvoicePreviewModal,
      preloadInvoiceDocumentModal,
      preloadSimplifiedInvoiceModal,
      preloadTableGridInvoiceModal,
      preloadSimplifiedPurchaseModal,
      preloadPurchaseDocumentModal,
      preloadTableGridPurchaseModal,
      preloadCashBankTransactionDetailModal,
      preloadVoucherEditorModal,
      preloadReportPdfPreviewModal,
      preloadThermalPrintModal,
      preloadBulkPrintModal,
    ];

    for (const preloader of preloaders) {
      expect(typeof preloader).toBe('function');
      const promise = preloader();
      expect(promise).toBeDefined();
      expect(typeof promise.then).toBe('function');
    }
  });

  it('preloadAllModalsOnIdle executes idle callback safely', () => {
    const originalIdle = (window as any).requestIdleCallback;
    const idleSpy = vi.fn((cb: () => void) => cb());
    (window as any).requestIdleCallback = idleSpy;

    try {
      expect(() => preloadAllModalsOnIdle()).not.toThrow();
      expect(idleSpy).toHaveBeenCalledTimes(1);
    } finally {
      (window as any).requestIdleCallback = originalIdle;
    }
  });

  it('preloadAllModalsOnIdle falls back to setTimeout if requestIdleCallback missing', () => {
    const originalIdle = (window as any).requestIdleCallback;
    delete (window as any).requestIdleCallback;

    try {
      expect(() => preloadAllModalsOnIdle()).not.toThrow();
    } finally {
      (window as any).requestIdleCallback = originalIdle;
    }
  });
});

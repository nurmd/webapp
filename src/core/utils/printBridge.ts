/**
 * Vyapar Books Print Bridge: Unified Native Android & Desktop/Browser Printing
 *
 * Dispatches HTML and current-page prints to Android PrintManager via AndroidBridge
 * with explicit paper size attributes (ISO A4 portrait, A4 landscape, or default),
 * and provides robust browser fallbacks (popup window -> hidden iframe -> window.print).
 */

export type PrintPaperSize = 'A4' | 'A4-landscape' | 'default';

/**
 * Escapes characters for safe inclusion in generated HTML documents.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Dispatches an HTML document directly to Android PrintManager via AndroidBridge.
 * For A4 portrait, preserves the legacy two-argument call (html, jobName) for backwards compatibility.
 * Returns true if handled by the native bridge without error, or false if bridge is unavailable or throws.
 */
export function printHtmlNative(
  html: string,
  jobName: string,
  paperSize: PrintPaperSize = 'A4'
): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as any).AndroidBridge;
  if (!bridge) return false;

  try {
    if (paperSize === 'A4') {
      if (typeof bridge.printHtml === 'function') {
        bridge.printHtml(html, jobName);
        return true;
      }
      if (typeof bridge.printHtmlWithPaper === 'function') {
        bridge.printHtmlWithPaper(html, jobName, 'A4');
        return true;
      }
    } else {
      if (typeof bridge.printHtmlWithPaper === 'function') {
        bridge.printHtmlWithPaper(html, jobName, paperSize);
        return true;
      }
      if (typeof bridge.printHtml === 'function') {
        bridge.printHtml(html, jobName);
        return true;
      }
    }
  } catch (err) {
    console.warn('AndroidBridge HTML printing failed, falling back to browser print:', err);
    return false;
  }
  return false;
}

/**
 * Dispatches the current application page / document to Android PrintManager via AndroidBridge.
 * Uses the main application WebView adapter with the requested paper size attributes.
 * Returns true if handled by the native bridge without error, or false otherwise.
 */
export function printCurrentPageNative(
  jobName: string,
  paperSize: PrintPaperSize = 'A4'
): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as any).AndroidBridge;
  if (!bridge) return false;

  try {
    if (paperSize === 'A4') {
      if (typeof bridge.printCurrentPage === 'function') {
        bridge.printCurrentPage(jobName);
        return true;
      }
      if (typeof bridge.printCurrentPageWithPaper === 'function') {
        bridge.printCurrentPageWithPaper(jobName, 'A4');
        return true;
      }
    } else {
      if (typeof bridge.printCurrentPageWithPaper === 'function') {
        bridge.printCurrentPageWithPaper(jobName, paperSize);
        return true;
      }
      if (typeof bridge.printCurrentPage === 'function') {
        bridge.printCurrentPage(jobName);
        return true;
      }
    }
  } catch (err) {
    console.warn('AndroidBridge current page printing failed, falling back:', err);
    return false;
  }
  return false;
}

/**
 * Dispatches direct PDF generation of the current page / document via AndroidBridge.
 * Renders the WebView to an ISO A4 PDF file in native cache and opens it with ACTION_VIEW.
 * Returns true if handled by the native bridge without error, or false if bridge is unavailable or throws.
 */
export function generatePdfNative(jobName: string): boolean {
  if (typeof window === 'undefined') return false;
  const bridge = (window as any).AndroidBridge;
  if (!bridge) return false;

  try {
    if (typeof bridge.generatePdfFromCurrentPage === 'function') {
      bridge.generatePdfFromCurrentPage(jobName);
      return true;
    }
  } catch (err) {
    console.warn('AndroidBridge direct PDF generation failed, falling back:', err);
    return false;
  }
  return false;
}

/**
 * Unified printable HTML generator runner:
 * Tries Android native print first, then falls back to window.open, hidden iframe, and window.print().
 */
export function printHtmlDocument(
  html: string,
  jobName: string,
  paperSize: PrintPaperSize = 'A4'
): void {
  if (printHtmlNative(html, jobName, paperSize)) {
    return;
  }

  // Browser fallback 1: popup window
  try {
    const printWindow = window.open('', '_blank');
    if (printWindow && !printWindow.closed) {
      printWindow.document.open();
      printWindow.document.write(html);
      printWindow.document.close();
      return;
    }
  } catch (err) {
    console.warn('Popup blocked, attempting iframe print fallback:', err);
  }

  // Browser fallback 2: hidden iframe
  try {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentWindow?.document || iframe.contentDocument;
    if (doc) {
      doc.open();
      doc.write(html);
      doc.close();

      setTimeout(() => {
        try {
          iframe.contentWindow?.focus();
          if (typeof iframe.contentWindow?.print === 'function') {
            iframe.contentWindow.print();
          } else if (typeof window !== 'undefined' && typeof window.print === 'function') {
            window.print();
          }
        } finally {
          setTimeout(() => {
            if (iframe.parentNode) iframe.parentNode.removeChild(iframe);
          }, 3000);
        }
      }, 300);
      return;
    }
  } catch (e) {
    console.warn('Iframe print failed, falling back to window.print():', e);
  }

  // Browser fallback 3: window.print()
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

/**
 * Unified current page / modal print runner:
 * Tries native current-page print on Android with the specified paper size, then falls back to window.print().
 */
export function printCurrentPage(
  jobName: string,
  paperSize: PrintPaperSize = 'A4'
): void {
  if (printCurrentPageNative(jobName, paperSize)) {
    return;
  }
  if (typeof window !== 'undefined' && typeof window.print === 'function') {
    window.print();
  }
}

export type PrintDocumentType = 'invoice-current-page' | 'standalone-html';

export interface PrintDocumentOptions {
  documentType: PrintDocumentType;
  jobName: string;
  paperSize?: PrintPaperSize;
  html?: string;
}

/**
 * Consolidated print document runner:
 * Chooses between current-page DOM printing (for modal previews like Invoice A4)
 * and standalone HTML document printing (for reports, vouchers, bills, slips).
 */
export function printDocument(options: PrintDocumentOptions): void {
  if (options.documentType === 'standalone-html') {
    if (!options.html) {
      console.warn('printDocument: HTML string required for standalone-html documentType');
      return;
    }
    printHtmlDocument(options.html, options.jobName, options.paperSize || 'A4');
  } else {
    printCurrentPage(options.jobName, options.paperSize || 'A4');
  }
}

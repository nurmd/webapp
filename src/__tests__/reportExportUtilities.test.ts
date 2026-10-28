import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeCsvCell,
  formatRfc4180Cell,
  generateCsvContent,
  exportReportToCsv,
  generateReportHtml,
  printReportDocument,
  printReportDocumentDirect,
  ReportPdfConfig,
} from '../components/Reports/utils/reportExportUtils.ts';
import { CompanyProfile } from '../models/company.ts';

describe('Report Export Utilities (reportExportUtils.ts)', () => {
  const mockCompany: CompanyProfile = {
    id: 'company-default',
    businessName: 'Sharma Enterprise Private Limited',
    tradeName: 'Sharma Electronics & Electricals',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    pincode: '400058',
    phone: '9876543210',
    email: 'info@sharmaelec.com',
    address: 'Shop 12, Main Market, Andheri West, Mumbai, Maharashtra',
    stateCode: '27',
    isGstEnabled: true,
  };

  describe('1. CSV Sanitization & RFC 4180 Escaping', () => {
    it('prepends UTF-8 BOM (\\uFEFF) to the generated CSV payload', () => {
      const headers = ['Item', 'Amount'];
      const rows = [['Widget A', 1500]];
      const csv = generateCsvContent(headers, rows);
      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(csv.charCodeAt(0)).toBe(0xfeff);
    });

    it('sanitizes formula injection characters (=, +, -, @, \\t, \\r) on text cells (CWE-1236)', () => {
      expect(sanitizeCsvCell('=SUM(A1:B1)')).toBe("'=SUM(A1:B1)");
      expect(sanitizeCsvCell('+cmd|/c calc')).toBe("'+cmd|/c calc");
      expect(sanitizeCsvCell('@payload')).toBe("'@payload");
      expect(sanitizeCsvCell('\tmaliciousTab')).toBe("'\tmaliciousTab");
      expect(sanitizeCsvCell('\rmaliciousReturn')).toBe("'\rmaliciousReturn");
      expect(sanitizeCsvCell('-cmd|/c notepad')).toBe("'-cmd|/c notepad");
    });

    it('preserves genuine negative numbers without formula quote', () => {
      // Numeric inputs
      expect(sanitizeCsvCell(-500.5)).toBe('-500.50');
      expect(sanitizeCsvCell(-42)).toBe('-42');

      // Numeric string inputs
      expect(sanitizeCsvCell('-1200.75')).toBe('-1200.75');
      expect(sanitizeCsvCell('-100')).toBe('-100');
    });

    it('escapes embedded quotes and encloses cells containing commas or newlines per RFC 4180', () => {
      expect(formatRfc4180Cell('Normal String')).toBe('Normal String');
      expect(formatRfc4180Cell('Pipes, Valves and Fittings')).toBe('"Pipes, Valves and Fittings"');
      expect(formatRfc4180Cell('12" Heavy Duty Pipe')).toBe('"12"" Heavy Duty Pipe"');
      expect(formatRfc4180Cell("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
      expect(formatRfc4180Cell('Quote "and" comma, combined')).toBe('"Quote ""and"" comma, combined"');
    });

    it('formats floating point numbers to 2 decimals and keeps integer counts clean', () => {
      expect(sanitizeCsvCell(125.456)).toBe('125.46');
      expect(sanitizeCsvCell(100)).toBe('100');
      expect(sanitizeCsvCell(0)).toBe('0');
      expect(sanitizeCsvCell(null)).toBe('');
      expect(sanitizeCsvCell(undefined)).toBe('');
    });

    it('appends summary row properly at the bottom of the CSV', () => {
      const headers = ['Category', 'Sales'];
      const rows = [
        ['Electronics', 5000],
        ['Apparel', 3000],
      ];
      const summary = ['TOTAL', 8000];
      const csv = generateCsvContent(headers, rows, summary);
      const lines = csv.replace('\uFEFF', '').split('\r\n');

      expect(lines.length).toBe(4);
      expect(lines[0]).toBe('Category,Sales');
      expect(lines[1]).toBe('Electronics,5000');
      expect(lines[2]).toBe('Apparel,3000');
      expect(lines[3]).toBe('TOTAL,8000');
    });
  });

  describe('2. exportReportToCsv Browser Download Trigger', () => {
    let originalCreateObjectURL: typeof URL.createObjectURL;
    let originalRevokeObjectURL: typeof URL.revokeObjectURL;
    let createdBlob: Blob | null = null;
    let clickedAnchor: HTMLAnchorElement | null = null;

    beforeEach(() => {
      createdBlob = null;
      clickedAnchor = null;
      originalCreateObjectURL = URL.createObjectURL;
      originalRevokeObjectURL = URL.revokeObjectURL;

      URL.createObjectURL = vi.fn((blob: Blob) => {
        createdBlob = blob;
        return 'blob:mock-csv-url';
      });
      URL.revokeObjectURL = vi.fn();

      vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        if (node instanceof HTMLAnchorElement) {
          clickedAnchor = node;
          vi.spyOn(node, 'click').mockImplementation(() => {});
        }
        return node;
      });
      vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);
    });

    afterEach(() => {
      URL.createObjectURL = originalCreateObjectURL;
      URL.revokeObjectURL = originalRevokeObjectURL;
      vi.restoreAllMocks();
    });

    it('creates a UTF-8 Blob and triggers anchor download with filename', () => {
      const headers = ['Invoice No', 'Amount'];
      const rows = [['INV-001', 1050.5]];

      exportReportToCsv('sales_report', headers, rows);

      expect(URL.createObjectURL).toHaveBeenCalledTimes(1);
      expect(createdBlob).not.toBeNull();
      expect(createdBlob?.type).toContain('text/csv;charset=utf-8;');
      expect(clickedAnchor?.download).toBe('sales_report.csv');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:mock-csv-url');
    });
  });

  describe('3. Printable PDF Document Generation (generateReportHtml)', () => {
    it('generates valid HTML document with @page A4 orientation and company branding', () => {
      const config: ReportPdfConfig = {
        title: 'GSTR-3B Summary Report',
        company: mockCompany,
        dateRangeLabel: '01 Oct 2026 to 31 Oct 2026',
        orientation: 'portrait',
        kpis: [
          { label: 'Outward Tax', value: '₹ 25,000.00' },
          { label: 'Eligible ITC', value: '₹ 18,000.00' },
          { label: 'Net Cash Payable', value: '₹ 7,000.00' },
        ],
        headers: ['Table', 'Description', 'Amount (INR)'],
        rows: [
          ['3.1(a)', 'Outward Taxable Supplies', 125000],
          ['4(A)', 'Eligible ITC Available', 18000],
        ],
        summaryRow: ['TOTAL', 'Net Tax Payable', 7000],
      };

      const html = generateReportHtml(config);

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('@page {');
      expect(html).toContain('size: A4 portrait');
      expect(html).toContain('Sharma Electronics & Electricals');
      expect(html).toContain('27AABCU9603R1ZM');
      expect(html).toContain('GSTR-3B Summary Report');
      expect(html).toContain('01 Oct 2026 to 31 Oct 2026');
      expect(html).toContain('Outward Tax');
      expect(html).toContain('₹ 25,000.00');
      expect(html).toContain('<tr class="summary-row">');
      expect(html).toContain('class="btn-print"');
      expect(html).toContain('thead {');
      expect(html).toContain('display: table-header-group;');
    });

    it('defaults orientation to landscape for wide tables (> 7 columns)', () => {
      const config: ReportPdfConfig = {
        title: 'Wide Sales Register',
        company: mockCompany,
        dateRangeLabel: 'October 2026',
        headers: ['Col1', 'Col2', 'Col3', 'Col4', 'Col5', 'Col6', 'Col7', 'Col8'],
        rows: [['1', '2', '3', '4', '5', '6', '7', '8']],
      };

      const html = generateReportHtml(config);
      expect(html).toContain('size: A4 landscape');
    });
  });

  describe('4. printReportDocument Execution & Fallback Handling', () => {
    let mockPrintWindow: {
      document: { open: ReturnType<typeof vi.fn>; write: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> };
      closed: boolean;
    };

    beforeEach(() => {
      mockPrintWindow = {
        document: {
          open: vi.fn(),
          write: vi.fn(),
          close: vi.fn(),
        },
        closed: false,
      };
    });

    afterEach(() => {
      vi.restoreAllMocks();
    });

    it('writes to new window when window.open succeeds', () => {
      window.open = vi.fn().mockReturnValue(mockPrintWindow);

      const config: ReportPdfConfig = {
        title: 'Stock Valuation',
        company: mockCompany,
        dateRangeLabel: 'As of Today',
        headers: ['Item', 'Valuation'],
        rows: [['Motor A', 15000]],
      };

      printReportDocument(config);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(mockPrintWindow.document.open).toHaveBeenCalled();
      expect(mockPrintWindow.document.write).toHaveBeenCalled();
      expect(mockPrintWindow.document.close).toHaveBeenCalled();
    });

    it('falls back to hidden iframe when window.open is blocked (returns null)', () => {
      window.open = vi.fn().mockReturnValue(null);

      const mockIframeDoc = {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      };
      const mockIframeWin = {
        document: mockIframeDoc,
        focus: vi.fn(),
        print: vi.fn(),
      };

      const appendChildSpy = vi.spyOn(document.body, 'appendChild');

      const config: ReportPdfConfig = {
        title: 'Stock Valuation',
        company: mockCompany,
        dateRangeLabel: 'As of Today',
        headers: ['Item', 'Valuation'],
        rows: [['Motor A', 15000]],
      };

      printReportDocument(config);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(appendChildSpy).toHaveBeenCalled();
      const iframe = appendChildSpy.mock.calls.find((call) => call[0] instanceof HTMLIFrameElement)?.[0] as HTMLIFrameElement;
      expect(iframe).toBeDefined();
    });

    it('selects A4-landscape paper size in printReportDocumentDirect when headers length > 7', () => {
      const mockPrintHtmlWithPaper = vi.fn();
      const mockPrintHtml = vi.fn();
      (window as any).AndroidBridge = {
        printHtmlWithPaper: mockPrintHtmlWithPaper,
        printHtml: mockPrintHtml,
      };

      const wideConfig: ReportPdfConfig = {
        title: 'Wide Multi-Column Sales Register',
        company: mockCompany,
        dateRangeLabel: 'FY 2026-27',
        headers: ['Date', 'Invoice #', 'Party', 'GSTIN', 'Taxable', 'CGST', 'SGST', 'IGST', 'Total'],
        rows: [['2026-10-15', 'INV-01', 'Acme Corp', '27AABCU9603R1ZM', '1000', '90', '90', '0', '1180']],
      };

      printReportDocumentDirect(wideConfig);

      expect(mockPrintHtmlWithPaper).toHaveBeenCalledTimes(1);
      expect(mockPrintHtmlWithPaper).toHaveBeenCalledWith(
        expect.stringContaining('Wide Multi-Column Sales Register'),
        'Wide Multi-Column Sales Register',
        'A4-landscape'
      );
      expect(mockPrintHtml).not.toHaveBeenCalled();
    });

    it('selects standard A4 paper size in printReportDocumentDirect when headers length <= 7', () => {
      const mockPrintHtmlWithPaper = vi.fn();
      const mockPrintHtml = vi.fn();
      (window as any).AndroidBridge = {
        printHtmlWithPaper: mockPrintHtmlWithPaper,
        printHtml: mockPrintHtml,
      };

      const standardConfig: ReportPdfConfig = {
        title: 'Summary Report',
        company: mockCompany,
        dateRangeLabel: 'Today',
        headers: ['Date', 'Doc #', 'Party', 'Amount'],
        rows: [['2026-10-15', 'INV-01', 'Acme Corp', '1180']],
      };

      printReportDocumentDirect(standardConfig);

      expect(mockPrintHtml).toHaveBeenCalledTimes(1);
      expect(mockPrintHtml).toHaveBeenCalledWith(
        expect.stringContaining('Summary Report'),
        'Summary Report'
      );
      expect(mockPrintHtmlWithPaper).not.toHaveBeenCalled();
    });
  });
});

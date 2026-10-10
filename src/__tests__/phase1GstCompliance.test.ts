import { describe, it, expect } from 'vitest';
import { calculateInvoice, STATUTORY_GST_RATES } from '../core/gst/calculator.ts';
import { generateGstr1Json } from '../core/gst/gstrExport.ts';
import { generateEInvoiceJson } from '../core/gst/eInvoiceExport.ts';
import { generateEWayBillJson, isValidVehicleNumber, EWAY_BILL_STATUTORY_THRESHOLD } from '../core/gst/eWayBillExport.ts';
import { validateSingleInvoice } from '../core/gst/gstrValidator.ts';
import { getFinancialYear } from '../core/utils/dateFilters.ts';
import { CompanyProfile } from '../models/company.ts';
import { Invoice } from '../models/invoice.ts';

const mockCompany: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Apex GST Traders Pvt Ltd',
  tradeName: 'Apex Traders',
  gstin: '27AABCU9603R1ZN',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '101 Commerce Park, Senapati Bapat Marg, Dadar West',
  city: 'Mumbai',
  pincode: '400028',
  phone: '9876543210',
  email: 'tax@apextraders.in',
  invoicePrefix: 'APX-2026-',
  isGstEnabled: true,
};

describe('Phase 1 GST Statutory Compliance & Audit Remediation Suite', () => {
  describe('R1: Statutory GST Rate Slabs & CESS Calculation', () => {
    it('supports all statutory rate slabs: 0%, 0.1%, 0.25%, 3%, 5%, 12%, 18%, 28%', () => {
      expect(STATUTORY_GST_RATES).toEqual([0, 0.1, 0.25, 3, 5, 12, 18, 28]);
    });

    it('calculates 0.1% rate with zero precision drift (Intra-state: 0.05% CGST + 0.05% SGST)', () => {
      const summary = calculateInvoice('27', '27', [
        { quantity: 1000, unitPrice: 100, gstRate: 0.1 },
      ]);
      expect(summary.totalTaxableAmount).toBe(100000);
      expect(summary.totalCgst).toBe(50);
      expect(summary.totalSgst).toBe(50);
      expect(summary.totalIgst).toBe(0);
      expect(summary.grandTotal).toBe(100100);
    });

    it('calculates 0.25% rate with zero precision drift (Inter-state: 0.25% IGST)', () => {
      const summary = calculateInvoice('27', '24', [
        { quantity: 10, unitPrice: 40000, gstRate: 0.25 },
      ]);
      expect(summary.totalTaxableAmount).toBe(400000);
      expect(summary.totalIgst).toBe(1000);
      expect(summary.totalCgst).toBe(0);
      expect(summary.totalSgst).toBe(0);
      expect(summary.grandTotal).toBe(401000);
    });

    it('calculates 3% precious metals / gold rate correctly', () => {
      const summary = calculateInvoice('27', '27', [
        { quantity: 10, unitPrice: 75000, gstRate: 3 },
      ]);
      expect(summary.totalTaxableAmount).toBe(750000);
      expect(summary.totalCgst).toBe(11250);
      expect(summary.totalSgst).toBe(11250);
      expect(summary.totalIgst).toBe(0);
      expect(summary.grandTotal).toBe(772500);
    });

    it('calculates percentage CESS and per-unit CESS simultaneously', () => {
      const summary = calculateInvoice('27', '27', [
        { quantity: 100, unitPrice: 500, gstRate: 28, cessPercent: 12, cessPerUnit: 1.5 },
      ]);
      // Taxable = 50,000. CGST 14% = 7,000, SGST 14% = 7,000.
      // Cess = (50,000 * 12%) + (100 * 1.5) = 6,000 + 150 = 6,150.
      expect(summary.totalTaxableAmount).toBe(50000);
      expect(summary.totalCgst).toBe(7000);
      expect(summary.totalSgst).toBe(7000);
      expect(summary.totalCess).toBe(6150);
      expect(summary.grandTotal).toBe(70150);
    });
  });

  describe('R2: Complete GSTR-1 Government Export Tables', () => {
    const mockInvoices: Invoice[] = [
      // 1. Table 4: B2B Regular with RCM = true
      {
        id: 'INV-B2B-1',
        invoiceNumber: 'APX-2026-001',
        invoiceType: 'B2B',
        date: '2026-10-05',
        partyName: 'Bharat Electronics Ltd',
        partyGstin: '27AAACB2233P1Z1',
        partyAddress: 'Pune Industrial Area, Pune 411001',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        isRcm: true,
        items: [
          {
            itemId: 'ITM-1',
            name: 'Industrial Controller',
            hsnSacCode: '85371000',
            unit: 'NOS',
            quantity: 5,
            unitPrice: 20000,
            taxableAmount: 100000,
            gstRate: 18,
            cgstAmount: 9000,
            sgstAmount: 9000,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 118000,
          },
        ],
        totalGrossAmount: 100000,
        totalDiscount: 0,
        totalTaxableAmount: 100000,
        totalCgst: 9000,
        totalSgst: 9000,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 18000,
        roundOff: 0,
        grandTotal: 118000,
        amountInWords: 'One Lakh Eighteen Thousand Rupees Only',
        paymentMode: 'BANK',
        paymentStatus: 'PAID',
        paidAmount: 118000,
        balanceAmount: 0,
        createdAt: '2026-10-05T10:00:00Z',
        updatedAt: '2026-10-05T10:00:00Z',
      },

      // 2. Table 5: B2CL (Inter-state unregistered > ₹2.5 Lakh)
      {
        id: 'INV-B2CL-1',
        invoiceNumber: 'APX-2026-002',
        invoiceType: 'B2CL',
        date: '2026-10-08',
        partyName: 'Delhi Individual Buyer',
        partyAddress: 'Connaught Place, New Delhi 110001',
        partyStateCode: '07',
        placeOfSupplyStateCode: '07',
        isIntraState: false,
        items: [
          {
            itemId: 'ITM-2',
            name: 'Commercial Solar Inverter',
            hsnSacCode: '85044090',
            unit: 'NOS',
            quantity: 2,
            unitPrice: 150000,
            taxableAmount: 300000,
            gstRate: 12,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 36000,
            cessAmount: 0,
            totalAmount: 336000,
          },
        ],
        totalGrossAmount: 300000,
        totalDiscount: 0,
        totalTaxableAmount: 300000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 36000,
        totalCess: 0,
        totalTax: 36000,
        roundOff: 0,
        grandTotal: 336000,
        amountInWords: 'Three Lakh Thirty Six Thousand Rupees Only',
        paymentMode: 'BANK',
        paymentStatus: 'PAID',
        paidAmount: 336000,
        balanceAmount: 0,
        createdAt: '2026-10-08T12:00:00Z',
        updatedAt: '2026-10-08T12:00:00Z',
      },

      // 3. Table 6A: Export (WPAY)
      {
        id: 'INV-EXP-1',
        invoiceNumber: 'APX-2026-003',
        invoiceType: 'EXPORT',
        date: '2026-10-10',
        exportType: 'WPAY',
        shippingBillNumber: 'SB-889900',
        shippingBillDate: '2026-10-09',
        partyName: 'Apex Global Trade FZE (Dubai)',
        partyAddress: 'Jebel Ali Free Zone, Dubai, UAE',
        partyStateCode: '96',
        placeOfSupplyStateCode: '96',
        isIntraState: false,
        items: [
          {
            itemId: 'ITM-3',
            name: 'Export Machinery Spare',
            hsnSacCode: '84799090',
            unit: 'NOS',
            quantity: 10,
            unitPrice: 50000,
            taxableAmount: 500000,
            gstRate: 18,
            cgstAmount: 0,
            sgstAmount: 0,
            igstAmount: 90000,
            cessAmount: 0,
            totalAmount: 590000,
          },
        ],
        totalGrossAmount: 500000,
        totalDiscount: 0,
        totalTaxableAmount: 500000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 90000,
        totalCess: 0,
        totalTax: 90000,
        roundOff: 0,
        grandTotal: 590000,
        amountInWords: 'Five Lakh Ninety Thousand Rupees Only',
        paymentMode: 'BANK',
        paymentStatus: 'PAID',
        paidAmount: 590000,
        balanceAmount: 0,
        createdAt: '2026-10-10T14:00:00Z',
        updatedAt: '2026-10-10T14:00:00Z',
      },

      // 4. Table 9B: Registered Credit Note (CDNR)
      {
        id: 'CN-001',
        invoiceNumber: 'CN-2026-001',
        invoiceType: 'CREDIT_NOTE',
        noteType: 'C',
        originalInvoiceNumber: 'APX-2026-001',
        originalInvoiceDate: '2026-10-05',
        date: '2026-10-12',
        partyName: 'Bharat Electronics Ltd',
        partyGstin: '27AAACB2233P1Z1',
        partyAddress: 'Pune Industrial Area, Pune 411001',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'ITM-1',
            name: 'Industrial Controller (Defect Return)',
            hsnSacCode: '85371000',
            unit: 'NOS',
            quantity: 1,
            unitPrice: 20000,
            taxableAmount: 20000,
            gstRate: 18,
            cgstAmount: 1800,
            sgstAmount: 1800,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 23600,
          },
        ],
        totalGrossAmount: 20000,
        totalDiscount: 0,
        totalTaxableAmount: 20000,
        totalCgst: 1800,
        totalSgst: 1800,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 3600,
        roundOff: 0,
        grandTotal: 23600,
        amountInWords: 'Twenty Three Thousand Six Hundred Rupees Only',
        paymentMode: 'CREDIT',
        paymentStatus: 'PAID',
        paidAmount: 23600,
        balanceAmount: 0,
        createdAt: '2026-10-12T16:00:00Z',
        updatedAt: '2026-10-12T16:00:00Z',
      },
    ];

    it('generates GSTR-1 JSON with Table 4 (B2B) mapping dynamic rchrg="Y"', () => {
      const gstr = generateGstr1Json(mockCompany, mockInvoices, '102026');
      expect(gstr.b2b).toBeDefined();
      expect(gstr.b2b?.length).toBe(1);
      const b2bItem = gstr.b2b?.[0].inv[0];
      expect(b2bItem?.rchrg).toBe('Y');
      expect(b2bItem?.val).toBe(118000);
      expect(b2bItem?.idt).toBe('05-10-2026');
    });

    it('generates Table 5 (B2CL) for large inter-state unregistered invoice', () => {
      const gstr = generateGstr1Json(mockCompany, mockInvoices, '102026');
      expect(gstr.b2cl).toBeDefined();
      expect(gstr.b2cl?.length).toBe(1);
      const b2clEntry = gstr.b2cl?.[0];
      expect(b2clEntry?.pos).toBe('07');
      expect(b2clEntry?.inv[0].val).toBe(336000);
      expect(b2clEntry?.inv[0].itms[0].itm_det.iamt).toBe(36000);
    });

    it('generates Table 6A (EXP) for export supply with shipping bill details', () => {
      const gstr = generateGstr1Json(mockCompany, mockInvoices, '102026');
      expect(gstr.exp).toBeDefined();
      expect(gstr.exp?.length).toBe(1);
      expect(gstr.exp?.[0].exp_typ).toBe('WPAY');
      const expInv = gstr.exp?.[0].inv[0];
      expect(expInv?.inum).toBe('APX-2026-003');
      expect(expInv?.val).toBe(590000);
      expect(expInv?.sbnum).toBe('SB-889900');
      expect(expInv?.sbdt).toBe('09-10-2026');
    });

    it('generates Table 9B (CDNR) linking original invoice and date', () => {
      const gstr = generateGstr1Json(mockCompany, mockInvoices, '102026');
      expect(gstr.cdnr).toBeDefined();
      expect(gstr.cdnr?.length).toBe(1);
      const cdnrNote = gstr.cdnr?.[0].nt[0];
      expect(cdnrNote?.ntty).toBe('C');
      expect(cdnrNote?.nt_num).toBe('CN-2026-001');
      expect(cdnrNote?.inum).toBe('APX-2026-001');
      expect(cdnrNote?.idt).toBe('05-10-2026');
      expect(cdnrNote?.val).toBe(23600);
    });

    it('generates Table 13 (DOCS) tracking document numbering series and counts', () => {
      const gstr = generateGstr1Json(mockCompany, mockInvoices, '102026');
      expect(gstr.doc_issue).toBeDefined();
      expect(gstr.doc_issue?.doc_det.length).toBeGreaterThanOrEqual(2); // Invoices & Credit Notes
      const invDoc = gstr.doc_issue?.doc_det.find((d) => d.doc_num === 1);
      expect(invDoc?.docs[0].totnum).toBe(3);
      expect(invDoc?.docs[0].from).toBe('APX-2026-001');
      expect(invDoc?.docs[0].to).toBe('APX-2026-003');

      const cnDoc = gstr.doc_issue?.doc_det.find((d) => d.doc_num === 5);
      expect(cnDoc?.docs[0].totnum).toBe(1);
      expect(cnDoc?.docs[0].from).toBe('CN-2026-001');
    });
  });

  describe('R3: Dynamic e-Invoice and e-Way Bill Payloads', () => {
    const testInvoice: Invoice = {
      id: 'INV-TEST-01',
      invoiceNumber: 'APX-2026-099',
      invoiceType: 'B2B',
      date: '2026-10-10',
      partyName: 'Reliance Retail Ventures',
      partyGstin: '24AAACR1234F1Z8',
      partyAddress: 'GIDC Industrial Estate, Sector 12, Gandhinagar 382010',
      partyPincode: '382010',
      partyStateCode: '24',
      placeOfSupplyStateCode: '24',
      isIntraState: false,
      items: [
        {
          itemId: 'ITM-99',
          name: 'Precision Power Supply',
          hsnSacCode: '85044030',
          unit: 'NOS',
          quantity: 2,
          unitPrice: 30000,
          taxableAmount: 60000,
          gstRate: 18,
          cgstAmount: 0,
          sgstAmount: 0,
          igstAmount: 10800,
          cessRate: 1,
          cessAmount: 600,
          totalAmount: 71400,
        },
      ],
      totalGrossAmount: 60000,
      totalDiscount: 0,
      totalTaxableAmount: 60000,
      totalCgst: 0,
      totalSgst: 0,
      totalIgst: 10800,
      totalCess: 600,
      totalTax: 11400,
      roundOff: 0,
      grandTotal: 71400,
      amountInWords: 'Seventy One Thousand Four Hundred Rupees Only',
      paymentMode: 'BANK',
      paymentStatus: 'PAID',
      paidAmount: 71400,
      balanceAmount: 0,
      createdAt: '2026-10-10T10:00:00Z',
      updatedAt: '2026-10-10T10:00:00Z',
    };

    it('generates e-Invoice payload with dynamic supplier and buyer PIN/location', () => {
      const eInv = generateEInvoiceJson(mockCompany, testInvoice);
      expect(eInv.SellerDtls.Pin).toBe(400028);
      expect(eInv.SellerDtls.Loc).toBe('Mumbai');
      expect(eInv.BuyerDtls.Pin).toBe(382010);
      expect(eInv.BuyerDtls.Loc).toBe('Gandhinagar');
      expect(eInv.TranDtls.SupTyp).toBe('B2B');
      expect(eInv.ItemList[0].CesRt).toBe(1);
      expect(eInv.ItemList[0].CesAmt).toBe(600);
    });

    it('generates e-Way Bill payload with dynamic PIN, locations, and CESS', () => {
      const eWay = generateEWayBillJson(mockCompany, testInvoice, {
        vehicleNumber: 'MH02XY9999',
        transDistance: 450,
      });
      const bill = eWay.billLists[0];
      expect(bill.fromPincode).toBe(400028);
      expect(bill.fromPlace).toBe('Mumbai');
      expect(bill.toPincode).toBe(382010);
      expect(bill.toPlace).toBe('Gandhinagar');
      expect(bill.vehNo).toBe('MH02XY9999');
      expect(bill.transDistance).toBe(450);
      expect(bill.cessValue).toBe(600);
    });

    it('validates Indian vehicle registration numbers correctly', () => {
      expect(isValidVehicleNumber('MH02XY9999')).toBe(true);
      expect(isValidVehicleNumber('DL01A1234')).toBe(true);
      expect(isValidVehicleNumber('KA05MC4321')).toBe(true);
      expect(isValidVehicleNumber('INVALID_VEHICLE')).toBe(false);
      expect(isValidVehicleNumber('')).toBe(false);
    });

    it('enforces statutory ₹50,000 threshold constant', () => {
      expect(EWAY_BILL_STATUTORY_THRESHOLD).toBe(50000);
    });
  });

  describe('R4: Pre-Save GST Compliance Validation Gate', () => {
    it('blocks B2B invoice with missing recipient GSTIN', () => {
      const invalidB2b: Invoice = {
        id: 'INV-INVALID-1',
        invoiceNumber: 'INV-001',
        invoiceType: 'B2B',
        date: '2026-10-10',
        partyName: 'ABC Enterprises',
        partyAddress: 'Mumbai',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 90,
        totalSgst: 90,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1180,
        balanceAmount: 0,
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      };
      const check = validateSingleInvoice(invalidB2b, '27', true);
      expect(check.isValid).toBe(false);
      expect(check.errors[0]).toContain('requires recipient GSTIN');
    });

    it('blocks invoice with tax bifurcation mismatch (Intra-state charging IGST)', () => {
      const mismatchedInvoice: Invoice = {
        id: 'INV-INVALID-2',
        invoiceNumber: 'INV-002',
        invoiceType: 'B2CS',
        date: '2026-10-10',
        partyName: 'Local Customer',
        partyAddress: 'Mumbai',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [],
        totalGrossAmount: 1000,
        totalDiscount: 0,
        totalTaxableAmount: 1000,
        totalCgst: 0,
        totalSgst: 0,
        totalIgst: 180, // INVALID for Intra-state POS 27
        totalCess: 0,
        totalTax: 180,
        roundOff: 0,
        grandTotal: 1180,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 1180,
        balanceAmount: 0,
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      };
      const check = validateSingleInvoice(mismatchedInvoice, '27', true);
      expect(check.isValid).toBe(false);
      expect(check.errors.some((e) => e.includes('Intra-state supply (POS 27) cannot charge IGST'))).toBe(true);
    });

    it('blocks item with invalid HSN/SAC code (e.g. 2 digits)', () => {
      const invalidHsnInvoice: Invoice = {
        id: 'INV-INVALID-3',
        invoiceNumber: 'INV-003',
        invoiceType: 'B2CS',
        date: '2026-10-10',
        partyName: 'Local Customer',
        partyAddress: 'Mumbai',
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        isIntraState: true,
        items: [
          {
            itemId: 'ITM-BAD',
            name: 'Faulty Code Product',
            hsnSacCode: '85', // Invalid 2-digit code
            unit: 'NOS',
            quantity: 1,
            unitPrice: 100,
            taxableAmount: 100,
            gstRate: 18,
            cgstAmount: 9,
            sgstAmount: 9,
            igstAmount: 0,
            cessAmount: 0,
            totalAmount: 118,
          },
        ],
        totalGrossAmount: 100,
        totalDiscount: 0,
        totalTaxableAmount: 100,
        totalCgst: 9,
        totalSgst: 9,
        totalIgst: 0,
        totalCess: 0,
        totalTax: 18,
        roundOff: 0,
        grandTotal: 118,
        amountInWords: '',
        paymentMode: 'CASH',
        paymentStatus: 'PAID',
        paidAmount: 118,
        balanceAmount: 0,
        createdAt: '2026-10-10',
        updatedAt: '2026-10-10',
      };
      const check = validateSingleInvoice(invalidHsnInvoice, '27', true);
      expect(check.isValid).toBe(false);
      expect(check.errors.some((e) => e.includes('invalid HSN/SAC code "85"'))).toBe(true);
    });
  });

  describe('R5: Financial Year Tracking', () => {
    it('computes correct Indian Financial Year (YYYY-YY)', () => {
      expect(getFinancialYear('2026-04-01')).toBe('2026-27');
      expect(getFinancialYear('2026-10-10')).toBe('2026-27');
      expect(getFinancialYear('2027-03-31')).toBe('2026-27');
      expect(getFinancialYear('2026-03-31')).toBe('2025-26');
      expect(getFinancialYear('2026-01-15')).toBe('2025-26');
    });
  });
});

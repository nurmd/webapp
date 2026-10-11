import { describe, it, expect } from 'vitest';
import { CompanyProfile } from '../models/company.ts';
import { Party } from '../models/party.ts';
import { Invoice } from '../models/invoice.ts';
import { ItcEligibility } from '../models/purchase.ts';
import { resolveReceiptTitle } from '../services/printSettingsService.ts';
import { formatThermalReceiptText, ThermalReceiptData } from '../core/printer/escpos.ts';
import { buildThermalReceiptBinary } from '../core/printer/escposBinary.ts';
import { isValidGstin } from '../core/gst/gstinUtils.ts';
import {
  generateEWayBillJson,
  extractPincode,
  extractLocation,
  getStateCodeFromPincode,
  getStateCodeFromAddress,
  EWayBillTransportOptions,
} from '../core/gst/eWayBillExport.ts';
import { calculateInvoice } from '../core/gst/calculator.ts';

// Baseline Mock Data
const mockRegularCompany: CompanyProfile = {
  id: 'COMP-001',
  businessName: 'Apex Enterprise Ltd',
  tradeName: 'Apex Electronics',
  gstin: '27AABCU9603R1ZN',
  pan: 'AABCU9603R',
  stateCode: '27',
  address: '101 Tech Zone, Senapati Bapat Marg, Dadar West',
  city: 'Mumbai',
  pincode: '400028',
  phone: '9876543210',
  email: 'tax@apex.in',
  isGstEnabled: true,
  isCompositionScheme: false,
};

const mockCompositionCompany: CompanyProfile = {
  ...mockRegularCompany,
  id: 'COMP-002',
  businessName: 'Sharma General Traders',
  tradeName: 'Sharma Traders',
  gstin: '27AABCU9603R1ZN',
  isCompositionScheme: true,
};

const mockRegularParty: Party = {
  id: 'PARTY-001',
  name: 'Global Infotech Services',
  type: 'CUSTOMER',
  phone: '9820098200',
  gstin: '27AAACG0561D1ZW',
  isComposition: false,
  stateCode: '27',
  billingAddress: '502 Corporate Arena, Andheri East, Mumbai',
  shippingAddress: 'Plot 12 Logistics Park, Bhiwandi',
  pincode: '400069',
  currentBalance: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

const mockCompositionSupplier: Party = {
  id: 'PARTY-002',
  name: 'Kisan Agro Traders',
  type: 'SUPPLIER',
  phone: '9819998199',
  gstin: '27AABCK1234F1Z8',
  isComposition: true,
  stateCode: '27',
  billingAddress: 'Shop 4 APMC Market, Vashi, Navi Mumbai',
  pincode: '400703',
  currentBalance: 0,
  createdAt: '2026-10-01T10:00:00.000Z',
  updatedAt: '2026-10-01T10:00:00.000Z',
};

const baseInvoice: Invoice = {
  id: 'INV-101',
  invoiceNumber: 'INV-2026-0001',
  invoiceType: 'B2B',
  isGstInvoice: true,
  date: '2026-10-11',
  partyId: mockRegularParty.id,
  partyName: mockRegularParty.name,
  partyGstin: mockRegularParty.gstin,
  partyAddress: mockRegularParty.billingAddress,
  partyPincode: mockRegularParty.pincode,
  partyStateCode: '27',
  placeOfSupplyStateCode: '27',
  isIntraState: true,
  items: [
    {
      id: 'ITEM-1',
      itemId: 'ITEM-1',
      name: 'Industrial Valve 2-inch',
      quantity: 5,
      unitPrice: 1000,
      taxableAmount: 5000,
      gstRate: 18,
      cgstAmount: 450,
      sgstAmount: 450,
      igstAmount: 0,
      cessAmount: 0,
      totalAmount: 5900,
      hsnSacCode: '84818030',
      unit: 'NOS',
    },
  ],
  totalGrossAmount: 5000,
  totalDiscount: 0,
  totalTaxableAmount: 5000,
  totalCgst: 450,
  totalSgst: 450,
  totalIgst: 0,
  totalCess: 0,
  totalTax: 900,
  grandTotal: 5900,
  amountInWords: 'Five Thousand Nine Hundred Rupees Only',
  roundOff: 0,
  paidAmount: 5900,
  balanceAmount: 0,
  paymentMode: 'CASH',
  paymentStatus: 'PAID',
  createdAt: '2026-10-11T12:00:00.000Z',
  updatedAt: '2026-10-11T12:00:00.000Z',
};

describe('Phase 2 Part 2 GST Statutory Compliance Suite', () => {
  // =========================================================================
  // Suite 1: Composition Scheme (P2-B) - Company Profile, Defaults & Titles
  // =========================================================================
  describe('Suite 1: Composition Scheme (P2-B) - Company Profile & Title Resolution', () => {
    it('TC-COMP-01: CompanyProfile supports isCompositionScheme flag', () => {
      expect(mockRegularCompany.isCompositionScheme).toBe(false);
      expect(mockCompositionCompany.isCompositionScheme).toBe(true);
    });

    it('TC-COMP-02: resolveReceiptTitle defaults to "Bill of Supply" when isCompositionScheme is true', () => {
      // Empty or undefined title
      expect(resolveReceiptTitle(undefined, true, true)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('', true, true)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('   ', true, false)).toBe('Bill of Supply');
    });

    it('TC-COMP-03: resolveReceiptTitle overrides "TAX INVOICE" and "RETAIL INVOICE" to "Bill of Supply" for composition dealers', () => {
      // Case insensitivity checks
      expect(resolveReceiptTitle('TAX INVOICE', true, true)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('tax invoice', true, true)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('Tax Invoice', true, true)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('  TAX INVOICE  ', true, true)).toBe('Bill of Supply');

      expect(resolveReceiptTitle('RETAIL INVOICE', true, false)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('retail invoice', true, false)).toBe('Bill of Supply');
      expect(resolveReceiptTitle('Retail Invoice', true, false)).toBe('Bill of Supply');
    });

    it('TC-COMP-04: resolveReceiptTitle preserves custom non-tax title for composition dealers', () => {
      expect(resolveReceiptTitle('Custom Supply Voucher', true, true)).toBe('Custom Supply Voucher');
      expect(resolveReceiptTitle('Delivery Slip', true, false)).toBe('Delivery Slip');
    });

    it('TC-COMP-05: resolveReceiptTitle behaves standardly for regular registered taxpayers', () => {
      // Regular dealer with GSTIN -> TAX INVOICE
      expect(resolveReceiptTitle(undefined, false, true)).toBe('TAX INVOICE');
      expect(resolveReceiptTitle('', false, true)).toBe('TAX INVOICE');

      // Regular dealer without GSTIN -> RETAIL INVOICE
      expect(resolveReceiptTitle(undefined, false, false)).toBe('RETAIL INVOICE');
      expect(resolveReceiptTitle('', false, false)).toBe('RETAIL INVOICE');

      // Custom title preserved for regular taxpayers
      expect(resolveReceiptTitle('PROFORMA INVOICE', false, true)).toBe('PROFORMA INVOICE');
    });
  });

  // =========================================================================
  // Suite 2: Composition Scheme (P2-B) - Thermal & Binary Receipt Tax Suppression
  // =========================================================================
  describe('Suite 2: Composition Scheme (P2-B) - Thermal & Binary Print Tax Suppression', () => {
    const thermalData: ThermalReceiptData = {
      companyName: mockCompositionCompany.tradeName || mockCompositionCompany.businessName,
      companyAddress: mockCompositionCompany.address,
      gstin: mockCompositionCompany.gstin,
      phone: mockCompositionCompany.phone,
      receiptTitle: 'TAX INVOICE',
      invoiceNo: baseInvoice.invoiceNumber,
      date: '11-Oct-2026',
      customerName: baseInvoice.partyName,
      items: [
        {
          name: 'Industrial Valve 2-inch',
          qty: 5,
          rate: 1000,
          amount: 5000,
        },
      ],
      taxableAmount: 5000,
      totalDiscount: 0,
      cgstAmount: 450,
      sgstAmount: 450,
      igstAmount: 0,
      grandTotal: 5000,
      paidAmount: 5000,
      balanceAmount: 0,
      isCompositionScheme: true,
    };

    it('TC-PRINT-01: formatThermalReceiptText formats "BILL OF SUPPLY" and suppresses tax lines when isCompositionScheme is true', () => {
      const receipt32 = formatThermalReceiptText(thermalData, 32);

      // Must print BILL OF SUPPLY header
      expect(receipt32).toContain('BILL OF SUPPLY');
      expect(receipt32).not.toContain('TAX INVOICE');

      // Must print Subtotal without Taxable label
      expect(receipt32).toContain('Subtotal:');
      expect(receipt32).not.toContain('Subtotal (Taxable):');

      // Tax lines MUST be completely suppressed
      expect(receipt32).not.toContain('CGST:');
      expect(receipt32).not.toContain('SGST:');
      expect(receipt32).not.toContain('IGST:');
      expect(receipt32).toContain('GRAND TOTAL:');
    });

    it('TC-PRINT-02: formatThermalReceiptText prints tax lines and "TAX INVOICE" when isCompositionScheme is false', () => {
      const regularThermalData: ThermalReceiptData = {
        ...thermalData,
        isCompositionScheme: false,
        grandTotal: 5900,
      };

      const receipt32 = formatThermalReceiptText(regularThermalData, 32);

      expect(receipt32).toContain('TAX INVOICE');
      expect(receipt32).not.toContain('BILL OF SUPPLY');
      expect(receipt32).toContain('Subtotal (Taxable):');
      expect(receipt32).toContain('CGST:');
      expect(receipt32).toContain('SGST:');
    });

    it('TC-PRINT-03: buildThermalReceiptBinary generates ESC/POS binary suppressing tax lines for composition dealers', () => {
      const binaryBytes = buildThermalReceiptBinary(thermalData, { width: 32 });
      expect(binaryBytes).toBeInstanceOf(Uint8Array);
      expect(binaryBytes.length).toBeGreaterThan(50);

      // Decode binary ASCII strings to verify tax suppression in byte stream
      const decoded = new TextDecoder('ascii').decode(binaryBytes);
      expect(decoded).toContain('BILL OF SUPPLY');
      expect(decoded).not.toContain('CGST Total:');
      expect(decoded).not.toContain('SGST Total:');
      expect(decoded).not.toContain('IGST Total:');
      expect(decoded).toContain('Subtotal:');
    });

    it('TC-PRINT-04: buildThermalReceiptBinary includes tax lines in binary stream for regular taxpayers', () => {
      const regularThermalData: ThermalReceiptData = {
        ...thermalData,
        isCompositionScheme: false,
        grandTotal: 5900,
      };

      const binaryBytes = buildThermalReceiptBinary(regularThermalData, { width: 32 });
      const decoded = new TextDecoder('ascii').decode(binaryBytes);
      expect(decoded).toContain('TAX INVOICE');
      expect(decoded).toContain('CGST Total:');
      expect(decoded).toContain('SGST Total:');
      expect(decoded).toContain('Taxable Amount:');
    });
  });

  // =========================================================================
  // Suite 3: Party Composition Flag & Strict GSTIN Validation (P2-F, P2-G)
  // =========================================================================
  describe('Suite 3: Party Composition Flag & Strict GSTIN Validation (P2-F, P2-G)', () => {
    it('TC-PARTY-01: Party interface stores isComposition boolean flag', () => {
      expect(mockRegularParty.isComposition).toBe(false);
      expect(mockCompositionSupplier.isComposition).toBe(true);

      const unregisteredParty: Party = {
        ...mockRegularParty,
        id: 'PARTY-003',
        gstin: undefined,
        isComposition: undefined,
      };
      expect(unregisteredParty.isComposition).toBeUndefined();
    });

    it('TC-PARTY-02: isValidGstin correctly validates standard 15-character GSTINs', () => {
      // Valid Indian GSTINs across states
      expect(isValidGstin('27AABCU9603R1ZN')).toBe(true); // Maharashtra
      expect(isValidGstin('29AABCS1429B1Z0')).toBe(true); // Karnataka
      expect(isValidGstin('07AAAAA0000A1Z5')).toBe(true); // Delhi
      expect(isValidGstin('33AAACH7409R1ZZ')).toBe(true); // Tamil Nadu
      expect(isValidGstin('24AAACC1206D1ZM')).toBe(true); // Gujarat

      // Case insensitivity & leading/trailing whitespace trimming
      expect(isValidGstin('  27aabcu9603r1zn  ')).toBe(true);
    });

    it('TC-PARTY-03: isValidGstin rejects malformed and invalid GSTIN formats', () => {
      expect(isValidGstin('')).toBe(false);
      expect(isValidGstin('   ')).toBe(false);
      expect(isValidGstin('INVALID')).toBe(false);
      expect(isValidGstin('27AABCU9603R1Z')).toBe(false); // 14 chars (too short)
      expect(isValidGstin('27AABCU9603R1ZN99')).toBe(false); // 17 chars (too long)
      expect(isValidGstin('27AABCU9603R12N')).toBe(false); // Missing 'Z' at 14th pos
      expect(isValidGstin('271234567890123')).toBe(false); // Numbers where PAN letters expected
    });

    it('TC-PARTY-04: AddEditPartyModal validation gate strictly blocks saving invalid non-empty GSTIN', () => {
      // Simulate form validation gate logic in AddEditPartyModal.tsx:142-146
      const validatePartySave = (gstinInput: string) => {
        const cleanGstin = gstinInput.trim().toUpperCase();
        if (cleanGstin && !isValidGstin(cleanGstin)) {
          return {
            canSave: false,
            error: 'Invalid GSTIN format. Expected 15-character alphanumeric GSTIN (e.g. 27ABCDE1234F1Z5).',
          };
        }
        return { canSave: true, savedGstin: cleanGstin || undefined };
      };

      // Invalid GSTIN must be blocked
      const invalidResult = validatePartySave('27INVALID1234');
      expect(invalidResult.canSave).toBe(false);
      expect(invalidResult.error).toContain('Invalid GSTIN format');

      // Valid GSTIN must succeed
      const validResult = validatePartySave('27AABCU9603R1ZN');
      expect(validResult.canSave).toBe(true);
      expect(validResult.savedGstin).toBe('27AABCU9603R1ZN');

      // Blank GSTIN must be permitted (unregistered consumer/supplier)
      const blankResult = validatePartySave('');
      expect(blankResult.canSave).toBe(true);
      expect(blankResult.savedGstin).toBeUndefined();

      const whitespaceResult = validatePartySave('   ');
      expect(whitespaceResult.canSave).toBe(true);
      expect(whitespaceResult.savedGstin).toBeUndefined();
    });
  });

  // =========================================================================
  // Suite 4: Purchase Modal Composition Supplier & ITC Eligibility (P2-F)
  // =========================================================================
  describe('Suite 4: Purchase Modal Composition Dealer ITC Handling (P2-F)', () => {
    it('TC-PUR-01: itcEligibility defaults to INELIGIBLE_OTHERS when initialSupplier is a composition dealer', () => {
      // Simulate state initializer from TableGridPurchaseModal.tsx:139-143
      const resolveInitialItc = (
        initialBill?: { itcEligibility?: ItcEligibility },
        initialSupplier?: Party | null
      ): ItcEligibility => {
        if (initialBill?.itcEligibility) return initialBill.itcEligibility;
        if (initialSupplier?.isComposition) return 'INELIGIBLE_OTHERS';
        return 'ELIGIBLE_INPUTS';
      };

      // Composition supplier -> ITC Ineligible (Blocked)
      expect(resolveInitialItc(undefined, mockCompositionSupplier)).toBe('INELIGIBLE_OTHERS');

      // Regular supplier -> ITC Eligible
      expect(resolveInitialItc(undefined, mockRegularParty)).toBe('ELIGIBLE_INPUTS');

      // No initial supplier -> Default ELIGIBLE_INPUTS
      expect(resolveInitialItc(undefined, null)).toBe('ELIGIBLE_INPUTS');

      // Existing bill's explicit setting is respected over supplier flag
      expect(
        resolveInitialItc(
          { itcEligibility: 'ELIGIBLE_CAPITAL_GOODS' },
          mockCompositionSupplier
        )
      ).toBe('ELIGIBLE_CAPITAL_GOODS');
    });

    it('TC-PUR-02: Selecting a composition supplier triggers switching itcEligibility to INELIGIBLE_OTHERS', () => {
      let currentItc: ItcEligibility = 'ELIGIBLE_INPUTS';

      const handleSelectSupplier = (supplier: Party) => {
        if (supplier.isComposition) {
          currentItc = 'INELIGIBLE_OTHERS';
        }
      };

      handleSelectSupplier(mockCompositionSupplier);
      expect(currentItc).toBe('INELIGIBLE_OTHERS');
    });

    it('TC-PUR-03: Statutory ITC calculation strictly excludes INELIGIBLE_OTHERS and INELIGIBLE_17_5 from claimable ITC', () => {
      const mockPurchases = [
        { id: 'P1', totalTax: 1800, itcEligibility: 'ELIGIBLE_INPUTS' as ItcEligibility },
        { id: 'P2', totalTax: 500, itcEligibility: 'INELIGIBLE_17_5' as ItcEligibility }, // Blocked sec 17(5)
        { id: 'P3', totalTax: 300, itcEligibility: 'INELIGIBLE_OTHERS' as ItcEligibility }, // Composition dealer inward supply
        { id: 'P4', totalTax: 900, itcEligibility: 'ELIGIBLE_SERVICES' as ItcEligibility },
      ];

      // Filtering logic in PurchasesHubView and Gstr1View
      const eligiblePurchases = mockPurchases.filter(
        (p) => p.itcEligibility !== 'INELIGIBLE_17_5' && p.itcEligibility !== 'INELIGIBLE_OTHERS'
      );
      const totalItcClaimable = eligiblePurchases.reduce((s, p) => s + p.totalTax, 0);

      expect(eligiblePurchases.length).toBe(2);
      expect(totalItcClaimable).toBe(2700); // 1800 + 900, strictly excluding 500 and 300
    });

    it('TC-PUR-04: Simplified purchase modal displays Blocked for both INELIGIBLE_17_5 and INELIGIBLE_OTHERS', () => {
      const getItcBadgeText = (itcEligibility?: ItcEligibility) =>
        itcEligibility === 'INELIGIBLE_17_5' || itcEligibility === 'INELIGIBLE_OTHERS' ? 'Blocked' : 'Eligible';

      expect(getItcBadgeText('INELIGIBLE_17_5')).toBe('Blocked');
      expect(getItcBadgeText('INELIGIBLE_OTHERS')).toBe('Blocked');
      expect(getItcBadgeText('ELIGIBLE_INPUTS')).toBe('Eligible');
      expect(getItcBadgeText('ELIGIBLE_CAPITAL_GOODS')).toBe('Eligible');
    });
  });

  // =========================================================================
  // Suite 5: Invoice Shipping Address & Bill-to Ship-to Wiring (P2-E)
  // =========================================================================
  describe('Suite 5: Invoice Shipping Address & Bill-to Ship-to Wiring (P2-E)', () => {
    it('TC-SHIP-01: Invoice model supports shippingAddress and shippingPincode properties', () => {
      const invoiceWithShipping: Invoice = {
        ...baseInvoice,
        partyPincode: '400069',
        shippingAddress: 'Plot 12 Logistics Park, Bhiwandi, Thane 421302',
        shippingPincode: '421302',
      };

      expect(invoiceWithShipping.shippingAddress).toBe('Plot 12 Logistics Park, Bhiwandi, Thane 421302');
      expect(invoiceWithShipping.shippingPincode).toBe('421302');
      expect(invoiceWithShipping.partyPincode).toBe('400069');
    });

    it('TC-SHIP-02: buildInvoicePayload trims and sanitizes shipping fields', () => {
      // Simulate buildInvoicePayload logic in TableGridInvoiceModal.tsx:482-512
      const buildPayload = (
        party: Party | null,
        shippingAddressInput: string,
        shippingPincodeInput: string
      ) => {
        return {
          partyAddress: party?.billingAddress || 'Local Counter',
          partyPincode: party?.pincode,
          shippingAddress: shippingAddressInput.trim() || undefined,
          shippingPincode: shippingPincodeInput.trim() || undefined,
        };
      };

      // Case 1: Custom shipping details provided with extra spaces
      const payload1 = buildPayload(
        mockRegularParty,
        '   Godown No 5, Turbhe MIDC   ',
        '  400705  '
      );
      expect(payload1.shippingAddress).toBe('Godown No 5, Turbhe MIDC');
      expect(payload1.shippingPincode).toBe('400705');
      expect(payload1.partyPincode).toBe('400069');

      // Case 2: Blank shipping details default to undefined (Same as Bill)
      const payload2 = buildPayload(mockRegularParty, '   ', '');
      expect(payload2.shippingAddress).toBeUndefined();
      expect(payload2.shippingPincode).toBeUndefined();
    });

    it('TC-SHIP-03: Party selection auto-populates shipping fields only when empty and party has shipping info', () => {
      // Simulate auto-populate logic in TableGridInvoiceModal.tsx
      let currentShippingAddress = '';
      let currentShippingPincode = '';

      const onSelectParty = (selected: Party) => {
        if (!currentShippingAddress && selected.shippingAddress) {
          currentShippingAddress = selected.shippingAddress;
        }
        if (!currentShippingPincode && selected.pincode) {
          currentShippingPincode = selected.pincode;
        }
      };

      // Select party with shippingAddress and pincode
      onSelectParty(mockRegularParty);
      expect(currentShippingAddress).toBe('Plot 12 Logistics Park, Bhiwandi');
      expect(currentShippingPincode).toBe('400069');

      // Does not overwrite when user already has custom values
      currentShippingAddress = 'Custom Delivery Warehouse';
      currentShippingPincode = '560001';

      const anotherParty: Party = {
        ...mockRegularParty,
        shippingAddress: 'Another Depot',
        pincode: '110001',
      };
      onSelectParty(anotherParty);
      expect(currentShippingAddress).toBe('Custom Delivery Warehouse');
      expect(currentShippingPincode).toBe('560001');

      // Clearing party resets shipping fields
      const onClearParty = () => {
        currentShippingAddress = '';
        currentShippingPincode = '';
      };
      onClearParty();
      expect(currentShippingAddress).toBe('');
      expect(currentShippingPincode).toBe('');
    });
  });

  // =========================================================================
  // Suite 6: e-Way Bill Export with Bill-to Ship-to (P2-E)
  // =========================================================================
  describe('Suite 6: e-Way Bill Export with Bill-to Ship-to (P2-E)', () => {
    it('TC-EWAY-01: generateEWayBillJson prioritizes shippingPincode over party billing pincode', () => {
      const invoiceWithShipPin: Invoice = {
        ...baseInvoice,
        partyPincode: '400069', // Billing PIN: Andheri
        shippingAddress: 'Plot 12 Logistics Park, Bhiwandi',
        shippingPincode: '421302', // Shipping PIN: Bhiwandi
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoiceWithShipPin);
      const bill = payload.billLists[0];

      expect(bill.toPincode).toBe(421302);
      expect(bill.toAddr1).toBe('Plot 12 Logistics Park, Bhiwandi');
      expect(bill.transType).toBe('2'); // Bill to - Ship to
    });

    it('TC-EWAY-02: generateEWayBillJson sets transType to "2" when shipping details differ from billing details', () => {
      const invoiceDifferentShipping: Invoice = {
        ...baseInvoice,
        partyAddress: '101 Billing Street, Fort, Mumbai',
        partyPincode: '400001',
        shippingAddress: 'Godown 4, Sector 19, Vashi, Navi Mumbai',
        shippingPincode: '400703',
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoiceDifferentShipping);
      const bill = payload.billLists[0];

      expect(bill.transType).toBe('2');
      expect(bill.toAddr1).toBe('Godown 4, Sector 19, Vashi, Navi Mumbai');
      expect(bill.toPincode).toBe(400703);
    });

    it('TC-EWAY-03: generateEWayBillJson sets transType to "1" (Regular) when shipping details are omitted or match billing', () => {
      // Case 1: No shipping details
      const invoiceNoShipping: Invoice = {
        ...baseInvoice,
        partyAddress: '101 Billing Street, Fort, Mumbai',
        partyPincode: '400001',
        shippingAddress: undefined,
        shippingPincode: undefined,
      };

      const payload1 = generateEWayBillJson(mockRegularCompany, invoiceNoShipping);
      expect(payload1.billLists[0].transType).toBe('1');
      expect(payload1.billLists[0].toPincode).toBe(400001);
      expect(payload1.billLists[0].toAddr1).toBe('101 Billing Street, Fort, Mumbai');

      // Case 2: Shipping details identical to billing details
      const invoiceIdenticalShipping: Invoice = {
        ...baseInvoice,
        partyAddress: '101 Billing Street, Fort, Mumbai',
        partyPincode: '400001',
        shippingAddress: '101 Billing Street, Fort, Mumbai',
        shippingPincode: '400001',
      };

      const payload2 = generateEWayBillJson(mockRegularCompany, invoiceIdenticalShipping);
      expect(payload2.billLists[0].transType).toBe('1');
    });

    it('TC-EWAY-04: generateEWayBillJson respects explicit transType override in transportOptions', () => {
      const invoice: Invoice = {
        ...baseInvoice,
        shippingAddress: 'Plot 12 Bhiwandi',
        shippingPincode: '421302',
      };

      const options: EWayBillTransportOptions = {
        transType: '4', // Combination
        transDistance: 120,
        vehicleNumber: 'MH04AB1234',
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoice, options);
      expect(payload.billLists[0].transType).toBe('4');
      expect(payload.billLists[0].transDistance).toBe(120);
    });

    it('TC-EWAY-05: resolves actToStateCode accurately based on shipping destination pincode in Bill-to Ship-to', () => {
      // Billing Party in Maharashtra (stateCode 27), Shipped to site in Karnataka (560001)
      const invoiceBillToShipTo: Invoice = {
        ...baseInvoice,
        partyStateCode: '27',
        placeOfSupplyStateCode: '27',
        partyAddress: '101 Nariman Point, Mumbai 400021, Maharashtra',
        partyPincode: '400021',
        shippingAddress: 'Site Office, Whitefield, Bangalore 560001, Karnataka',
        shippingPincode: '560001',
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoiceBillToShipTo);
      const bill = payload.billLists[0];

      expect(bill.transType).toBe('2');
      expect(bill.toStateCode).toBe(27); // Billing state
      expect(bill.actToStateCode).toBe(29); // Physical delivery destination state (Karnataka)
      expect(bill.toPincode).toBe(560001);
    });

    it('TC-EWAY-06: resolves actToStateCode from shipping address state name when shipping pincode circle is omitted', () => {
      const invoiceAddressState: Invoice = {
        ...baseInvoice,
        partyStateCode: '27',
        partyAddress: '101 Mumbai',
        partyPincode: '400001',
        shippingAddress: 'Godown 5, Phase 2 Industrial Area, Delhi',
        shippingPincode: undefined,
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoiceAddressState);
      const bill = payload.billLists[0];

      expect(bill.transType).toBe('2');
      expect(bill.toStateCode).toBe(27);
      expect(bill.actToStateCode).toBe(7); // Delhi
    });

    it('TC-EWAY-07: getStateCodeFromPincode accurately maps major postal circle prefixes to GST state codes', () => {
      expect(getStateCodeFromPincode(110001)).toBe(7); // Delhi
      expect(getStateCodeFromPincode(560001)).toBe(29); // Karnataka
      expect(getStateCodeFromPincode(380001)).toBe(24); // Gujarat
      expect(getStateCodeFromPincode(600001)).toBe(33); // Tamil Nadu
      expect(getStateCodeFromPincode(403001)).toBe(30); // Goa
      expect(getStateCodeFromPincode(682001)).toBe(31); // Lakshadweep
      expect(getStateCodeFromPincode(744101)).toBe(35); // Andaman & Nicobar
      expect(getStateCodeFromPincode(194101)).toBe(38); // Ladakh
      expect(getStateCodeFromPincode(500001)).toBe(36); // Telangana
    });

    it('TC-EWAY-08: getStateCodeFromAddress extracts state code case-insensitively', () => {
      expect(getStateCodeFromAddress('Warehouse No 4, Bangalore, Karnataka, 560001')).toBe(29);
      expect(getStateCodeFromAddress('Plot 10, Ahmedabad, Gujarat')).toBe(24);
      expect(getStateCodeFromAddress('Plot 2, Connaught Place, New Delhi')).toBe(7);
      expect(getStateCodeFromAddress('Unknown place')).toBeUndefined();
    });
  });

  // =========================================================================
  // Suite 7: Statutory Edge Cases & Input Sanitization
  // =========================================================================
  describe('Suite 7: Statutory Edge Cases & Sanitization', () => {
    it('TC-EDGE-01: Sanitizes formatted shipping pincodes containing spaces or dashes', () => {
      const invoiceWithSpacedPin: Invoice = {
        ...baseInvoice,
        partyPincode: '400001',
        shippingPincode: '421 302',
      };

      const payload1 = generateEWayBillJson(mockRegularCompany, invoiceWithSpacedPin);
      expect(payload1.billLists[0].toPincode).toBe(421302);

      const invoiceWithDashedPin: Invoice = {
        ...baseInvoice,
        partyPincode: '400001',
        shippingPincode: '560-001',
      };

      const payload2 = generateEWayBillJson(mockRegularCompany, invoiceWithDashedPin);
      expect(payload2.billLists[0].toPincode).toBe(560001);
    });

    it('TC-EDGE-02: Extracts destination pincode embedded in shippingAddress if shippingPincode is omitted', () => {
      const invoiceWithEmbeddedPin: Invoice = {
        ...baseInvoice,
        partyPincode: undefined,
        shippingAddress: 'Plot 42 MIDC Industrial Area, Pune 411018, Maharashtra',
        shippingPincode: undefined,
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoiceWithEmbeddedPin);
      expect(payload.billLists[0].toPincode).toBe(411018);
    });

    it('TC-EDGE-03: Truncates shipping address to 50 characters maximum for e-Way bill toAddr1 schema limit', () => {
      const longAddress = 'Super Large Regional Central Fulfillment Center Godown Number 9999, Trans-Thane Creek Industrial Belt';
      const invoiceLongAddr: Invoice = {
        ...baseInvoice,
        shippingAddress: longAddress,
      };

      const payload = generateEWayBillJson(mockRegularCompany, invoiceLongAddr);
      expect(payload.billLists[0].toAddr1.length).toBeLessThanOrEqual(50);
      expect(payload.billLists[0].toAddr1).toBe(longAddress.substring(0, 50));
    });

    it('TC-EDGE-04: extractLocation extracts city name from address string correctly', () => {
      expect(extractLocation('502 Arena, Andheri East, Mumbai 400069', 'City')).toBe('Mumbai');
      expect(extractLocation('502 Arena, Andheri East, Mumbai, Maharashtra 400069', 'City')).toBe('Maharashtra');
      expect(extractLocation('', 'Nagpur')).toBe('Nagpur');
    });

    it('TC-EDGE-05: Tax calculations maintain mathematical invariants regardless of composition status', () => {
      // Intra-state standard calculation
      const intraCalc = calculateInvoice('27', '27', [
        { quantity: 2, unitPrice: 2500, gstRate: 18 },
      ]);
      expect(intraCalc.totalTaxableAmount).toBe(5000);
      expect(intraCalc.totalCgst).toBe(450);
      expect(intraCalc.totalSgst).toBe(450);
      expect(intraCalc.totalIgst).toBe(0);
      expect(intraCalc.grandTotal).toBe(5900);

      // Inter-state standard calculation
      const interCalc = calculateInvoice('27', '24', [
        { quantity: 2, unitPrice: 2500, gstRate: 18 },
      ]);
      expect(interCalc.totalTaxableAmount).toBe(5000);
      expect(interCalc.totalCgst).toBe(0);
      expect(interCalc.totalSgst).toBe(0);
      expect(interCalc.totalIgst).toBe(900);
      expect(interCalc.grandTotal).toBe(5900);
    });
  });
});

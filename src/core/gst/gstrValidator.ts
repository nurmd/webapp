/**
 * src/core/gst/gstrValidator.ts
 *
 * Pre-Filing Validation Engine & Anomaly Detection for GSTR Compliance.
 * Audits sales invoices, credit/debit notes, and purchase bills for a target
 * tax period (MMYYYY) before government return JSON export.
 *
 * Enforces:
 * - Luhn Modulo 36 checksum verification for taxpayer & counterparty GSTINs
 * - Mandatory recipient GSTIN on B2B supplies
 * - Place of Supply (POS) consistency vs recipient registration state
 * - Statutory tax bifurcation (Intra-state CGST+SGST vs Inter-state IGST vs Exports)
 * - Mandatory HSN/SAC digit rules (4, 6, 8 for goods; 6 starting with 99 for services)
 * - Table 12 HSN summary mathematical reconciliation (within ₹1.00 statutory tolerance)
 * - Export blocker invariant (canExport = false if any severity === 'ERROR')
 */

import type { Invoice, InvoiceItemEntry, InvoiceType } from '../../models/invoice.ts';
import type { PurchaseBill, PurchaseItemEntry } from '../../models/purchase.ts';
import { validateGstin, calculateGstinChecksum, type GstinValidationResult } from './validator.ts';
import { getStateByCode } from './stateCodes.ts';

// Re-export core GSTIN utilities for unified validator module access
export { validateGstin, calculateGstinChecksum };

/**
 * Standardized Validation Severity enumeration
 */
export type ValidationSeverity = 'ERROR' | 'WARNING';

/**
 * Standardized Validation Error Code enumeration
 */
export type ValidationErrorCode =
  | 'INVALID_GSTIN_CHECKSUM'
  | 'MISSING_CUSTOMER_GSTIN'
  | 'POS_STATE_MISMATCH'
  | 'TAX_BIFURCATION_ERROR'
  | 'INVALID_HSN_CODE'
  | 'HSN_RECONCILIATION_MISMATCH';

/**
 * Diagnostic anomaly record representing a compliance error or warning
 */
export interface ValidationError {
  id: string;                                // Unique identifier, e.g. "ERR_GSTIN_INV-001"
  documentType: 'INVOICE' | 'PURCHASE' | 'NOTE';
  documentNumber: string;                    // Invoice number, bill number, or note number
  documentDate: string;                      // Document issue date (YYYY-MM-DD or ISO)
  severity: ValidationSeverity;             // ERROR blocks export; WARNING is advisory
  code: ValidationErrorCode;
  message: string;                           // Detailed human-readable diagnostic message
  remediation: string;                       // Concrete, actionable steps to fix the anomaly
}

/**
 * Summary result produced by the validation engine
 */
export interface ValidationSummary {
  isValid: boolean;                          // true if 0 errors and 0 warnings
  canExport: boolean;                        // false if any error has severity === 'ERROR'
  totalErrors: number;                       // Count of severity === 'ERROR'
  totalWarnings: number;                     // Count of severity === 'WARNING'
  errors: ValidationError[];                 // Complete list of validation issues
}

/**
 * Return Period Boundary definition
 */
export interface PeriodBounds {
  month: string;                             // Two-digit month "01" to "12"
  year: string;                              // Four-digit year "2026"
  isValid: boolean;
  startDate: string;                         // "YYYY-MM-01"
  endDate: string;                           // "YYYY-MM-LD"
}

/**
 * HSN Code inspection result
 */
export interface HsnValidationResult {
  isValid: boolean;
  type: 'GOODS' | 'SERVICES' | 'INVALID';
  code: string;
  error?: string;
}

/**
 * Checks whether a GSTIN has a mathematically valid Luhn Mod 36 checksum.
 */
export function isValidGstinChecksum(gstin: string): boolean {
  if (!gstin || typeof gstin !== 'string') return false;
  return validateGstin(gstin).isValid;
}

/**
 * Validates HSN or SAC code against statutory digit length rules.
 * - Goods: 4, 6, or 8 numeric digits
 * - Services: 6 numeric digits starting with "99"
 *
 * @param code - The HSN/SAC code string to test
 * @returns boolean indicating validity
 */
export function validateHsnSac(code: string | undefined): boolean {
  if (!code || typeof code !== 'string') return false;
  const clean = code.trim();
  if (!/^\d+$/.test(clean)) return false;
  if (clean.startsWith('99')) {
    return clean.length === 6;
  }
  return clean.length === 4 || clean.length === 6 || clean.length === 8;
}

/**
 * Detailed HSN code validation returning type classification and diagnostic reason.
 */
export function validateHsnCode(code: string | undefined): HsnValidationResult {
  if (!code || typeof code !== 'string' || code.trim() === '') {
    return { isValid: false, type: 'INVALID', code: '', error: 'HSN/SAC code is missing' };
  }
  const clean = code.trim();
  if (!/^\d+$/.test(clean)) {
    return { isValid: false, type: 'INVALID', code: clean, error: 'HSN/SAC code must contain numeric digits only' };
  }
  if (clean.startsWith('99')) {
    if (clean.length === 6) {
      return { isValid: true, type: 'SERVICES', code: clean };
    }
    return {
      isValid: false,
      type: 'SERVICES',
      code: clean,
      error: `Service SAC code must be exactly 6 digits (received ${clean.length} digits: ${clean})`,
    };
  }
  if (clean.length === 4 || clean.length === 6 || clean.length === 8) {
    return { isValid: true, type: 'GOODS', code: clean };
  }
  return {
    isValid: false,
    type: 'GOODS',
    code: clean,
    error: `Goods HSN code must be 4, 6, or 8 digits (received ${clean.length} digits: ${clean})`,
  };
}

/**
 * Extracts year and two-digit month from a variety of document date formats.
 * Supports: YYYY-MM-DD, ISO timestamps, DD-MM-YYYY, and DD/MM/YYYY.
 */
export function parseDocumentDate(dateStr: string): { year: string; month: string } | null {
  if (!dateStr || typeof dateStr !== 'string') return null;
  const clean = dateStr.trim();
  if (clean.length === 0) return null;

  // Match ISO / YYYY-MM-DD (e.g. "2026-10-15" or "2026-10-15T12:00:00.000Z")
  if (/^\d{4}-\d{2}/.test(clean)) {
    const parts = clean.split('T')[0].split('-');
    if (parts.length >= 2) {
      return { year: parts[0], month: parts[1].padStart(2, '0') };
    }
  }

  // Match DD-MM-YYYY or DD/MM/YYYY (e.g. "15-10-2026" or "15/10/2026")
  if (/^\d{2}[-/]\d{2}[-/]\d{4}/.test(clean)) {
    const parts = clean.split(/[-/]/);
    if (parts.length >= 3) {
      return { year: parts[2], month: parts[1].padStart(2, '0') };
    }
  }

  // Fallback: JavaScript Date parser
  const d = new Date(clean);
  if (!isNaN(d.getTime())) {
    return {
      year: String(d.getFullYear()),
      month: String(d.getMonth() + 1).padStart(2, '0'),
    };
  }

  return null;
}

/**
 * Determines whether a transaction date falls into the return period MMYYYY.
 */
export function isDocumentInPeriod(dateStr: string, periodMMYYYY: string): boolean {
  if (!dateStr || !periodMMYYYY || periodMMYYYY.length !== 6) return false;
  const targetMonth = periodMMYYYY.substring(0, 2);
  const targetYear = periodMMYYYY.substring(2, 6);
  const parsed = parseDocumentDate(dateStr);
  if (!parsed) return false;
  return parsed.year === targetYear && parsed.month === targetMonth;
}

/**
 * Parses and verifies return period in MMYYYY format (e.g. "102026").
 */
export function parseReturnPeriod(period: string): PeriodBounds {
  if (!period || typeof period !== 'string' || period.length !== 6 || !/^(0[1-9]|1[0-2])\d{4}$/.test(period)) {
    return {
      month: '',
      year: '',
      isValid: false,
      startDate: '',
      endDate: '',
    };
  }
  const month = period.substring(0, 2);
  const year = period.substring(2, 6);
  const mNum = parseInt(month, 10);
  const yNum = parseInt(year, 10);
  const lastDay = new Date(yNum, mNum, 0).getDate();
  return {
    month,
    year,
    isValid: true,
    startDate: `${year}-${month}-01`,
    endDate: `${year}-${month}-${String(lastDay).padStart(2, '0')}`,
  };
}

/**
 * Validates consistency between Place of Supply (POS) and recipient GSTIN.
 * For registered counterparties, recipient GSTIN prefix (first 2 digits) must match POS state code.
 */
export function validatePlaceOfSupply(
  posStateCode: string,
  recipientGstin?: string,
  isExport?: boolean
): { isValid: boolean; severity?: ValidationSeverity; error?: string } {
  if (isExport) {
    if (posStateCode === '96' || getStateByCode(posStateCode)) {
      return { isValid: true };
    }
    return { isValid: false, severity: 'ERROR', error: `Invalid export Place of Supply: '${posStateCode}'` };
  }

  if (!posStateCode || (!getStateByCode(posStateCode) && posStateCode !== '96')) {
    return { isValid: false, severity: 'ERROR', error: `Place of Supply '${posStateCode}' is not a recognized GST state code` };
  }

  if (recipientGstin && recipientGstin.trim().length >= 2) {
    const gstinState = recipientGstin.trim().substring(0, 2);
    if (gstinState !== posStateCode.padStart(2, '0')) {
      return {
        isValid: false,
        severity: 'WARNING',
        error: `POS state (${posStateCode}) differs from recipient state (${gstinState})`,
      };
    }
  }

  return { isValid: true };
}

/**
 * Validates statutory tax bifurcation (Intra-state CGST+SGST vs Inter-state IGST vs Exports).
 */
export function validateTaxBifurcation(
  companyStateCode: string,
  posStateCode: string,
  taxableAmount: number,
  cgstAmount: number,
  sgstAmount: number,
  igstAmount: number,
  isExport?: boolean,
  exportType?: 'WPAY' | 'WOPAY'
): { isValid: boolean; error?: string } {
  // Nil-rated or zero taxable supplies with 0 taxes are always valid
  if (taxableAmount <= 0 && cgstAmount === 0 && sgstAmount === 0 && igstAmount === 0) {
    return { isValid: true };
  }

  if (isExport) {
    if (exportType === 'WOPAY') {
      if (cgstAmount > 0 || sgstAmount > 0 || igstAmount > 0) {
        return { isValid: false, error: 'Export without payment of tax (WOPAY) must have 0 tax charges' };
      }
      return { isValid: true };
    }
    if (cgstAmount > 0 || sgstAmount > 0) {
      return { isValid: false, error: 'Export invoice cannot contain local CGST or SGST' };
    }
    return { isValid: true };
  }

  const isIntra = (posStateCode || companyStateCode) === companyStateCode;
  if (isIntra) {
    if (igstAmount > 0) {
      return { isValid: false, error: 'Intra-state supply cannot contain Integrated Tax (IGST)' };
    }
    if (Math.abs(cgstAmount - sgstAmount) > 0.05) {
      return { isValid: false, error: 'Intra-state supply CGST and SGST amounts must be equal' };
    }
    return { isValid: true };
  } else {
    if (cgstAmount > 0 || sgstAmount > 0) {
      return { isValid: false, error: 'Inter-state supply cannot contain Central Tax (CGST) or State Tax (SGST)' };
    }
    return { isValid: true };
  }
}

/**
 * Reconciles line-item HSN summary totals with outward invoice totals.
 * Enforces ₹1.00 statutory tolerance per GSTN rules.
 */
export function reconcileHsnSummary(invoices: Invoice[]): {
  isBalanced: boolean;
  diffTaxable: number;
  diffTax: number;
  hsnTaxable: number;
  outwardTaxable: number;
  hsnTax: number;
  outwardTax: number;
} {
  let outwardTaxable = 0;
  let outwardTax = 0;
  let hsnTaxable = 0;
  let hsnTax = 0;

  for (const inv of invoices) {
    if (inv.isCancelled) continue;
    if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'DELIVERY_CHALLAN') continue;

    const factor = inv.invoiceType === 'CREDIT_NOTE' ? -1 : 1;

    outwardTaxable += factor * (inv.totalTaxableAmount || 0);
    const docTax =
      inv.totalTax !== undefined && inv.totalTax > 0
        ? inv.totalTax
        : (inv.totalCgst || 0) + (inv.totalSgst || 0) + (inv.totalIgst || 0) + (inv.totalCess || 0);
    outwardTax += factor * docTax;

    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        hsnTaxable += factor * (item.taxableAmount || 0);
        const itmTax =
          (item.cgstAmount || 0) + (item.sgstAmount || 0) + (item.igstAmount || 0) + (item.cessAmount || 0);
        hsnTax += factor * itmTax;
      }
    }
  }

  const roundedOutwardTaxable = Math.round(outwardTaxable * 100) / 100;
  const roundedOutwardTax = Math.round(outwardTax * 100) / 100;
  const roundedHsnTaxable = Math.round(hsnTaxable * 100) / 100;
  const roundedHsnTax = Math.round(hsnTax * 100) / 100;

  const diffTaxable = Math.round(Math.abs(roundedHsnTaxable - roundedOutwardTaxable) * 100) / 100;
  const diffTax = Math.round(Math.abs(roundedHsnTax - roundedOutwardTax) * 100) / 100;

  return {
    isBalanced: diffTaxable <= 1.00 && diffTax <= 1.00,
    diffTaxable,
    diffTax,
    hsnTaxable: roundedHsnTaxable,
    outwardTaxable: roundedOutwardTaxable,
    hsnTax: roundedHsnTax,
    outwardTax: roundedOutwardTax,
  };
}

/**
 * Master validation entry point auditing all transactions for a specified tax period.
 *
 * @param companyGstin - Taxpayer's registered GSTIN (15 characters)
 * @param companyStateCode - Taxpayer's home state code (2 digits, e.g. "27")
 * @param invoices - All outward invoices and notes from local store
 * @param purchases - All inward purchase bills from local store
 * @param period - Target return period in "MMYYYY" format (e.g. "102026")
 * @returns Complete ValidationSummary with canExport blocker and diagnostics
 */
export function validateGstrPeriodData(
  companyGstin: string,
  companyStateCode: string,
  invoices: Invoice[],
  purchases: PurchaseBill[],
  period: string
): ValidationSummary {
  const errors: ValidationError[] = [];

  // Filter invoices & purchases to active filing period
  const periodInvoices = invoices.filter((inv) => isDocumentInPeriod(inv.date, period));
  const periodPurchases = purchases.filter((p) => isDocumentInPeriod(p.date, period));

  // 1. Audit Filing Company GSTIN
  if (companyGstin && companyGstin.trim() !== '') {
    const compGstinRes = validateGstin(companyGstin);
    if (!compGstinRes.isValid) {
      errors.push({
        id: 'ERR_COMPANY_GSTIN',
        documentType: 'INVOICE',
        documentNumber: 'COMPANY_PROFILE',
        documentDate: new Date().toISOString().split('T')[0],
        severity: 'ERROR',
        code: 'INVALID_GSTIN_CHECKSUM',
        message: `Filing company GSTIN '${companyGstin}' fails checksum validation: ${compGstinRes.error || 'Invalid checksum'}.`,
        remediation: 'Correct company GSTIN in Settings before generating statutory GSTR files.',
      });
    }
  }

  // 2. Audit Outward Invoices and Notes
  for (const inv of periodInvoices) {
    // Skip cancelled invoices during pre-filing tax audit (handled in Table 13 count)
    if (inv.isCancelled) continue;

    // Skip non-tax quotations and delivery challans
    if (inv.invoiceType === 'ESTIMATE' || inv.invoiceType === 'DELIVERY_CHALLAN') continue;

    const docType: 'INVOICE' | 'NOTE' =
      inv.invoiceType === 'CREDIT_NOTE' || inv.invoiceType === 'DEBIT_NOTE' ? 'NOTE' : 'INVOICE';
    const docNum = inv.invoiceNumber || 'INV';
    const docDate = inv.date || '';

    // Check 2.1: Recipient GSTIN on B2B documents
    if (inv.invoiceType === 'B2B') {
      if (!inv.partyGstin || inv.partyGstin.trim() === '') {
        errors.push({
          id: `ERR_GSTIN_MISSING_${inv.id || docNum}`,
          documentType: docType,
          documentNumber: docNum,
          documentDate: docDate,
          severity: 'ERROR',
          code: 'MISSING_CUSTOMER_GSTIN',
          message: `B2B invoice ${docNum} requires recipient GSTIN`,
          remediation: 'Provide valid 15-digit GSTIN for customer, or convert to B2CS/B2CL if unregistered.',
        });
      } else {
        const valRes = validateGstin(inv.partyGstin);
        if (!valRes.isValid) {
          errors.push({
            id: `ERR_GSTIN_CHK_${inv.id || docNum}`,
            documentType: docType,
            documentNumber: docNum,
            documentDate: docDate,
            severity: 'ERROR',
            code: 'INVALID_GSTIN_CHECKSUM',
            message: `Invalid GSTIN ${inv.partyGstin}: ${valRes.error || 'Checksum mismatch'}`,
            remediation: 'Correct customer GSTIN checksum character on the official GST portal.',
          });
        } else {
          // Check POS vs Recipient GSTIN State Prefix (Bill-to / Ship-to Advisory Warning)
          const expectedState = inv.partyGstin.trim().substring(0, 2);
          const pos = inv.placeOfSupplyStateCode;
          if (pos && pos !== expectedState) {
            errors.push({
              id: `WARN_POS_MISMATCH_${inv.id || docNum}`,
              documentType: docType,
              documentNumber: docNum,
              documentDate: docDate,
              severity: 'WARNING',
              code: 'POS_STATE_MISMATCH',
              message: `POS state ${pos} differs from recipient state ${expectedState}`,
              remediation: 'Confirm if transaction is Bill-to / Ship-to supply',
            });
          }
        }
      }
    } else if (
      (inv.invoiceType === 'CREDIT_NOTE' || inv.invoiceType === 'DEBIT_NOTE') &&
      inv.partyGstin &&
      inv.partyGstin.trim() !== ''
    ) {
      // Registered Note Checksum
      const valRes = validateGstin(inv.partyGstin);
      if (!valRes.isValid) {
        errors.push({
          id: `ERR_GSTIN_NOTE_${inv.id || docNum}`,
          documentType: docType,
          documentNumber: docNum,
          documentDate: docDate,
          severity: 'ERROR',
          code: 'INVALID_GSTIN_CHECKSUM',
          message: `Counterparty GSTIN '${inv.partyGstin}' on ${docType} ${docNum} fails checksum validation.`,
          remediation: 'Correct counterparty GSTIN checksum character.',
        });
      }
    }

    // Check 2.2: Place of Supply State Validity
    const isExport = inv.invoiceType === 'EXPORT';
    const pos = inv.placeOfSupplyStateCode || companyStateCode;

    if (isExport) {
      if (pos !== '96' && !getStateByCode(pos)) {
        errors.push({
          id: `ERR_POS_EXPORT_${inv.id || docNum}`,
          documentType: docType,
          documentNumber: docNum,
          documentDate: docDate,
          severity: 'ERROR',
          code: 'POS_STATE_MISMATCH',
          message: `Invalid Place of Supply '${pos}' on export invoice ${docNum}.`,
          remediation: "Use '96' (Other Countries) or a valid Indian state code for exports.",
        });
      }
    } else {
      if (inv.placeOfSupplyStateCode && !getStateByCode(inv.placeOfSupplyStateCode) && inv.placeOfSupplyStateCode !== '96') {
        errors.push({
          id: `ERR_POS_INVALID_${inv.id || docNum}`,
          documentType: docType,
          documentNumber: docNum,
          documentDate: docDate,
          severity: 'ERROR',
          code: 'POS_STATE_MISMATCH',
          message: `Place of Supply '${inv.placeOfSupplyStateCode}' is not a recognized state code.`,
          remediation: 'Select a valid 2-digit Indian State/UT code for Place of Supply.',
        });
      }
    }

    // Check 2.3: Statutory Tax Bifurcation
    if (isExport) {
      if ((inv.totalCgst || 0) > 0 || (inv.totalSgst || 0) > 0) {
        errors.push({
          id: `ERR_TAX_BIF_${inv.id || docNum}`,
          documentType: docType,
          documentNumber: docNum,
          documentDate: docDate,
          severity: 'ERROR',
          code: 'TAX_BIFURCATION_ERROR',
          message: `Export invoice ${docNum} cannot have CGST or SGST`,
          remediation: 'Charge Integrated Tax (IGST) instead of CGST+SGST on export supplies.',
        });
      }
      if (inv.exportType === 'WOPAY' && ((inv.totalIgst || 0) > 0 || (inv.totalCgst || 0) > 0 || (inv.totalSgst || 0) > 0)) {
        errors.push({
          id: `ERR_TAX_BIF_WOPAY_${inv.id || docNum}`,
          documentType: docType,
          documentNumber: docNum,
          documentDate: docDate,
          severity: 'ERROR',
          code: 'TAX_BIFURCATION_ERROR',
          message: `Export without payment of tax (WOPAY) on invoice ${docNum} must have zero tax liability.`,
          remediation: 'Set IGST, CGST, and SGST to 0 for WOPAY exports under Letter of Undertaking (LUT).',
        });
      }
    } else {
      const isIntra = pos === companyStateCode;
      if (isIntra) {
        if ((inv.totalIgst || 0) > 0) {
          errors.push({
            id: `ERR_TAX_BIF_${inv.id || docNum}`,
            documentType: docType,
            documentNumber: docNum,
            documentDate: docDate,
            severity: 'ERROR',
            code: 'TAX_BIFURCATION_ERROR',
            message: `Intra-state invoice ${docNum} cannot have IGST`,
            remediation: 'Bifurcate tax into CGST and SGST',
          });
        }
        if (Math.abs((inv.totalCgst || 0) - (inv.totalSgst || 0)) > 0.05) {
          errors.push({
            id: `ERR_TAX_ASYM_${inv.id || docNum}`,
            documentType: docType,
            documentNumber: docNum,
            documentDate: docDate,
            severity: 'ERROR',
            code: 'TAX_BIFURCATION_ERROR',
            message: `Intra-state invoice ${docNum} CGST and SGST amounts must be equal`,
            remediation: 'Equalize CGST and SGST rates and amounts',
          });
        }
      } else {
        // Inter-state
        if ((inv.totalCgst || 0) > 0 || (inv.totalSgst || 0) > 0) {
          errors.push({
            id: `ERR_TAX_BIF_${inv.id || docNum}`,
            documentType: docType,
            documentNumber: docNum,
            documentDate: docDate,
            severity: 'ERROR',
            code: 'TAX_BIFURCATION_ERROR',
            message: `Inter-state invoice ${docNum} cannot have CGST or SGST`,
            remediation: 'Charge Integrated Tax (IGST) instead of CGST+SGST',
          });
        }
      }
    }

    // Check 2.4: Line-Item HSN/SAC Digit Rules
    if (inv.items && Array.isArray(inv.items)) {
      for (const item of inv.items) {
        const hsn = item.hsnSacCode || item.hsnCode || '';
        if (!validateHsnSac(hsn)) {
          errors.push({
            id: `ERR_HSN_${inv.id || docNum}_${item.id || item.name}`,
            documentType: docType,
            documentNumber: docNum,
            documentDate: docDate,
            severity: 'ERROR',
            code: 'INVALID_HSN_CODE',
            message: `Item '${item.name || 'Item'}' has invalid or missing HSN/SAC code: '${hsn}'`,
            remediation: 'Specify 4, 6, or 8 digits for goods, or 6 digits starting with 99 for services',
          });
        }
      }
    }
  }

  // 3. Audit Inward Purchase Bills
  for (const pur of periodPurchases) {
    if (pur.isCancelled) continue;

    const purDocNum = pur.billNumber || 'BILL';
    const purDocDate = pur.date || '';

    // Check 3.1: Supplier GSTIN Checksum
    if (pur.supplierGstin && pur.supplierGstin.trim() !== '') {
      const supVal = validateGstin(pur.supplierGstin);
      if (!supVal.isValid) {
        errors.push({
          id: `ERR_PUR_GSTIN_${pur.id || purDocNum}`,
          documentType: 'PURCHASE',
          documentNumber: purDocNum,
          documentDate: purDocDate,
          severity: 'ERROR',
          code: 'INVALID_GSTIN_CHECKSUM',
          message: `Supplier GSTIN '${pur.supplierGstin}' on Purchase Bill #${purDocNum} failed checksum validation.`,
          remediation: 'Verify supplier GSTIN on the official GST portal.',
        });
      }
    }

    // Check 3.2: Inward Tax Bifurcation
    const purPos = pur.placeOfSupplyStateCode || pur.supplierStateCode || companyStateCode;
    const purIsIntra = purPos === companyStateCode;

    if (purIsIntra) {
      if ((pur.totalIgst || 0) > 0) {
        errors.push({
          id: `ERR_PUR_TAX_BIF_${pur.id || purDocNum}`,
          documentType: 'PURCHASE',
          documentNumber: purDocNum,
          documentDate: purDocDate,
          severity: 'ERROR',
          code: 'TAX_BIFURCATION_ERROR',
          message: `Intra-state Purchase Bill #${purDocNum} cannot have IGST`,
          remediation: 'Split tax into CGST and SGST for intra-state purchases.',
        });
      }
      if (Math.abs((pur.totalCgst || 0) - (pur.totalSgst || 0)) > 0.05) {
        errors.push({
          id: `ERR_PUR_TAX_ASYM_${pur.id || purDocNum}`,
          documentType: 'PURCHASE',
          documentNumber: purDocNum,
          documentDate: purDocDate,
          severity: 'ERROR',
          code: 'TAX_BIFURCATION_ERROR',
          message: `Purchase Bill #${purDocNum} CGST and SGST amounts must be equal`,
          remediation: 'Equalize CGST and SGST on intra-state purchase bills.',
        });
      }
    } else {
      if ((pur.totalCgst || 0) > 0 || (pur.totalSgst || 0) > 0) {
        errors.push({
          id: `ERR_PUR_TAX_BIF_${pur.id || purDocNum}`,
          documentType: 'PURCHASE',
          documentNumber: purDocNum,
          documentDate: purDocDate,
          severity: 'ERROR',
          code: 'TAX_BIFURCATION_ERROR',
          message: `Inter-state Purchase Bill #${purDocNum} cannot have CGST or SGST`,
          remediation: 'Use IGST for inter-state purchase bills.',
        });
      }
    }
  }

  // 4. Audit Table 12 HSN Summary Mathematical Reconciliation
  if (periodInvoices.length > 0) {
    const rec = reconcileHsnSummary(periodInvoices);
    if (!rec.isBalanced) {
      errors.push({
        id: `ERR_HSN_RECON_${period}`,
        documentType: 'INVOICE',
        documentNumber: 'PERIOD_RECONCILIATION',
        documentDate: new Date().toISOString().split('T')[0],
        severity: 'ERROR',
        code: 'HSN_RECONCILIATION_MISMATCH',
        message: `Table 12 HSN summary deviates from outward supplies by ₹${Math.max(rec.diffTaxable, rec.diffTax).toFixed(2)} (exceeds ₹1.00 tolerance).`,
        remediation: 'Audit line item subtotals and invoice totals to ensure reconciliation within ₹1.00.',
      });
    }
  }

  // 5. Aggregate Summary and Enforce Export Blocker
  const totalErrors = errors.filter((e) => e.severity === 'ERROR').length;
  const totalWarnings = errors.filter((e) => e.severity === 'WARNING').length;

  return {
    isValid: errors.length === 0,
    canExport: totalErrors === 0,
    totalErrors,
    totalWarnings,
    errors,
  };
}

/**
 * Validates a single sales invoice before saving to storage or completing checkout.
 * Checks GSTIN format & checksum (for B2B), place of supply consistency, tax bifurcation,
 * and line-item HSN/SAC digit rules.
 */
export function validateSingleInvoice(
  invoice: Invoice,
  companyStateCode: string = '27',
  isGstActive: boolean = true
): { isValid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (!isGstActive) {
    return { isValid: true, errors, warnings };
  }

  // 1. Check B2B GSTIN
  if (invoice.invoiceType === 'B2B') {
    if (!invoice.partyGstin || invoice.partyGstin.trim() === '') {
      errors.push(`B2B Invoice ${invoice.invoiceNumber || ''} requires recipient GSTIN.`);
    } else {
      const gstinVal = validateGstin(invoice.partyGstin);
      if (!gstinVal.isValid) {
        errors.push(`Customer GSTIN "${invoice.partyGstin}" is invalid: ${gstinVal.error || 'Invalid format/checksum'}.`);
      } else {
        // POS state consistency check
        const gstinState = invoice.partyGstin.substring(0, 2);
        const pos = invoice.placeOfSupplyStateCode || invoice.partyStateCode;
        if (pos && pos !== gstinState) {
          warnings.push(`Place of supply state (${pos}) does not match customer registration state (${gstinState}).`);
        }
      }
    }
  }

  // 2. Check Tax Bifurcation
  const pos = invoice.placeOfSupplyStateCode || invoice.partyStateCode || companyStateCode;
  const isIntra = pos === companyStateCode;
  if (invoice.invoiceType !== 'EXPORT') {
    if (isIntra) {
      if ((invoice.totalIgst || 0) > 0) {
        errors.push(`Intra-state supply (POS ${pos}) cannot charge IGST.`);
      }
      if (Math.abs((invoice.totalCgst || 0) - (invoice.totalSgst || 0)) > 0.05) {
        errors.push('Intra-state CGST and SGST amounts must be equal.');
      }
    } else {
      if ((invoice.totalCgst || 0) > 0 || (invoice.totalSgst || 0) > 0) {
        errors.push(`Inter-state supply (POS ${pos}) must charge IGST instead of CGST/SGST.`);
      }
    }
  }

  // 3. Check Line-Item HSN/SAC codes
  if (invoice.items && Array.isArray(invoice.items)) {
    for (const item of invoice.items) {
      const hsn = (item.hsnSacCode || item.hsnCode || '').trim();
      if (hsn && !validateHsnSac(hsn)) {
        errors.push(`Item "${item.name}" has invalid HSN/SAC code "${hsn}". Goods require 4, 6, or 8 digits; Services require 6 digits (99xxxx).`);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

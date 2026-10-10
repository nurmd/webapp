import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';

export interface Gstr1JsonPayload {
  gstin: string;
  fp: string; // MMYYYY e.g. "102026"
  gt: number;
  cur_gt: number;
  version: string;
  hash: string;
  b2b?: Array<{
    ctin: string;
    inv: Array<{
      inum: string;
      idt: string; // DD-MM-YYYY
      val: number;
      pos: string;
      rchrg: string; // 'Y' | 'N'
      etin?: string;
      inv_typ: string;
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          camt: number;
          samt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  b2cl?: Array<{
    pos: string;
    inv: Array<{
      inum: string;
      idt: string; // DD-MM-YYYY
      val: number;
      etin?: string;
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  b2cs?: Array<{
    sply_ty: 'INTRA' | 'INTER';
    pos: string;
    typ: string; // 'OE'
    rt: number;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  }>;
  cdnr?: Array<{
    ctin: string;
    nt: Array<{
      ntty: 'C' | 'D';
      nt_num: string;
      nt_dt: string; // DD-MM-YYYY
      p_gst: string;
      inum: string;
      idt: string; // DD-MM-YYYY
      val: number;
      pos: string;
      rchrg: string;
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          camt: number;
          samt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  cdnur?: Array<{
    typ: 'B2CL' | 'EXPWP' | 'EXPWOP';
    ntty: 'C' | 'D';
    nt_num: string;
    nt_dt: string;
    p_gst: string;
    inum: string;
    idt: string;
    pos: string;
    val: number;
    itms: Array<{
      num: number;
      itm_det: {
        rt: number;
        txval: number;
        iamt: number;
        csamt: number;
      };
    }>;
  }>;
  exp?: Array<{
    exp_typ: 'WPAY' | 'WOPAY';
    inv: Array<{
      inum: string;
      idt: string;
      val: number;
      sbnum?: string;
      sbdt?: string;
      itms: Array<{
        num: number;
        itm_det: {
          rt: number;
          txval: number;
          iamt: number;
          csamt: number;
        };
      }>;
    }>;
  }>;
  hsn?: {
    data: Array<{
      num: number;
      hsn_sc: string;
      desc: string;
      uqc: string;
      qty: number;
      val: number;
      txval: number;
      rt: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }>;
  };
  doc_issue?: {
    doc_det: Array<{
      doc_num: number;
      docs: Array<{
        num: number;
        from: string;
        to: string;
        totnum: number;
        cancel: number;
        net_issue: number;
      }>;
    }>;
  };
}

/**
 * Normalizes a date string into official GST Portal DD-MM-YYYY format.
 */
export function toGstrPortalDate(dateStr?: string): string {
  if (!dateStr) return '';
  const clean = dateStr.split('T')[0];
  const parts = clean.split('-');
  if (parts.length === 3) {
    // If input is YYYY-MM-DD
    if (parts[0].length === 4) {
      return `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
    }
    // If input is DD-MM-YYYY already
    if (parts[2].length === 4) {
      return `${parts[0].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[2]}`;
    }
  }
  return clean;
}

export function generateGstr1Json(
  company: CompanyProfile,
  invoices: Invoice[],
  returnPeriodMMYYYY: string
): Gstr1JsonPayload {
  const targetMonth = returnPeriodMMYYYY && returnPeriodMMYYYY.length === 6 ? returnPeriodMMYYYY.substring(0, 2) : '';
  const targetYear = returnPeriodMMYYYY && returnPeriodMMYYYY.length === 6 ? returnPeriodMMYYYY.substring(2) : '';

  const periodInvoices = invoices.filter((inv) => {
    if (!targetMonth || !targetYear) return true;
    const dStr = (inv.date || '').split('T')[0];
    if (!dStr) return true;
    const parts = dStr.split('-');
    if (parts.length >= 2) {
      const y = parts[0];
      const m = parts[1].padStart(2, '0');
      return y === targetYear && m === targetMonth;
    }
    return true;
  });

  // Statutory Document Filtering
  const b2bInvoices = periodInvoices.filter((i) => !i.isCancelled && i.invoiceType === 'B2B' && i.partyGstin);

  // Table 5 B2CL: Inter-state unregistered invoices where grandTotal strictly exceeds ₹2,50,000.00
  const b2clInvoices = periodInvoices.filter(
    (i) =>
      !i.isCancelled &&
      (i.invoiceType === 'B2CL' ||
        (!i.partyGstin &&
          i.invoiceType !== 'EXPORT' &&
          i.invoiceType !== 'CREDIT_NOTE' &&
          i.invoiceType !== 'DEBIT_NOTE' &&
          !i.isIntraState &&
          i.grandTotal > 250000))
  );

  // Table 7 B2CS: Unregistered intra-state (any value) or inter-state <= ₹2,50,000.00
  const b2csInvoices = periodInvoices.filter(
    (i) =>
      !i.isCancelled &&
      (i.invoiceType === 'B2CS' ||
        (!i.partyGstin &&
          i.invoiceType !== 'EXPORT' &&
          i.invoiceType !== 'CREDIT_NOTE' &&
          i.invoiceType !== 'DEBIT_NOTE' &&
          (i.isIntraState || i.grandTotal <= 250000)))
  );

  // Table 6A Exports
  const expInvoices = periodInvoices.filter((i) => !i.isCancelled && i.invoiceType === 'EXPORT');

  // Table 9B Credit / Debit Notes
  const creditNotes = periodInvoices.filter(
    (i) => !i.isCancelled && (i.invoiceType === 'CREDIT_NOTE' || i.invoiceType === 'DEBIT_NOTE')
  );

  // 1. Table 4: B2B Grouped by CTIN
  const b2bGrouped: Record<string, any[]> = {};
  b2bInvoices.forEach((inv) => {
    const ctin = inv.partyGstin!.trim().toUpperCase();
    if (!b2bGrouped[ctin]) {
      b2bGrouped[ctin] = [];
    }

    const itms = inv.items.map((item, idx) => ({
      num: idx + 1,
      itm_det: {
        rt: item.gstRate,
        txval: Math.round(item.taxableAmount * 100) / 100,
        iamt: Math.round(item.igstAmount * 100) / 100,
        camt: Math.round(item.cgstAmount * 100) / 100,
        samt: Math.round(item.sgstAmount * 100) / 100,
        csamt: Math.round((item.cessAmount || 0) * 100) / 100,
      },
    }));

    b2bGrouped[ctin].push({
      inum: inv.invoiceNumber,
      idt: toGstrPortalDate(inv.date),
      val: Math.round(inv.grandTotal * 100) / 100,
      pos: inv.placeOfSupplyStateCode || company.stateCode,
      rchrg: inv.isRcm ? 'Y' : 'N',
      inv_typ: 'R',
      itms,
    });
  });

  const b2bList = Object.keys(b2bGrouped).map((ctin) => ({
    ctin,
    inv: b2bGrouped[ctin],
  }));

  // 2. Table 5: B2CL Grouped by POS
  const b2clMap: Record<string, any[]> = {};
  b2clInvoices.forEach((inv) => {
    const pos = inv.placeOfSupplyStateCode || '00';
    if (!b2clMap[pos]) b2clMap[pos] = [];
    b2clMap[pos].push({
      inum: inv.invoiceNumber,
      idt: toGstrPortalDate(inv.date),
      val: Math.round(inv.grandTotal * 100) / 100,
      itms: inv.items.map((item, idx) => ({
        num: idx + 1,
        itm_det: {
          rt: item.gstRate,
          txval: Math.round(item.taxableAmount * 100) / 100,
          iamt: Math.round(item.igstAmount * 100) / 100,
          csamt: Math.round((item.cessAmount || 0) * 100) / 100,
        },
      })),
    });
  });

  const b2clList = Object.keys(b2clMap).map((pos) => ({
    pos,
    inv: b2clMap[pos],
  }));

  // 3. Table 7: B2CS Summary grouped by Supply Type, POS, and Rate Slab
  const b2csMap: Record<string, { sply_ty: 'INTRA' | 'INTER'; pos: string; typ: string; rt: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }> = {};
  b2csInvoices.forEach((inv) => {
    const isIntra = (inv.placeOfSupplyStateCode || company.stateCode) === company.stateCode;
    const pos = inv.placeOfSupplyStateCode || company.stateCode;
    inv.items.forEach((item) => {
      const key = `${isIntra ? 'INTRA' : 'INTER'}_${pos}_${item.gstRate}`;
      if (!b2csMap[key]) {
        b2csMap[key] = {
          sply_ty: isIntra ? 'INTRA' : 'INTER',
          pos,
          typ: 'OE',
          rt: item.gstRate,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        };
      }
      b2csMap[key].txval += item.taxableAmount;
      b2csMap[key].iamt += item.igstAmount;
      b2csMap[key].camt += item.cgstAmount;
      b2csMap[key].samt += item.sgstAmount;
      b2csMap[key].csamt += item.cessAmount || 0;
    });
  });

  // Net off B2CS Credit Notes (without GSTIN and not B2CL)
  creditNotes.forEach((cn) => {
    if (!cn.partyGstin && (cn.isIntraState || cn.grandTotal <= 250000)) {
      const isIntra = (cn.placeOfSupplyStateCode || company.stateCode) === company.stateCode;
      const pos = cn.placeOfSupplyStateCode || company.stateCode;
      const factor = cn.noteType === 'D' ? 1 : -1;
      cn.items.forEach((item) => {
        const key = `${isIntra ? 'INTRA' : 'INTER'}_${pos}_${item.gstRate}`;
        if (b2csMap[key]) {
          b2csMap[key].txval += factor * item.taxableAmount;
          b2csMap[key].iamt += factor * item.igstAmount;
          b2csMap[key].camt += factor * item.cgstAmount;
          b2csMap[key].samt += factor * item.sgstAmount;
          b2csMap[key].csamt += factor * (item.cessAmount || 0);
        }
      });
    }
  });

  const b2csList = Object.values(b2csMap).map((entry) => ({
    sply_ty: entry.sply_ty,
    rt: entry.rt,
    typ: 'OE',
    pos: entry.pos,
    txval: Math.round(entry.txval * 100) / 100,
    iamt: Math.round(entry.iamt * 100) / 100,
    camt: Math.round(entry.camt * 100) / 100,
    samt: Math.round(entry.samt * 100) / 100,
    csamt: Math.round(entry.csamt * 100) / 100,
  }));

  // 4. Table 9B: CDNR (Registered) & CDNUR (Unregistered Large / Export)
  const cdnrMap: Record<string, any[]> = {};
  const cdnurList: any[] = [];
  creditNotes.forEach((cn) => {
    if (cn.partyGstin) {
      const ctin = cn.partyGstin.trim().toUpperCase();
      if (!cdnrMap[ctin]) cdnrMap[ctin] = [];
      cdnrMap[ctin].push({
        ntty: cn.noteType || 'C',
        nt_num: cn.invoiceNumber,
        nt_dt: toGstrPortalDate(cn.date),
        p_gst: 'N',
        inum: cn.originalInvoiceNumber || 'INV-REF',
        idt: cn.originalInvoiceDate ? toGstrPortalDate(cn.originalInvoiceDate) : toGstrPortalDate(cn.date),
        val: Math.round(cn.grandTotal * 100) / 100,
        pos: cn.placeOfSupplyStateCode || company.stateCode,
        rchrg: cn.isRcm ? 'Y' : 'N',
        itms: cn.items.map((it, idx) => ({
          num: idx + 1,
          itm_det: {
            rt: it.gstRate,
            txval: Math.round(it.taxableAmount * 100) / 100,
            iamt: Math.round(it.igstAmount * 100) / 100,
            camt: Math.round(it.cgstAmount * 100) / 100,
            samt: Math.round(it.sgstAmount * 100) / 100,
            csamt: Math.round((it.cessAmount || 0) * 100) / 100,
          },
        })),
      });
    } else if (cn.grandTotal > 250000 && !cn.isIntraState) {
      cdnurList.push({
        typ: 'B2CL',
        ntty: cn.noteType || 'C',
        nt_num: cn.invoiceNumber,
        nt_dt: toGstrPortalDate(cn.date),
        p_gst: 'N',
        inum: cn.originalInvoiceNumber || 'INV-REF',
        idt: cn.originalInvoiceDate ? toGstrPortalDate(cn.originalInvoiceDate) : toGstrPortalDate(cn.date),
        pos: cn.placeOfSupplyStateCode || '00',
        val: Math.round(cn.grandTotal * 100) / 100,
        itms: cn.items.map((it, idx) => ({
          num: idx + 1,
          itm_det: {
            rt: it.gstRate,
            txval: Math.round(it.taxableAmount * 100) / 100,
            iamt: Math.round(it.igstAmount * 100) / 100,
            csamt: Math.round((it.cessAmount || 0) * 100) / 100,
          },
        })),
      });
    }
  });

  const cdnrList = Object.keys(cdnrMap).map((ctin) => ({
    ctin,
    nt: cdnrMap[ctin],
  }));

  // 5. Table 6A: Exports
  const expMap: Record<string, any[]> = {};
  expInvoices.forEach((exp) => {
    const expTyp = exp.exportType || (exp.totalIgst > 0 ? 'WPAY' : 'WOPAY');
    if (!expMap[expTyp]) expMap[expTyp] = [];
    expMap[expTyp].push({
      inum: exp.invoiceNumber,
      idt: toGstrPortalDate(exp.date),
      val: Math.round(exp.grandTotal * 100) / 100,
      sbnum: exp.shippingBillNumber,
      sbdt: exp.shippingBillDate ? toGstrPortalDate(exp.shippingBillDate) : undefined,
      itms: exp.items.map((it, idx) => ({
        num: idx + 1,
        itm_det: {
          rt: it.gstRate,
          txval: Math.round(it.taxableAmount * 100) / 100,
          iamt: Math.round(it.igstAmount * 100) / 100,
          csamt: Math.round((it.cessAmount || 0) * 100) / 100,
        },
      })),
    });
  });

  const expList = Object.keys(expMap).map((exp_typ) => ({
    exp_typ: exp_typ as 'WPAY' | 'WOPAY',
    inv: expMap[exp_typ],
  }));

  // 6. Table 12: HSN Summary per rate slab with credit note netting
  const hsnMap: Record<string, { hsn_sc: string; desc: string; uqc: string; qty: number; val: number; txval: number; rt: number; iamt: number; camt: number; samt: number; csamt: number }> = {};
  periodInvoices.forEach((inv) => {
    if (inv.isCancelled) return;
    const isCreditNote = inv.invoiceType === 'CREDIT_NOTE';
    const factor = isCreditNote ? -1 : 1;

    inv.items.forEach((item) => {
      const hsn = item.hsnSacCode || '999999';
      const key = `${hsn}_${item.gstRate}`;
      if (!hsnMap[key]) {
        hsnMap[key] = {
          hsn_sc: hsn,
          desc: item.name,
          uqc: item.unit || (hsn.startsWith('99') ? 'OTH' : 'NOS'),
          qty: 0,
          val: 0,
          txval: 0,
          rt: item.gstRate,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        };
      }
      hsnMap[key].qty += factor * item.quantity;
      hsnMap[key].val += factor * item.totalAmount;
      hsnMap[key].txval += factor * item.taxableAmount;
      hsnMap[key].iamt += factor * item.igstAmount;
      hsnMap[key].camt += factor * item.cgstAmount;
      hsnMap[key].samt += factor * item.sgstAmount;
      hsnMap[key].csamt += factor * (item.cessAmount || 0);
    });
  });

  const hsnData = Object.values(hsnMap).map((entry, idx) => ({
    num: idx + 1,
    hsn_sc: entry.hsn_sc,
    desc: entry.desc,
    uqc: entry.uqc,
    qty: Math.round(entry.qty * 1000) / 1000,
    val: Math.round(entry.val * 100) / 100,
    txval: Math.round(entry.txval * 100) / 100,
    rt: entry.rt,
    iamt: Math.round(entry.iamt * 100) / 100,
    camt: Math.round(entry.camt * 100) / 100,
    samt: Math.round(entry.samt * 100) / 100,
    csamt: Math.round(entry.csamt * 100) / 100,
  }));

  // 7. Table 13: Document Issue Summary
  const invSeries = periodInvoices.filter((i) => i.invoiceType !== 'CREDIT_NOTE' && i.invoiceType !== 'DEBIT_NOTE');
  const cnSeries = periodInvoices.filter((i) => i.invoiceType === 'CREDIT_NOTE');
  const dnSeries = periodInvoices.filter((i) => i.invoiceType === 'DEBIT_NOTE');

  const doc_det: any[] = [];
  if (invSeries.length > 0) {
    const sorted = [...invSeries].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    const cancelCount = sorted.filter((i) => i.isCancelled).length;
    doc_det.push({
      doc_num: 1,
      docs: [
        {
          num: 1,
          from: sorted[0].invoiceNumber,
          to: sorted[sorted.length - 1].invoiceNumber,
          totnum: sorted.length,
          cancel: cancelCount,
          net_issue: sorted.length - cancelCount,
        },
      ],
    });
  }
  if (cnSeries.length > 0) {
    const sorted = [...cnSeries].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    const cancelCount = sorted.filter((i) => i.isCancelled).length;
    doc_det.push({
      doc_num: 5,
      docs: [
        {
          num: 1,
          from: sorted[0].invoiceNumber,
          to: sorted[sorted.length - 1].invoiceNumber,
          totnum: sorted.length,
          cancel: cancelCount,
          net_issue: sorted.length - cancelCount,
        },
      ],
    });
  }
  if (dnSeries.length > 0) {
    const sorted = [...dnSeries].sort((a, b) => a.invoiceNumber.localeCompare(b.invoiceNumber));
    const cancelCount = sorted.filter((i) => i.isCancelled).length;
    doc_det.push({
      doc_num: 4,
      docs: [
        {
          num: 1,
          from: sorted[0].invoiceNumber,
          to: sorted[sorted.length - 1].invoiceNumber,
          totnum: sorted.length,
          cancel: cancelCount,
          net_issue: sorted.length - cancelCount,
        },
      ],
    });
  }

  const totalGrossTurnover = periodInvoices
    .filter((i) => !i.isCancelled)
    .reduce((s, i) => s + i.grandTotal, 0);

  return {
    gstin: company.gstin,
    fp: returnPeriodMMYYYY,
    gt: Math.round(totalGrossTurnover * 100) / 100,
    cur_gt: Math.round(totalGrossTurnover * 100) / 100,
    version: 'GST_OFFLINE_TOOL_v1.0',
    hash: 'hash_' + Date.now(),
    b2b: b2bList,
    b2cl: b2clList,
    b2cs: b2csList,
    cdnr: cdnrList,
    cdnur: cdnurList,
    exp: expList,
    hsn: {
      data: hsnData,
    },
    doc_issue: doc_det.length > 0 ? { doc_det } : undefined,
  };
}

export function downloadGstr1JsonFile(company: CompanyProfile, invoices: Invoice[], period: string) {
  const payload = generateGstr1Json(company, invoices, period);
  const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(payload, null, 2));
  const downloadAnchor = document.createElement('a');
  downloadAnchor.setAttribute('href', dataStr);
  downloadAnchor.setAttribute('download', `GSTR1_${company.gstin}_${period}.json`);
  document.body.appendChild(downloadAnchor);
  downloadAnchor.click();
  downloadAnchor.remove();
}

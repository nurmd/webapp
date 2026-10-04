import { Invoice } from '../../models/invoice.ts';
import { CompanyProfile } from '../../models/company.ts';

export interface Gstr1JsonPayload {
  gstin: string;
  fp: string; // MMYYYY e.g. "102024"
  gt: number;
  cur_gt: number;
  version: string;
  hash: string;
  b2b: Array<{
    ctin: string;
    inv: Array<{
      inum: string;
      idt: string; // DD-MM-YYYY
      val: number;
      pos: string;
      rchrg: string;
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
  b2cs: Array<{
    sply_ty: string;
    rt: number;
    typ: string;
    pos: string;
    txval: number;
    iamt: number;
    camt: number;
    samt: number;
    csamt: number;
  }>;
  hsn: {
    data: Array<{
      num: number;
      hsn_sc: string;
      desc: string;
      uqc: string;
      qty: number;
      val: number;
      txval: number;
      iamt: number;
      camt: number;
      samt: number;
      csamt: number;
    }>;
  };
}

export function generateGstr1Json(company: CompanyProfile, invoices: Invoice[], returnPeriodMMYYYY: string): Gstr1JsonPayload {
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

  const b2bInvoices = periodInvoices.filter((i) => i.invoiceType === 'B2B' && i.partyGstin);
  const b2csInvoices = periodInvoices.filter((i) => i.invoiceType === 'B2CS' || (!i.partyGstin && i.invoiceType !== 'B2B'));

  // Group B2B by Recipient GSTIN
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
        txval: item.taxableAmount,
        iamt: item.igstAmount,
        camt: item.cgstAmount,
        samt: item.sgstAmount,
        csamt: item.cessAmount,
      },
    }));

    // Convert date YYYY-MM-DD to DD-MM-YYYY safely
    const cleanDate = (inv.date || '').split('T')[0];
    const [y, m, d] = cleanDate.split('-');
    const formattedDate = (d && m && y) ? `${d.padStart(2, '0')}-${m.padStart(2, '0')}-${y}` : cleanDate;

    b2bGrouped[ctin].push({
      inum: inv.invoiceNumber,
      idt: formattedDate,
      val: inv.grandTotal,
      pos: inv.placeOfSupplyStateCode || company.stateCode,
      rchrg: 'N',
      inv_typ: 'R',
      itms,
    });
  });

  const b2bList = Object.keys(b2bGrouped).map((ctin) => ({
    ctin,
    inv: b2bGrouped[ctin],
  }));

  // B2CS Summary grouped by POS & Rate
  const b2csMap: Record<string, { txval: number; iamt: number; camt: number; samt: number; csamt: number; rt: number; pos: string; isIntra: boolean }> = {};
  b2csInvoices.forEach((inv) => {
    inv.items.forEach((item) => {
      const pos = inv.placeOfSupplyStateCode || company.stateCode;
      const key = `${pos}_${item.gstRate}`;
      if (!b2csMap[key]) {
        b2csMap[key] = {
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
          rt: item.gstRate,
          pos,
          isIntra: inv.isIntraState,
        };
      }
      b2csMap[key].txval += item.taxableAmount;
      b2csMap[key].iamt += item.igstAmount;
      b2csMap[key].camt += item.cgstAmount;
      b2csMap[key].samt += item.sgstAmount;
      b2csMap[key].csamt += item.cessAmount;
    });
  });

  const b2csList = Object.values(b2csMap).map((entry) => ({
    sply_ty: entry.isIntra ? 'INTRA' : 'INTER',
    rt: entry.rt,
    typ: 'OE',
    pos: entry.pos,
    txval: Math.round(entry.txval * 100) / 100,
    iamt: Math.round(entry.iamt * 100) / 100,
    camt: Math.round(entry.camt * 100) / 100,
    samt: Math.round(entry.samt * 100) / 100,
    csamt: Math.round(entry.csamt * 100) / 100,
  }));

  // HSN Summary
  const hsnMap: Record<string, { desc: string; uqc: string; qty: number; val: number; txval: number; iamt: number; camt: number; samt: number; csamt: number }> = {};
  periodInvoices.forEach((inv) => {
    inv.items.forEach((item) => {
      const hsn = item.hsnSacCode || '999999';
      if (!hsnMap[hsn]) {
        hsnMap[hsn] = {
          desc: item.name,
          uqc: item.unit || 'OTH',
          qty: 0,
          val: 0,
          txval: 0,
          iamt: 0,
          camt: 0,
          samt: 0,
          csamt: 0,
        };
      }
      hsnMap[hsn].qty += item.quantity;
      hsnMap[hsn].val += item.totalAmount;
      hsnMap[hsn].txval += item.taxableAmount;
      hsnMap[hsn].iamt += item.igstAmount;
      hsnMap[hsn].camt += item.cgstAmount;
      hsnMap[hsn].samt += item.sgstAmount;
      hsnMap[hsn].csamt += item.cessAmount;
    });
  });

  const hsnData = Object.keys(hsnMap).map((hsn, idx) => ({
    num: idx + 1,
    hsn_sc: hsn,
    desc: hsnMap[hsn].desc,
    uqc: hsnMap[hsn].uqc,
    qty: hsnMap[hsn].qty,
    val: Math.round(hsnMap[hsn].val * 100) / 100,
    txval: Math.round(hsnMap[hsn].txval * 100) / 100,
    iamt: Math.round(hsnMap[hsn].iamt * 100) / 100,
    camt: Math.round(hsnMap[hsn].camt * 100) / 100,
    samt: Math.round(hsnMap[hsn].samt * 100) / 100,
    csamt: Math.round(hsnMap[hsn].csamt * 100) / 100,
  }));

  const totalGrossTurnover = periodInvoices.reduce((s, i) => s + i.grandTotal, 0);

  return {
    gstin: company.gstin,
    fp: returnPeriodMMYYYY,
    gt: totalGrossTurnover,
    cur_gt: totalGrossTurnover,
    version: 'GST_OFFLINE_TOOL_v1.0',
    hash: 'hash_' + Date.now(),
    b2b: b2bList,
    b2cs: b2csList,
    hsn: {
      data: hsnData,
    },
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

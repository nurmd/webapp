import { HSN_RAW_DATA } from './data/hsnData';

export interface HsnItem {
  code: string;
  description: string;
  category: 'Goods' | 'Services';
  gstRate: number; // Statutory Indian GST rates: 0, 0.1, 0.25, 3, 5, 12, 18, 28
}

export const COMMON_HSN_CODES: HsnItem[] = [
  // Services (SAC)
  { code: '998311', description: 'Management consulting and management services', category: 'Services', gstRate: 18 },
  { code: '998313', description: 'Information technology (IT) consulting and support services', category: 'Services', gstRate: 18 },
  { code: '998314', description: 'Information technology (IT) design and development services', category: 'Services', gstRate: 18 },
  { code: '995411', description: 'General construction services of residential buildings', category: 'Services', gstRate: 12 },
  { code: '996331', description: 'Restaurant service with air-conditioning', category: 'Services', gstRate: 5 },
  { code: '996511', description: 'Road transport services of goods including rental', category: 'Services', gstRate: 5 },
  { code: '997212', description: 'Real estate services involving own or leased property', category: 'Services', gstRate: 18 },
  { code: '998221', description: 'Financial auditing and accounting services', category: 'Services', gstRate: 18 },
  { code: '998211', description: 'Legal advisory and representation services', category: 'Services', gstRate: 18 },

  // Goods (HSN)
  { code: '847130', description: 'Laptops, Notebooks and sub-notebook computers', category: 'Goods', gstRate: 18 },
  { code: '851712', description: 'Smartphones and cellular network phones', category: 'Goods', gstRate: 18 },
  { code: '852852', description: 'Computer monitors and display units', category: 'Goods', gstRate: 18 },
  { code: '844332', description: 'Thermal printers, receipt printers and laser printers', category: 'Goods', gstRate: 18 },
  { code: '0401', description: 'Fresh milk and pasteurized milk (unbranded/branded)', category: 'Goods', gstRate: 0 },
  { code: '1006', description: 'Rice (unbranded/pre-packaged)', category: 'Goods', gstRate: 5 },
  { code: '1905', description: 'Bread, pastries, cakes, biscuits and bakery products', category: 'Goods', gstRate: 18 },
  { code: '2106', description: 'Food preparations and sweetmeats', category: 'Goods', gstRate: 5 },
  { code: '3004', description: 'Medicaments and pharmaceuticals', category: 'Goods', gstRate: 12 },
  { code: '6109', description: 'T-shirts, singlets and other vests, knitted or crocheted', category: 'Goods', gstRate: 5 },
  { code: '6403', description: 'Footwear with outer soles of rubber or leather', category: 'Goods', gstRate: 12 },
  { code: '9403', description: 'Office and home furniture and parts', category: 'Goods', gstRate: 18 },
];

interface CatalogEntry {
  item: HsnItem;
  cleanCode: string;
  lowerDesc: string;
}

let catalogInitialized = false;
let catalogEntries: CatalogEntry[] = [];
let codeMap = new Map<string, HsnItem>();
let allItems: HsnItem[] = [];

function ensureCatalogInitialized() {
  if (catalogInitialized) return;

  const totalRaw = HSN_RAW_DATA.length;
  const entries: CatalogEntry[] = new Array(totalRaw);
  const items: HsnItem[] = new Array(totalRaw);
  const map = new Map<string, HsnItem>();

  for (let i = 0; i < totalRaw; i++) {
    const [rawCode, desc, rate] = HSN_RAW_DATA[i];
    const cleanCode = rawCode.trim().replace(/[.\s-]/g, '');
    const isService = cleanCode.startsWith('99');
    const item: HsnItem = {
      code: cleanCode,
      description: desc,
      category: isService ? 'Services' : 'Goods',
      gstRate: rate,
    };
    items[i] = item;
    entries[i] = {
      item,
      cleanCode,
      lowerDesc: desc.toLowerCase(),
    };
    if (!map.has(cleanCode)) {
      map.set(cleanCode, item);
    }
  }

  // Ensure common codes are also mapped
  for (let j = 0; j < COMMON_HSN_CODES.length; j++) {
    const common = COMMON_HSN_CODES[j];
    const clean = common.code.trim().replace(/[.\s-]/g, '');
    if (!map.has(clean)) {
      map.set(clean, common);
    }
  }

  catalogEntries = entries;
  allItems = items;
  codeMap = map;
  catalogInitialized = true;
}

// Initialize eagerly on module load
ensureCatalogInitialized();

/**
 * Returns an HSN/SAC item by exact code with O(1) lookup.
 * Automatically normalizes punctuation, spaces, and hyphens.
 */
export function getHsnByCode(code: string | undefined | null): HsnItem | undefined {
  if (!code) return undefined;
  ensureCatalogInitialized();
  const clean = String(code).trim().replace(/[.\s-]/g, '');
  return codeMap.get(clean);
}

/**
 * Returns all catalog items (>= 5,000 authentic codes).
 */
export function getAllHsnItems(): HsnItem[] {
  ensureCatalogInitialized();
  return allItems;
}

/**
 * High-performance search for HSN/SAC items (sub-10ms query latency).
 * Supports prefix matching on codes and keyword/phrase matching on descriptions.
 */
export function searchHsn(query: string, limit: number = 10): HsnItem[] {
  ensureCatalogInitialized();
  const q = (query || '').trim().toLowerCase();
  if (!q) {
    return COMMON_HSN_CODES.slice(0, Math.min(limit, COMMON_HSN_CODES.length));
  }

  const cleanQueryCode = q.replace(/[.\s-]/g, '');
  const isDigitQuery = /^\d+$/.test(cleanQueryCode);

  const exactMatches: HsnItem[] = [];
  const prefixCodeMatches: HsnItem[] = [];
  const descStartsWithMatches: HsnItem[] = [];
  const descIncludesMatches: HsnItem[] = [];
  const seen = new Set<string>();

  // Exact code match
  if (isDigitQuery && codeMap.has(cleanQueryCode)) {
    const exact = codeMap.get(cleanQueryCode)!;
    exactMatches.push(exact);
    seen.add(exact.code);
  }

  // Scan entries
  for (let i = 0; i < catalogEntries.length; i++) {
    const entry = catalogEntries[i];
    const code = entry.cleanCode;
    if (seen.has(code)) continue;

    if (isDigitQuery) {
      if (code.startsWith(cleanQueryCode)) {
        prefixCodeMatches.push(entry.item);
        seen.add(code);
        if (exactMatches.length + prefixCodeMatches.length >= limit) {
          break;
        }
      }
    } else {
      if (entry.lowerDesc.startsWith(q)) {
        descStartsWithMatches.push(entry.item);
        seen.add(code);
      } else if (entry.lowerDesc.includes(q)) {
        descIncludesMatches.push(entry.item);
        seen.add(code);
      }
      if (exactMatches.length + descStartsWithMatches.length + descIncludesMatches.length >= limit * 2) {
        break;
      }
    }
  }

  // If query had digits and fewer results than limit, check description match as well
  if (isDigitQuery && exactMatches.length + prefixCodeMatches.length < limit) {
    for (let i = 0; i < catalogEntries.length; i++) {
      const entry = catalogEntries[i];
      if (seen.has(entry.cleanCode)) continue;
      if (entry.lowerDesc.includes(q)) {
        descIncludesMatches.push(entry.item);
        seen.add(entry.cleanCode);
        if (exactMatches.length + prefixCodeMatches.length + descIncludesMatches.length >= limit) {
          break;
        }
      }
    }
  }

  const combined = [
    ...exactMatches,
    ...prefixCodeMatches,
    ...descStartsWithMatches,
    ...descIncludesMatches,
  ];

  return combined.slice(0, limit);
}

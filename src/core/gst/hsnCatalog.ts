export interface HsnItem {
  code: string;
  description: string;
  category: 'Goods' | 'Services';
  gstRate: number; // 0, 5, 12, 18, 28
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

export function searchHsn(query: string): HsnItem[] {
  const q = query.toLowerCase().trim();
  if (!q) return COMMON_HSN_CODES.slice(0, 10);
  return COMMON_HSN_CODES.filter(
    (item) => item.code.includes(q) || item.description.toLowerCase().includes(q)
  );
}

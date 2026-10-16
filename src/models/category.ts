export interface ItemCategory {
  id: string;
  name: string;
  description?: string;
  color?: string; // Hex color code for badges/chips (e.g. '#2563eb')
  icon?: string;  // Material Symbols icon name (e.g. 'local_grocery_store')
  defaultGstRate?: number; // e.g. 0, 5, 12, 18, 28
  defaultHsn?: string;     // e.g. '1006', '8517'
  isSystem?: boolean;      // System default (cannot be hard-deleted)
  createdAt: string;
  updatedAt: string;
}

export const CATEGORY_COLOR_PALETTE = [
  '#2563eb', // Blue
  '#0d9488', // Teal
  '#16a34a', // Green
  '#ca8a04', // Amber
  '#ea580c', // Orange
  '#dc2626', // Red
  '#9333ea', // Purple
  '#db2777', // Pink
  '#0891b2', // Cyan
  '#64748b', // Slate / Gray
];

export const CATEGORY_ICON_OPTIONS = [
  { icon: 'category', label: 'General / Miscellaneous' },
  { icon: 'local_grocery_store', label: 'Groceries & Provisions' },
  { icon: 'devices', label: 'Electronics & Computers' },
  { icon: 'checkroom', label: 'Clothing & Apparel' },
  { icon: 'build', label: 'Hardware & Tools' },
  { icon: 'home_repair_service', label: 'Services & Maintenance' },
  { icon: 'restaurant', label: 'Food & Beverage' },
  { icon: 'medication', label: 'Pharmacy & Healthcare' },
  { icon: 'menu_book', label: 'Books & Stationery' },
  { icon: 'directions_car', label: 'Automotive & Parts' },
  { icon: 'sports_soccer', label: 'Sports & Fitness' },
  { icon: 'inventory_2', label: 'Packaged Goods' },
];

export const DEFAULT_ITEM_CATEGORIES: ItemCategory[] = [
  {
    id: 'cat_general',
    name: 'General',
    description: 'Standard uncategorized retail & wholesale products',
    color: '#64748b',
    icon: 'category',
    isSystem: true,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat_groceries',
    name: 'Groceries',
    description: 'Food grains, provisions, and FMCG daily essentials',
    color: '#16a34a',
    icon: 'local_grocery_store',
    defaultGstRate: 5,
    defaultHsn: '1006',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat_electronics',
    name: 'Electronics',
    description: 'Consumer gadgets, hardware, appliances and accessories',
    color: '#2563eb',
    icon: 'devices',
    defaultGstRate: 18,
    defaultHsn: '851712',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat_apparel',
    name: 'Clothing & Apparel',
    description: 'Garments, readymade wear, textiles and footwear',
    color: '#db2777',
    icon: 'checkroom',
    defaultGstRate: 5,
    defaultHsn: '6109',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat_services',
    name: 'Services',
    description: 'Labor charges, maintenance, and professional consultancies',
    color: '#9333ea',
    icon: 'home_repair_service',
    defaultGstRate: 18,
    defaultHsn: '9987',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'cat_hardware',
    name: 'Hardware & Tools',
    description: 'Construction tools, electrical fittings, pipes and fasteners',
    color: '#ea580c',
    icon: 'build',
    defaultGstRate: 18,
    defaultHsn: '8205',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

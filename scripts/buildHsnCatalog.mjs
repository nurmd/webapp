// scripts/buildHsnCatalog.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

import { getSection1Items } from './hsn-definitions/sec01_animals.mjs';
import { getSection2Items } from './hsn-definitions/sec02_vegetables.mjs';
import { getSection3Items } from './hsn-definitions/sec03_fats_foods.mjs';
import { getSection4Items } from './hsn-definitions/sec04_minerals_chemicals.mjs';
import { getSection5Items } from './hsn-definitions/sec05_plastics_leather_wood.mjs';
import { getSection6Items } from './hsn-definitions/sec06_textiles_footwear.mjs';
import { getSection7Items } from './hsn-definitions/sec07_stone_precious_metals.mjs';
import { getSection8Items } from './hsn-definitions/sec08_machinery_vehicles.mjs';
import { getSection9Items } from './hsn-definitions/sec09_precision_misc_art.mjs';
import { getSection10Items } from './hsn-definitions/sec10_services_sac.mjs';
import { getExpansionItems } from './hsn-definitions/sec_expansion.mjs';
import { getExpansion2Items } from './hsn-definitions/sec_expansion2.mjs';
import { getExpansion3Items } from './hsn-definitions/sec_expansion3.mjs';
import { getExpansion4Items } from './hsn-definitions/sec_expansion4.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const VALID_STATUTORY_RATES = new Set([0, 0.1, 0.25, 3, 5, 12, 18, 28]);

const itemsMap = new Map();

function registerItems(list, label) {
  let added = 0;
  for (const [code, desc, rate] of list) {
    const cleanCode = String(code).trim().replace(/[.\s-]/g, '');
    if (!VALID_STATUTORY_RATES.has(rate)) {
      throw new Error(`Invalid statutory rate ${rate} for code ${code} in ${label}`);
    }
    if (!itemsMap.has(cleanCode)) {
      itemsMap.set(cleanCode, [cleanCode, desc.trim(), rate]);
      added++;
    }
  }
  console.log(`${label}: registered ${added} new items.`);
}

registerItems(getSection1Items(), 'Section 1 (Ch 01-05 Animals)');
registerItems(getSection2Items(), 'Section 2 (Ch 06-14 Vegetables)');
registerItems(getSection3Items(), 'Section 3 (Ch 15-24 Foods & Tobacco)');
registerItems(getSection4Items(), 'Section 4 (Ch 25-38 Minerals & Chemicals)');
registerItems(getSection5Items(), 'Section 5 (Ch 39-49 Plastics, Leather, Wood & Paper)');
registerItems(getSection6Items(), 'Section 6 (Ch 50-67 Textiles & Footwear)');
registerItems(getSection7Items(), 'Section 7 (Ch 68-83 Stone & Metals)');
registerItems(getSection8Items(), 'Section 8 (Ch 84-89 Machinery & Vehicles)');
registerItems(getSection9Items(), 'Section 9 (Ch 90-98 Instruments, Misc & Art)');
registerItems(getSection10Items(), 'Section 10 (Ch 99 Services SAC)');
registerItems(getExpansionItems(), 'Expansion 1 (Industrial Chemicals & Precision)');
registerItems(getExpansion2Items(), 'Expansion 2 (Broad Trade Nomenclature)');
registerItems(getExpansion3Items(), 'Expansion 3 (Textiles, Footwear, Metals, Services)');
registerItems(getExpansion4Items(), 'Expansion 4 (Statutory 4-digit Headings)');

// Mandatory 21 items
const MANDATORY_COMMON = [
  ['998311', 'Management consulting and management services', 18],
  ['998313', 'Information technology (IT) consulting and support services', 18],
  ['998314', 'Information technology (IT) design and development services', 18],
  ['995411', 'General construction services of residential buildings', 12],
  ['996331', 'Restaurant service with air-conditioning', 5],
  ['996511', 'Road transport services of goods including rental', 5],
  ['997212', 'Real estate services involving own or leased property', 18],
  ['998221', 'Financial auditing and accounting services', 18],
  ['998211', 'Legal advisory and representation services', 18],
  ['847130', 'Laptops, Notebooks and sub-notebook computers', 18],
  ['851712', 'Smartphones and cellular network phones', 18],
  ['852852', 'Computer monitors and display units', 18],
  ['844332', 'Thermal printers, receipt printers and laser printers', 18],
  ['0401', 'Fresh milk and pasteurized milk (unbranded/branded)', 0],
  ['1006', 'Rice (unbranded/pre-packaged)', 5],
  ['1905', 'Bread, pastries, cakes, biscuits and bakery products', 18],
  ['2106', 'Food preparations and sweetmeats', 5],
  ['3004', 'Medicaments and pharmaceuticals', 12],
  ['6109', 'T-shirts, singlets and other vests, knitted or crocheted', 5],
  ['6403', 'Footwear with outer soles of rubber or leather', 12],
  ['9403', 'Office and home furniture and parts', 18],
];

for (const [c, d, r] of MANDATORY_COMMON) {
  itemsMap.set(c, [c, d, r]);
}

const totalCount = itemsMap.size;
console.log(`Current total distinct items: ${totalCount}`);

if (totalCount < 5000) {
  throw new Error(`Total distinct items ${totalCount} is less than required 5000!`);
}

// Sort items by code for deterministic generation
const sortedItems = Array.from(itemsMap.values()).sort((a, b) => a[0].localeCompare(b[0]));

const outDir = path.resolve(__dirname, '../src/core/gst/data');
if (!fs.existsSync(outDir)) {
  fs.mkdirSync(outDir, { recursive: true });
}

const targetFile = path.join(outDir, 'hsnData.ts');

const lines = [
  '// Autogenerated by scripts/buildHsnCatalog.mjs - DO NOT EDIT MANUALLY',
  `// Total distinct authentic Indian GST HSN/SAC items: ${sortedItems.length}`,
  '',
  'export const HSN_RAW_DATA: [string, string, number][] = [',
];

for (const [code, desc, rate] of sortedItems) {
  // Escape any special characters in description
  const escapedDesc = desc.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
  lines.push(`  ['${code}', '${escapedDesc}', ${rate}],`);
}

lines.push('];');
lines.push('');

fs.writeFileSync(targetFile, lines.join('\n'), 'utf-8');
console.log(`Successfully generated ${targetFile} with ${sortedItems.length} items.`);

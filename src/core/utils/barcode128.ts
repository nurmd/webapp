/**
 * Pure TypeScript Code128 (Subset B) Barcode Generator.
 * Zero external dependencies. Generates clean SVG markup or React SVG element
 * suitable for 203 DPI / 300 DPI thermal roll printers and laser sticker sheets.
 */

// Code 128 Patterns (0 to 106). Each entry represents the widths of 3 bars and 3 spaces (sum = 11 modules),
// except 106 (STOP) which has 4 bars and 3 spaces (sum = 13 modules) + 2 module termination bar.
const CODE128_PATTERNS: string[] = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213', // 0-9
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132', // 10-19
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211', // 20-29
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313', // 30-39
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331', // 40-49
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111', // 50-59
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214', // 60-69
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111', // 70-79
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141', // 80-89
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141', // 90-99
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112' // 100-106
];

const START_CODE_B = 104; // '211214'
const STOP_CODE = 106;    // '2331112' + '2' module terminator

export interface BarcodeOptions {
  height?: number;
  barWidth?: number;
  includeText?: boolean;
  fontSize?: number;
  color?: string;
  backgroundColor?: string;
}

/**
 * Calculates Code128 pattern for an ASCII string using Code Set B.
 */
export function encodeCode128B(text: string): { modules: boolean[]; checksum: number } {
  // Subset B starts with ASCII 32 (' ') up to ASCII 127
  // Value of char = charCode - 32
  const values: number[] = [];
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 32 && code <= 126) {
      values.push(code - 32);
    } else {
      // Fallback for unsupported chars
      values.push(0); // Space
    }
  }

  // Calculate checksum: (START_CODE_B + sum(val * (idx + 1))) % 103
  let checksumTotal = START_CODE_B;
  for (let i = 0; i < values.length; i++) {
    checksumTotal += values[i] * (i + 1);
  }
  const checksum = checksumTotal % 103;

  // Build full sequence of symbols
  const fullSymbols = [START_CODE_B, ...values, checksum, STOP_CODE];

  // Convert to boolean modules (true = black bar, false = white space)
  const modules: boolean[] = [];

  for (let symIdx = 0; symIdx < fullSymbols.length; symIdx++) {
    const patternStr = CODE128_PATTERNS[fullSymbols[symIdx]];
    let isBar = true; // Starts with bar, alternates with space
    for (let charIdx = 0; charIdx < patternStr.length; charIdx++) {
      const width = parseInt(patternStr[charIdx], 10);
      for (let w = 0; w < width; w++) {
        modules.push(isBar);
      }
      isBar = !isBar;
    }
  }

  // Add 2-module termination bar at the very end
  modules.push(true, true);

  return { modules, checksum };
}

/**
 * Generates an SVG string representation of a Code128 barcode.
 */
export function generateCode128SvgString(
  text: string,
  options: BarcodeOptions = {}
): string {
  const {
    height = 50,
    barWidth = 1.5,
    includeText = true,
    fontSize = 11,
    color = '#000000',
    backgroundColor = '#ffffff',
  } = options;

  const sanitized = text || '000000';
  const { modules } = encodeCode128B(sanitized);

  const quietZone = 10; // Modules on left and right
  const totalModules = modules.length + quietZone * 2;
  const svgWidth = Math.ceil(totalModules * barWidth);
  const textHeight = includeText ? fontSize + 4 : 0;
  const svgHeight = height + textHeight;

  // Build rects for consecutive true modules
  const rects: string[] = [];
  let currentStart: number | null = null;

  for (let i = 0; i < modules.length; i++) {
    if (modules[i]) {
      if (currentStart === null) currentStart = i;
    } else {
      if (currentStart !== null) {
        const x = (quietZone + currentStart) * barWidth;
        const w = (i - currentStart) * barWidth;
        rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${color}" />`);
        currentStart = null;
      }
    }
  }

  if (currentStart !== null) {
    const x = (quietZone + currentStart) * barWidth;
    const w = (modules.length - currentStart) * barWidth;
    rects.push(`<rect x="${x.toFixed(2)}" y="0" width="${w.toFixed(2)}" height="${height}" fill="${color}" />`);
  }

  const textElement = includeText
    ? `<text x="${(svgWidth / 2).toFixed(2)}" y="${(height + fontSize + 2).toFixed(2)}" font-family="monospace, monospace" font-size="${fontSize}" font-weight="bold" text-anchor="middle" fill="${color}">${sanitized}</text>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${svgWidth} ${svgHeight}" width="${svgWidth}" height="${svgHeight}" style="background-color: ${backgroundColor};">
    ${rects.join('\n    ')}
    ${textElement}
  </svg>`;
}

/**
 * Zero-dependency pure TypeScript QR Code generator (ISO/IEC 18004).
 * Generates clean, crisp SVG elements or strings completely offline.
 * Ideal for UPI payments, product stickers, and offline invoice verification.
 */

// GF(256) math for Reed-Solomon error correction
const EXP_TABLE = new Uint8Array(256);
const LOG_TABLE = new Uint8Array(256);

(function initGaloisField() {
  let x = 1;
  for (let i = 0; i < 255; i++) {
    EXP_TABLE[i] = x;
    LOG_TABLE[x] = i;
    x <<= 1;
    if (x & 0x100) {
      x ^= 0x11d; // Primitive polynomial x^8 + x^4 + x^3 + x^2 + 1
    }
  }
  for (let i = 255; i < 256; i++) {
    EXP_TABLE[i] = EXP_TABLE[i - 255];
  }
})();

function gfMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0;
  return EXP_TABLE[(LOG_TABLE[x] + LOG_TABLE[y]) % 255];
}

function polyMul(p1: number[], p2: number[]): number[] {
  const result = new Array(p1.length + p2.length - 1).fill(0);
  for (let i = 0; i < p1.length; i++) {
    for (let j = 0; j < p2.length; j++) {
      result[i + j] ^= gfMul(p1[i], p2[j]);
    }
  }
  return result;
}

function polyRemainder(dividend: number[], divisor: number[]): number[] {
  let result = [...dividend];
  while (result.length >= divisor.length) {
    const lead = result[0];
    if (lead !== 0) {
      for (let i = 0; i < divisor.length; i++) {
        result[i] ^= gfMul(divisor[i], lead);
      }
    }
    result.shift();
  }
  return result;
}

function getGeneratorPoly(degree: number): number[] {
  let g = [1];
  for (let i = 0; i < degree; i++) {
    g = polyMul(g, [1, EXP_TABLE[i]]);
  }
  return g;
}

// Version table capacities for Byte Mode (L, M, Q, H)
// [totalCodewords, ecCodewords, ecBlocksGroup1, dataCodewordsGroup1, ecBlocksGroup2, dataCodewordsGroup2]
interface VersionInfo {
  version: number;
  totalCodewords: number;
  ecCodewords: number;
  numBlocks: number;
}

const VERSIONS: VersionInfo[] = [
  { version: 1, totalCodewords: 26, ecCodewords: 10, numBlocks: 1 }, // 1-M (up to 14 bytes)
  { version: 2, totalCodewords: 44, ecCodewords: 16, numBlocks: 1 }, // 2-M (up to 26 bytes)
  { version: 3, totalCodewords: 70, ecCodewords: 26, numBlocks: 1 }, // 3-M (up to 42 bytes)
  { version: 4, totalCodewords: 100, ecCodewords: 36, numBlocks: 2 }, // 4-M (up to 62 bytes)
  { version: 5, totalCodewords: 134, ecCodewords: 48, numBlocks: 2 }, // 5-M (up to 84 bytes)
  { version: 6, totalCodewords: 172, ecCodewords: 64, numBlocks: 4 }, // 6-M (up to 106 bytes)
];

export interface QrCodeOptions {
  size?: number;
  margin?: number;
  color?: string;
  backgroundColor?: string;
}

export function generateQrMatrix(text: string): boolean[][] {
  const textBytes = new TextEncoder().encode(text);
  
  // Select best version (1 to 6)
  let chosenVersion: VersionInfo = VERSIONS[0];
  let dataCapacity = 0;
  for (const v of VERSIONS) {
    const dataCodewords = v.totalCodewords - v.ecCodewords;
    // Overhead: 4 bits mode (0100 for Byte) + 8 bits length indicator = 12 bits = 1.5 bytes
    if (dataCodewords >= textBytes.length + 3) {
      chosenVersion = v;
      dataCapacity = dataCodewords;
      break;
    }
  }

  if (dataCapacity === 0) {
    // Text exceeds capacity of version 6, fall back to version 6
    chosenVersion = VERSIONS[VERSIONS.length - 1];
    dataCapacity = chosenVersion.totalCodewords - chosenVersion.ecCodewords;
  }

  // 1. Bitstream assembly
  const bits: number[] = [];
  function pushBits(val: number, length: number) {
    for (let i = length - 1; i >= 0; i--) {
      bits.push((val >> i) & 1);
    }
  }

  // Byte mode indicator: 0100
  pushBits(0b0100, 4);
  // Character count indicator (8 bits for versions 1-9 in Byte mode)
  pushBits(Math.min(textBytes.length, 255), 8);
  // Text payload
  for (let i = 0; i < textBytes.length; i++) {
    pushBits(textBytes[i], 8);
  }
  // Terminator: up to 4 zero bits
  const totalDataBits = dataCapacity * 8;
  const terminatorBits = Math.min(4, totalDataBits - bits.length);
  pushBits(0, terminatorBits);
  // Pad with zeroes to next byte boundary
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }
  // Pad bytes: alternate 0xEC (236) and 0x11 (17)
  const padPatterns = [0b11101100, 0b00010001];
  let padIdx = 0;
  while (bits.length < totalDataBits) {
    pushBits(padPatterns[padIdx % 2], 8);
    padIdx++;
  }

  // Convert bits to byte codewords
  const dataCodewords: number[] = [];
  for (let i = 0; i < bits.length; i += 8) {
    let byteVal = 0;
    for (let b = 0; b < 8; b++) {
      byteVal = (byteVal << 1) | bits[i + b];
    }
    dataCodewords.push(byteVal);
  }

  // 2. Reed-Solomon Error Correction Code
  const ecPerBlock = chosenVersion.ecCodewords / chosenVersion.numBlocks;
  const dataPerBlock = Math.floor(dataCapacity / chosenVersion.numBlocks);
  const genPoly = getGeneratorPoly(ecPerBlock);

  const dataBlocks: number[][] = [];
  const ecBlocks: number[][] = [];

  for (let b = 0; b < chosenVersion.numBlocks; b++) {
    const start = b * dataPerBlock;
    const blockData = dataCodewords.slice(start, start + dataPerBlock);
    dataBlocks.push(blockData);

    const padded = [...blockData, ...new Array(ecPerBlock).fill(0)];
    const remainder = polyRemainder(padded, genPoly);
    const ec = new Array(ecPerBlock).fill(0);
    for (let i = 0; i < remainder.length; i++) {
      ec[ecPerBlock - remainder.length + i] = remainder[i];
    }
    ecBlocks.push(ec);
  }

  // Interleave data codewords and EC codewords
  const finalCodewords: number[] = [];
  for (let i = 0; i < dataPerBlock; i++) {
    for (let b = 0; b < chosenVersion.numBlocks; b++) {
      finalCodewords.push(dataBlocks[b][i]);
    }
  }
  for (let i = 0; i < ecPerBlock; i++) {
    for (let b = 0; b < chosenVersion.numBlocks; b++) {
      finalCodewords.push(ecBlocks[b][i]);
    }
  }

  // 3. Matrix construction
  const size = chosenVersion.version * 4 + 17;
  const matrix: (boolean | null)[][] = Array.from({ length: size }, () =>
    new Array(size).fill(null)
  );

  // Function to place 7x7 finder pattern
  function placeFinder(row: number, col: number) {
    for (let r = 0; r < 7; r++) {
      for (let c = 0; c < 7; c++) {
        const isBlack =
          r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4);
        matrix[row + r][col + c] = isBlack;
      }
    }
    // Separator
    for (let r = -1; r <= 7; r++) {
      for (let c = -1; c <= 7; c++) {
        if (
          (r === -1 || r === 7 || c === -1 || c === 7) &&
          row + r >= 0 &&
          row + r < size &&
          col + c >= 0 &&
          col + c < size
        ) {
          matrix[row + r][col + c] = false;
        }
      }
    }
  }

  placeFinder(0, 0);
  placeFinder(0, size - 7);
  placeFinder(size - 7, 0);

  // Timing patterns
  for (let i = 8; i < size - 8; i++) {
    const val = i % 2 === 0;
    if (matrix[6][i] === null) matrix[6][i] = val;
    if (matrix[i][6] === null) matrix[i][6] = val;
  }

  // Dark module
  matrix[4 * chosenVersion.version + 9][8] = true;

  // Format info area (placeholder reserved, mask 000 with Level M => format string 101010000010010)
  const formatBits = [1, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0, 0, 1, 0];
  // Around top-left finder
  const formatCoordsTopLeft: [number, number][] = [
    [8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8],
    [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]
  ];
  for (let i = 0; i < 15; i++) {
    const [r, c] = formatCoordsTopLeft[i];
    matrix[r][c] = formatBits[i] === 1;
  }
  // Around bottom-left & top-right
  for (let i = 0; i < 7; i++) {
    matrix[size - 1 - i][8] = formatBits[i] === 1;
  }
  for (let i = 0; i < 8; i++) {
    matrix[8][size - 8 + i] = formatBits[7 + i] === 1;
  }

  // Convert final codewords to bitstream
  const matrixBits: boolean[] = [];
  for (const cw of finalCodewords) {
    for (let b = 7; b >= 0; b--) {
      matrixBits.push(((cw >> b) & 1) === 1);
    }
  }

  // Place data bits with zig-zag pattern (right to left, 2 columns at a time)
  let bitIdx = 0;
  let upward = true;
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--; // Skip timing column
    const rows = upward
      ? Array.from({ length: size }, (_, i) => size - 1 - i)
      : Array.from({ length: size }, (_, i) => i);

    for (const row of rows) {
      for (const c of [col, col - 1]) {
        if (matrix[row][c] === null) {
          const bit = bitIdx < matrixBits.length ? matrixBits[bitIdx++] : false;
          // Apply Mask 0: (row + col) % 2 == 0
          const mask = (row + c) % 2 === 0;
          matrix[row][c] = mask ? !bit : bit;
        }
      }
    }
    upward = !upward;
  }

  // Convert nulls to false
  return matrix.map((row) => row.map((cell) => cell ?? false));
}

/**
 * Generates an SVG string representation of a QR code.
 */
export function generateQrCodeSvgString(
  text: string,
  options: QrCodeOptions = {}
): string {
  const {
    size = 120,
    margin = 2,
    color = '#000000',
    backgroundColor = '#ffffff',
  } = options;

  const matrix = generateQrMatrix(text || ' ');
  const matrixSize = matrix.length;
  const totalModules = matrixSize + margin * 2;
  const cellSize = size / totalModules;

  const rects: string[] = [];
  for (let r = 0; r < matrixSize; r++) {
    for (let c = 0; c < matrixSize; c++) {
      if (matrix[r][c]) {
        const x = ((c + margin) * cellSize).toFixed(2);
        const y = ((r + margin) * cellSize).toFixed(2);
        const w = (cellSize + 0.1).toFixed(2); // slight overlap to avoid subpixel antialiasing gaps
        rects.push(`<rect x="${x}" y="${y}" width="${w}" height="${w}" fill="${color}" />`);
      }
    }
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" style="background-color: ${backgroundColor};">
    ${rects.join('\n    ')}
  </svg>`;
}

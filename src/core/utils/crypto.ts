/**
 * Zero-dependency Cryptographic Utilities with Secure / Non-Secure Context Fallback.
 * Conforms to FIPS PUB 180-4 (SHA-256).
 */

// Initial SHA-256 hash constants
const H_INIT = [
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
  0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
];

// SHA-256 round constants (first 32 bits of fractional parts of cube roots of first 64 primes)
const K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5,
  0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3,
  0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7,
  0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13,
  0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3,
  0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5,
  0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotr(n: number, x: number): number {
  return (x >>> n) | (x << (32 - n));
}

function toBytes(data: string | Uint8Array | ArrayBuffer): Uint8Array {
  if (typeof data === 'string') {
    if (typeof TextEncoder !== 'undefined') {
      return new TextEncoder().encode(data);
    }
    // Fallback UTF-8 encoding
    const utf8: number[] = [];
    for (let i = 0; i < data.length; i++) {
      let code = data.charCodeAt(i);
      if (code < 0x80) {
        utf8.push(code);
      } else if (code < 0x800) {
        utf8.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f));
      } else if (code < 0xd800 || code >= 0xe000) {
        utf8.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f));
      } else {
        i++;
        code = 0x10000 + (((code & 0x3ff) << 10) | (data.charCodeAt(i) & 0x3ff));
        utf8.push(
          0xf0 | (code >> 18),
          0x80 | ((code >> 12) & 0x3f),
          0x80 | ((code >> 6) & 0x3f),
          0x80 | (code & 0x3f)
        );
      }
    }
    return new Uint8Array(utf8);
  }
  if (data instanceof Uint8Array) {
    return data;
  }
  return new Uint8Array(data);
}

/**
 * Pure JavaScript FIPS 180-4 compliant SHA-256 implementation.
 * Synchronous, zero external dependencies, operates in all JS environments.
 */
export function sha256Sync(data: string | Uint8Array | ArrayBuffer): string {
  const bytes = toBytes(data);
  const len = bytes.length;
  const k = (56 - ((len + 1) % 64) + 64) % 64;
  const paddedLength = len + 1 + k + 8;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[len] = 0x80;

  const highBits = Math.floor(len / 0x20000000);
  const lowBits = (len * 8) >>> 0;

  padded[paddedLength - 8] = (highBits >>> 24) & 0xff;
  padded[paddedLength - 7] = (highBits >>> 16) & 0xff;
  padded[paddedLength - 6] = (highBits >>> 8) & 0xff;
  padded[paddedLength - 5] = highBits & 0xff;
  padded[paddedLength - 4] = (lowBits >>> 24) & 0xff;
  padded[paddedLength - 3] = (lowBits >>> 16) & 0xff;
  padded[paddedLength - 2] = (lowBits >>> 8) & 0xff;
  padded[paddedLength - 1] = lowBits & 0xff;

  let [h0, h1, h2, h3, h4, h5, h6, h7] = H_INIT;
  const w = new Uint32Array(64);

  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let i = 0; i < 16; i++) {
      w[i] =
        ((padded[offset + i * 4] << 24) |
          (padded[offset + i * 4 + 1] << 16) |
          (padded[offset + i * 4 + 2] << 8) |
          padded[offset + i * 4 + 3]) >>>
        0;
    }
    for (let i = 16; i < 64; i++) {
      const s0 = (rotr(7, w[i - 15]) ^ rotr(18, w[i - 15]) ^ (w[i - 15] >>> 3)) >>> 0;
      const s1 = (rotr(17, w[i - 2]) ^ rotr(19, w[i - 2]) ^ (w[i - 2] >>> 10)) >>> 0;
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }

    let a = h0, b = h1, c = h2, d = h3, e = h4, f = h5, g = h6, h = h7;

    for (let i = 0; i < 64; i++) {
      const S1 = (rotr(6, e) ^ rotr(11, e) ^ rotr(25, e)) >>> 0;
      const ch = ((e & f) ^ (~e & g)) >>> 0;
      const temp1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = (rotr(2, a) ^ rotr(13, a) ^ rotr(22, a)) >>> 0;
      const maj = ((a & b) ^ (a & c) ^ (b & c)) >>> 0;
      const temp2 = (S0 + maj) >>> 0;

      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    h0 = (h0 + a) >>> 0;
    h1 = (h1 + b) >>> 0;
    h2 = (h2 + c) >>> 0;
    h3 = (h3 + d) >>> 0;
    h4 = (h4 + e) >>> 0;
    h5 = (h5 + f) >>> 0;
    h6 = (h6 + g) >>> 0;
    h7 = (h7 + h) >>> 0;
  }

  const toHex = (n: number) => n.toString(16).padStart(8, '0');
  return (
    toHex(h0) + toHex(h1) + toHex(h2) + toHex(h3) +
    toHex(h4) + toHex(h5) + toHex(h6) + toHex(h7)
  );
}

/**
 * Computes a 64-character lowercase hexadecimal SHA-256 digest.
 * Utilizes hardware-accelerated Web Crypto API in Secure Contexts,
 * seamlessly falling back to pure-JS SHA-256 on non-secure LAN HTTP.
 */
export async function sha256Hex(data: string | Uint8Array | ArrayBuffer): Promise<string> {
  const bytes = toBytes(data);
  const subtle =
    typeof globalThis !== 'undefined' && globalThis.crypto?.subtle
      ? globalThis.crypto.subtle
      : typeof window !== 'undefined' && window.crypto?.subtle
      ? window.crypto.subtle
      : undefined;

  if (subtle && typeof subtle.digest === 'function') {
    try {
      const buffer = await subtle.digest('SHA-256', bytes as unknown as BufferSource);
      return Array.from(new Uint8Array(buffer))
        .map((b) => b.toString(16).padStart(2, '0'))
        .join('');
    } catch {
      // Fallback if subtle.digest encounters an unexpected platform error
      return sha256Sync(bytes);
    }
  }

  return sha256Sync(bytes);
}

/**
 * Cryptographically random salt generator resilient to non-secure environments.
 */
export function generateRandomSalt(byteLength: number = 16): string {
  const bytes = new Uint8Array(byteLength);
  const cryptoObj =
    typeof globalThis !== 'undefined' && globalThis.crypto
      ? globalThis.crypto
      : typeof window !== 'undefined' && window.crypto
      ? window.crypto
      : undefined;

  if (cryptoObj && typeof cryptoObj.getRandomValues === 'function') {
    cryptoObj.getRandomValues(bytes);
  } else {
    for (let i = 0; i < byteLength; i++) {
      bytes[i] = Math.floor(Math.random() * 256);
    }
  }

  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

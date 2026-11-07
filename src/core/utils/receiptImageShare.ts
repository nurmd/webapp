import { toBlob } from 'html-to-image';
import { normalizeWhatsAppPhone } from './whatsappIntent.ts';
import { safeOpenExternalUrl } from './upiAndShare.ts';
import { getAndroidBridge } from './androidBridge.ts';

/**
 * Captures a styled HTML thermal preview DOM element to a high-resolution PNG Blob via html-to-image.
 * If capture throws, returns null, or yields a suspiciously small/blank image (< 1 KB),
 * falls back to renderThermalReceiptImage (canvas text) when fallbackText is provided.
 */
export async function renderThermalPreviewImage(
  node: HTMLElement,
  fallbackText?: string,
  paperWidth: 32 | 48 = 32
): Promise<Blob> {
  if (!node && !fallbackText) {
    throw new Error('Target node is missing for thermal preview capture');
  }

  try {
    if (!node) {
      throw new Error('Target node is missing for thermal preview capture');
    }
    const blob = await toBlob(node, { cacheBust: true, pixelRatio: 2 });
    if (!blob || blob.size < 1024) {
      if (fallbackText) {
        console.warn(`[share] dom capture produced suspicious/small blob (${blob?.size ?? 0} bytes), falling back to canvas`);
        return await renderThermalReceiptImage(fallbackText, paperWidth);
      }
      throw new Error('html-to-image failed to produce a Blob');
    }
    return blob;
  } catch (err: any) {
    console.warn('[share] dom capture failed:', err);
    if (fallbackText) {
      return await renderThermalReceiptImage(fallbackText, paperWidth);
    }
    throw err;
  }
}

/**
 * Wraps long monospace lines so that no line exceeds paperWidth columns.
 * Breaks on word boundaries (spaces) when possible, or splits long continuous strings.
 */
export function wrapReceiptText(text: string, paperWidth: 32 | 48 = 32): string[] {
  const rawLines = text.split('\n');
  const result: string[] = [];

  for (const rawLine of rawLines) {
    if (rawLine.length <= paperWidth) {
      result.push(rawLine);
      continue;
    }

    let remaining = rawLine;
    while (remaining.length > paperWidth) {
      let breakIdx = remaining.lastIndexOf(' ', paperWidth);
      if (breakIdx <= 0) {
        breakIdx = paperWidth;
      }
      result.push(remaining.substring(0, breakIdx));
      remaining = remaining.substring(breakIdx).trimStart();
    }
    if (remaining.length > 0) {
      result.push(remaining);
    }
  }

  return result;
}

/**
 * Renders a thermal receipt text string onto an offscreen canvas and converts it into a PNG Blob.
 *
 * Canvas specs:
 * - 576px wide for 32 columns (58mm)
 * - 768px wide for 48 columns (80mm)
 * - Monospace font 20px, line-height 26px, padding 24px
 * - Color #0f172a on white background
 */
export function renderThermalReceiptImage(
  text: string,
  paperWidth: 32 | 48
): Promise<Blob> {
  return new Promise<Blob>((resolve, reject) => {
    try {
      if (typeof document === 'undefined') {
        reject(new Error('Document is not defined in this environment'));
        return;
      }

      const width = paperWidth === 32 ? 576 : 768;
      const paddingH = 24;
      const paddingV = 24;
      const lineHeight = 26;
      const lines = wrapReceiptText(text, paperWidth);
      const height = paddingV * 2 + lines.length * lineHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('2D context is unavailable'));
        return;
      }

      // Fill clean white background
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);

      // Render crisp monospace receipt text
      ctx.fillStyle = '#0f172a';
      ctx.font = '20px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';
      ctx.textBaseline = 'top';

      lines.forEach((line, index) => {
        const y = paddingV + index * lineHeight;
        ctx.fillText(line, paddingH, y);
      });

      canvas.toBlob((blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob failed to produce a Blob'));
        }
      }, 'image/png');
    } catch (err) {
      reject(err);
    }
  });
}

/**
 * Converts a Blob to a base64 string without data URL prefix (suitable for Android native bridge).
 */
export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const res = (reader.result as string) || '';
      const commaIdx = res.indexOf(',');
      resolve(commaIdx >= 0 ? res.slice(commaIdx + 1) : res);
    };
    reader.onerror = () => {
      reject(reader.error || new Error('Failed to read blob as base64'));
    };
    reader.readAsDataURL(blob);
  });
}

/**
 * Dispatches thermal receipt image sharing to AndroidBridge if available in the Android container.
 */
export async function shareImageNative(
  blob: Blob,
  fileName: string,
  phone?: string
): Promise<boolean> {
  const bridge = getAndroidBridge();
  if (!bridge || typeof bridge.shareImage !== 'function') return false;
  try {
    const base64 = await blobToBase64(blob);
    bridge.shareImage(base64, fileName, 'Share receipt image', phone);
    return true;
  } catch (err) {
    console.warn('[share] shareImageNative failed:', err);
    return false;
  }
}

/**
 * Shares a thermal receipt image via AndroidBridge or Web Share API (native share sheet on mobile),
 * or falls back to browser download and opening the party's WhatsApp conversation.
 */
export async function shareReceiptImage(
  blob: Blob,
  fileName: string,
  options?: { text?: string; phone?: string }
): Promise<'shared' | 'downloaded' | 'failed' | 'cancelled' | 'copied'> {
  try {
    // 0. Native Android Bridge share sheet (when available in Android WebView)
    const nativeShared = await shareImageNative(blob, fileName, options?.phone);
    if (nativeShared) {
      return 'shared';
    }

    const file = new File([blob], fileName, { type: 'image/png' });

    // 1. Native Web Share API with file support (Android share sheet includes WhatsApp)
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      try {
        await navigator.share({
          files: [file],
          text: options?.text,
        });
        return 'shared';
      } catch (err: any) {
        if (err?.name === 'AbortError' || err?.name === 'NotAllowedError') {
          return 'cancelled';
        }
        return 'failed';
      }
    }

    // 2a. Try copying the image to the clipboard (works in some WebViews)
    if (typeof navigator !== 'undefined' && navigator.clipboard && typeof (navigator.clipboard as any).write === 'function' && typeof (window as any).ClipboardItem === 'function') {
      try {
        const item = new (window as any).ClipboardItem({ 'image/png': blob });
        await (navigator.clipboard as any).write([item]);
        return 'copied';
      } catch (_clipErr) {
        // fall through to download
      }
    }

    // 2b. Fallback: Trigger client-side file download
    if (typeof document !== 'undefined') {
      try {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (_dlErr) {
        // ignore
      }
    }

    // When phone is available, open WhatsApp conversation with deep link
    if (options?.phone) {
      const norm = normalizeWhatsAppPhone(options.phone);
      const digits = norm.valid ? norm.e164 : options.phone.replace(/\D/g, '');
      const encodedText = options.text ? encodeURIComponent(options.text) : '';
      const waUrl = digits
        ? `https://wa.me/${digits}?text=${encodedText}`
        : `https://wa.me/?text=${encodedText}`;
      safeOpenExternalUrl(waUrl);
    }

    return 'downloaded';
  } catch (_err) {
    return 'failed';
  }
}

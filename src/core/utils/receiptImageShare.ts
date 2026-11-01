import { normalizeWhatsAppPhone } from './whatsappIntent.ts';
import { safeOpenExternalUrl } from './upiAndShare.ts';

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
      const lines = text.split('\n');
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
 * Shares a thermal receipt image via the Web Share API (native share sheet on mobile),
 * or falls back to browser download and opening the party's WhatsApp conversation.
 */
export async function shareReceiptImage(
  blob: Blob,
  fileName: string,
  options?: { text?: string; phone?: string }
): Promise<'shared' | 'downloaded' | 'failed'> {
  try {
    const file = new File([blob], fileName, { type: 'image/png' });

    // 1. Native Web Share API with file support (Android share sheet includes WhatsApp)
    if (
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      navigator.canShare({ files: [file] })
    ) {
      await navigator.share({
        files: [file],
        text: options?.text,
      });
      return 'shared';
    }

    // 2. Fallback: Trigger client-side file download
    if (typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
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

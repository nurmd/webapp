/**
 * Client for the extraction proxy (`server/bill-intake`).
 *
 * The browser never holds a model provider key. It sends the document to your own
 * endpoint, which is authenticated with a shared token and returns JSON.
 */
import type { BillIntakeSettings } from './types.ts';

export type IntakeClientErrorCode =
  | 'NOT_CONFIGURED'
  | 'UNSUPPORTED_FILE'
  | 'FILE_TOO_LARGE'
  | 'NETWORK'
  | 'UNAUTHORIZED'
  | 'RATE_LIMITED'
  | 'PROVIDER_ERROR'
  | 'BAD_RESPONSE';

export class IntakeClientError extends Error {
  code: IntakeClientErrorCode;
  retryable: boolean;

  constructor(code: IntakeClientErrorCode, message: string, retryable = false) {
    super(message);
    this.name = 'IntakeClientError';
    this.code = code;
    this.retryable = retryable;
  }
}

const SUPPORTED_MIME = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/webp',
]);

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const REQUEST_TIMEOUT_MS = 120_000;

function base64FromBytes(bytes: Uint8Array): string {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode.apply(null, Array.from(bytes.subarray(i, i + chunk)) as number[]);
  }
  return btoa(binary);
}

function endpoint(settings: BillIntakeSettings, path: string): string {
  const base = settings.proxyUrl.trim().replace(/\/+$/, '');
  return `${base}${path}`;
}

function authHeaders(settings: BillIntakeSettings): Record<string, string> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (settings.token.trim()) headers.Authorization = `Bearer ${settings.token.trim()}`;
  return headers;
}

export interface ExtractResult {
  data: unknown;
  model?: string;
  provider?: string;
  durationMs?: number;
}

export async function extractFromFile(file: File, settings: BillIntakeSettings): Promise<ExtractResult> {
  if (!settings.proxyUrl.trim()) {
    throw new IntakeClientError('NOT_CONFIGURED', 'Set the extraction service URL in AI Bill Intake settings first.');
  }
  if (!SUPPORTED_MIME.has(file.type)) {
    throw new IntakeClientError('UNSUPPORTED_FILE', `${file.name}: only PDF, JPG, PNG or WEBP are supported.`);
  }
  if (file.size > MAX_FILE_BYTES) {
    throw new IntakeClientError('FILE_TOO_LARGE', `${file.name} is larger than 12 MB. Split or compress the document.`);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(endpoint(settings, '/extract'), {
      method: 'POST',
      headers: authHeaders(settings),
      body: JSON.stringify({
        fileName: file.name,
        mimeType: file.type,
        dataBase64: base64FromBytes(bytes),
      }),
      signal: controller.signal,
    });

    if (response.status === 401 || response.status === 403) {
      throw new IntakeClientError('UNAUTHORIZED', 'The extraction service rejected the access token.');
    }
    if (response.status === 429) {
      throw new IntakeClientError('RATE_LIMITED', 'Too many documents in flight. Try again in a minute.', true);
    }
    if (!response.ok) {
      const detail = await safeText(response);
      throw new IntakeClientError('PROVIDER_ERROR', `Extraction failed (${response.status}). ${detail}`);
    }

    const payload = (await response.json()) as ExtractResult;
    if (!payload || typeof payload !== 'object' || payload.data === undefined) {
      throw new IntakeClientError('BAD_RESPONSE', 'The extraction service returned an empty result.');
    }
    return payload;
  } catch (error) {
    if (error instanceof IntakeClientError) throw error;
    if ((error as Error)?.name === 'AbortError') {
      throw new IntakeClientError('NETWORK', 'Extraction timed out after two minutes.', true);
    }
    throw new IntakeClientError('NETWORK', `Could not reach the extraction service. ${(error as Error)?.message || ''}`.trim(), true);
  } finally {
    clearTimeout(timer);
  }
}

export async function checkExtractionService(settings: BillIntakeSettings): Promise<{ ok: boolean; model?: string; provider?: string; message?: string }> {
  if (!settings.proxyUrl.trim()) return { ok: false, message: 'No service URL configured.' };
  try {
    const response = await fetch(endpoint(settings, '/health'), {
      method: 'GET',
      headers: authHeaders(settings),
    });
    if (!response.ok) return { ok: false, message: `Health check returned ${response.status}.` };
    const body = (await response.json()) as { ok?: boolean; model?: string; provider?: string };
    return { ok: Boolean(body.ok), model: body.model, provider: body.provider };
  } catch (error) {
    return { ok: false, message: (error as Error)?.message || 'Service unreachable.' };
  }
}

async function safeText(response: Response): Promise<string> {
  try {
    const text = await response.text();
    return text.slice(0, 300);
  } catch {
    return '';
  }
}

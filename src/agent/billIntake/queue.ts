/**
 * Review queue persistence.
 *
 * Drafts live in localStorage so the queue survives reloads and works offline —
 * consistent with the rest of the offline-first app. Documents themselves are
 * never persisted here, only the extracted data (no invoice images in the browser
 * beyond the lifetime of the upload request).
 */
import type { IntakeDraft } from './types.ts';

const QUEUE_KEY = 'gst_bill_intake_queue_v1';
const MAX_DRAFTS = 120;
const KEEP_RAW_TEXT = 2000;
const MAX_RAW_TEXT_LENGTH = 20000;

type Listener = (drafts: IntakeDraft[]) => void;
const listeners = new Set<Listener>();

function decode(): IntakeDraft[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as IntakeDraft[]) : [];
  } catch {
    return [];
  }
}

function emit(drafts: IntakeDraft[]): void {
  listeners.forEach((fn) => fn(drafts));
}

function persist(drafts: IntakeDraft[]): void {
  const trimmed = prune(drafts);
  try {
    localStorage.setItem(QUEUE_KEY, JSON.stringify(trimmed));
  } catch {
    // Quota exhausted: drop raw text and keep the structured data.
    const lean = trimmed.map((d) => ({ ...d, raw: { ...d.raw, rawText: undefined } }));
    try {
      localStorage.setItem(QUEUE_KEY, JSON.stringify(lean));
    } catch {
      /* give up silently; the in-memory queue still works for this session */
    }
  }
  emit(trimmed);
}

function prune(drafts: IntakeDraft[]): IntakeDraft[] {
  const shaped = drafts.map((d) => ({
    ...d,
    raw: {
      ...d.raw,
      rawText: d.raw.rawText && d.status === 'NEEDS_REVIEW' ? d.raw.rawText.slice(0, MAX_RAW_TEXT_LENGTH) : undefined,
    },
  }));
  // Newest first, capped. Open drafts are pinned ahead of closed ones so a busy
  // day of imports can never push a review item out of the queue.
  const isOpen = (d: IntakeDraft) => d.status === 'QUEUED' || d.status === 'NEEDS_REVIEW' || d.status === 'APPROVED';
  const open = shaped.filter(isOpen).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const closed = shaped.filter((d) => !isOpen(d)).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  const capClosed = Math.max(0, MAX_DRAFTS - open.length);
  return [...open, ...closed.slice(0, capClosed)];
}

export const intakeQueue = {
  list(): IntakeDraft[] {
    return decode().sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  },

  get(id: string): IntakeDraft | undefined {
    return decode().find((d) => d.id === id);
  },

  put(draft: IntakeDraft): void {
    const drafts = decode();
    const idx = drafts.findIndex((d) => d.id === draft.id);
    const next = { ...draft, updatedAt: new Date().toISOString() };
    if (idx >= 0) drafts[idx] = next;
    else drafts.unshift(next);
    persist(drafts);
  },

  patch(id: string, patch: Partial<IntakeDraft>): IntakeDraft | undefined {
    const drafts = decode();
    const idx = drafts.findIndex((d) => d.id === id);
    if (idx < 0) return undefined;
    drafts[idx] = { ...drafts[idx], ...patch, updatedAt: new Date().toISOString() };
    persist(drafts);
    return drafts[idx];
  },

  remove(id: string): void {
    persist(decode().filter((d) => d.id !== id));
  },

  clearClosed(): void {
    persist(decode().filter((d) => d.status === 'NEEDS_REVIEW' || d.status === 'APPROVED'));
  },

  subscribe(fn: Listener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  /** Exposed for tests only. */
  _rawTextCap: { KEEP_RAW_TEXT, MAX_RAW_TEXT_LENGTH },
};

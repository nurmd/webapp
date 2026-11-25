export interface SavedDocument {
  kind: string;
  number?: string;
  amount?: number;
}

export function notifyDocumentSaved(doc: SavedDocument): void {
  if (typeof window === 'undefined' || !doc?.kind) return;
  window.dispatchEvent(new CustomEvent('app_document_saved', { detail: doc }));
}

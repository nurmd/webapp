import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CompanyProfile } from '../../models/company.ts';
import type { InventoryItem } from '../../models/item.ts';
import type { Party } from '../../models/party.ts';
import type { PurchaseBill } from '../../models/purchase.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { TableGridPurchaseModal } from './TableGridPurchaseModal.tsx';
import {
  approveDraft,
  ingestFiles,
  ingestGstr2bFile,
  loadContext,
  postDraft,
  postEditedBill,
  rejectDraft,
  runAutoPost,
} from '../../agent/billIntake/agent.ts';
import { intakeQueue } from '../../agent/billIntake/queue.ts';
import { getSettings, saveSettings, subscribeSettings } from '../../agent/billIntake/settings.ts';
import { checkExtractionService } from '../../agent/billIntake/visionClient.ts';
import type { BillIntakeSettings, IntakeDraft, IntakeIssue } from '../../agent/billIntake/types.ts';

interface BillIntakeViewProps {
  company: CompanyProfile;
  parties: Party[];
  itemsCatalog: InventoryItem[];
  onClose: () => void;
  onPosted?: (bill: PurchaseBill) => void;
}

const CONFIDENCE_STYLES: Record<IntakeDraft['confidence']['band'], string> = {
  HIGH: 'bg-secondary/10 text-secondary border-secondary/30',
  MEDIUM: 'bg-amber-50 text-amber-700 border-amber-200',
  LOW: 'bg-error-container text-on-error-container border-error/30',
};

const SEVERITY_STYLES: Record<IntakeIssue['severity'], string> = {
  BLOCKER: 'bg-error-container text-on-error-container',
  WARNING: 'bg-amber-100 text-amber-800',
  INFO: 'bg-surface-container text-on-surface-variant',
};

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return new Date(iso).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

export const BillIntakeView: React.FC<BillIntakeViewProps> = ({ company, parties, itemsCatalog, onClose, onPosted }) => {
  const [drafts, setDrafts] = useState<IntakeDraft[]>(() => intakeQueue.list());
  const [settings, setSettings] = useState<BillIntakeSettings>(() => getSettings());
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [busy, setBusy] = useState<{ active: boolean; message: string }>({ active: false, message: '' });
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error' | 'info'; message: string } | null>(null);
  const [reviewDraft, setReviewDraft] = useState<IntakeDraft | null>(null);
  const [expandedIssues, setExpandedIssues] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const scanInputRef = useRef<HTMLInputElement>(null);
  const jsonInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => intakeQueue.subscribe(setDrafts), []);
  useEffect(() => subscribeSettings(setSettings), []);

  const openCount = useMemo(
    () => drafts.filter((d) => d.status === 'NEEDS_REVIEW' || d.status === 'APPROVED').length,
    [drafts]
  );

  const flash = useCallback((tone: 'ok' | 'error' | 'info', message: string) => {
    setNotice({ tone, message });
    window.setTimeout(() => setNotice(null), 6000);
  }, []);

  const refresh = useCallback(() => setDrafts(intakeQueue.list()), []);

  const handleScan = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      if (!settings.proxyUrl.trim()) {
        setIsSettingsOpen(true);
        flash('error', 'Add your extraction service URL before scanning bills.');
        return;
      }
      setBusy({ active: true, message: `Reading ${list.length} document${list.length > 1 ? 's' : ''}…` });
      try {
        const ctx = loadContext();
        const result = await ingestFiles(list, ctx, settings, (done, total, name) => {
          setBusy({ active: true, message: name ? `Reading ${name} (${done + 1}/${total})…` : 'Finalising…' });
        });
        refresh();

        if (result.drafts.length > 0 && settings.autoPost) {
          const auto = runAutoPost(loadContext(), settings);
          refresh();
          if (auto.posted.length > 0) {
            auto.posted.forEach((d) => onPosted?.(d.bill));
            flash('ok', `${auto.posted.length} bill(s) auto-posted at ${(settings.autoPostThreshold * 100).toFixed(0)}% confidence or better.`);
          }
        }

        if (result.errors.length > 0) {
          flash('error', `${result.errors.length} document(s) failed: ${result.errors[0].message}`);
        } else if (result.drafts.length > 0) {
          const review = result.drafts.filter((d) => d.status === 'NEEDS_REVIEW').length;
          if (review > 0) flash('info', `${result.drafts.length} draft(s) ready — ${review} need review.`);
        }
      } catch (error) {
        flash('error', (error as Error)?.message || 'Scanning failed.');
      } finally {
        setBusy({ active: false, message: '' });
        if (scanInputRef.current) scanInputRef.current.value = '';
      }
    },
    [flash, onPosted, refresh, settings]
  );

  const handleGstr2b = useCallback(
    async (file: File) => {
      setBusy({ active: true, message: `Importing ${file.name}…` });
      try {
        const text = await file.text();
        let json: unknown;
        try {
          json = JSON.parse(text);
        } catch {
          throw new Error('That file is not valid JSON. Download the GSTR-2B JSON from the GST portal and try again.');
        }
        const ctx = loadContext();
        const result = ingestGstr2bFile(json, ctx, settings, file.name);
        refresh();

        if (result.drafts.length === 0) {
          flash('error', result.meta.warnings[0] || 'No B2B invoices found in this file.');
          return;
        }

        if (settings.autoPost) {
          const auto = runAutoPost(loadContext(), settings);
          refresh();
          if (auto.posted.length > 0) {
            auto.posted.forEach((d) => onPosted?.(d.bill));
            flash('ok', `${auto.posted.length} of ${result.drafts.length} 2B invoice(s) auto-posted.`);
            return;
          }
        }

        flash(
          'ok',
          `Imported ${result.meta.invoices} invoice(s) and ${result.meta.creditNotes} credit/debit note(s)${result.meta.period ? ` for ${result.meta.period}` : ''}.`
        );
      } catch (error) {
        flash('error', (error as Error)?.message || 'Could not import the GSTR-2B file.');
      } finally {
        setBusy({ active: false, message: '' });
        if (jsonInputRef.current) jsonInputRef.current.value = '';
      }
    },
    [flash, onPosted, refresh, settings]
  );

  const handleReview = useCallback((draft: IntakeDraft) => {
    // Deliberately does not create the supplier yet — the master stays clean until
    // the bill is actually saved. `postEditedBill` binds a real party at save time.
    setReviewDraft(draft);
  }, []);

  const handlePost = useCallback(
    (draft: IntakeDraft) => {
      const result = postDraft(draft.id);
      refresh();
      if (result.ok && result.bill) {
        onPosted?.(result.bill);
        flash('ok', `Posted ${result.bill.billNumber} · ${formatINR(result.bill.grandTotal)}.`);
      } else {
        flash('error', result.reason || 'Could not post this bill.');
      }
    },
    [flash, onPosted, refresh]
  );

  const handlePostAllEligible = useCallback(() => {
    const auto = runAutoPost(loadContext(), { ...settings, autoPost: true });
    refresh();
    if (auto.posted.length > 0) auto.posted.forEach((d) => onPosted?.(d.bill));
    flash(
      auto.posted.length > 0 ? 'ok' : 'info',
      auto.posted.length > 0
        ? `${auto.posted.length} bill(s) posted, ${auto.held.length} left for review.`
        : 'No drafts clear the confidence bar yet.'
    );
  }, [flash, onPosted, refresh, settings]);

  const handleTestConnection = useCallback(async () => {
    setBusy({ active: true, message: 'Testing extraction service…' });
    const result = await checkExtractionService(settings);
    setBusy({ active: false, message: '' });
    if (result.ok) flash('ok', `Connected to ${result.provider} · ${result.model}.`);
    else flash('error', result.message || 'Service unreachable.');
  }, [flash, settings]);

  const handleFilesDropped = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragging(false);
      const files = event.dataTransfer.files;
      if (!files || files.length === 0) return;
      const jsonFile = Array.from(files).find((f) => f.name.toLowerCase().endsWith('.json'));
      if (jsonFile) {
        void handleGstr2b(jsonFile);
        return;
      }
      void handleScan(files);
    },
    [handleGstr2b, handleScan]
  );

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch sm:items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="w-full h-full sm:h-auto sm:max-h-[92vh] sm:max-w-4xl bg-surface sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden border border-outline-variant">
        {/* Header */}
        <header className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant bg-surface-container-low shrink-0">
          <div className="h-9 w-9 rounded-lg bg-tertiary-fixed text-on-tertiary-fixed flex items-center justify-center shrink-0">
            <span className="material-symbols-outlined text-[20px]">document_scanner</span>
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="font-headline-sm text-headline-sm text-on-surface truncate">AI Bill Intake</h2>
            <p className="text-[11px] text-on-surface-variant truncate">
              {openCount > 0 ? `${openCount} draft${openCount > 1 ? 's' : ''} waiting` : 'Scan supplier invoices or import GSTR-2B'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsSettingsOpen((v) => !v)}
            className="h-9 w-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            title="Intake settings"
          >
            <span className="material-symbols-outlined text-[20px]">tune</span>
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-9 w-9 rounded-full hover:bg-surface-container flex items-center justify-center text-on-surface-variant"
            title="Close"
          >
            <span className="material-symbols-outlined text-[20px]">close</span>
          </button>
        </header>

        <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
          {/* Settings */}
          {isSettingsOpen && (
            <section className="px-4 py-3 border-b border-outline-variant bg-surface-container-low/60 space-y-3">
              <div className="grid gap-2 sm:grid-cols-2">
                <label className="text-[11px] font-semibold text-on-surface-variant">
                  Extraction service URL
                  <input
                    type="url"
                    value={settings.proxyUrl}
                    onChange={(e) => setSettings(saveSettings({ proxyUrl: e.target.value }))}
                    placeholder="https://intake.yourdomain.com"
                    className="mt-1 w-full h-9 px-2 rounded-lg border border-outline-variant bg-surface text-primary text-xs"
                  />
                </label>
                <label className="text-[11px] font-semibold text-on-surface-variant">
                  Access token
                  <input
                    type="password"
                    value={settings.token}
                    onChange={(e) => setSettings(saveSettings({ token: e.target.value }))}
                    placeholder="shared secret"
                    className="mt-1 w-full h-9 px-2 rounded-lg border border-outline-variant bg-surface text-primary text-xs"
                  />
                </label>
              </div>

              <div className="flex flex-wrap items-center gap-4">
                <label className="flex items-center gap-2 text-xs text-on-surface">
                  <input
                    type="checkbox"
                    checked={settings.autoPost}
                    onChange={(e) => setSettings(saveSettings({ autoPost: e.target.checked }))}
                    className="h-4 w-4 accent-orange-600"
                  />
                  Auto-post above threshold
                </label>
                <label className="flex items-center gap-2 text-xs text-on-surface">
                  Threshold
                  <input
                    type="range"
                    min={0.75}
                    max={0.99}
                    step={0.01}
                    value={settings.autoPostThreshold}
                    onChange={(e) => setSettings(saveSettings({ autoPostThreshold: Number(e.target.value) }))}
                    className="w-28 accent-orange-600"
                  />
                  <span className="font-tabular-data w-10">{(settings.autoPostThreshold * 100).toFixed(0)}%</span>
                </label>
                <label className="flex items-center gap-2 text-xs text-on-surface">
                  <input
                    type="checkbox"
                    checked={settings.requireCatalogMatchForAutoPost}
                    onChange={(e) => setSettings(saveSettings({ requireCatalogMatchForAutoPost: e.target.checked }))}
                    className="h-4 w-4 accent-orange-600"
                  />
                  Only known items
                </label>
                <button
                  type="button"
                  onClick={handleTestConnection}
                  className="ml-auto h-8 px-3 rounded-lg border border-outline-variant text-[11px] font-semibold text-on-surface hover:bg-surface-container"
                >
                  Test connection
                </button>
              </div>
              <p className="text-[10px] text-on-surface-variant leading-4">
                Provider API keys live on the service, never in this app. Auto-posting still requires zero blocking
                issues and a known supplier.
              </p>
            </section>
          )}

          {/* Drop zone */}
          <div className="px-4 pt-4">
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={handleFilesDropped}
              className={`rounded-xl border-2 border-dashed p-4 transition-colors ${
                isDragging ? 'border-orange-500 bg-orange-50' : 'border-outline-variant bg-surface-container-low/40'
              }`}
            >
              <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                <span className="material-symbols-outlined text-[28px] text-on-surface-variant">upload_file</span>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-on-surface">Drop invoice PDFs, photos or a GSTR-2B JSON here</p>
                  <p className="text-[10px] text-on-surface-variant">PDF, JPG, PNG, WEBP up to 12 MB · multiple files supported</p>
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => scanInputRef.current?.click()}
                    className="h-9 px-3 rounded-lg bg-orange-600 hover:bg-orange-700 text-white text-[11px] font-bold"
                  >
                    Scan bills
                  </button>
                  <button
                    type="button"
                    onClick={() => jsonInputRef.current?.click()}
                    className="h-9 px-3 rounded-lg border border-outline-variant text-on-surface text-[11px] font-bold hover:bg-surface-container"
                  >
                    GSTR-2B
                  </button>
                </div>
              </div>
              <input
                ref={scanInputRef}
                type="file"
                accept="application/pdf,image/jpeg,image/png,image/webp"
                multiple
                className="hidden"
                onChange={(e) => e.target.files && void handleScan(e.target.files)}
              />
              <input
                ref={jsonInputRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={(e) => e.target.files?.[0] && void handleGstr2b(e.target.files[0])}
              />
            </div>
          </div>

          {busy.active && (
            <div className="mx-4 mt-3 flex items-center gap-2 rounded-lg bg-surface-container px-3 py-2 text-[11px] text-on-surface">
              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              {busy.message}
            </div>
          )}

          {notice && (
            <div
              className={`mx-4 mt-3 rounded-lg px-3 py-2 text-[11px] font-medium ${
                notice.tone === 'error'
                  ? 'bg-error-container text-on-error-container'
                  : notice.tone === 'ok'
                  ? 'bg-secondary/10 text-secondary'
                  : 'bg-surface-container text-on-surface-variant'
              }`}
            >
              {notice.message}
            </div>
          )}

          {/* Queue */}
          <section className="px-4 py-4 space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-[11px] font-bold uppercase tracking-wide text-on-surface-variant">Review queue</h3>
              {drafts.some((d) => d.status === 'NEEDS_REVIEW') && (
                <button
                  type="button"
                  onClick={handlePostAllEligible}
                  className="text-[11px] font-bold text-secondary hover:underline"
                >
                  Post all eligible
                </button>
              )}
            </div>

            {drafts.length === 0 && (
              <div className="rounded-xl border border-outline-variant bg-surface-container-lowest px-4 py-8 text-center">
                <span className="material-symbols-outlined text-[32px] text-outline">inbox</span>
                <p className="mt-1 text-xs font-semibold text-on-surface">No bills yet</p>
                <p className="text-[10px] text-on-surface-variant">
                  Scanned bills appear here with a confidence score before they reach your purchase register.
                </p>
              </div>
            )}

            {drafts.map((draft) => (
              <DraftCard
                key={draft.id}
                draft={draft}
                expanded={expandedIssues === draft.id}
                onToggleIssues={() => setExpandedIssues((cur) => (cur === draft.id ? null : draft.id))}
                onReview={() => handleReview(draft)}
                onPost={() => handlePost(draft)}
                onApprove={() => {
                  approveDraft(draft.id);
                  refresh();
                }}
                onReject={() => {
                  rejectDraft(draft.id, 'Rejected in review');
                  refresh();
                }}
                onDelete={() => {
                  intakeQueue.remove(draft.id);
                  refresh();
                }}
              />
            ))}
          </section>
        </div>
      </div>

      {reviewDraft && (
        <TableGridPurchaseModal
          company={company}
          parties={parties}
          itemsCatalog={itemsCatalog}
          initialBill={reviewDraft.bill}
          onClose={() => setReviewDraft(null)}
          onSave={(bill) => {
            const result = postEditedBill(reviewDraft.id, bill);
            setReviewDraft(null);
            refresh();
            if (result.ok && result.bill) {
              onPosted?.(result.bill);
              flash('ok', `Posted ${result.bill.billNumber} · ${formatINR(result.bill.grandTotal)}.`);
            } else {
              flash('error', result.reason || 'Could not save the purchase bill.');
            }
          }}
        />
      )}
    </div>
  );
};

interface DraftCardProps {
  draft: IntakeDraft;
  expanded: boolean;
  onToggleIssues: () => void;
  onReview: () => void;
  onPost: () => void;
  onApprove: () => void;
  onReject: () => void;
  onDelete: () => void;
}

const DraftCard: React.FC<DraftCardProps> = ({
  draft,
  expanded,
  onToggleIssues,
  onReview,
  onPost,
  onApprove,
  onReject,
  onDelete,
}) => {
  const blockers = draft.issues.filter((i) => i.severity === 'BLOCKER');
  const warnings = draft.issues.filter((i) => i.severity === 'WARNING');
  const isOpen = draft.status === 'NEEDS_REVIEW' || draft.status === 'APPROVED' || draft.status === 'QUEUED';

  return (
    <article className="rounded-xl border border-outline-variant bg-surface-container-lowest overflow-hidden">
      <div className="flex items-start gap-3 p-3">
        <div
          className={`mt-0.5 h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${
            draft.source === 'GSTR2B' ? 'bg-tertiary-fixed text-on-tertiary-fixed' : 'bg-surface-container text-on-surface-variant'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {draft.source === 'GSTR2B' ? 'receipt_long' : 'description'}
          </span>
        </div>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-bold text-on-surface truncate">{draft.supplier.name}</p>
              <p className="text-[10px] text-on-surface-variant truncate">
                {draft.raw.billNumber || 'no number'} · {draft.raw.billDate}
                {draft.raw.supplier.gstin ? ` · ${draft.raw.supplier.gstin}` : ''}
              </p>
            </div>
            <div className="text-right shrink-0">
              <p className="text-xs font-bold font-tabular-data text-on-surface">{formatINR(draft.bill.grandTotal)}</p>
              <span className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[9px] font-bold ${CONFIDENCE_STYLES[draft.confidence.band]}`}>
                {(draft.confidence.score * 100).toFixed(0)}% {draft.confidence.band}
              </span>
            </div>
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {draft.status === 'POSTED' && <Badge tone="ok" icon="check_circle">Posted</Badge>}
            {draft.status === 'DUPLICATE' && <Badge tone="error" icon="content_copy">Duplicate</Badge>}
            {draft.status === 'REJECTED' && <Badge tone="muted" icon="block">Rejected</Badge>}
            {blockers.length > 0 && <Badge tone="error" icon="error">{blockers.length} blocking</Badge>}
            {warnings.length > 0 && <Badge tone="warn" icon="warning">{warnings.length} warning</Badge>}
            <Badge tone="muted" icon="schedule">{relativeTime(draft.createdAt)}</Badge>
            {draft.fileName && <Badge tone="muted" icon="attach_file">{draft.fileName.slice(0, 24)}</Badge>}
          </div>

          {isOpen && (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onReview}
                className="h-8 px-3 rounded-lg bg-primary text-on-primary text-[11px] font-bold"
              >
                Review &amp; edit
              </button>
              <button
                type="button"
                onClick={onPost}
                disabled={blockers.length > 0}
                className="h-8 px-3 rounded-lg bg-secondary text-on-secondary text-[11px] font-bold disabled:opacity-40"
              >
                Post now
              </button>
              {draft.status === 'NEEDS_REVIEW' && (
                <button type="button" onClick={onApprove} className="h-8 px-2 rounded-lg border border-outline-variant text-[11px] font-semibold">
                  Mark checked
                </button>
              )}
              <button type="button" onClick={onReject} className="h-8 px-2 rounded-lg text-[11px] font-semibold text-error hover:bg-error-container/50">
                Reject
              </button>
            </div>
          )}

          {(blockers.length > 0 || warnings.length > 0 || draft.reconciliation.deltas.length > 0) && (
            <button
              type="button"
              onClick={onToggleIssues}
              className="mt-2 text-[10px] font-semibold text-on-surface-variant hover:text-on-surface"
            >
              {expanded ? 'Hide details' : `Why ${blockers.length > 0 ? 'blocked' : 'flagged'}?`}
            </button>
          )}

          {expanded && (
            <div className="mt-2 space-y-1.5 rounded-lg bg-surface-container-low p-2">
              {draft.issues.map((issue, idx) => (
                <div key={`${issue.code}-${idx}`} className={`rounded px-2 py-1 text-[10px] leading-4 ${SEVERITY_STYLES[issue.severity]}`}>
                  {issue.message}
                </div>
              ))}
              {draft.reconciliation.deltas.map((d) => (
                <div key={d.field} className="rounded bg-error-container px-2 py-1 text-[10px] text-on-error-container">
                  {d.field}: printed {d.printed.toFixed(2)} vs computed {d.computed.toFixed(2)} (Δ {d.delta.toFixed(2)})
                </div>
              ))}
              <div className="pt-1 text-[10px] font-semibold text-on-surface-variant">How this score was built</div>
              {draft.confidence.reasons.map((reason, idx) => (
                <div key={idx} className="text-[10px] text-on-surface-variant leading-4">• {reason}</div>
              ))}
            </div>
          )}
        </div>
      </div>

      {draft.status === 'POSTED' && (
        <div className="flex items-center justify-between border-t border-outline-variant px-3 py-1.5">
          <span className="text-[10px] text-secondary font-semibold">Saved to purchase register</span>
          <button type="button" onClick={onDelete} className="text-[10px] text-on-surface-variant hover:text-error">
            Remove from list
          </button>
        </div>
      )}
    </article>
  );
};

const Badge: React.FC<{ tone: 'ok' | 'warn' | 'error' | 'muted'; icon: string; children: React.ReactNode }> = ({ tone, icon, children }) => {
  const tones: Record<string, string> = {
    ok: 'bg-secondary/10 text-secondary',
    warn: 'bg-amber-100 text-amber-800',
    error: 'bg-error-container text-on-error-container',
    muted: 'bg-surface-container text-on-surface-variant',
  };
  return (
    <span className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[9px] font-semibold ${tones[tone]}`}>
      <span className="material-symbols-outlined text-[12px]">{icon}</span>
      {children}
    </span>
  );
};

export default BillIntakeView;

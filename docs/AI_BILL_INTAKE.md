# AI Bill Intake — GST Purchase Automation

Scans supplier invoices (PDF/photo) and GSTR-2B JSON, then prepares a **review-ready
purchase entry** that is identical to one keyed by hand. High-confidence bills can
auto-post; everything else lands in a review queue with the exact reason it was held.

```
┌──────────────────────────────┐        ┌───────────────────────────────┐
│  GSTR-2B / 2A JSON           │        │  Invoice PDF / photo          │
│  (portal download)           │        │  (supplier email, WhatsApp)   │
└──────────────┬───────────────┘        └───────────────┬───────────────┘
               │ deterministic parse                     │ vision model (server side)
               ▼                                         ▼
        ┌──────────────────────────────────────────────────────┐
        │ RawBillExtraction  — text only, never arithmetic      │
        └──────────────────────────┬───────────────────────────┘
                                   ▼
   ┌───────────────────────────────────────────────────────────────┐
   │ IntakeDraft                                                    │
   │  • supplier matched by GSTIN → name (never by LLM guess)       │
   │  • items matched by SKU → name → HSN → token overlap           │
   │  • tax recomputed by src/core/gst/calculator.ts                │
   │  • printed totals reconciled against computed totals           │
   │  • duplicate detection (supplier GSTIN + document number)      │
   │  • confidence score from verifiable facts only                 │
   └──────────────────────────┬────────────────────────────────────┘
                              ▼
        ┌─────────────────────┴──────────────────────┐
        │ score ≥ threshold, zero blockers           │ any blocker / low score
        ▼                                            ▼
  db.savePurchase()  → stock + ledger + audit   Review queue → TableGridPurchaseModal
```

## Why this shape

The failure mode that costs money is not "the model couldn't read the bill" — it is
"the model read 1,180 as 11,800 and nobody noticed". So the design never lets a model
produce a number that reaches the ledger:

| Layer | Responsibility | Trust |
|---|---|---|
| Extraction (LLM) | Transcribe text, GSTIN, HSN, quantities, printed totals | **Untrusted** |
| GST engine (`src/core/gst/`) | Recompute every taxable value and tax head | Authoritative |
| Reconciliation | Diff computed vs printed; mismatch = blocker | Authoritative |
| Entity matching | Resolve supplier/items against local masters | Deterministic |
| Confidence | Score from verifiable facts, not model self-report | Deterministic |

Consequences:

- A misread digit cannot silently change the tax amount — it surfaces as a `TOTAL_MISMATCH` blocker.
- An invalid GSTIN is caught by the Luhn Mod-36 checksum before it reaches the ledger.
- The same invoice arriving twice (email + WhatsApp + 2B) is caught by supplier GSTIN + bill number.
- GSTR-2B imports involve **no model at all** and are therefore the highest-trust path.

## Confidence scoring

Scores are additive, out of 1.00:

| Signal | Weight |
|---|---|
| Supplier GSTIN passes checksum | 0.16 |
| Supplier matched to an existing party | 0.10 |
| Bill number + date present | 0.10 |
| Lines complete (qty, rate, HSN, statutory slab) | 0.22 |
| Reconciliation with printed totals | 0.24 |
| Catalog coverage of line items | 0.10 |
| Document type recognised | 0.08 |

Penalties: each warning −0.03, reverse charge −0.08, import −0.08, duplicate caps the
score at 0.20.

Bands: **HIGH ≥ 0.92**, **MEDIUM ≥ 0.75**, **LOW** otherwise or any blocker.

Auto-posting requires **all** of:

1. zero `BLOCKER` issues,
2. score ≥ `autoPostThreshold` (default 0.92),
3. supplier already exists in the ledger (default on),
4. every line item exists in the inventory catalog (default on).

Anything else waits for a human. The defaults are deliberately conservative — a
wrong purchase entry corrupts stock, payables, GSTR-3B ITC and the audit trail at once.

## Blockers vs warnings

**Blockers** (never auto-post, cannot be posted without editing):

- Missing supplier name, bill number or bill date
- Unreadable line quantity or rate
- Computed totals disagree with printed totals beyond tolerance
- Bill addressed to a different GSTIN (wrong recipient)
- Duplicate of an existing purchase

**Warnings** (postable, score reduced):

- Missing supplier GSTIN (no ITC)
- Non-statutory GST slab
- Missing HSN/SAC
- Future-dated or older-than-a-year bill
- Composition supplier (ITC ineligible)
- Unknown supplier state

## Setup

### 1. Extraction service

Provider keys must never ship inside the PWA/APK, so extraction runs through a small
zero-dependency proxy.

```bash
cd server/bill-intake
cp .env.example .env          # fill in GEMINI_API_KEY or OPENAI_API_KEY
node --env-file=.env server.mjs
```

Health check: `GET http://localhost:8787/health`

Provider options:

| `EXTRACTION_PROVIDER` | Models | Notes |
|---|---|---|
| `gemini` (default) | `gemini-2.5-flash`, `gemini-2.5-pro` | Strong document OCR, native PDF input, cheapest per page |
| `openai` | `gpt-4.1`, `gpt-4o` | Uses the Responses API with `input_file` for PDFs |

Deployment: any container host (Fly.io, Render, Railway, a VPS behind Nginx, or a
Cloudflare Tunnel to an on-prem box). It is stateless — no database, no document storage.

### 2. Point the app at it

Purchases → **AI Intake** → gear icon → set the service URL and access token.
"Test connection" confirms the provider and model.

The URL and token are stored in `localStorage` (`gst_bill_intake_settings_v1`), matching
the app's offline-first policy.

### 3. Scan

- **Scan bills** — drop one or many PDFs/photos. Each is extracted, reconciled and queued.
- **GSTR-2B** — drop the portal JSON. Invoices and credit/debit notes become drafts immediately.
- **Review & edit** — opens the normal `TableGridPurchaseModal` pre-filled with the draft.
- **Post now** — writes to the purchase register (stock, ledger vouchers, audit trail).
- **Post all eligible** — batch auto-post above threshold.

## GSTR-2B specifics

2B reports HSN, rate, taxable value and tax amounts — but **not quantity or item names**.
Lines are therefore grouped per (HSN, rate) and imported as value lines; the draft says so
with a `QTY_NOT_REPORTED` info issue. Fill quantities before posting, or scan the matching
PDF to enrich the same bill.

Imports (`impg` / `impgsez`) are skipped with a warning: they belong in the Bill of Entry
flow, not a plain purchase invoice.

Credit notes (`cdnr`, `ntty = C`) become purchase returns; supplier debit notes become bills.

## Storage

| What | Where |
|---|---|
| Settings | `localStorage` → `gst_bill_intake_settings_v1` |
| Review queue | `localStorage` → `gst_bill_intake_queue_v1` |
| Posted bills | Normal purchase register (`db.savePurchase`) |
| Documents | Never persisted; uploaded per request, not retained |

Queue is capped at 120 drafts, open drafts are never evicted, and `rawText` is dropped
once a draft leaves review.

## Security and compliance

- **No provider keys in the client.** The proxy holds them.
- **Shared-token auth** on every `/extract` call (`INTAKE_TOKEN`), plus a per-IP rate limit.
- **No document retention** on the service; logs contain file name, size, model and latency only.
- **DPDP Act 2023 / data residency:** invoice images contain customer and supplier PII. If you
  need in-country processing, use an Indian region deployment of the proxy, or run a local
  vision model (vLLM + Qwen2.5-VL / Llama 3.2 Vision) by pointing `OPENAI_BASE_URL` at it.
- **Audit trail:** every posted bill emits the standard SHA-256 chained audit record from
  `db.savePurchase`; provenance (source file, confidence) is recorded in the bill's `notes`.
- **RBAC:** the intake button should be hidden from `CASHIER`; posting is an accounting action.

## Cost estimate

Rough figures at typical volume (one invoice = 1–2 pages):

| Volume/month | Model | Approx. cost |
|---|---|---|
| 500 bills | Gemini 2.5 Flash | ₹150 – ₹400 |
| 5,000 bills | Gemini 2.5 Flash | ₹1,500 – ₹4,000 |
| 5,000 bills | GPT-4.1 | ₹8,000 – ₹15,000 |

GSTR-2B imports are free — no model is called.

## Limitations (known and deliberate)

1. **Handwritten bills** — transcription quality drops sharply; expect LOW confidence and manual review.
2. **2B has no quantity** — see above.
3. **Multi-page bills with a summary page** — the model sees the whole PDF, but totals pages are occasionally missed; reconciliation catches it.
4. **TDS/TCS lines** are treated as document noise and not modelled in `PurchaseBill` (the ledger has no TDS account).
5. **Queue does not sync across devices** — it is local, like drafts. Posted bills do sync via PouchDB.
6. **No 2B reconciliation report yet** — comparing the purchase register against 2B (missing/extra invoices) is the natural next feature.

## Roadmap

1. **2B ↔ register reconciliation** — flag invoices in 2B that were never booked, and booked bills absent from 2B.
2. **Email ingestion** — a mailbox poller drops attachments into the same `ingestFiles` path.
3. **Batch enrichment** — after the 2B import, fetch the matching IRP e-invoice JSON by IRN to fill quantities.
4. **Learning loop** — remember corrections per supplier (item mapping, GST slab) and pre-apply them next month.
5. **Duplicate supplier de-dup** — auto-merge "Sharma Traders" and "Sharma Traders Pvt Ltd".

## File map

```
src/agent/billIntake/
  types.ts          contracts
  schema.ts         defensive normalisation of model output
  matcher.ts        supplier/item/duplicate resolution
  reconcile.ts      recompute + diff vs printed totals
  confidence.ts     scoring + auto-post gate
  toPurchaseBill.ts draft → PurchaseBill
  gstr2b.ts         deterministic GSTR-2B/2A parser
  queue.ts          localStorage review queue
  settings.ts       local configuration
  visionClient.ts   proxy client
  agent.ts          orchestrator (ingest → build → post)

src/components/Purchases/BillIntakeView.tsx   review UI
server/bill-intake/server.mjs                 extraction proxy
server/bill-intake/prompt.txt                 extraction prompt (server-side, versioned)
```

## Tests

```bash
npm run test -- billIntake
```

Covers 2B parsing, reconciliation tolerance, GSTIN/name/item matching, duplicate
detection, coercion of messy model output, and the auto-post gate.

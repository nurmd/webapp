# Manual Conflict-Review & Resolution Runbook

> **Standard Operating Procedure for Production CouchDB / PouchDB Conflict Resolution**
>
> Vyapar Books Multi-Terminal Synchronization Engine

---

## 1. Safety & Production Integrity Invariants

1. **Strictly No Automated Resolution**:
   - Never auto-resolve, bulk-resolve, arbitrarily merge, or write production CouchDB data from a review or diagnostics surface.
   - Every revision conflict represents diverging multi-terminal business state that requires deliberate human review.
2. **Mandatory Backup & Offline Restore Verification**:
   - Always back up first and prove that the backup can be successfully restored offline before executing any write or deletion in production CouchDB.
   - Verify cryptographic checksums and document counts before proceeding.
3. **Local-Only & Zero Credential Leaks**:
   - Never commit or log credentials, basic auth strings, or bearer tokens in manifest files, diagnostics, or URLs.
   - Use environment variables (`COUCHDB_URL`) when invoking export scripts and verify that output paths have strict permissions (`0700`/`0600`).

---

## 2. Pre-Resolution Step: Export Read-Only Manifest & Backup

Before reviewing or touching any live database records, generate a complete read-only conflict inventory using `scripts/conflict-manifest.ts`:

```bash
# Export read-only manifest and sensitive backup bundle
COUCHDB_URL='https://user:password@couchdb.example.com/db' \
  node --experimental-strip-types scripts/conflict-manifest.ts --out ~/conflict-review/$(date +%Y%m%d_%H%M%S)

# Verify the backup integrity offline
node --experimental-strip-types scripts/conflict-manifest.ts \
  --verify-only ~/conflict-review/<timestamp>/conflict-backup.json
```

- This script executes HTTP `GET` requests only (`/`, `/_all_docs?conflicts=true`, and `/{doc}?rev=`). It never performs `PUT`, `POST`, or `DELETE`.
- The generated `conflict-manifest.json` redacts credentials and tokens.
- The `conflict-backup.json` contains full revision bodies for emergency disaster recovery.

---

## 3. Review & Comparison Process

1. Open the **Settings → Data & Sync** tab.
2. Navigate to the **Revision Conflict Queue** card.
3. For each conflicted document, expand the row to view the detail comparison panel.
4. Compare **Version A (Winning)** and **Version B (Conflicting)** field-by-field:
   - Identify whether differences stem from concurrent terminal updates, outdated cached states, or incomplete offline sync.
   - Review statutory tax fields, invoice totals, payments, and timestamps.

---

## 4. Resolution Order: Dependency Hierarchy

Conflicts must be reviewed and resolved in strict topological dependency order to avoid orphaned relationships or referential drift:

```
1. Company Profile (company:COMP-001)
   └── 2. Synced Settings (settings:app_settings company object)
       └── 3. Catalog & Inventory Items (item:*)
           └── 4. Parties / Customers & Suppliers (party:*)
               └── 5. Financial Documents (invoice:*, purchase:*, voucher:*)
```

### Critical Company Baseline Invariants:
When resolving company records or settings conflicts, ensure the authentic production merchant data is preserved:
- **Business Name**: `Brahmaputra Hardware`
- **GSTIN**: `18ADHPL1415E1ZX`
- **Invoice Prefix**: `INV/26-27/`
- **Cash Account (`ACC_CASH`) Opening Balance**: `35000`

---

## 5. Demo Data & Tombstone Guardrails

1. **Demo Data Isolation**:
   - Keep demo data completely isolated from production.
   - Never clear, overwrite, or disable `brahmaputrahw.store` with sample demo store contents.
2. **Anti-Resurrection Tombstones**:
   - Do NOT delete or resolve away `tombstone:*DEMO*` anti-resurrection markers.
   - Replicated tombstones prevent previously purged sample demo records from resurrecting across distributed PouchDB nodes.

---

## 6. Post-Resolution Verification Checklist

Following manual resolution of all items in the queue, verify the system against this mandatory checklist:

- [ ] **Conflicts Count**: Queue badge displays `0 Conflicts • Verified Clean`.
- [ ] **Sync State**: Sync badge and indicators reflect truthful state (`synced` or `online`) with `0` pending changes.
- [ ] **Dashboard Totals**: Verify Sales, Purchases, and Cash/Bank balances reconcile accurately on the Dashboard.
- [ ] **Invoice Numbering**: Verify sequential numbering integrity and ensure the next invoice number resolves to `#INV/26-27/0012`.
- [ ] **Deferred Compaction**: CouchDB database compaction and view reindexing remain deferred until after operational validation.

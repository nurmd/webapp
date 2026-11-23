---
name: vyapar-data-sync
description: >-
  Use when touching persistence, PouchDB documents, synced storage keys, BroadcastChannel
  updates, tombstones, cross-device reconciliation, conflict review, or when a new entity
  type must sync between devices in Vyapar Books.
---

# Persistence & Cross-Device Sync

## Safety (non-negotiable)
- Never write, resolve, merge or bulk-resolve production CouchDB/PouchDB data. The user
  fixes records manually in the app.
- Conflict comparison UI is read-only.
- Back up and verify restore before any production write.
- Preserve the production company `Brahmaputra Hardware` (GSTIN `18ADHPL1415E1ZX`,
  invoice prefix `INV/26-27/`) and `ACC_CASH` opening balance `35000`.

## Adding a synced entity
Copy the `party_category` / `unit` pattern:
1. Add the key to `STORAGE_KEYS` and to `SYNCED_KEYS` in `src/services/db/syncStorage.ts`.
2. Handle all four paths: local mutation, incoming change, delete tombstone, and
   `reconcileCollection`.
3. Add the PouchDB doc type mapping in `src/services/pouchdb.ts`.
4. Emit a BroadcastChannel change on save/delete (`broadcastChange(type, action, id, payload)`).
5. Merge partial incoming records with the stored record; never overwrite baseline metadata.
6. Add tests for local save, incoming save, incoming delete, and reconcile both sides.

## Tombstones
Deletes record `{ id, deletedAt }`. An incoming tombstone removes the local record; a stale
incoming save must not resurrect a tombstoned record.

## Reconcile
`reconcileCollection` merges by `id` (or `code` fallback for keyed collections), keeping the
newer `updatedAt`. A reconcile must never drop fields that exist on only one side.

## Checklist
- [ ] key in `SYNCED_KEYS`.
- [ ] all four sync paths handled.
- [ ] PouchDB mapping added.
- [ ] broadcast emitted.
- [ ] partial merge is non-destructive.
- [ ] tests for save / delete / reconcile.

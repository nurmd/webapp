/**
 * @module Parties
 * @description Customer & Supplier Ledger and Directory Domain Module.
 * 
 * Provides:
 * - Party model (Customer vs Supplier, Registered B2B vs Unregistered B2C).
 * - Real-time party balance tracking (Receivables & Payables).
 * - Party directory listing, detailed transaction statements, and quick-picker modals.
 * - Customer/Supplier Luhn Mod 36 GSTIN and State Code linking.
 */

export * from '../../models/party.ts';
export { PartiesView } from '../../components/Parties/PartiesView.tsx';
export { SelectPartyModal } from '../../components/Parties/SelectPartyModal.tsx';
export { PartyDetailModal } from '../../components/Parties/PartyDetailModal.tsx';

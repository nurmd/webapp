import React, { useState } from 'react';
import { Party, PartyType } from '../../models/party.ts';
import { validateGstin } from '../../core/gst/validator.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { Search, Plus, Users, CheckCircle, AlertCircle, Edit, Trash2, X } from 'lucide-react';

interface PartiesViewProps {
  parties: Party[];
  onSaveParty: (party: Party) => void;
  onDeleteParty: (id: string) => void;
}

export const PartiesView: React.FC<PartiesViewProps> = ({
  parties,
  onSaveParty,
  onDeleteParty,
}) => {
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState<'ALL' | 'CUSTOMER' | 'SUPPLIER'>('ALL');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingParty, setEditingParty] = useState<Party | null>(null);

  // GSTIN feedback
  const [gstinFeedback, setGstinFeedback] = useState<string | null>(null);

  const filtered = parties.filter((p) => {
    const matchesSearch =
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
      p.phone.includes(search);
    const matchesType = typeFilter === 'ALL' || p.type === typeFilter;
    return matchesSearch && matchesType;
  });

  const openNewParty = () => {
    setEditingParty({
      id: `PTY-${Date.now()}`,
      name: '',
      type: 'CUSTOMER',
      phone: '',
      email: '',
      gstin: '',
      pan: '',
      stateCode: '27',
      billingAddress: '',
      currentBalance: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setGstinFeedback(null);
    setIsModalOpen(true);
  };

  const openEditParty = (party: Party) => {
    setEditingParty({ ...party });
    setGstinFeedback(null);
    setIsModalOpen(true);
  };

  const handleGstinChange = (value: string) => {
    if (!editingParty) return;
    const clean = value.toUpperCase().trim();
    setEditingParty({ ...editingParty, gstin: clean });

    if (clean.length === 15) {
      const res = validateGstin(clean);
      if (res.isValid) {
        setGstinFeedback(`Valid: ${res.stateName} (PAN: ${res.pan})`);
        setEditingParty((prev) =>
          prev ? { ...prev, gstin: clean, stateCode: res.stateCode || prev.stateCode, pan: res.pan || prev.pan } : null
        );
      } else {
        setGstinFeedback(`Invalid: ${res.error}`);
      }
    } else {
      setGstinFeedback(null);
    }
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingParty || !editingParty.name) return;
    onSaveParty({
      ...editingParty,
      updatedAt: new Date().toISOString(),
    });
    setIsModalOpen(false);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
            Parties Directory (Customers & Suppliers)
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            GSTIN registry, state codes, and ledger outstanding balances
          </div>
        </div>

        <button
          onClick={openNewParty}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            backgroundColor: '#2563eb',
            color: '#fff',
            border: 'none',
            padding: '0.5rem 0.85rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.85rem',
          }}
        >
          <Plus size={15} /> Add Party
        </button>
      </div>

      {/* Filter and Search */}
      <div style={{
        display: 'flex',
        gap: '0.75rem',
        alignItems: 'center',
        backgroundColor: '#1e293b',
        padding: '0.75rem',
        borderRadius: '8px',
        border: '1px solid #334155',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, backgroundColor: '#0f172a', padding: '0.4rem 0.75rem', borderRadius: '6px', border: '1px solid #334155' }}>
          <Search size={16} color="#94a3b8" />
          <input
            type="text"
            placeholder="Search party by name, phone, or GSTIN..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value as any)}
          style={{
            backgroundColor: '#0f172a',
            border: '1px solid #334155',
            color: '#fff',
            padding: '0.45rem 0.75rem',
            borderRadius: '6px',
            fontSize: '0.85rem',
          }}
        >
          <option value="ALL">All Parties</option>
          <option value="CUSTOMER">Customers Only</option>
          <option value="SUPPLIER">Suppliers Only</option>
        </select>
      </div>

      {/* Parties Table */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Party Name</th>
              <th style={{ padding: '0.75rem 1rem' }}>Type</th>
              <th style={{ padding: '0.75rem 1rem' }}>Phone</th>
              <th style={{ padding: '0.75rem 1rem' }}>GSTIN</th>
              <th style={{ padding: '0.75rem 1rem' }}>State</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Outstanding Balance</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((party) => (
              <tr key={party.id} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                  {party.name}
                  {party.email && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{party.email}</div>}
                </td>
                <td style={{ padding: '0.75rem 1rem' }}>
                  <span style={{
                    padding: '2px 6px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    backgroundColor: party.type === 'CUSTOMER' ? '#1e3a8a' : '#3730a3',
                    color: party.type === 'CUSTOMER' ? '#93c5fd' : '#c7d2fe',
                  }}>
                    {party.type}
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                  {party.phone}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#38bdf8' }}>
                  {party.gstin || <span style={{ color: '#64748b' }}>Unregistered</span>}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                  {party.stateCode}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: party.currentBalance > 0 ? '#f59e0b' : '#10b981' }}>
                  {formatINR(party.currentBalance)}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => openEditParty(party)}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => onDeleteParty(party.id)}
                      style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer' }}
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Modal */}
      {isModalOpen && editingParty && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(15, 23, 42, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 50,
          padding: '1rem',
        }}>
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '8px',
            border: '1px solid #334155',
            width: '100%',
            maxWidth: '560px',
            padding: '1.5rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '1rem',
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#f8fafc' }}>
                {editingParty.id.startsWith('PTY-') ? 'Add New Party' : 'Edit Party'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Business / Party Name *</label>
                  <input
                    type="text"
                    required
                    value={editingParty.name}
                    onChange={(e) => setEditingParty({ ...editingParty, name: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Party Type</label>
                  <select
                    value={editingParty.type}
                    onChange={(e) => setEditingParty({ ...editingParty, type: e.target.value as PartyType })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  >
                    <option value="CUSTOMER">Customer (Debtor)</option>
                    <option value="SUPPLIER">Supplier (Creditor)</option>
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>
                  GSTIN (15 Digits)
                </label>
                <input
                  type="text"
                  maxLength={15}
                  placeholder="e.g. 27AAACS1429B1Z8"
                  value={editingParty.gstin || ''}
                  onChange={(e) => handleGstinChange(e.target.value)}
                  style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                />
                {gstinFeedback && (
                  <div style={{
                    fontSize: '0.75rem',
                    marginTop: '3px',
                    color: gstinFeedback.startsWith('Valid') ? '#4ade80' : '#ef4444',
                  }}>
                    {gstinFeedback}
                  </div>
                )}
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Phone Number</label>
                  <input
                    type="text"
                    value={editingParty.phone}
                    onChange={(e) => setEditingParty({ ...editingParty, phone: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>State</label>
                  <select
                    value={editingParty.stateCode}
                    onChange={(e) => setEditingParty({ ...editingParty, stateCode: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  >
                    {getStateList().map((s) => (
                      <option key={s.code} value={s.code}>
                        {s.code} - {s.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Billing Address</label>
                <textarea
                  rows={2}
                  value={editingParty.billingAddress}
                  onChange={(e) => setEditingParty({ ...editingParty, billingAddress: e.target.value })}
                  style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  style={{ backgroundColor: 'transparent', border: '1px solid #334155', color: '#94a3b8', padding: '0.4rem 0.8rem', borderRadius: '4px', cursor: 'pointer' }}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  style={{ backgroundColor: '#2563eb', color: '#fff', border: 'none', padding: '0.4rem 1rem', borderRadius: '4px', cursor: 'pointer', fontWeight: 600 }}
                >
                  Save Party
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

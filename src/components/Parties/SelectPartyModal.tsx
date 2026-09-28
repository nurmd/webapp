import React, { useState } from 'react';
import { Party } from '../../models/party.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { Search, UserCheck, Plus, X, Building, Phone, ArrowRight } from 'lucide-react';

interface SelectPartyModalProps {
  parties: Party[];
  onSelectParty: (party: Party) => void;
  onClose: () => void;
  onAddNewParty: () => void;
}

export const SelectPartyModal: React.FC<SelectPartyModalProps> = ({
  parties,
  onSelectParty,
  onClose,
  onAddNewParty,
}) => {
  const [search, setSearch] = useState('');

  const filtered = parties.filter(
    (p) =>
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.gstin && p.gstin.toLowerCase().includes(search.toLowerCase())) ||
      p.phone.includes(search)
  );

  return (
    <div style={{
      position: 'fixed',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: 'rgba(10, 15, 29, 0.85)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 70,
      padding: '1rem',
    }}>
      <div style={{
        backgroundColor: '#162035',
        borderRadius: '12px',
        border: '1px solid #273754',
        width: '100%',
        maxWidth: '520px',
        maxHeight: '85vh',
        display: 'flex',
        flexDirection: 'column',
        boxShadow: 'var(--card-shadow-lg)',
      }}>
        {/* Header */}
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #273754',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <div>
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Select Customer / Party
            </h3>
            <p style={{ fontSize: '0.75rem', color: '#94a3b8', margin: '2px 0 0 0' }}>
              Choose registered B2B customer or retail party
            </p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
            <X size={20} />
          </button>
        </div>

        {/* Search & Add New button */}
        <div style={{ padding: '0.85rem 1.25rem', display: 'flex', gap: '0.5rem', borderBottom: '1px solid #273754' }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            backgroundColor: '#0a0f1d',
            flex: 1,
            padding: '0.45rem 0.75rem',
            borderRadius: '6px',
            border: '1px solid #273754',
          }}>
            <Search size={16} color="#94a3b8" />
            <input
              type="text"
              placeholder="Search by name, GSTIN, or phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              autoFocus
              style={{
                background: 'none',
                border: 'none',
                color: '#fff',
                outline: 'none',
                width: '100%',
                fontSize: '0.85rem',
              }}
            />
          </div>

          <button
            onClick={onAddNewParty}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.3rem',
              backgroundColor: '#00875a',
              color: '#fff',
              border: 'none',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
              fontSize: '0.8rem',
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={14} /> Add New
          </button>
        </div>

        {/* List of Parties */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem 1.25rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {filtered.length === 0 ? (
            <div style={{ padding: '2rem', textAlign: 'center', color: '#94a3b8', fontSize: '0.85rem' }}>
              No parties found matching "{search}".
            </div>
          ) : (
            filtered.map((party) => (
              <div
                key={party.id}
                onClick={() => onSelectParty(party)}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#131b2e',
                  padding: '0.75rem 1rem',
                  borderRadius: '8px',
                  border: '1px solid #273754',
                  cursor: 'pointer',
                  transition: 'border-color 0.15s, background-color 0.15s',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = '#2563eb';
                  e.currentTarget.style.backgroundColor = '#1c273f';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = '#273754';
                  e.currentTarget.style.backgroundColor = '#131b2e';
                }}
              >
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                    <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.9rem' }}>{party.name}</span>
                    <span style={{
                      fontSize: '0.7rem',
                      padding: '1px 6px',
                      borderRadius: '4px',
                      backgroundColor: party.gstin ? 'rgba(37, 99, 235, 0.2)' : 'rgba(100, 116, 139, 0.2)',
                      color: party.gstin ? '#93c5fd' : '#94a3b8',
                      fontWeight: 600,
                    }}>
                      {party.gstin ? 'B2B GST' : 'Retail / Unreg'}
                    </span>
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px', display: 'flex', gap: '0.75rem' }}>
                    <span>Phone: {party.phone}</span>
                    <span>State: {party.stateCode}</span>
                  </div>
                  {party.gstin && (
                    <div style={{ fontSize: '0.75rem', color: '#38bdf8', marginTop: '2px', fontFamily: 'monospace' }}>
                      GSTIN: {party.gstin}
                    </div>
                  )}
                </div>

                <div style={{ textAlign: 'right' }}>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Balance</div>
                  <div style={{ fontSize: '0.9rem', fontWeight: 700, color: party.currentBalance > 0 ? '#f59e0b' : '#6cf8bb' }}>
                    {formatINR(party.currentBalance)}
                  </div>
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};

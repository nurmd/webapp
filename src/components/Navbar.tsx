import React from 'react';
import { CompanyProfile } from '../models/company.ts';
import { ShieldCheck, Monitor, Smartphone, Globe, Plus, ShoppingCart } from 'lucide-react';

interface NavbarProps {
  company: CompanyProfile;
  onNewInvoice: () => void;
  onQuickPos: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ company, onNewInvoice, onQuickPos }) => {
  return (
    <header style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '0.875rem 1.5rem',
      backgroundColor: '#1e293b',
      borderBottom: '1px solid #334155',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
        <div style={{
          width: '38px',
          height: '38px',
          borderRadius: '8px',
          backgroundColor: '#2563eb',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontWeight: 'bold',
          color: '#ffffff',
          fontSize: '1.2rem',
        }}>
          ₹
        </div>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              {company.businessName}
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              backgroundColor: '#1e3a8a',
              color: '#93c5fd',
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              fontWeight: 500,
            }}>
              <ShieldCheck size={12} />
              GSTIN: {company.gstin}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {company.address} • Phone: {company.phone}
          </div>
        </div>
      </div>

      {/* Cross-Platform Badges & Quick Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: '#0f172a',
          padding: '0.35rem 0.75rem',
          borderRadius: '6px',
          border: '1px solid #334155',
          fontSize: '0.75rem',
          color: '#94a3b8'
        }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#60a5fa' }} title="Web / PWA">
            <Globe size={13} /> Web
          </span>
          <span>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80' }} title="Android & iOS">
            <Smartphone size={13} /> Mobile
          </span>
          <span>•</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#c084fc' }} title="Linux & Windows">
            <Monitor size={13} /> Desktop
          </span>
        </div>

        <button
          onClick={onQuickPos}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: '#059669',
            color: '#ffffff',
            border: 'none',
            padding: '0.5rem 0.85rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          <ShoppingCart size={16} />
          POS Billing
        </button>

        <button
          onClick={onNewInvoice}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            padding: '0.5rem 0.85rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600,
            fontSize: '0.875rem',
          }}
        >
          <Plus size={16} />
          New Invoice
        </button>
      </div>
    </header>
  );
};

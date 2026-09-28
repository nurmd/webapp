import React from 'react';
import { CompanyProfile } from '../models/company.ts';
import { ShieldCheck, Monitor, Smartphone, Globe, Plus, ShoppingCart, Bell, Search, CheckCircle2 } from 'lucide-react';

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
      padding: '0.75rem 1.5rem',
      backgroundColor: '#0f172a',
      borderBottom: '1px solid #334155',
      flexShrink: 0,
      gap: '1rem',
      flexWrap: 'wrap',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
        {/* Brand Logo from Stitch */}
        <img
          src="/logo.svg"
          alt="Vyapar Modern Logo"
          style={{ width: '38px', height: '38px', borderRadius: '10px', boxShadow: '0 2px 8px rgba(0,0,0,0.3)' }}
          onError={(e) => {
            // Fallback if SVG fails to load
            (e.target as HTMLElement).style.display = 'none';
          }}
        />

        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#f8fafc', margin: 0 }}>
              {company.businessName}
            </h1>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.25rem',
              fontSize: '0.75rem',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              fontWeight: 700,
              border: '1px solid rgba(16, 185, 129, 0.3)',
            }}>
              <CheckCircle2 size={12} />
              GSTIN Active: {company.gstin}
            </span>
          </div>
          <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {company.address} • Ph: {company.phone}
          </div>
        </div>
      </div>

      {/* Cross-Platform Badges & Quick Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '0.5rem',
          backgroundColor: '#1e293b',
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
          <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80' }} title="Android APK">
            <Smartphone size={13} /> Android
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
            fontWeight: 700,
            fontSize: '0.85rem',
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
            fontWeight: 700,
            fontSize: '0.85rem',
          }}
        >
          <Plus size={16} />
          New Invoice
        </button>

        {/* Profile Avatar from Stitch */}
        <img
          src="/avatar.png"
          alt="Merchant Profile"
          style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            objectFit: 'cover',
            border: '2px solid #3b82f6',
          }}
          onError={(e) => {
            (e.target as HTMLElement).style.display = 'none';
          }}
        />
      </div>
    </header>
  );
};

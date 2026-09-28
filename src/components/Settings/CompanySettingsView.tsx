import React, { useState } from 'react';
import { CompanyProfile } from '../../models/company.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { validateGstin } from '../../core/gst/validator.ts';
import { Save, CheckCircle, ShieldCheck } from 'lucide-react';

interface CompanySettingsViewProps {
  company: CompanyProfile;
  onSave: (updated: CompanyProfile) => void;
}

export const CompanySettingsView: React.FC<CompanySettingsViewProps> = ({
  company,
  onSave,
}) => {
  const [profile, setProfile] = useState<CompanyProfile>({ ...company });
  const [feedback, setFeedback] = useState<string | null>(null);
  const [savedNotice, setSavedNotice] = useState(false);

  const handleGstinChange = (value: string) => {
    const clean = value.toUpperCase().trim();
    setProfile({ ...profile, gstin: clean });

    if (clean.length === 15) {
      const res = validateGstin(clean);
      if (res.isValid) {
        setFeedback(`Valid GSTIN: State ${res.stateName}, PAN ${res.pan}`);
        setProfile((prev) => ({
          ...prev,
          gstin: clean,
          stateCode: res.stateCode || prev.stateCode,
          pan: res.pan || prev.pan,
        }));
      } else {
        setFeedback(`Validation Error: ${res.error}`);
      }
    } else {
      setFeedback(null);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(profile);
    setSavedNotice(true);
    setTimeout(() => setSavedNotice(false), 3000);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem', maxWidth: '800px' }}>
      <div>
        <h2 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
          Business Profile & GST Settings
        </h2>
        <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
          Configures tax identification, print headers, and banking / UPI details
        </div>
      </div>

      <form onSubmit={handleSubmit} style={{ backgroundColor: '#1e293b', padding: '1.5rem', borderRadius: '8px', border: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
        {/* Business details */}
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#60a5fa', marginBottom: '0.75rem' }}>
            Legal Entity Details
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Legal Business Name *</label>
              <input
                type="text"
                required
                value={profile.businessName}
                onChange={(e) => setProfile({ ...profile, businessName: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Trade Name (Brand)</label>
              <input
                type="text"
                value={profile.tradeName || ''}
                onChange={(e) => setProfile({ ...profile, tradeName: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>

        {/* GSTIN and State */}
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#60a5fa', marginBottom: '0.75rem' }}>
            GSTIN & Location
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Company GSTIN (15 Digits) *</label>
              <input
                type="text"
                required
                maxLength={15}
                value={profile.gstin}
                onChange={(e) => handleGstinChange(e.target.value)}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
              {feedback && (
                <div style={{ fontSize: '0.75rem', marginTop: '3px', color: feedback.startsWith('Valid') ? '#4ade80' : '#ef4444' }}>
                  {feedback}
                </div>
              )}
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Home State *</label>
              <select
                value={profile.stateCode}
                onChange={(e) => setProfile({ ...profile, stateCode: e.target.value })}
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

          <div style={{ marginTop: '0.75rem' }}>
            <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Address</label>
            <textarea
              rows={2}
              value={profile.address}
              onChange={(e) => setProfile({ ...profile, address: e.target.value })}
              style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem', marginTop: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Contact Phone</label>
              <input
                type="text"
                value={profile.phone}
                onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Email</label>
              <input
                type="email"
                value={profile.email}
                onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>

        {/* Banking and UPI */}
        <div>
          <h3 style={{ fontSize: '0.95rem', fontWeight: 600, color: '#60a5fa', marginBottom: '0.75rem' }}>
            Bank Details & UPI Payment QR
          </h3>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Bank Name</label>
              <input
                type="text"
                value={profile.bankName || ''}
                onChange={(e) => setProfile({ ...profile, bankName: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Account Number</label>
              <input
                type="text"
                value={profile.accountNumber || ''}
                onChange={(e) => setProfile({ ...profile, accountNumber: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>IFSC Code</label>
              <input
                type="text"
                value={profile.ifscCode || ''}
                onChange={(e) => setProfile({ ...profile, ifscCode: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>

            <div>
              <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>UPI Virtual ID (for QR code)</label>
              <input
                type="text"
                placeholder="yourbusiness@bank"
                value={profile.upiId || ''}
                onChange={(e) => setProfile({ ...profile, upiId: e.target.value })}
                style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
              />
            </div>
          </div>
        </div>

        {/* Invoice terms */}
        <div>
          <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Invoice Default Terms & Conditions</label>
          <textarea
            rows={3}
            value={profile.termsAndConditions || ''}
            onChange={(e) => setProfile({ ...profile, termsAndConditions: e.target.value })}
            style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
          />
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid #334155', paddingTop: '1rem' }}>
          {savedNotice ? (
            <span style={{ color: '#4ade80', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <CheckCircle size={15} /> Company profile updated successfully!
            </span>
          ) : <span />}

          <button
            type="submit"
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
              backgroundColor: '#2563eb',
              color: '#fff',
              border: 'none',
              padding: '0.5rem 1.25rem',
              borderRadius: '6px',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            <Save size={16} /> Save Profile Settings
          </button>
        </div>
      </form>
    </div>
  );
};

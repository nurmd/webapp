import React from 'react';
import { CompanyProfile } from '../../../models/company.ts';

export interface SettingsSubModalProps {
  activeSubModal: string | null;
  setActiveSubModal: (subModal: string | null) => void;
  isGstActive: boolean;
  stateName: string;
  profile: CompanyProfile;
  defaultPrintOption: string;
  handleDefaultPrintOptionChange: (option: string) => void;
}

export const SettingsSubModal: React.FC<SettingsSubModalProps> = ({
  activeSubModal,
  setActiveSubModal,
  isGstActive,
  stateName,
  profile,
  defaultPrintOption,
  handleDefaultPrintOptionChange,
}) => {
  if (!activeSubModal) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl max-w-md w-full p-5 shadow-2xl border border-outline-variant/30 flex flex-col gap-3">
        <div className="flex items-center justify-between pb-2 border-b border-outline-variant/20">
          <h4 className="font-headline-sm text-sm font-bold text-on-surface capitalize">
            {activeSubModal.replace('_', ' ')}
          </h4>
          <button
            onClick={() => setActiveSubModal(null)}
            className="w-7 h-7 rounded-full bg-surface-container-low flex items-center justify-center text-on-surface-variant cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">close</span>
          </button>
        </div>

        <div className="text-xs text-on-surface-variant space-y-2 py-2">
          {!isGstActive && ['tax_rates', 'place_of_supply', 'eway_bill'].includes(activeSubModal) && (
            <div className="p-2.5 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 font-medium flex items-center gap-2 mb-2">
              <span className="material-symbols-outlined text-[18px] flex-shrink-0">warning</span>
              <span>GST is currently disabled. Toggle &quot;Enable GST Billing&quot; in settings to apply these tax rules to your bills.</span>
            </div>
          )}

          {activeSubModal === 'tax_rates' && (
            <>
              <p className="font-semibold text-on-surface">Standard GST Tax Slabs Configured:</p>
              <ul className="list-disc pl-4 space-y-1">
                <li>0% (Exempt: Essential Food, Unbranded grains)</li>
                <li>5% (Standard: Tea, Spices, Sugar, Edible Oils)</li>
                <li>12% (Standard: Processed food, butter, ghee)</li>
                <li>18% (Standard: Household goods, soap, stationery, electronics)</li>
                <li>28% (Luxury &amp; Sin: Pan masala, premium goods)</li>
              </ul>
              <p className="text-secondary font-bold pt-1">
                Reverse Charge Mechanism (RCM) and Compensation Cess can be toggled on per item.
              </p>
            </>
          )}

          {activeSubModal === 'place_of_supply' && (
            <>
              <p className="font-semibold text-on-surface">State Tax Engine (Intra vs. Inter-state):</p>
              <p>
                When party state equals <strong>{stateName} ({profile.stateCode})</strong>, the app automatically bifurcates tax into <strong>CGST (50%)</strong> and <strong>SGST (50%)</strong>.
              </p>
              <p>
                For different states, <strong>IGST (100%)</strong> is automatically applied according to Indian GST law.
              </p>
            </>
          )}

          {activeSubModal === 'eway_bill' && (
            <>
              <p className="font-semibold text-on-surface">Government NIC E-Way Bill Integration:</p>
              <p>
                Consignments exceeding <strong>₹50,000</strong> invoice value automatically generate compliant JSON payloads for direct upload to <code>ewaybillgst.gov.in</code>.
              </p>
              <p className="text-secondary font-bold">
                Vehicle Number, Transporter ID, and Distance (km) fields are ready on B2B invoices.
              </p>
            </>
          )}

          {activeSubModal === 'printing' && (
            <div className="space-y-4">
              <div>
                <p className="font-semibold text-on-surface text-sm">Choose Default Invoice Print Format</p>
                <p className="text-xs text-on-surface-variant mt-0.5">
                  Select which format automatically launches whenever you open, preview, or print bills on this device:
                </p>
              </div>

              <div className="space-y-2.5">
                {[
                  {
                    id: 'A4',
                    title: 'A4 Modern Laser (Full Sheet)',
                    desc: 'Full tax invoice with detailed tax breakup table, company logo, terms & signature stamp.',
                    icon: 'description',
                  },
                  {
                    id: 'Thermal-80mm',
                    title: '3-Inch (80mm) ESC/POS Thermal Slip',
                    desc: 'Countertop high-speed receipt printer (48 columns) with UPI QR code & cash drawer kick.',
                    icon: 'receipt_long',
                  },
                  {
                    id: 'Thermal-58mm',
                    title: '2-Inch (58mm) Mobile Bluetooth Slip',
                    desc: 'Handheld portable battery receipt printer (32 columns) for mobile sales & rapid billing.',
                    icon: 'receipt',
                  },
                ].map((fmt) => {
                  const isSelected =
                    defaultPrintOption === fmt.id ||
                    (fmt.id === 'A4' && (!defaultPrintOption || defaultPrintOption === 'None'));
                  return (
                    <div
                      key={fmt.id}
                      onClick={() => handleDefaultPrintOptionChange(fmt.id)}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 cursor-pointer transition-all ${
                        isSelected
                          ? 'border-secondary bg-secondary/10 shadow-xs ring-1 ring-secondary'
                          : 'border-outline-variant/30 bg-surface-container-low hover:bg-surface-container'
                      }`}
                    >
                      <div className="flex items-start gap-3 min-w-0">
                        <div
                          className={`w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0 ${
                            isSelected ? 'bg-secondary text-on-secondary' : 'bg-surface-container text-on-surface'
                          }`}
                        >
                          <span className="material-symbols-outlined text-[20px]">{fmt.icon}</span>
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-bold text-on-surface flex items-center gap-2">
                            <span>{fmt.title}</span>
                            {isSelected && (
                              <span className="px-1.5 py-0.5 rounded text-[10px] bg-secondary text-on-secondary font-bold">
                                Active Default
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-on-surface-variant mt-0.5 leading-snug">{fmt.desc}</p>
                        </div>
                      </div>
                      <div
                        className={`w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                          isSelected ? 'border-secondary bg-secondary text-on-secondary' : 'border-outline-variant'
                        }`}
                      >
                        {isSelected && <span className="material-symbols-outlined text-[13px] font-bold">check</span>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {activeSubModal === 'prefix_series' && (
            <>
              <p className="font-semibold text-on-surface">Invoice Numbering Configuration:</p>
              <p>
                Current series starts with: <code>{profile.invoicePrefix || 'INV-2024-'}</code> followed by 4-digit incremental counters.
              </p>
              <p>
                You can change your custom invoice prefix anytime via the <strong>Edit Profile</strong> button.
              </p>
            </>
          )}

          {activeSubModal === 'whatsapp_alerts' && (
            <>
              <p className="font-semibold text-on-surface">Automated WhatsApp Reminders:</p>
              <p>
                One-tap customer ledger sharing generates polite, vernacular payment reminders in English and Hindi (हिंदी) with a dynamic UPI pay link pre-populated with your VPA (<code>{profile.upiId || 'Not set'}</code>).
              </p>
            </>
          )}

          {activeSubModal === 'banking_upi' && (
            <>
              <p className="font-semibold text-on-surface">Bank & Dynamic UPI QR Setup:</p>
              <p>
                Linked Bank: <strong>{profile.bankName || 'Not set'}</strong> ({profile.accountNumber || 'No A/C'})
              </p>
              <p>
                IFSC: <strong>{profile.ifscCode || 'None'}</strong>
              </p>
              <p>
                UPI VPA: <strong>{profile.upiId || 'None'}</strong>
              </p>
            </>
          )}

          {activeSubModal === 'staff_roles' && (
            <>
              <p className="font-semibold text-on-surface">Role-Based Access Control (RBAC):</p>
              <ul className="list-disc pl-4 space-y-1">
                <li><strong>Business Owner</strong>: Full administrative privileges, invoice deletion, settings &amp; updates.</li>
                <li><strong>Cashier / POS Staff</strong>: Quick billing, scan &amp; print only. No invoice deletion.</li>
                <li><strong>Chartered Accountant (CA)</strong>: Read-only access to GSTR reports, balance sheet, and daybook.</li>
              </ul>
              <p className="text-secondary font-bold pt-1">
                Switch roles anytime via the top-right profile icon or drawer using your 4-digit security PIN.
              </p>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setActiveSubModal(null)}
          className="w-full py-2.5 rounded-xl bg-surface-container text-on-surface font-bold text-xs hover:bg-surface-container-high transition-colors cursor-pointer"
        >
          Close
        </button>
      </div>
    </div>
  );
};

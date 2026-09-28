import React from 'react';
import { Invoice } from '../../models/invoice.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { getPaymentReminderWhatsAppUrl, getWhatsAppShareUrl } from '../../core/utils/upiAndShare.ts';
import { db } from '../../services/db.ts';
import {
  TrendingUp,
  Receipt,
  AlertTriangle,
  Users,
  ShoppingCart,
  PlusCircle,
  FileText,
  ShieldCheck,
  Send,
  Printer,
  ArrowUpRight,
  ArrowDownRight,
  ArrowRight,
  Wallet,
  Building,
  CheckCircle2,
  Calendar,
} from 'lucide-react';

interface DashboardViewProps {
  invoices: Invoice[];
  items: InventoryItem[];
  parties: Party[];
  onNewInvoice: () => void;
  onQuickPos: () => void;
  onViewInvoice: (invoice: Invoice) => void;
  onNavigateToTab?: (tab: string) => void;
}

export const DashboardView: React.FC<DashboardViewProps> = ({
  invoices,
  items,
  parties,
  onNewInvoice,
  onQuickPos,
  onViewInvoice,
  onNavigateToTab,
}) => {
  const company = db.getCompany();

  // Aggregate Metrics
  const totalSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalGstLiability = invoices.reduce((sum, inv) => sum + inv.totalTax, 0);
  const totalReceivables = parties
    .filter((p) => p.currentBalance > 0)
    .reduce((sum, p) => sum + p.currentBalance, 0);
  const totalPayables = parties
    .filter((p) => p.currentBalance < 0)
    .reduce((sum, p) => sum + Math.abs(p.currentBalance), 0);

  // Collections calculation (Cash vs UPI)
  const upiCollections = invoices
    .filter((i) => i.paymentMode === 'UPI')
    .reduce((sum, i) => sum + i.paidAmount, 0);
  const cashCollections = invoices
    .filter((i) => i.paymentMode === 'CASH')
    .reduce((sum, i) => sum + i.paidAmount, 0);
  const totalCollections = upiCollections + cashCollections;
  const collectionRatio = totalSales > 0 ? Math.min(100, Math.round((totalCollections / totalSales) * 100)) : 100;
  const upiRatio = totalCollections > 0 ? Math.round((upiCollections / totalCollections) * 100) : 60;

  const lowStockItems = items.filter((i) => i.currentStock <= i.minStockAlert);
  const debtorParties = parties.filter((p) => p.currentBalance > 0);

  const handleRemindFirstDebtor = () => {
    if (debtorParties.length > 0) {
      const debtor = debtorParties[0];
      const url = getPaymentReminderWhatsAppUrl(
        debtor.name,
        debtor.phone,
        debtor.currentBalance,
        company.tradeName || company.businessName,
        company.upiId
      );
      window.open(url, '_blank');
    } else {
      alert('All parties have cleared their balances!');
    }
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* GST Compliance Alert Banner (Stitch Vyapar Design) */}
      <section style={{
        background: 'linear-gradient(90deg, #1e293b 0%, #1e3a8a 100%)',
        borderRadius: '14px',
        padding: '1rem 1.25rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        border: '1px solid #334155',
        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
        flexWrap: 'wrap',
        gap: '0.75rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{
            width: '36px',
            height: '36px',
            borderRadius: '50%',
            backgroundColor: '#10b981',
            color: '#002113',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 'bold',
          }}>
            <ShieldCheck size={20} />
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
              <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>
                GSTR-1 Due in 6 Days
              </span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
              <span style={{ fontSize: '0.85rem', color: '#cbd5e1' }}>
                GST Liability: <strong style={{ color: '#fbbf24' }}>{formatINR(totalGstLiability)}</strong>
              </span>
              <span style={{ width: '4px', height: '4px', borderRadius: '50%', backgroundColor: '#94a3b8' }} />
              <span style={{ fontSize: '0.8rem', color: '#6cf8bb' }}>
                GSTIN: {company.gstin} (Active)
              </span>
            </div>
          </div>
        </div>

        <button
          onClick={() => onNavigateToTab ? onNavigateToTab('reports') : undefined}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            color: '#f8fafc',
            border: 'none',
            padding: '0.4rem 0.85rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.8rem',
            fontWeight: 600,
          }}
        >
          View Tax Summary →
        </button>
      </section>

      {/* Business Health Pulse Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '1rem' }}>
        {/* Today's Sales & Collections */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
            <div>
              <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                Total Sales Billed
              </div>
              <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '4px' }}>
                <span style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em' }}>
                  {formatINR(totalSales)}
                </span>
                <span style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '2px',
                  backgroundColor: 'rgba(16, 185, 129, 0.2)',
                  color: '#34d399',
                  padding: '0.15rem 0.4rem',
                  borderRadius: '9999px',
                  fontSize: '0.75rem',
                  fontWeight: 700,
                }}>
                  <TrendingUp size={12} /> +14.2%
                </span>
              </div>
            </div>

            <div style={{ width: '40px', height: '40px', borderRadius: '10px', backgroundColor: '#0f172a', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
              <ShoppingCart size={20} />
            </div>
          </div>

          {/* Collections Split Bar */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.4rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
              <span style={{ color: '#94a3b8' }}>
                Collections: <strong style={{ color: '#f8fafc' }}>{formatINR(totalCollections)}</strong>
              </span>
              <span style={{ color: '#34d399', fontWeight: 600 }}>{collectionRatio}% Realized</span>
            </div>

            <div style={{ width: '100%', height: '8px', backgroundColor: '#0f172a', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
              <div style={{ width: `${upiRatio}%`, backgroundColor: '#3b82f6' }} title="UPI / Online" />
              <div style={{ width: `${100 - upiRatio}%`, backgroundColor: '#10b981' }} title="Cash" />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: '#94a3b8', paddingTop: '2px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#3b82f6' }} />
                UPI: <strong style={{ color: '#f8fafc' }}>{formatINR(upiCollections)}</strong>
              </span>
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                <span style={{ width: '6px', height: '6px', borderRadius: '50%', backgroundColor: '#10b981' }} />
                Cash: <strong style={{ color: '#f8fafc' }}>{formatINR(cashCollections)}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* You'll Receive (To Collect) */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                To Collect (Receivable)
              </span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#10b981' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#34d399', marginTop: '4px' }}>
              {formatINR(totalReceivables)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
              From {debtorParties.length} parties outstanding
            </div>
          </div>

          <button
            onClick={handleRemindFirstDebtor}
            style={{
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(16, 185, 129, 0.15)',
              color: '#34d399',
              border: 'none',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span>WhatsApp Payment Reminder</span>
            <Send size={14} />
          </button>
        </div>

        {/* You'll Pay (To Pay) */}
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '14px',
          padding: '1.25rem',
          border: '1px solid #334155',
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
        }}>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#94a3b8', textTransform: 'uppercase' }}>
                To Pay (Payable)
              </span>
              <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#ef4444' }} />
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f87171', marginTop: '4px' }}>
              {formatINR(totalPayables || 62400)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
              To suppliers & vendor accounts
            </div>
          </div>

          <button
            onClick={() => onNavigateToTab ? onNavigateToTab('purchases') : undefined}
            style={{
              marginTop: '1rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              backgroundColor: 'rgba(239, 68, 68, 0.15)',
              color: '#f87171',
              border: 'none',
              padding: '0.5rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
            }}
          >
            <span>Manage Supplier Bills</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </div>

      {/* Operational Quick Action Ribbon (Stitch vyapar_dashboard) */}
      <div style={{
        backgroundColor: '#0f172a',
        borderRadius: '12px',
        padding: '0.75rem 1rem',
        border: '1px solid #334155',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '0.5rem',
      }}>
        <button
          onClick={onNewInvoice}
          style={{
            flex: '1 1 180px',
            height: '46px',
            backgroundColor: '#10b981',
            color: '#002113',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
            boxShadow: '0 4px 12px rgba(16, 185, 129, 0.25)',
          }}
        >
          <PlusCircle size={18} />
          + New GST Invoice
        </button>

        <button
          onClick={onQuickPos}
          style={{
            flex: '1 1 160px',
            height: '46px',
            backgroundColor: '#2563eb',
            color: '#ffffff',
            border: 'none',
            borderRadius: '8px',
            fontWeight: 700,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
        >
          <ShoppingCart size={18} />
          Retail POS Mode
        </button>

        <button
          onClick={() => onNavigateToTab ? onNavigateToTab('expenses') : undefined}
          style={{
            flex: '1 1 140px',
            height: '46px',
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
        >
          <Wallet size={16} style={{ color: '#ef4444' }} />
          Add Expense
        </button>

        <button
          onClick={() => onNavigateToTab ? onNavigateToTab('parties') : undefined}
          style={{
            flex: '1 1 140px',
            height: '46px',
            backgroundColor: '#1e293b',
            color: '#cbd5e1',
            border: '1px solid #334155',
            borderRadius: '8px',
            fontWeight: 600,
            fontSize: '0.875rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '0.5rem',
            cursor: 'pointer',
          }}
        >
          <Users size={16} style={{ color: '#38bdf8' }} />
          Parties & Ledger
        </button>
      </div>

      {/* Low Stock Warning Alert if any */}
      {lowStockItems.length > 0 && (
        <div style={{
          backgroundColor: 'rgba(245, 158, 11, 0.12)',
          border: '1px solid rgba(245, 158, 11, 0.4)',
          borderRadius: '10px',
          padding: '0.85rem 1.25rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <AlertTriangle size={20} style={{ color: '#f59e0b' }} />
            <div>
              <span style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.9rem' }}>
                {lowStockItems.length} Products Running Low on Stock
              </span>
              <span style={{ fontSize: '0.8rem', color: '#cbd5e1', marginLeft: '8px' }}>
                Reorder soon to avoid stockouts at checkout.
              </span>
            </div>
          </div>
          <button
            onClick={() => onNavigateToTab ? onNavigateToTab('inventory') : undefined}
            style={{
              backgroundColor: '#f59e0b',
              color: '#000',
              fontWeight: 700,
              fontSize: '0.75rem',
              padding: '0.35rem 0.75rem',
              borderRadius: '4px',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            Review Stock
          </button>
        </div>
      )}

      {/* Recent Invoices Feed */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '14px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        <div style={{
          padding: '1rem 1.25rem',
          borderBottom: '1px solid #334155',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
        }}>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 700, color: '#f8fafc', margin: 0, display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Receipt size={18} style={{ color: '#38bdf8' }} />
            Recent Sales Transactions
          </h3>
          <button
            onClick={() => onNavigateToTab ? onNavigateToTab('sales') : undefined}
            style={{
              backgroundColor: 'transparent',
              color: '#38bdf8',
              border: 'none',
              fontSize: '0.8rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            View All Sales Hub →
          </button>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Invoice No. & Date</th>
                <th style={{ padding: '0.75rem 1rem' }}>Party Name / Customer</th>
                <th style={{ padding: '0.75rem 1rem' }}>Type</th>
                <th style={{ padding: '0.75rem 1rem' }}>Status</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Amount</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {invoices.slice(0, 6).map((inv) => (
                <tr
                  key={inv.id}
                  style={{
                    borderBottom: '1px solid #334155',
                    color: '#f8fafc',
                  }}
                >
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{inv.invoiceNumber}</div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>{formatDate(inv.date)}</div>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <div style={{ fontWeight: 600 }}>{inv.partyName}</div>
                    {inv.partyGstin && (
                      <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>{inv.partyGstin}</div>
                    )}
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      fontSize: '0.7rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: inv.invoiceType === 'B2B' ? 'rgba(59, 130, 246, 0.2)' : 'rgba(168, 85, 247, 0.2)',
                      color: inv.invoiceType === 'B2B' ? '#60a5fa' : '#c084fc',
                    }}>
                      {inv.invoiceType}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem' }}>
                    <span style={{
                      fontSize: '0.75rem',
                      fontWeight: 600,
                      padding: '0.2rem 0.5rem',
                      borderRadius: '4px',
                      backgroundColor: inv.paymentStatus === 'PAID' ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
                      color: inv.paymentStatus === 'PAID' ? '#34d399' : '#f87171',
                    }}>
                      {inv.paymentStatus}
                    </span>
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700 }}>
                    {formatINR(inv.grandTotal)}
                  </td>
                  <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem' }}>
                      <button
                        onClick={() => onViewInvoice(inv)}
                        style={{
                          backgroundColor: '#334155',
                          border: 'none',
                          color: '#f8fafc',
                          padding: '0.35rem 0.65rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          fontSize: '0.75rem',
                          fontWeight: 600,
                        }}
                      >
                        View & Print
                      </button>
                      <button
                        onClick={() => {
                          const url = getWhatsAppShareUrl(inv, company);
                          window.open(url, '_blank');
                        }}
                        style={{
                          backgroundColor: '#25D366',
                          border: 'none',
                          color: '#ffffff',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                        }}
                        title="Send on WhatsApp"
                      >
                        <Send size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

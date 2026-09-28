import React, { useState } from 'react';
import { Invoice } from '../../models/invoice.ts';
import { PurchaseBill } from '../../models/purchase.ts';
import { Expense } from '../../models/expense.ts';
import { CompanyProfile } from '../../models/company.ts';
import { InventoryItem } from '../../models/item.ts';
import { Party } from '../../models/party.ts';
import { formatINR, formatDate } from '../../core/utils/formatters.ts';
import { downloadGstr1JsonFile } from '../../core/gst/gstrExport.ts';
import {
  FileSpreadsheet,
  Download,
  Calendar,
  Search,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  DollarSign,
  Layers,
  ArrowRight,
  ShieldCheck,
  Building,
  Users,
  Package,
} from 'lucide-react';

interface BusinessReportsViewProps {
  company: CompanyProfile;
  invoices: Invoice[];
  purchases: PurchaseBill[];
  expenses: Expense[];
  items: InventoryItem[];
  parties: Party[];
}

type ReportCategory = 'ALL' | 'GST' | 'FINANCIAL' | 'PARTIES_STOCK';

export const BusinessReportsView: React.FC<BusinessReportsViewProps> = ({
  company,
  invoices,
  purchases,
  expenses,
  items,
  parties,
}) => {
  const [activeCategory, setActiveCategory] = useState<ReportCategory>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedPeriod, setSelectedPeriod] = useState('102024'); // Oct 2024

  // Financial aggregates
  const grossSales = invoices.reduce((sum, inv) => sum + inv.grandTotal, 0);
  const totalSalesTaxable = invoices.reduce((sum, inv) => sum + inv.totalTaxableAmount, 0);
  const totalOutputGst = invoices.reduce((sum, inv) => sum + inv.totalTax, 0);

  const grossPurchases = purchases.reduce((sum, p) => sum + p.grandTotal, 0);
  const totalInputTaxCreditFromPurchases = purchases.reduce((sum, p) => sum + p.totalTax, 0);

  const totalExpenses = expenses.reduce((sum, e) => sum + e.amount, 0);
  const itcFromExpenses = expenses
    .filter((e) => e.itcEligible)
    .reduce((sum, e) => sum + e.taxAmount, 0);

  const totalAvailableItc = totalInputTaxCreditFromPurchases + itcFromExpenses;
  const netGstPayableInCash = Math.max(0, totalOutputGst - totalAvailableItc);

  // Profit & Loss calculation
  const totalStockValuation = items.reduce((sum, i) => sum + (i.currentStock * i.purchasePrice), 0);
  const costOfGoodsSold = grossPurchases;
  const netProfit = grossSales - costOfGoodsSold - totalExpenses;
  const profitMargin = grossSales > 0 ? (netProfit / grossSales) * 100 : 0;

  const handleDownloadGstr1 = () => {
    downloadGstr1JsonFile(company, invoices, selectedPeriod);
  };

  return (
    <div style={{ padding: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
      {/* Top Financial Snapshot Banner (Matching Stitch DESIGN.md) */}
      <div style={{
        background: 'linear-gradient(135deg, #0e1c2f 0%, #1e293b 100%)',
        borderRadius: '16px',
        padding: '1.75rem',
        border: '1px solid #334155',
        boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.4)',
        position: 'relative',
        overflow: 'hidden',
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: '#6cf8bb' }}>
            <TrendingUp size={20} />
            <span style={{ fontSize: '0.8rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Business Financial Snapshot • Vyapar Pro
            </span>
          </div>

          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: 'rgba(255, 255, 255, 0.1)',
            padding: '0.35rem 0.75rem',
            borderRadius: '9999px',
            fontSize: '0.8rem',
            color: '#f8fafc',
          }}>
            <Calendar size={14} />
            <span>Return Period: {selectedPeriod.slice(0, 2)}/{selectedPeriod.slice(2)}</span>
          </div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
          <div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Estimated Net Profit</div>
            <div style={{ fontSize: '2rem', fontWeight: 800, color: '#f8fafc', letterSpacing: '-0.02em', marginTop: '2px' }}>
              {formatINR(netProfit)}
            </div>
            <span style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '4px',
              backgroundColor: 'rgba(16, 185, 129, 0.2)',
              color: '#34d399',
              padding: '0.15rem 0.5rem',
              borderRadius: '9999px',
              fontSize: '0.75rem',
              fontWeight: 700,
              marginTop: '4px',
            }}>
              <TrendingUp size={12} /> {profitMargin.toFixed(1)}% Operating Margin
            </span>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Gross Revenue (Invoices)</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#38bdf8', marginTop: '2px' }}>
              {formatINR(grossSales)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
              {invoices.length} Tax Invoices billed
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Total Purchases & Expenses</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#f87171', marginTop: '2px' }}>
              {formatINR(grossPurchases + totalExpenses)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '4px' }}>
              Purchases ({formatINR(grossPurchases)}) + Ops ({formatINR(totalExpenses)})
            </div>
          </div>

          <div>
            <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>Net GST Cash Liability</div>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, color: '#fbbf24', marginTop: '2px' }}>
              {formatINR(netGstPayableInCash)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '4px' }}>
              After ₹{totalAvailableItc.toLocaleString('en-IN')} ITC setoff
            </div>
          </div>
        </div>

        {/* Visual Progress Ratio Bar */}
        <div style={{ marginTop: '1.5rem', width: '100%', height: '6px', backgroundColor: 'rgba(255, 255, 255, 0.1)', borderRadius: '9999px', overflow: 'hidden', display: 'flex' }}>
          <div style={{ width: `${Math.min(100, Math.max(10, profitMargin))}%`, backgroundColor: '#10b981' }} title="Profit" />
          <div style={{ width: '45%', backgroundColor: '#ef4444' }} title="Costs" />
          <div style={{ width: '25%', backgroundColor: '#f59e0b' }} title="Tax & Ops" />
        </div>
      </div>

      {/* Category Tabs */}
      <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
        <button
          onClick={() => setActiveCategory('ALL')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeCategory === 'ALL' ? '#3b82f6' : '#1e293b',
            color: activeCategory === 'ALL' ? '#ffffff' : '#94a3b8',
          }}
        >
          All Reports (7)
        </button>
        <button
          onClick={() => setActiveCategory('GST')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeCategory === 'GST' ? '#3b82f6' : '#1e293b',
            color: activeCategory === 'GST' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <ShieldCheck size={16} style={{ color: '#10b981' }} />
          GST & Tax Compliance
        </button>
        <button
          onClick={() => setActiveCategory('FINANCIAL')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeCategory === 'FINANCIAL' ? '#3b82f6' : '#1e293b',
            color: activeCategory === 'FINANCIAL' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <DollarSign size={16} style={{ color: '#f59e0b' }} />
          Financial Statements (P&L, Daybook)
        </button>
        <button
          onClick={() => setActiveCategory('PARTIES_STOCK')}
          style={{
            padding: '0.5rem 1rem',
            borderRadius: '9999px',
            fontSize: '0.85rem',
            fontWeight: 600,
            cursor: 'pointer',
            border: 'none',
            backgroundColor: activeCategory === 'PARTIES_STOCK' ? '#3b82f6' : '#1e293b',
            color: activeCategory === 'PARTIES_STOCK' ? '#ffffff' : '#94a3b8',
            display: 'flex',
            alignItems: 'center',
            gap: '0.35rem',
          }}
        >
          <Package size={16} style={{ color: '#a855f7' }} />
          Parties & Stock Valuation
        </button>
      </div>

      {/* GSTR-1 Official Section */}
      {(activeCategory === 'ALL' || activeCategory === 'GST') && (
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '12px',
          border: '1px solid #334155',
          padding: '1.5rem',
          display: 'flex',
          flexDirection: 'column',
          gap: '1rem',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '1rem' }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <span style={{ backgroundColor: '#10b981', color: '#002113', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem' }}>
                  GSTR-1
                </span>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
                  GSTR-1 Monthly Return (Outward Supplies)
                </h3>
              </div>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: '4px 0 0 0' }}>
                B2B Invoices, B2C Small/Large, HSN Table, and Tax Breakdown ready for official portal upload.
              </p>
            </div>

            <button
              onClick={handleDownloadGstr1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '0.5rem',
                backgroundColor: '#10b981',
                color: '#002113',
                padding: '0.625rem 1.25rem',
                borderRadius: '8px',
                border: 'none',
                fontWeight: 700,
                cursor: 'pointer',
                boxShadow: '0 4px 12px rgba(16, 185, 129, 0.3)',
              }}
            >
              <Download size={18} />
              Download GST Portal JSON
            </button>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginTop: '0.5rem' }}>
            <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Table 4A: B2B Invoices</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                {formatINR(invoices.filter((i) => i.invoiceType === 'B2B').reduce((s, i) => s + i.grandTotal, 0))}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#38bdf8' }}>
                {invoices.filter((i) => i.invoiceType === 'B2B').length} bills with GSTIN
              </div>
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Table 7: B2C Small (Retail)</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                {formatINR(invoices.filter((i) => i.invoiceType === 'B2CS').reduce((s, i) => s + i.grandTotal, 0))}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#a855f7' }}>
                {invoices.filter((i) => i.invoiceType === 'B2CS').length} counter retail sales
              </div>
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Table 12: HSN Summary</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', marginTop: '2px' }}>
                {formatINR(totalSalesTaxable)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#34d399' }}>
                Total Taxable Value
              </div>
            </div>

            <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Total Output Tax Liability</div>
              <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#fbbf24', marginTop: '2px' }}>
                {formatINR(totalOutputGst)}
              </div>
              <div style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                CGST + SGST + IGST
              </div>
            </div>
          </div>
        </div>
      )}

      {/* GSTR-3B Tax Set-Off Summary */}
      {(activeCategory === 'ALL' || activeCategory === 'GST') && (
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '12px',
          border: '1px solid #334155',
          padding: '1.5rem',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
            <span style={{ backgroundColor: '#3b82f6', color: '#ffffff', padding: '0.2rem 0.6rem', borderRadius: '4px', fontWeight: 800, fontSize: '0.75rem' }}>
              GSTR-3B
            </span>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: 0 }}>
              Monthly Tax Computation & ITC Set-Off
            </h3>
          </div>

          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
                <th style={{ padding: '0.75rem 1rem' }}>Description</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Taxable Value</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>IGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>CGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>SGST</th>
                <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Total Tax</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #334155', color: '#f8fafc' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                  (A) Outward Taxable Supplies (Sales)
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(totalSalesTaxable)}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(invoices.reduce((s, i) => s + i.totalIgst, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(invoices.reduce((s, i) => s + i.totalCgst, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(invoices.reduce((s, i) => s + i.totalSgst, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#f59e0b' }}>{formatINR(totalOutputGst)}</td>
              </tr>
              <tr style={{ borderBottom: '1px solid #334155', color: '#f8fafc' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600 }}>
                  (B) Eligible ITC Available (Purchases + Ops)
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(purchases.reduce((s, p) => s + p.totalTaxableAmount, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(purchases.reduce((s, p) => s + p.totalIgst, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(purchases.reduce((s, p) => s + p.totalCgst, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>{formatINR(purchases.reduce((s, p) => s + p.totalSgst, 0))}</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 700, color: '#10b981' }}>{formatINR(totalAvailableItc)}</td>
              </tr>
              <tr style={{ backgroundColor: '#0f172a', color: '#f8fafc', fontWeight: 800 }}>
                <td style={{ padding: '0.75rem 1rem', color: '#fbbf24' }}>
                  (C) Net Tax Payable in Cash (A - B)
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>—</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>—</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>—</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>—</td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontSize: '1rem', color: netGstPayableInCash > 0 ? '#ef4444' : '#10b981' }}>
                  {formatINR(netGstPayableInCash)}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      )}

      {/* Profit & Loss Statement */}
      {(activeCategory === 'ALL' || activeCategory === 'FINANCIAL') && (
        <div style={{
          backgroundColor: '#1e293b',
          borderRadius: '12px',
          border: '1px solid #334155',
          padding: '1.5rem',
        }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 1rem 0' }}>
            Trading & Profit & Loss Statement (P&L)
          </h3>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            {/* Income */}
            <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 700, color: '#38bdf8', marginBottom: '0.75rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                INCOME / REVENUE
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: '#cbd5e1' }}>
                <span>Gross Sales Revenue:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(grossSales)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: '#cbd5e1' }}>
                <span>Closing Stock Value:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(totalStockValuation)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.5rem', borderTop: '1px solid #334155', fontWeight: 800, color: '#38bdf8' }}>
                <span>Total Income:</span>
                <span>{formatINR(grossSales + totalStockValuation)}</span>
              </div>
            </div>

            {/* Expenses */}
            <div style={{ backgroundColor: '#0f172a', padding: '1rem', borderRadius: '8px', border: '1px solid #334155' }}>
              <div style={{ fontWeight: 700, color: '#f87171', marginBottom: '0.75rem', borderBottom: '1px solid #334155', paddingBottom: '0.5rem' }}>
                EXPENDITURE & COSTS
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: '#cbd5e1' }}>
                <span>Purchases & Goods Cost:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(grossPurchases)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.35rem 0', color: '#cbd5e1' }}>
                <span>Operational Overheads:</span>
                <span style={{ fontWeight: 600, color: '#f8fafc' }}>{formatINR(totalExpenses)}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.5rem', borderTop: '1px solid #334155', fontWeight: 800, color: '#f87171' }}>
                <span>Total Expenditure:</span>
                <span>{formatINR(grossPurchases + totalExpenses)}</span>
              </div>
            </div>
          </div>

          <div style={{
            marginTop: '1rem',
            padding: '1rem',
            borderRadius: '8px',
            backgroundColor: netProfit >= 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(239, 68, 68, 0.15)',
            border: `1px solid ${netProfit >= 0 ? '#10b981' : '#ef4444'}`,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
          }}>
            <div>
              <div style={{ fontWeight: 800, fontSize: '1.1rem', color: netProfit >= 0 ? '#34d399' : '#f87171' }}>
                Net Operating Profit: {formatINR(netProfit)}
              </div>
              <div style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Gross Sales minus Inventory Cost and Operational Expenses
              </div>
            </div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: netProfit >= 0 ? '#34d399' : '#f87171' }}>
              {profitMargin.toFixed(1)}% Margin
            </div>
          </div>
        </div>
      )}

      {/* Stock Valuation & Party Receivables */}
      {(activeCategory === 'ALL' || activeCategory === 'PARTIES_STOCK') && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
          {/* Stock Valuation */}
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            border: '1px solid #334155',
            padding: '1.5rem',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Package size={18} style={{ color: '#a855f7' }} />
              Stock Valuation Summary
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>Total SKUs / Items:</span>
              <span style={{ fontWeight: 700, color: '#f8fafc' }}>{items.length} Products</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>Total Inventory Units:</span>
              <span style={{ fontWeight: 700, color: '#f8fafc' }}>{items.reduce((s, i) => s + i.currentStock, 0)} Units</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.5rem', fontWeight: 800, color: '#a855f7', fontSize: '1.1rem' }}>
              <span>Inventory Asset Value:</span>
              <span>{formatINR(totalStockValuation)}</span>
            </div>
          </div>

          {/* Party Receivables vs Payables */}
          <div style={{
            backgroundColor: '#1e293b',
            borderRadius: '12px',
            border: '1px solid #334155',
            padding: '1.5rem',
          }}>
            <h3 style={{ fontSize: '1.125rem', fontWeight: 700, color: '#f8fafc', margin: '0 0 1rem 0', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <Users size={18} style={{ color: '#38bdf8' }} />
              Ledger Outstanding Balances
            </h3>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>To Collect (Receivables):</span>
              <span style={{ fontWeight: 700, color: '#10b981' }}>
                {formatINR(parties.filter((p) => p.currentBalance > 0).reduce((s, p) => s + p.currentBalance, 0))}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', borderBottom: '1px solid #334155' }}>
              <span style={{ color: '#94a3b8' }}>To Pay (Payables):</span>
              <span style={{ fontWeight: 700, color: '#ef4444' }}>
                {formatINR(parties.filter((p) => p.currentBalance < 0).reduce((s, p) => s + Math.abs(p.currentBalance), 0))}
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '0.5rem 0', marginTop: '0.5rem', fontWeight: 800, color: '#f8fafc', fontSize: '1.1rem' }}>
              <span>Registered Parties:</span>
              <span>{parties.length} Accounts</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

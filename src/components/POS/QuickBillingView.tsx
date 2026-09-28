import React, { useState } from 'react';
import { InventoryItem } from '../../models/item.ts';
import { CompanyProfile } from '../../models/company.ts';
import { Invoice, InvoiceItemEntry } from '../../models/invoice.ts';
import { calculateInvoice } from '../../core/gst/calculator.ts';
import { amountInWords } from '../../core/utils/currencyWords.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import {
  Search,
  ShoppingCart,
  Plus,
  Minus,
  Trash2,
  Printer,
  CreditCard,
  QrCode,
  DollarSign,
} from 'lucide-react';

interface QuickBillingViewProps {
  company: CompanyProfile;
  items: InventoryItem[];
  onCompleteSale: (invoice: Invoice) => void;
}

export const QuickBillingView: React.FC<QuickBillingViewProps> = ({
  company,
  items,
  onCompleteSale,
}) => {
  const [cart, setCart] = useState<Array<{ item: InventoryItem; qty: number }>>([]);
  const [search, setSearch] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMode, setPaymentMode] = useState<'CASH' | 'UPI' | 'CARD'>('CASH');

  const filteredItems = items.filter(
    (i) =>
      i.name.toLowerCase().includes(search.toLowerCase()) ||
      (i.barcode && i.barcode.includes(search)) ||
      (i.sku && i.sku.toLowerCase().includes(search.toLowerCase()))
  );

  const addToCart = (item: InventoryItem) => {
    const existing = cart.find((c) => c.item.id === item.id);
    if (existing) {
      setCart(cart.map((c) => (c.item.id === item.id ? { ...c, qty: c.qty + 1 } : c)));
    } else {
      setCart([...cart, { item, qty: 1 }]);
    }
  };

  const updateQty = (itemId: string, delta: number) => {
    setCart(
      cart
        .map((c) => {
          if (c.item.id === itemId) {
            const newQty = c.qty + delta;
            return newQty > 0 ? { ...c, qty: newQty } : null;
          }
          return c;
        })
        .filter(Boolean) as Array<{ item: InventoryItem; qty: number }>
    );
  };

  const removeFromCart = (itemId: string) => {
    setCart(cart.filter((c) => c.item.id !== itemId));
  };

  // Live calculation
  const calcInputs = cart.map((c) => ({
    quantity: c.qty,
    unitPrice: c.item.salePrice,
    gstRate: c.item.gstRate,
  }));

  const calcSummary = calculateInvoice(company.stateCode, company.stateCode, calcInputs);

  const handleCheckout = () => {
    if (cart.length === 0) return;

    const invoiceItems: InvoiceItemEntry[] = cart.map((c, idx) => {
      const itemCalc = calcSummary.items[idx];
      return {
        itemId: c.item.id,
        name: c.item.name,
        hsnSacCode: c.item.hsnSacCode,
        unit: c.item.unit,
        quantity: c.qty,
        unitPrice: c.item.salePrice,
        taxableAmount: itemCalc.taxableAmount,
        gstRate: c.item.gstRate,
        cgstAmount: itemCalc.cgstAmount,
        sgstAmount: itemCalc.sgstAmount,
        igstAmount: 0,
        cessAmount: 0,
        totalAmount: itemCalc.totalAmount,
      };
    });

    const newInvoice: Invoice = {
      id: `INV-POS-${Date.now()}`,
      invoiceNumber: `POS-${Math.floor(10000 + Math.random() * 90000)}`,
      invoiceType: 'B2CS',
      date: new Date().toISOString().split('T')[0],
      partyName: customerPhone ? `Retail (${customerPhone})` : 'Retail Customer',
      partyAddress: 'Counter Sale',
      partyStateCode: company.stateCode,
      placeOfSupplyStateCode: company.stateCode,
      isIntraState: true,
      items: invoiceItems,
      totalGrossAmount: calcSummary.totalGrossAmount,
      totalDiscount: 0,
      totalTaxableAmount: calcSummary.totalTaxableAmount,
      totalCgst: calcSummary.totalCgst,
      totalSgst: calcSummary.totalSgst,
      totalIgst: 0,
      totalCess: 0,
      totalTax: calcSummary.totalTax,
      roundOff: calcSummary.roundOff,
      grandTotal: calcSummary.grandTotal,
      amountInWords: amountInWords(calcSummary.grandTotal),
      paymentMode,
      paymentStatus: 'PAID',
      paidAmount: calcSummary.grandTotal,
      balanceAmount: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onCompleteSale(newInvoice);
    setCart([]);
    setCustomerPhone('');
  };

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', height: 'calc(100vh - 65px)', overflow: 'hidden' }}>
      {/* Left: Product Catalog & Search */}
      <div style={{ padding: '1.25rem', borderRight: '1px solid #334155', display: 'flex', flexDirection: 'column', gap: '1rem', overflowY: 'auto' }}>
        <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flex: 1, backgroundColor: '#1e293b', padding: '0.5rem 0.75rem', borderRadius: '6px', border: '1px solid #334155' }}>
            <Search size={18} color="#94a3b8" />
            <input
              type="text"
              placeholder="Scan barcode or search product name / SKU..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ background: 'none', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.9rem' }}
            />
          </div>
        </div>

        {/* Product Grid */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
          gap: '0.75rem',
        }}>
          {filteredItems.map((item) => (
            <div
              key={item.id}
              onClick={() => addToCart(item)}
              style={{
                backgroundColor: '#1e293b',
                padding: '1rem',
                borderRadius: '8px',
                border: '1px solid #334155',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                transition: 'transform 0.1s, border-color 0.1s',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = '#3b82f6';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = '#334155';
              }}
            >
              <div>
                <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
                  {item.name}
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  HSN: {item.hsnSacCode} • GST {item.gstRate}%
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '0.75rem' }}>
                <span style={{ fontSize: '1rem', fontWeight: 700, color: '#38bdf8' }}>
                  {formatINR(item.salePrice)}
                </span>
                <span style={{ fontSize: '0.7rem', color: item.currentStock <= item.minStockAlert ? '#ef4444' : '#10b981' }}>
                  {item.currentStock} {item.unit}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Right: Cart & Quick Checkout Counter */}
      <div style={{ backgroundColor: '#1e293b', display: 'flex', flexDirection: 'column', height: '100%' }}>
        {/* Cart Header */}
        <div style={{ padding: '1rem', borderBottom: '1px solid #334155', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontWeight: 700, color: '#f8fafc' }}>
            <ShoppingCart size={18} color="#3b82f6" />
            POS Current Cart ({cart.reduce((s, c) => s + c.qty, 0)})
          </div>
          {cart.length > 0 && (
            <button
              onClick={() => setCart([])}
              style={{ background: 'none', border: 'none', color: '#ef4444', fontSize: '0.75rem', cursor: 'pointer' }}
            >
              Clear Cart
            </button>
          )}
        </div>

        {/* Cart Items List */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '0.75rem', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {cart.length === 0 ? (
            <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: '#64748b', gap: '0.5rem' }}>
              <ShoppingCart size={40} style={{ opacity: 0.3 }} />
              <div>Cart is empty. Tap items on the left to add.</div>
            </div>
          ) : (
            cart.map((c) => (
              <div
                key={c.item.id}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  backgroundColor: '#0f172a',
                  padding: '0.6rem 0.75rem',
                  borderRadius: '6px',
                  border: '1px solid #334155',
                }}
              >
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 600, color: '#f8fafc' }}>{c.item.name}</div>
                  <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                    {formatINR(c.item.salePrice)} × {c.qty} (GST {c.item.gstRate}%)
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', backgroundColor: '#1e293b', borderRadius: '4px' }}>
                    <button
                      onClick={() => updateQty(c.item.id, -1)}
                      style={{ background: 'none', border: 'none', color: '#fff', padding: '4px 6px', cursor: 'pointer' }}
                    >
                      <Minus size={12} />
                    </button>
                    <span style={{ fontSize: '0.85rem', fontWeight: 600, padding: '0 4px', minWidth: '20px', textAlign: 'center' }}>
                      {c.qty}
                    </span>
                    <button
                      onClick={() => updateQty(c.item.id, 1)}
                      style={{ background: 'none', border: 'none', color: '#fff', padding: '4px 6px', cursor: 'pointer' }}
                    >
                      <Plus size={12} />
                    </button>
                  </div>

                  <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#f8fafc', minWidth: '65px', textAlign: 'right' }}>
                    {formatINR(c.item.salePrice * c.qty)}
                  </span>

                  <button
                    onClick={() => removeFromCart(c.item.id)}
                    style={{ background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', padding: '4px' }}
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))
          )}
        </div>

        {/* Customer & Payment Mode Selection */}
        <div style={{ padding: '0.75rem 1rem', borderTop: '1px solid #334155', backgroundColor: '#0f172a' }}>
          <input
            type="text"
            placeholder="Customer Phone (Optional for SMS / Bill)"
            value={customerPhone}
            onChange={(e) => setCustomerPhone(e.target.value)}
            style={{
              width: '100%',
              backgroundColor: '#1e293b',
              border: '1px solid #334155',
              color: '#fff',
              padding: '0.4rem 0.6rem',
              borderRadius: '4px',
              fontSize: '0.8rem',
              marginBottom: '0.5rem',
            }}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.4rem' }}>
            <button
              onClick={() => setPaymentMode('CASH')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '0.4rem',
                backgroundColor: paymentMode === 'CASH' ? '#16a34a' : '#1e293b',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <DollarSign size={14} /> Cash
            </button>
            <button
              onClick={() => setPaymentMode('UPI')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '0.4rem',
                backgroundColor: paymentMode === 'UPI' ? '#2563eb' : '#1e293b',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <QrCode size={14} /> UPI
            </button>
            <button
              onClick={() => setPaymentMode('CARD')}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                padding: '0.4rem',
                backgroundColor: paymentMode === 'CARD' ? '#7c3aed' : '#1e293b',
                color: '#fff',
                border: 'none',
                borderRadius: '4px',
                cursor: 'pointer',
                fontSize: '0.8rem',
                fontWeight: 600,
              }}
            >
              <CreditCard size={14} /> Card
            </button>
          </div>
        </div>

        {/* Bill Summary & Checkout Button */}
        <div style={{ padding: '1rem', borderTop: '1px solid #334155', backgroundColor: '#1e293b' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8' }}>
            <span>Taxable Amount:</span>
            <span>{formatINR(calcSummary.totalTaxableAmount)}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8rem', color: '#94a3b8', marginTop: '2px' }}>
            <span>CGST + SGST ({company.stateCode}):</span>
            <span>{formatINR(calcSummary.totalCgst + calcSummary.totalSgst)}</span>
          </div>

          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            fontSize: '1.25rem',
            fontWeight: 800,
            color: '#f8fafc',
            marginTop: '0.5rem',
            paddingTop: '0.5rem',
            borderTop: '1px solid #334155',
          }}>
            <span>To Pay:</span>
            <span style={{ color: '#4ade80' }}>{formatINR(calcSummary.grandTotal)}</span>
          </div>

          <button
            onClick={handleCheckout}
            disabled={cart.length === 0}
            style={{
              width: '100%',
              backgroundColor: cart.length === 0 ? '#475569' : '#059669',
              color: '#fff',
              border: 'none',
              padding: '0.75rem',
              borderRadius: '6px',
              fontSize: '1rem',
              fontWeight: 700,
              cursor: cart.length === 0 ? 'not-allowed' : 'pointer',
              marginTop: '0.75rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '0.5rem',
            }}
          >
            <Printer size={18} />
            Charge & Print Thermal Slip
          </button>
        </div>
      </div>
    </div>
  );
};

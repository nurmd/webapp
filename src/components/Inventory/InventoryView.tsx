import React, { useState } from 'react';
import { InventoryItem, UnitOfMeasurement } from '../../models/item.ts';
import { formatINR } from '../../core/utils/formatters.ts';
import { COMMON_HSN_CODES } from '../../core/gst/hsnCatalog.ts';
import { Search, Plus, AlertTriangle, Edit, Trash2, X, Check } from 'lucide-react';

interface InventoryViewProps {
  items: InventoryItem[];
  onSaveItem: (item: InventoryItem) => void;
  onDeleteItem: (id: string) => void;
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  items,
  onSaveItem,
  onDeleteItem,
}) => {
  const [search, setSearch] = useState('');
  const [onlyLowStock, setOnlyLowStock] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);

  const filtered = items.filter((item) => {
    const matchesSearch =
      item.name.toLowerCase().includes(search.toLowerCase()) ||
      item.hsnSacCode.includes(search) ||
      (item.sku && item.sku.toLowerCase().includes(search.toLowerCase()));

    const matchesLowStock = onlyLowStock ? item.currentStock <= item.minStockAlert : true;
    return matchesSearch && matchesLowStock;
  });

  const openNewItem = () => {
    setEditingItem({
      id: `ITM-${Date.now()}`,
      name: '',
      sku: '',
      barcode: '',
      hsnSacCode: '844332',
      category: 'General',
      unit: 'PCS',
      salePrice: 0,
      purchasePrice: 0,
      gstRate: 18,
      currentStock: 0,
      minStockAlert: 5,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });
    setIsModalOpen(true);
  };

  const openEditItem = (item: InventoryItem) => {
    setEditingItem({ ...item });
    setIsModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name) return;
    onSaveItem({
      ...editingItem,
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
            Inventory & Services Catalog
          </h2>
          <div style={{ fontSize: '0.85rem', color: '#94a3b8' }}>
            Goods, HSN/SAC classification, tax rates, and stock alerts
          </div>
        </div>

        <button
          onClick={openNewItem}
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
          <Plus size={15} /> Add Item / Service
        </button>
      </div>

      {/* Filters */}
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
            placeholder="Search items by name, HSN code, or SKU..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{ background: 'none', border: 'none', color: '#fff', outline: 'none', width: '100%', fontSize: '0.85rem' }}
          />
        </div>

        <button
          onClick={() => setOnlyLowStock(!onlyLowStock)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '0.4rem',
            backgroundColor: onlyLowStock ? '#ef4444' : '#0f172a',
            color: '#fff',
            border: '1px solid #334155',
            padding: '0.45rem 0.75rem',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '0.8rem',
          }}
        >
          <AlertTriangle size={14} color={onlyLowStock ? '#fff' : '#f59e0b'} />
          Low Stock Only
        </button>
      </div>

      {/* Items Table */}
      <div style={{
        backgroundColor: '#1e293b',
        borderRadius: '8px',
        border: '1px solid #334155',
        overflow: 'hidden',
      }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.875rem' }}>
          <thead>
            <tr style={{ backgroundColor: '#0f172a', color: '#94a3b8', borderBottom: '1px solid #334155' }}>
              <th style={{ padding: '0.75rem 1rem' }}>Item Name</th>
              <th style={{ padding: '0.75rem 1rem' }}>HSN / SAC</th>
              <th style={{ padding: '0.75rem 1rem' }}>Category</th>
              <th style={{ padding: '0.75rem 1rem' }}>Unit</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Sale Price</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>GST Rate</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'right' }}>Current Stock</th>
              <th style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((item) => (
              <tr key={item.id} style={{ borderBottom: '1px solid #334155' }}>
                <td style={{ padding: '0.75rem 1rem', fontWeight: 600, color: '#f8fafc' }}>
                  {item.name}
                  {item.sku && <div style={{ fontSize: '0.75rem', color: '#64748b' }}>SKU: {item.sku}</div>}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#93c5fd' }}>
                  {item.hsnSacCode}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                  {item.category}
                </td>
                <td style={{ padding: '0.75rem 1rem', color: '#cbd5e1' }}>
                  {item.unit}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: '#f8fafc' }}>
                  {formatINR(item.salePrice)}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <span style={{ backgroundColor: '#1e3a8a', color: '#93c5fd', padding: '2px 6px', borderRadius: '4px', fontSize: '0.75rem', fontWeight: 600 }}>
                    {item.gstRate}%
                  </span>
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'right', fontWeight: 600, color: item.currentStock <= item.minStockAlert ? '#ef4444' : '#10b981' }}>
                  {item.currentStock} {item.unit}
                </td>
                <td style={{ padding: '0.75rem 1rem', textAlign: 'center' }}>
                  <div style={{ display: 'flex', justifyContent: 'center', gap: '0.5rem' }}>
                    <button
                      onClick={() => openEditItem(item)}
                      style={{ background: 'none', border: 'none', color: '#60a5fa', cursor: 'pointer' }}
                    >
                      <Edit size={16} />
                    </button>
                    <button
                      onClick={() => onDeleteItem(item.id)}
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

      {/* Edit / Create Item Modal */}
      {isModalOpen && editingItem && (
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
                {editingItem.id.startsWith('ITM-') ? 'Add Item / Service' : 'Edit Item'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} style={{ background: 'none', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSave} style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Item Name *</label>
                <input
                  type="text"
                  required
                  value={editingItem.name}
                  onChange={(e) => setEditingItem({ ...editingItem, name: e.target.value })}
                  style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>HSN / SAC Code</label>
                  <input
                    type="text"
                    required
                    value={editingItem.hsnSacCode}
                    onChange={(e) => setEditingItem({ ...editingItem, hsnSacCode: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>GST Rate (%)</label>
                  <select
                    value={editingItem.gstRate}
                    onChange={(e) => setEditingItem({ ...editingItem, gstRate: Number(e.target.value) })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  >
                    <option value={0}>0%</option>
                    <option value={5}>5%</option>
                    <option value={12}>12%</option>
                    <option value={18}>18%</option>
                    <option value={28}>28%</option>
                  </select>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Unit</label>
                  <select
                    value={editingItem.unit}
                    onChange={(e) => setEditingItem({ ...editingItem, unit: e.target.value as UnitOfMeasurement })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  >
                    {['PCS', 'NOS', 'KGS', 'GMS', 'LTR', 'ML', 'MTR', 'BOX', 'PKT', 'SET', 'BAG'].map((u) => (
                      <option key={u} value={u}>{u}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Category</label>
                  <input
                    type="text"
                    value={editingItem.category}
                    onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Sale Price (₹)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={editingItem.salePrice}
                    onChange={(e) => setEditingItem({ ...editingItem, salePrice: Number(e.target.value) })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', marginBottom: '3px' }}>Opening / Current Stock</label>
                  <input
                    type="number"
                    min="0"
                    value={editingItem.currentStock}
                    onChange={(e) => setEditingItem({ ...editingItem, currentStock: Number(e.target.value) })}
                    style={{ width: '100%', backgroundColor: '#0f172a', border: '1px solid #334155', color: '#fff', padding: '0.5rem', borderRadius: '4px' }}
                  />
                </div>
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
                  Save Item
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

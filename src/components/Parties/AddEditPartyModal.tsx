import React, { useState, useEffect } from 'react';
import { Party, BalanceType } from '../../models/party.ts';
import { getStateList } from '../../core/gst/stateCodes.ts';
import { isValidGstin, extractStateCodeFromGstin, extractPanFromGstin } from '../../core/gst/gstinUtils.ts';
import { formatINR } from '../../core/utils/formatters.ts';

export interface AddEditPartyModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (party: Party) => void;
  editingParty: Party | null;
  initialType?: 'CUSTOMER' | 'SUPPLIER';
  parties?: Party[];
}

export const AddEditPartyModal: React.FC<AddEditPartyModalProps> = ({
  isOpen,
  onClose,
  onSave,
  editingParty,
  initialType = 'CUSTOMER',
  parties = [],
}) => {
  const allStates = getStateList();

  const [name, setName] = useState('');
  const [type, setType] = useState<'CUSTOMER' | 'SUPPLIER'>(initialType);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [gstin, setGstin] = useState('');
  const [pan, setPan] = useState('');
  const [stateCode, setStateCode] = useState('27');
  const [address, setAddress] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [hasSeparateShipping, setHasSeparateShipping] = useState(false);
  const [creditLimit, setCreditLimit] = useState<string>('');
  const [openingBalance, setOpeningBalance] = useState<string>('');
  const [openingBalanceType, setOpeningBalanceType] = useState<BalanceType>(initialType === 'CUSTOMER' ? 'TO_RECEIVE' : 'TO_PAY');
  const [openingBalanceDate, setOpeningBalanceDate] = useState<string>(new Date().toISOString().split('T')[0]);

  useEffect(() => {
    if (editingParty) {
      setName(editingParty.name);
      setType(editingParty.type);
      setPhone(editingParty.phone);
      setEmail(editingParty.email || '');
      setGstin(editingParty.gstin || '');
      setPan(editingParty.pan || '');
      setStateCode(editingParty.stateCode || '27');
      setAddress(editingParty.billingAddress || '');
      setShippingAddress(editingParty.shippingAddress || '');
      setHasSeparateShipping(!!editingParty.shippingAddress && editingParty.shippingAddress !== editingParty.billingAddress);
      setCreditLimit(editingParty.creditLimit ? editingParty.creditLimit.toString() : '');

      const hasExplicit = typeof editingParty.openingBalance === 'number';
      const rawOpening = hasExplicit ? editingParty.openingBalance! : Math.abs(editingParty.currentBalance);
      setOpeningBalance(rawOpening > 0 ? rawOpening.toString() : '');
      setOpeningBalanceType(
        editingParty.openingBalanceType ||
        (editingParty.currentBalance >= 0 ? 'TO_RECEIVE' : 'TO_PAY')
      );
      setOpeningBalanceDate(
        editingParty.openingBalanceDate ||
        (editingParty.createdAt ? editingParty.createdAt.split('T')[0] : new Date().toISOString().split('T')[0])
      );
    } else {
      setName('');
      setType(initialType);
      setPhone('');
      setEmail('');
      setGstin('');
      setPan('');
      setStateCode('27');
      setAddress('');
      setShippingAddress('');
      setHasSeparateShipping(false);
      setCreditLimit('');
      setOpeningBalance('');
      setOpeningBalanceType(initialType === 'CUSTOMER' ? 'TO_RECEIVE' : 'TO_PAY');
      setOpeningBalanceDate(new Date().toISOString().split('T')[0]);
    }
  }, [editingParty, initialType, isOpen]);

  if (!isOpen) return null;

  const handleGstinInputChange = (val: string) => {
    const uppercaseVal = val.toUpperCase().trim();
    setGstin(uppercaseVal);

    const detectedState = extractStateCodeFromGstin(uppercaseVal);
    if (detectedState) {
      setStateCode(detectedState);
    }

    const detectedPan = extractPanFromGstin(uppercaseVal);
    if (detectedPan) {
      setPan(detectedPan);
    }
  };

  // Duplicate checks
  const duplicatePhoneParty = phone.trim()
    ? parties.find(
        (p) =>
          p.id !== editingParty?.id &&
          p.phone.replace(/\D/g, '') === phone.trim().replace(/\D/g, '') &&
          p.phone !== '9999999999'
      )
    : null;

  const duplicateGstinParty = gstin.trim()
    ? parties.find(
        (p) =>
          p.id !== editingParty?.id &&
          p.gstin &&
          p.gstin.trim().toUpperCase() === gstin.trim().toUpperCase()
      )
    : null;

  const handleTypeChange = (newType: 'CUSTOMER' | 'SUPPLIER') => {
    setType(newType);
    if (!editingParty && !openingBalance) {
      setOpeningBalanceType(newType === 'CUSTOMER' ? 'TO_RECEIVE' : 'TO_PAY');
    }
  };

  const handleSavePartyForm = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    const numCreditLimit = creditLimit.trim() ? parseFloat(creditLimit) : undefined;
    const numOpening = openingBalance.trim() ? Math.abs(parseFloat(openingBalance)) : 0;
    const newSignedOpening = numOpening > 0 ? (openingBalanceType === 'TO_RECEIVE' ? numOpening : -numOpening) : 0;

    let finalCurrentBalance = newSignedOpening;
    if (editingParty) {
      const hasOldExplicit = typeof editingParty.openingBalance === 'number';
      const oldRawOpening = hasOldExplicit ? editingParty.openingBalance! : Math.abs(editingParty.currentBalance);
      const oldType = editingParty.openingBalanceType || (editingParty.currentBalance >= 0 ? 'TO_RECEIVE' : 'TO_PAY');
      const oldSignedOpening = oldRawOpening > 0 ? (oldType === 'TO_RECEIVE' ? oldRawOpening : -oldRawOpening) : 0;

      const delta = newSignedOpening - oldSignedOpening;
      finalCurrentBalance = editingParty.currentBalance + delta;
    }

    const partyToSave: Party = {
      id: editingParty ? editingParty.id : 'PTY-' + Date.now(),
      name: name.trim(),
      type,
      phone: phone.trim() || '9999999999',
      email: email.trim() || undefined,
      gstin: gstin.trim().toUpperCase() || undefined,
      pan: pan.trim().toUpperCase() || undefined,
      stateCode: stateCode.trim() || '27',
      billingAddress: address.trim() || 'Local Counter',
      shippingAddress: hasSeparateShipping ? shippingAddress.trim() : undefined,
      creditLimit: numCreditLimit && numCreditLimit > 0 ? numCreditLimit : undefined,
      openingBalance: numOpening > 0 ? numOpening : undefined,
      openingBalanceType: numOpening > 0 ? openingBalanceType : undefined,
      openingBalanceDate: numOpening > 0 ? openingBalanceDate : undefined,
      currentBalance: finalCurrentBalance,
      createdAt: editingParty ? editingParty.createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    onSave(partyToSave);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 bg-on-surface/40 backdrop-blur-sm flex items-center justify-center p-3 animate-fade-in">
      <div className="bg-surface-container-lowest rounded-2xl p-5 w-full max-w-lg shadow-xl border border-outline-variant/30 flex flex-col gap-3.5 max-h-[92vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-outline-variant/20 pb-2.5">
          <h3 className="font-headline-sm text-base font-bold text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-[20px] text-secondary">person</span>
            <span>{editingParty ? 'Edit Party Details' : 'Add New Party'}</span>
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-on-surface-variant hover:text-on-surface p-1 cursor-pointer"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* Duplicate phone/gstin warning banners */}
        {duplicatePhoneParty && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] flex-shrink-0">warning</span>
            <span>
              Another party <strong>{duplicatePhoneParty.name}</strong> already has this mobile number.
            </span>
          </div>
        )}
        {duplicateGstinParty && (
          <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-700 dark:text-amber-300 text-xs flex items-center gap-2">
            <span className="material-symbols-outlined text-[16px] flex-shrink-0">warning</span>
            <span>
              This GSTIN is already registered to <strong>{duplicateGstinParty.name}</strong>.
            </span>
          </div>
        )}

        <form onSubmit={handleSavePartyForm} className="flex flex-col gap-3 text-xs">
          {/* Type Switcher */}
          <div>
            <label className="block font-bold text-on-surface-variant mb-1">Party Category</label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleTypeChange('CUSTOMER')}
                className={`py-2 rounded-xl font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                  type === 'CUSTOMER'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'bg-surface-container-low text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">groups</span>
                <span>Customer (Buyer)</span>
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('SUPPLIER')}
                className={`py-2 rounded-xl font-bold cursor-pointer transition-colors flex items-center justify-center gap-1.5 ${
                  type === 'SUPPLIER'
                    ? 'bg-secondary text-on-secondary shadow-sm'
                    : 'bg-surface-container-low text-on-surface'
                }`}
              >
                <span className="material-symbols-outlined text-[16px]">local_shipping</span>
                <span>Supplier (Vendor)</span>
              </button>
            </div>
          </div>

          {/* Name */}
          <div>
            <label className="block font-bold text-on-surface-variant mb-1">
              Party / Business Name *
            </label>
            <input
              type="text"
              required
              placeholder="e.g. Ramesh Hardware Store"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
            />
          </div>

          {/* Mobile & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-bold text-on-surface-variant mb-1">
                Mobile Number *
              </label>
              <input
                type="tel"
                required
                placeholder="10-digit mobile"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>
            <div>
              <label className="block font-bold text-on-surface-variant mb-1">
                Email Address (Optional)
              </label>
              <input
                type="email"
                placeholder="e.g. contact@business.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>
          </div>

          {/* GSTIN & State Code */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-bold text-on-surface-variant">GSTIN (Optional)</label>
                {gstin && (
                  <span
                    className={`text-[10px] font-bold ${
                      isValidGstin(gstin) ? 'text-secondary' : 'text-outline'
                    }`}
                  >
                    {isValidGstin(gstin) ? '✓ Valid Format' : '15 characters expected'}
                  </span>
                )}
              </div>
              <input
                type="text"
                maxLength={15}
                placeholder="15-digit GSTIN"
                value={gstin}
                onChange={(e) => handleGstinInputChange(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>

            <div>
              <label className="block font-bold text-on-surface-variant mb-1">State / POS</label>
              <select
                value={stateCode}
                onChange={(e) => setStateCode(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary/40"
              >
                {allStates.map((st) => (
                  <option key={st.code} value={st.code}>
                    {st.code} - {st.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* PAN & Credit Limit */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block font-bold text-on-surface-variant mb-1">PAN Number</label>
              <input
                type="text"
                maxLength={10}
                placeholder="10-digit PAN"
                value={pan}
                onChange={(e) => setPan(e.target.value.toUpperCase())}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm font-mono uppercase focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>

            <div>
              <label className="block font-bold text-on-surface-variant mb-1">
                Credit Limit (₹)
              </label>
              <input
                type="number"
                min="0"
                placeholder="e.g. 50000"
                value={creditLimit}
                onChange={(e) => setCreditLimit(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
              />
            </div>
          </div>

          {/* Opening Balance Section */}
          <div className="p-3 rounded-xl bg-surface-container-low/70 border border-outline-variant/30 flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <label className="font-bold text-xs text-on-surface flex items-center gap-1.5">
                <span className="material-symbols-outlined text-[16px] text-secondary">account_balance_wallet</span>
                <span>Opening Balance</span>
              </label>
              {editingParty && (
                <span className="text-[10px] text-on-surface-variant font-medium">
                  Current Balance: <strong className={editingParty.currentBalance >= 0 ? 'text-secondary' : 'text-error'}>{formatINR(Math.abs(editingParty.currentBalance))} {editingParty.currentBalance >= 0 ? 'Dr' : 'Cr'}</strong>
                </span>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {/* Amount */}
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant block mb-1">Amount (₹)</label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-on-surface-variant font-bold text-xs">₹</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={openingBalance}
                    onChange={(e) => setOpeningBalance(e.target.value)}
                    className="w-full pl-7 pr-3 py-1.5 rounded-xl border border-outline-variant/40 bg-surface text-on-surface text-xs font-bold focus:outline-none focus:ring-2 focus:ring-secondary/40"
                  />
                </div>
              </div>

              {/* As of Date */}
              <div>
                <label className="text-[10px] font-bold text-on-surface-variant block mb-1">As of Date</label>
                <input
                  type="date"
                  value={openingBalanceDate}
                  onChange={(e) => setOpeningBalanceDate(e.target.value)}
                  className="w-full px-2.5 py-1.5 rounded-xl border border-outline-variant/40 bg-surface text-on-surface text-xs focus:outline-none focus:ring-2 focus:ring-secondary/40"
                />
              </div>
            </div>

            {/* Type selector (To Receive vs To Pay) */}
            <div className="flex flex-col gap-1 pt-0.5">
              <label className="text-[10px] font-bold text-on-surface-variant">Balance Type</label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setOpeningBalanceType('TO_RECEIVE')}
                  className={`py-1.5 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                    openingBalanceType === 'TO_RECEIVE'
                      ? 'bg-secondary/15 text-secondary border-secondary/40 shadow-xs'
                      : 'bg-surface text-on-surface-variant border-outline-variant/30 hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">call_received</span>
                  <span>To Receive (Dr)</span>
                </button>

                <button
                  type="button"
                  onClick={() => setOpeningBalanceType('TO_PAY')}
                  className={`py-1.5 px-2.5 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer transition-all active:scale-95 ${
                    openingBalanceType === 'TO_PAY'
                      ? 'bg-error/15 text-error border-error/40 shadow-xs'
                      : 'bg-surface text-on-surface-variant border-outline-variant/30 hover:bg-surface-container'
                  }`}
                >
                  <span className="material-symbols-outlined text-[15px]">call_made</span>
                  <span>To Pay (Cr)</span>
                </button>
              </div>
              <span className="text-[10px] text-outline mt-0.5">
                {openingBalanceType === 'TO_RECEIVE'
                  ? '• Customer/Supplier owes you this amount (Receivable)'
                  : '• You owe this amount to Customer/Supplier (Payable)'}
              </span>
            </div>
          </div>

          {/* Billing Address */}
          <div>
            <label className="block font-bold text-on-surface-variant mb-1">Billing Address</label>
            <input
              type="text"
              placeholder="Street / Shop No / Market / City"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40"
            />
          </div>

          {/* Separate Shipping Address Toggle */}
          <div>
            <label className="flex items-center gap-2 cursor-pointer py-1">
              <input
                type="checkbox"
                checked={hasSeparateShipping}
                onChange={(e) => setHasSeparateShipping(e.target.checked)}
                className="w-4 h-4 rounded text-secondary focus:ring-secondary/40"
              />
              <span className="font-semibold text-on-surface">Different Shipping / Delivery Address</span>
            </label>
            {hasSeparateShipping && (
              <input
                type="text"
                placeholder="Delivery warehouse / Site address"
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                className="w-full px-3 py-2 rounded-xl border border-outline-variant bg-surface text-on-surface text-sm focus:outline-none focus:ring-2 focus:ring-secondary/40 mt-1.5"
              />
            )}
          </div>

          <div className="flex justify-end gap-2 mt-2 pt-2 border-t border-outline-variant/20">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-on-surface-variant text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-5 py-2 rounded-xl bg-secondary text-on-secondary text-xs font-bold shadow-sm cursor-pointer active:scale-95"
            >
              {editingParty ? 'Update Party' : 'Save Party'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

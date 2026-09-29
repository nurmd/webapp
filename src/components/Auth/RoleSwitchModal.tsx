import React, { useState } from 'react';
import { rbac, UserProfile } from '../../services/rbac.ts';

interface RoleSwitchModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRoleChanged: (newUser: UserProfile) => void;
}

export const RoleSwitchModal: React.FC<RoleSwitchModalProps> = ({
  isOpen,
  onClose,
  onRoleChanged,
}) => {
  const users = rbac.getUsers();
  const activeUser = rbac.getActiveUser();

  const [selectedUser, setSelectedUser] = useState<UserProfile>(activeUser);
  const [pin, setPin] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleSelectTargetUser = (u: UserProfile) => {
    setSelectedUser(u);
    setPin('');
    setErrorMsg(null);
  };

  const handleNumberClick = (digit: string) => {
    if (pin.length < 4) {
      const next = pin + digit;
      setPin(next);
      setErrorMsg(null);

      // Auto-submit on 4th digit
      if (next.length === 4) {
        verifyAndSwitch(next);
      }
    }
  };

  const handleBackspace = () => {
    setPin(pin.slice(0, -1));
    setErrorMsg(null);
  };

  const verifyAndSwitch = (pinToTest: string) => {
    const res = rbac.switchUser(selectedUser.id, pinToTest);
    if (res.success) {
      onRoleChanged(selectedUser);
      onClose();
    } else {
      setErrorMsg(res.error || 'Incorrect PIN');
      setPin('');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-surface-container-lowest rounded-3xl shadow-2xl max-w-sm w-full overflow-hidden border border-outline-variant/30 flex flex-col">
        {/* Header */}
        <div className="p-4 border-b border-outline-variant/20 flex items-center justify-between bg-surface-container-low">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-secondary text-[22px]">lock</span>
            <div>
              <h3 className="font-headline-sm text-sm font-bold text-on-surface">
                User Role &amp; Security Switch
              </h3>
              <p className="text-[10px] text-on-surface-variant">
                Active: {activeUser.name} ({activeUser.role})
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* User Picker Tabs */}
        <div className="p-3 border-b border-outline-variant/20 flex gap-1.5 bg-surface-container-low/50">
          {users.map((u) => {
            const isSelected = selectedUser.id === u.id;
            return (
              <button
                key={u.id}
                type="button"
                onClick={() => handleSelectTargetUser(u)}
                className={`flex-1 py-2 px-1 rounded-xl text-center flex flex-col items-center gap-1 transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-surface-container-lowest border-secondary shadow-sm'
                    : 'border-transparent text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold"
                  style={{ backgroundColor: u.avatarColor }}
                >
                  {u.name[0]}
                </div>
                <div className="font-label-md text-[11px] font-bold text-on-surface truncate w-full">
                  {u.role}
                </div>
              </button>
            );
          })}
        </div>

        {/* PIN Entry Area */}
        <div className="p-5 flex flex-col items-center">
          <p className="text-xs font-semibold text-on-surface-variant mb-2">
            Enter 4-digit PIN for <span className="text-secondary font-bold">{selectedUser.name}</span>
          </p>

          {/* PIN dots */}
          <div className="flex gap-3 my-3">
            {[0, 1, 2, 3].map((idx) => (
              <div
                key={idx}
                className={`w-3.5 h-3.5 rounded-full border-2 transition-all ${
                  pin.length > idx
                    ? 'bg-secondary border-secondary scale-110'
                    : 'border-outline-variant/60 bg-surface'
                }`}
              />
            ))}
          </div>

          {errorMsg && (
            <div className="text-error text-xs font-bold mb-2 animate-bounce flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick PIN Hint for first-time use */}
          <div className="text-[10px] text-on-surface-variant/80 mb-3 bg-surface-container-low px-2 py-1 rounded-md">
            Default PIN: Owner <code className="font-mono font-bold">1234</code> · Cashier <code className="font-mono font-bold">0000</code> · CA <code className="font-mono font-bold">9999</code>
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                onClick={() => handleNumberClick(digit)}
                className="h-12 rounded-2xl bg-surface-container-low hover:bg-surface-container active:scale-95 text-on-surface font-headline-sm text-base font-bold transition-all shadow-sm flex items-center justify-center cursor-pointer"
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setPin('')}
              className="h-12 rounded-2xl bg-surface-container-low text-xs font-bold text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={() => handleNumberClick('0')}
              className="h-12 rounded-2xl bg-surface-container-low hover:bg-surface-container active:scale-95 text-on-surface font-headline-sm text-base font-bold transition-all shadow-sm flex items-center justify-center cursor-pointer"
            >
              0
            </button>
            <button
              type="button"
              onClick={handleBackspace}
              className="h-12 rounded-2xl bg-surface-container-low text-on-surface-variant hover:bg-surface-container active:scale-95 transition-all flex items-center justify-center cursor-pointer"
            >
              <span className="material-symbols-outlined text-[20px]">backspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

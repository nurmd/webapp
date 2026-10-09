import React, { useState, useEffect } from 'react';
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
  const [isVerifying, setIsVerifying] = useState(false);
  const [lockoutRemaining, setLockoutRemaining] = useState(0);

  // Synchronize state when modal opens or selected user changes
  useEffect(() => {
    if (!isOpen) return;
    const lockout = rbac.isUserLockedOut(selectedUser.id);
    setLockoutRemaining(lockout.remainingSeconds);
    if (!lockout.isLocked) {
      setErrorMsg(null);
    }
    setPin('');
  }, [isOpen, selectedUser.id]);

  // Real-time 1s countdown timer for brute-force lockout
  useEffect(() => {
    if (lockoutRemaining <= 0) return;
    const timer = setInterval(() => {
      setLockoutRemaining((prev) => {
        if (prev <= 1) {
          clearInterval(timer);
          setErrorMsg(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [lockoutRemaining]);

  if (!isOpen) return null;

  const isLocked = lockoutRemaining > 0;
  const isKeypadDisabled = isVerifying || isLocked;

  const handleSelectTargetUser = (u: UserProfile) => {
    if (isVerifying) return;
    setSelectedUser(u);
    setPin('');
    setErrorMsg(null);
    const lockout = rbac.isUserLockedOut(u.id);
    setLockoutRemaining(lockout.remainingSeconds);
  };

  const handleNumberClick = (digit: string) => {
    if (isKeypadDisabled) return;
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
    if (isKeypadDisabled) return;
    setPin(pin.slice(0, -1));
    setErrorMsg(null);
  };

  const handleClear = () => {
    if (isKeypadDisabled) return;
    setPin('');
    setErrorMsg(null);
  };

  const verifyAndSwitch = async (pinToTest: string) => {
    if (isKeypadDisabled) return;
    setIsVerifying(true);
    try {
      const res = await rbac.switchUser(selectedUser.id, pinToTest);
      if (res.success) {
        onRoleChanged(selectedUser);
        onClose();
      } else {
        const lockout = rbac.isUserLockedOut(selectedUser.id);
        if (lockout.isLocked) {
          setLockoutRemaining(lockout.remainingSeconds);
          setErrorMsg(null);
        } else {
          setErrorMsg(res.error || 'Incorrect PIN');
        }
        setPin('');
      }
    } catch {
      setErrorMsg('Authentication error. Please try again.');
      setPin('');
    } finally {
      setIsVerifying(false);
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
            disabled={isVerifying}
            className="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant hover:bg-surface-container cursor-pointer transition-colors disabled:opacity-50"
          >
            <span className="material-symbols-outlined text-[18px]">close</span>
          </button>
        </div>

        {/* User Picker Tabs */}
        <div className="p-3 border-b border-outline-variant/20 flex gap-1.5 bg-surface-container-low/50">
          {users.map((u) => {
            const isSelected = selectedUser.id === u.id;
            const userLocked = rbac.isUserLockedOut(u.id).isLocked;
            return (
              <button
                key={u.id}
                type="button"
                disabled={isVerifying}
                onClick={() => handleSelectTargetUser(u)}
                className={`relative flex-1 py-2 px-1 rounded-xl text-center flex flex-col items-center gap-1 transition-all cursor-pointer border ${
                  isSelected
                    ? 'bg-surface-container-lowest border-secondary shadow-sm'
                    : 'border-transparent text-on-surface-variant hover:bg-surface-container'
                } ${isVerifying ? 'opacity-60 cursor-not-allowed' : ''}`}
              >
                <div
                  className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold relative"
                  style={{ backgroundColor: u.avatarColor }}
                >
                  {u.name[0]}
                  {userLocked && (
                    <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-error text-white rounded-full flex items-center justify-center text-[9px]">
                      🔒
                    </span>
                  )}
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

          {/* Real-time Lockout Banner */}
          {isLocked && (
            <div className="w-full bg-error-container/40 border border-error/30 rounded-xl p-2.5 mb-3 flex items-center gap-2 text-error text-xs font-bold animate-pulse">
              <span className="material-symbols-outlined text-[18px]">lock_clock</span>
              <span>Account locked due to multiple failed attempts. Retry in {lockoutRemaining}s</span>
            </div>
          )}

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

          {/* Verifying Indicator */}
          {isVerifying && (
            <div className="text-secondary text-xs font-bold mb-2 flex items-center gap-1.5 animate-pulse">
              <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
              <span>Verifying PIN...</span>
            </div>
          )}

          {/* Error Message */}
          {!isLocked && errorMsg && (
            <div className="text-error text-xs font-bold mb-2 animate-bounce flex items-center gap-1">
              <span className="material-symbols-outlined text-[14px]">error</span>
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Quick PIN Hint */}
          <div className="text-[10px] text-on-surface-variant/80 mb-3 bg-surface-container-low px-2 py-1 rounded-md">
            Default PIN: Owner <code className="font-mono font-bold">1234</code> · Cashier <code className="font-mono font-bold">0000</code> · CA <code className="font-mono font-bold">9999</code>
          </div>

          {/* Numeric Keypad */}
          <div className="grid grid-cols-3 gap-2 w-full max-w-[240px]">
            {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => (
              <button
                key={digit}
                type="button"
                disabled={isKeypadDisabled}
                onClick={() => handleNumberClick(digit)}
                className={`h-12 rounded-2xl bg-surface-container-low text-on-surface font-headline-sm text-base font-bold transition-all shadow-sm flex items-center justify-center ${
                  isKeypadDisabled
                    ? 'opacity-50 pointer-events-none cursor-not-allowed'
                    : 'hover:bg-surface-container active:scale-95 cursor-pointer'
                }`}
              >
                {digit}
              </button>
            ))}
            <button
              type="button"
              disabled={isKeypadDisabled}
              onClick={handleClear}
              className={`h-12 rounded-2xl bg-surface-container-low text-xs font-bold text-on-surface-variant transition-all flex items-center justify-center ${
                isKeypadDisabled
                  ? 'opacity-50 pointer-events-none cursor-not-allowed'
                  : 'hover:bg-surface-container active:scale-95 cursor-pointer'
              }`}
            >
              Clear
            </button>
            <button
              type="button"
              disabled={isKeypadDisabled}
              onClick={() => handleNumberClick('0')}
              className={`h-12 rounded-2xl bg-surface-container-low text-on-surface font-headline-sm text-base font-bold transition-all shadow-sm flex items-center justify-center ${
                isKeypadDisabled
                  ? 'opacity-50 pointer-events-none cursor-not-allowed'
                  : 'hover:bg-surface-container active:scale-95 cursor-pointer'
              }`}
            >
              0
            </button>
            <button
              type="button"
              disabled={isKeypadDisabled}
              onClick={handleBackspace}
              className={`h-12 rounded-2xl bg-surface-container-low text-on-surface-variant transition-all flex items-center justify-center ${
                isKeypadDisabled
                  ? 'opacity-50 pointer-events-none cursor-not-allowed'
                  : 'hover:bg-surface-container active:scale-95 cursor-pointer'
              }`}
            >
              <span className="material-symbols-outlined text-[20px]">backspace</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

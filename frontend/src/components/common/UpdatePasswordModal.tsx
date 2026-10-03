import React, { useState } from 'react';
import { KeyRound, Lock, Eye, EyeOff, CheckCircle2, AlertCircle, X, ShieldCheck, Loader2 } from 'lucide-react';
import { User } from '../../types';

interface UpdatePasswordModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentUser: User;
  onUpdatePassword: (newPassword: string) => Promise<void>;
}

export const UpdatePasswordModal: React.FC<UpdatePasswordModalProps> = ({
  isOpen,
  onClose,
  currentUser,
  onUpdatePassword,
}) => {
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  if (!isOpen) return null;

  // Password strength calculation
  const getPasswordStrength = (pass: string) => {
    if (!pass) return { label: '', color: '', percent: 0 };
    let score = 0;
    if (pass.length >= 6) score += 25;
    if (pass.length >= 10) score += 25;
    if (/[A-Z]/.test(pass) && /[a-z]/.test(pass)) score += 25;
    if (/\d/.test(pass) || /[^A-Za-z0-9]/.test(pass)) score += 25;

    if (score <= 25) return { label: 'Weak', color: 'bg-rose-500 text-rose-400', percent: 25 };
    if (score <= 50) return { label: 'Fair', color: 'bg-amber-500 text-amber-400', percent: 50 };
    if (score <= 75) return { label: 'Good', color: 'bg-blue-500 text-blue-400', percent: 75 };
    return { label: 'Strong', color: 'bg-emerald-500 text-emerald-400', percent: 100 };
  };

  const strength = getPasswordStrength(newPassword);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    const trimmed = newPassword.trim();
    if (trimmed.length < 6) {
      setErrorMsg('Password must be at least 6 characters long.');
      return;
    }
    if (trimmed.length > 128) {
      setErrorMsg('Password must not exceed 128 characters.');
      return;
    }
    if (trimmed !== confirmPassword.trim()) {
      setErrorMsg('Passwords do not match. Please re-enter.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onUpdatePassword(trimmed);
      setSuccessMsg('Your password has been updated and securely synchronized.');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => {
        setSuccessMsg(null);
        onClose();
      }, 1800);
    } catch (err: any) {
      setErrorMsg(err?.message || 'Failed to update password. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleModalClose = () => {
    if (isSubmitting) return;
    setErrorMsg(null);
    setSuccessMsg(null);
    setNewPassword('');
    setConfirmPassword('');
    onClose();
  };

  const roleLabel =
    currentUser.role === 'ADMIN'
      ? 'System Administrator'
      : currentUser.role === 'FACULTY'
      ? 'Faculty Educator'
      : 'Student Candidate';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="update-password-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-in fade-in duration-200"
    >
      <div className="relative w-full max-w-md bg-[#141417] border border-white/10 rounded-2xl shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10 bg-[#18181c]">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl text-indigo-400">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h2 id="update-password-title" className="text-base font-bold text-white tracking-tight">
                Update Account Password
              </h2>
              <p className="text-xs text-zinc-400">Change your security passcode</p>
            </div>
          </div>
          <button
            onClick={handleModalClose}
            disabled={isSubmitting}
            className="p-1.5 rounded-lg text-zinc-400 hover:text-white hover:bg-white/5 transition cursor-pointer disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* User Card */}
        <div className="px-6 pt-4">
          <div className="bg-[#1c1c22] border border-white/5 rounded-xl p-3 flex items-center justify-between">
            <div className="space-y-0.5">
              <div className="text-xs font-semibold text-zinc-200">{currentUser.name}</div>
              <div className="text-[11px] text-zinc-400 font-mono">{currentUser.email}</div>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-indigo-500/20 text-indigo-300 border border-indigo-500/30">
              {roleLabel}
            </span>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/15 border border-rose-500/30 text-rose-300 text-xs flex items-center gap-2 font-medium">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs flex items-center gap-2 font-medium">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* New Password */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              New Password <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter at least 6 characters"
                required
                minLength={6}
                disabled={isSubmitting}
                className="w-full bg-[#18181c] border border-white/10 rounded-xl pl-9 pr-10 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-zinc-500 hover:text-zinc-300 transition cursor-pointer"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {/* Strength meter */}
            {newPassword.length > 0 && (
              <div className="mt-2 space-y-1">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-zinc-500">Strength</span>
                  <span className={`font-medium ${strength.color.split(' ')[1]}`}>{strength.label}</span>
                </div>
                <div className="w-full h-1 bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className={`h-full transition-all duration-300 ${strength.color.split(' ')[0]}`}
                    style={{ width: `${strength.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Confirm Password */}
          <div>
            <label className="block text-xs font-medium text-zinc-300 mb-1.5">
              Confirm New Password <span className="text-rose-400">*</span>
            </label>
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-zinc-500">
                <Lock className="w-4 h-4" />
              </div>
              <input
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                required
                minLength={6}
                disabled={isSubmitting}
                className="w-full bg-[#18181c] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 transition font-mono"
              />
            </div>
          </div>

          <div className="p-3 bg-[#18181c] border border-white/5 rounded-xl flex items-start gap-2.5 text-[11px] text-zinc-400">
            <ShieldCheck className="w-4 h-4 text-indigo-400 shrink-0 mt-0.5" />
            <span>
              Your updated password takes effect immediately across all sessions, authentication systems, and database credentials.
            </span>
          </div>

          {/* Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={handleModalClose}
              disabled={isSubmitting}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-zinc-400 hover:text-white bg-white/5 hover:bg-white/10 transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !newPassword || newPassword.length < 6}
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-500 transition cursor-pointer shadow-lg shadow-indigo-600/20 flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Updating...</span>
                </>
              ) : (
                <>
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Update Password</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import {
  ShieldCheck,
  Mail,
  Lock,
  Eye,
  EyeOff,
  User as UserIcon,
  Briefcase,
  Hash,
  AlertCircle,
  ArrowRight,
  Database,
  Building2,
  CheckCircle2,
  Clock,
  X,
} from 'lucide-react';
import { UserRole } from '../../types';
import {
  loginWithEmailPassword,
  registerWithEmailPassword,
  sendPasswordResetLink,
  updateUserPassword,
  DEFAULT_SYSTEM_SETTINGS,
} from '../../services/firebase';

interface AuthScreenProps {
  onSuccess: (user: any) => void;
  sessionTimeoutMessage?: string | null;
  onClearTimeoutMessage?: () => void;
}

export const AuthScreen: React.FC<AuthScreenProps> = ({
  onSuccess,
  sessionTimeoutMessage,
  onClearTimeoutMessage,
}) => {
  const [mode, setMode] = useState<'LOGIN' | 'REGISTER'>('LOGIN');
  const [role, setRole] = useState<UserRole>('CANDIDATE');

  // Form Fields
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [department, setDepartment] = useState('Computer Science & Engineering');
  const [registerNumber, setRegisterNumber] = useState('');
  const [employeeId, setEmployeeId] = useState('');
  const [batch, setBatch] = useState('2026');
  const [year, setYear] = useState('4th Year');
  const [section, setSection] = useState('Section A');

  const [pendingPasswordChangeUser, setPendingPasswordChangeUser] = useState<any | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [changePasswordError, setChangePasswordError] = useState<string | null>(null);
  const [changingPassword, setChangingPassword] = useState(false);

  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const handlePasswordChangeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pendingPasswordChangeUser) return;
    setChangePasswordError(null);

    if (newPassword.length < 6) {
      setChangePasswordError('New password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setChangePasswordError('Passwords do not match. Please re-enter.');
      return;
    }
    if (newPassword === 'Faculty@123' || newPassword === 'Student@123' || newPassword === 'Admin@123') {
      setChangePasswordError('New password cannot be the temporary default password.');
      return;
    }

    setChangingPassword(true);
    try {
      await updateUserPassword(pendingPasswordChangeUser.id, newPassword);
      const updated = {
        ...pendingPasswordChangeUser,
        mustChangePassword: false,
      };
      setPendingPasswordChangeUser(null);
      onSuccess(updated);
    } catch (err: any) {
      setChangePasswordError(err?.message || 'Failed to update password. Please try again.');
    } finally {
      setChangingPassword(false);
    }
  };

  const handleForgotPassword = async () => {
    if (!email) {
      setError('Please enter your account email address above first.');
      return;
    }
    setError(null);
    setSuccessNotice(null);
    setLoading(true);
    try {
      await sendPasswordResetLink(email);
      setSuccessNotice(`Password reset instructions sent to ${email}. Please check your inbox.`);
      setResetSent(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset link.');
    } finally {
      setLoading(false);
    }
  };
  const [error, setError] = useState<string | null>(null);
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessNotice(null);
    setLoading(true);

    try {
      if (!email || !password) {
        throw new Error('Please provide both User ID/Email and password.');
      }
      const user = await loginWithEmailPassword(email, password);
      if (user.mustChangePassword) {
        setPendingPasswordChangeUser(user);
      } else {
        onSuccess(user);
      }
    } catch (err: any) {
      let msg = err?.message || 'Authentication failed. Please check your credentials.';
      if (err?.code === 'auth/operation-not-allowed' || err?.message?.includes('operation-not-allowed')) {
        msg = 'Email/Password sign-in provider is disabled in Firebase Console. Please enable Email/Password under Authentication > Sign-in method, or use Quick Demo Sign In.';
      } else if (err?.code === 'auth/invalid-credential' || err?.code === 'auth/wrong-password') {
        msg = 'Invalid email or password. Please verify your credentials.';
      } else if (err?.code === 'auth/user-not-found') {
        msg = 'No account found with this email. Please check your email or contact your administrator.';
      } else if (err?.code === 'auth/email-already-in-use') {
        msg = 'This email is already registered. Please sign in or use a different email.';
      } else if (err?.code === 'auth/weak-password') {
        msg = 'Password should be at least 6 characters.';
      }
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0c0c0e] text-[#e4e4e7] flex flex-col justify-center items-center px-4 py-8">
      {/* Background Glow */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[650px] h-[350px] bg-indigo-600/10 blur-[130px] rounded-full"></div>
      </div>

      <div className="relative w-full max-w-md z-10">
        {/* App Branding */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-indigo-600/20 border border-indigo-500/30 text-indigo-400 mb-3 shadow-lg shadow-indigo-500/10">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-3xl font-extrabold font-display tracking-tight text-white flex items-center justify-center gap-2">
            CodeExam
            <span className="label-mono px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
              Platform
            </span>
          </h1>
          <p className="text-sm text-zinc-400 mt-1">
            Database-driven examination and proctoring platform
          </p>
        </div>

        {/* Auth Card */}
        <div className="bg-[#141417] border border-white/10 rounded-lg p-6 sm:p-8 space-y-6">
          {pendingPasswordChangeUser ? (
            <div>
              <div className="text-center mb-6">
                <div className="inline-flex items-center justify-center w-12 h-12 rounded-xl bg-amber-500/20 border border-amber-500/30 text-amber-400 mb-2">
                  <Lock className="w-6 h-6" />
                </div>
                <h2 className="text-lg font-bold text-white">First-Time Password Change</h2>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Welcome, <span className="font-semibold text-slate-200">{pendingPasswordChangeUser.name}</span>! For your security, you must set a new private password before accessing your account.
                </p>
                <div className="mt-2 inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-800 text-[11px] text-slate-300 border border-slate-700">
                  <span className="font-mono text-indigo-400">{pendingPasswordChangeUser.email}</span>
                  <span>&bull;</span>
                  <span className="uppercase text-[10px] tracking-wider text-slate-400 font-semibold">{pendingPasswordChangeUser.role}</span>
                </div>
              </div>

              {changePasswordError && (
                <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-300">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{changePasswordError}</span>
                </div>
              )}

              <form onSubmit={handlePasswordChangeSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={showNewPassword ? 'text' : 'password'}
                      required
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Minimum 6 characters"
                      className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition p-0.5 focus:outline-none cursor-pointer"
                      title={showNewPassword ? 'Hide password' : 'Show password'}
                    >
                      {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1">
                    Confirm New Password
                  </label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                    <input
                      type={showConfirmPassword ? 'text' : 'password'}
                      required
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="Re-enter new password"
                      className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword((prev) => !prev)}
                      className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition p-0.5 focus:outline-none cursor-pointer"
                      title={showConfirmPassword ? 'Hide password' : 'Show password'}
                    >
                      {showConfirmPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 space-y-2">
                  <button
                    type="submit"
                    disabled={changingPassword}
                    className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-1.5"
                  >
                    {changingPassword ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <span>Set New Password & Enter</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPendingPasswordChangeUser(null);
                      setNewPassword('');
                      setConfirmPassword('');
                      setChangePasswordError(null);
                    }}
                    className="w-full py-2 px-4 bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white rounded-lg text-xs font-medium transition"
                  >
                    Cancel & Return to Login
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <>
          {/* Session Timeout Banner */}
          {sessionTimeoutMessage && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 flex items-start justify-between gap-3 text-xs text-amber-200 shadow-lg">
              <div className="flex items-start space-x-2.5">
                <Clock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div>
                  <span className="font-bold text-amber-300 block">Session Timeout (30 Min Inactivity)</span>
                  <span className="text-[11px] text-amber-200/90 leading-relaxed block mt-0.5">
                    {sessionTimeoutMessage}
                  </span>
                </div>
              </div>
              {onClearTimeoutMessage && (
                <button
                  type="button"
                  onClick={onClearTimeoutMessage}
                  className="text-amber-400 hover:text-amber-200 p-0.5 rounded transition"
                  title="Dismiss alert"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
          )}

          {/* Alerts */}
          {error && (
            <div className="mb-4 p-3 rounded-lg bg-rose-500/10 border border-rose-500/30 flex items-start space-x-2 text-xs text-rose-300">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successNotice && (
            <div className="mb-4 p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 flex items-start space-x-2 text-xs text-emerald-300">
              <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{successNotice}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">
                User ID / Email / Register No.
              </label>
              <div className="relative">
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="admin@examcode.cse.in or REG2026001"
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-slate-300">
                  Password
                </label>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={loading}
                  className="text-[11px] text-indigo-400 hover:text-indigo-300 hover:underline font-medium"
                >
                  Forgot Password?
                </button>
              </div>
              <div className="relative">
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type={showPassword ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full bg-slate-800/80 border border-slate-700/80 rounded-lg pl-9 pr-10 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-200 transition p-0.5 focus:outline-none cursor-pointer"
                  title={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-2.5 px-4 bg-indigo-600 hover:bg-indigo-500 active:bg-indigo-700 disabled:opacity-50 text-white rounded-lg text-xs font-bold transition-all shadow-md shadow-indigo-600/20 flex items-center justify-center space-x-1.5"
            >
              {loading ? (
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
              ) : (
                <>
                  <span>Sign In</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </>
              )}
            </button>
          </form>
        </>
      )}
    </div>

        {/* Footnote */}
        <div className="text-center mt-6 flex items-center justify-center space-x-2 text-xs text-slate-500">
          <Database className="w-3.5 h-3.5 text-indigo-400" />
          <span>Real-Time Cloud Persistence Active</span>
        </div>
      </div>
    </div>
  );
};

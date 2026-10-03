import React from 'react';
import { ShieldCheck, User as UserIcon, Bell, ExternalLink, RefreshCw, KeyRound, LogOut } from 'lucide-react';
import { User, UserRole } from '../../types';
import { UserAvatar } from './UserAvatar';
import { QueueStatus } from '../../services/clientWriteQueue';

interface HeaderProps {
  currentUser: User;
  onSwitchRole?: (role: UserRole) => void;
  onOpenPrivacyModal?: () => void;
  writeQueueStatus?: QueueStatus;
  activeTab?: string;
  onSignOut?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  currentUser,
  onOpenPrivacyModal,
  writeQueueStatus,
  activeTab,
  onSignOut,
}) => {
  return (
    <header className="h-16 border-b-2 border-white/10 bg-[#141417] px-6 flex items-center justify-between sticky top-0 z-30 shrink-0">
      <div className="flex items-center space-x-4">
        <div className="flex items-center space-x-3">
          <div className="w-8 h-8 rounded bg-indigo-600 flex items-center justify-center text-[#0c0c0e] font-extrabold font-display text-lg shadow-sm">
            C
          </div>
          <div>
            <h1 className="text-lg font-extrabold text-white tracking-tight font-display flex items-center gap-2">
              CodeExam
              <span className="label-mono opacity-60">
                v2.4
              </span>
            </h1>
          </div>
        </div>
      </div>

      {/* User Profile & Controls */}
      <div className="flex items-center space-x-3">
        {/* User Card */}
        <div className="flex items-center space-x-3 pl-2 text-right">
          <div className="hidden sm:block">
            <div className="text-xs font-semibold text-zinc-200">{currentUser.name}</div>
            <div className="label-mono text-[10px]">
              {currentUser.role === 'CANDIDATE' ? 'student' : currentUser.role.toLowerCase()}
              {currentUser.role === 'CANDIDATE' && (currentUser.registerNo || currentUser.registerNumber) && (
                <span className="text-indigo-400 ml-1">
                  • {currentUser.registerNo || currentUser.registerNumber}
                </span>
              )}
            </div>
          </div>
          <UserAvatar
            name={currentUser.name}
            avatarUrl={currentUser.avatar || (currentUser as any).profilePicUrl || (currentUser as any).photoUrl}
            sizeClassName="w-8 h-8"
            textClassName="text-xs"
          />
        </div>

        {onSignOut && (
          <button
            onClick={onSignOut}
            title="Sign out"
            className="p-1.5 rounded bg-[#141417] hover:bg-rose-500/20 border border-white/10 hover:border-rose-500/40 text-zinc-400 hover:text-rose-300 transition-all cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
          </button>
        )}
      </div>
    </header>
  );
};

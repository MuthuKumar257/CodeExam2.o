import React, { useState } from 'react';

interface UserAvatarProps {
  name?: string;
  avatarUrl?: string;
  sizeClassName?: string;
  textClassName?: string;
  className?: string;
}

export const UserAvatar: React.FC<UserAvatarProps> = ({
  name = 'User',
  avatarUrl,
  sizeClassName = 'w-7 h-7',
  textClassName = 'text-xs',
  className = '',
}) => {
  const [imgError, setImgError] = useState(false);

  const cleanAvatarUrl =
    avatarUrl && typeof avatarUrl === 'string' && avatarUrl.trim().length > 0
      ? avatarUrl.trim()
      : null;

  const getInitials = (str: string) => {
    if (!str) return 'U';
    const parts = str.trim().split(/\s+/);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[1][0]).toUpperCase();
    }
    return str.slice(0, 2).toUpperCase();
  };

  if (cleanAvatarUrl && !imgError) {
    return (
      <div className={`relative rounded-full overflow-hidden shrink-0 bg-slate-800 border border-slate-700/60 ${sizeClassName} ${className}`}>
        <img
          src={cleanAvatarUrl}
          alt={name}
          className="w-full h-full object-cover rounded-full"
          onError={() => setImgError(true)}
          referrerPolicy="no-referrer"
        />
      </div>
    );
  }

  return (
    <div
      className={`rounded-full bg-gradient-to-tr from-indigo-600 to-indigo-400 flex items-center justify-center text-white font-bold uppercase shrink-0 border border-indigo-500/30 ${sizeClassName} ${textClassName} ${className}`}
    >
      {getInitials(name)}
    </div>
  );
};

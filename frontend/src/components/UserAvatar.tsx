import { useState, useEffect } from 'react';

interface UserAvatarProps {
  userId: string;
  username: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
  className?: string;
}

const sizeClasses = {
  sm: 'w-6 h-6',
  md: 'w-8 h-8',
  lg: 'w-10 h-10',
};

export function UserAvatar({ userId, username, size = 'md', onClick, className = '' }: UserAvatarProps) {
  const [hasAvatar, setHasAvatar] = useState(true);
  const [avatarKey, setAvatarKey] = useState(Date.now());

  // Construct avatar URL
  const avatarUrl = `/api/profile/avatar/${userId}?t=${avatarKey}`;

  // Reset avatar state when userId changes
  useEffect(() => {
    setHasAvatar(true);
    setAvatarKey(Date.now());
  }, [userId]);

  const handleError = () => {
    setHasAvatar(false);
  };

  const baseClasses = `rounded-full overflow-hidden flex items-center justify-center ${sizeClasses[size]} ${className}`;
  const interactiveClasses = onClick
    ? 'cursor-pointer hover:ring-2 hover:ring-blue-500 hover:ring-offset-2 dark:hover:ring-offset-gray-800 transition-all'
    : '';

  if (hasAvatar) {
    return (
      <button
        type="button"
        onClick={onClick}
        className={`${baseClasses} ${interactiveClasses}`}
        title={username}
      >
        <img
          src={avatarUrl}
          alt={`${username}'s avatar`}
          className="w-full h-full object-cover"
          onError={handleError}
        />
      </button>
    );
  }

  // Fallback: show user icon with initials background
  const initial = username.charAt(0).toUpperCase();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`${baseClasses} ${interactiveClasses} bg-gray-200 dark:bg-gray-700 text-gray-600 dark:text-gray-400`}
      title={username}
    >
      <span className="text-xs font-medium">{initial}</span>
    </button>
  );
}

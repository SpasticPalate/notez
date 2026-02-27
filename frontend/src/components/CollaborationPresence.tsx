import { useState, useEffect } from 'react';
import type { HocuspocusProvider } from '@hocuspocus/provider';

// Validates CSS color values from remote awareness data to prevent CSS injection.
const SAFE_COLOR_RE = /^(#[0-9a-fA-F]{3,8}|hsl\(\d{1,3},\s*\d{1,3}%,\s*\d{1,3}%\)|rgb\(\d{1,3},\s*\d{1,3},\s*\d{1,3}\)|[a-zA-Z]{1,30})$/;

interface User {
  name: string;
  color: string;
}

interface CollaborationPresenceProps {
  provider: HocuspocusProvider;
}

export function CollaborationPresence({ provider }: CollaborationPresenceProps) {
  const [users, setUsers] = useState<User[]>([]);

  useEffect(() => {
    const awareness = provider.awareness;
    if (!awareness) return;

    const updateUsers = () => {
      const states = awareness.getStates();
      const connectedUsers: User[] = [];

      states.forEach((state: any, clientId: number) => {
        // Skip our own cursor
        if (clientId === awareness.clientID) return;
        // Validate remote awareness data before rendering
        if (state.user && typeof state.user.name === 'string' && typeof state.user.color === 'string') {
          connectedUsers.push({
            name: state.user.name.slice(0, 50),
            color: SAFE_COLOR_RE.test(state.user.color) ? state.user.color : '#999999',
          });
        }
      });

      setUsers(connectedUsers);
    };

    awareness.on('change', updateUsers);
    updateUsers();

    return () => {
      awareness.off('change', updateUsers);
    };
  }, [provider]);

  if (users.length === 0) return null;

  return (
    <div className="flex items-center gap-1.5 px-4 py-1.5">
      <span className="text-xs text-gray-500 dark:text-gray-400 mr-1">Collaborators:</span>
      {users.map((user, i) => (
        <div
          key={`${user.name}-${i}`}
          className="flex items-center gap-1"
          title={user.name}
        >
          <div
            className="w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold text-white flex-shrink-0"
            style={{ backgroundColor: user.color }}
          >
            {user.name.charAt(0).toUpperCase()}
          </div>
          <span className="text-xs text-gray-600 dark:text-gray-300 hidden sm:inline">
            {user.name}
          </span>
        </div>
      ))}
    </div>
  );
}

import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { usersApi, systemApi } from '../lib/api';
import { Users, UserPlus, Key, UserX, UserCheck, Server, Database, HardDrive, Bot } from 'lucide-react';
import { useToast } from './Toast';

interface User {
  id: string;
  username: string;
  email: string;
  role: string;
  isActive: boolean;
  isServiceAccount: boolean;
  createdAt: string;
}

interface SystemInfo {
  version: string;
  nodeVersion: string;
  database: {
    status: string;
    info: string;
  };
  uptime: string;
  statistics: {
    totalNotes: number;
    totalFolders: number;
    totalTags: number;
  };
}

export function AdminPanel() {
  const { user } = useAuth();
  const { showToast } = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showResetModal, setShowResetModal] = useState<string | null>(null);

  // Create user form
  const [newUsername, setNewUsername] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState('user');
  const [newIsServiceAccount, setNewIsServiceAccount] = useState(false);
  const [createError, setCreateError] = useState('');

  // Reset password form
  const [resetPassword, setResetPassword] = useState('');
  const [resetError, setResetError] = useState('');

  useEffect(() => {
    if (user?.role === 'admin') {
      loadUsers();
      loadSystemInfo();
    }
  }, [user]);

  const loadUsers = async () => {
    setIsLoading(true);
    try {
      const response = await usersApi.list(true);
      setUsers(response.data.users);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load users:', error);
      showToast('Failed to load users', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const loadSystemInfo = async () => {
    try {
      const response = await systemApi.getInfo();
      setSystemInfo(response.data);
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to load system info:', error);
      setSystemInfo({
        version: 'Error',
        nodeVersion: 'Error',
        database: { status: 'error', info: 'Could not fetch info' },
        uptime: 'Error',
        statistics: { totalNotes: 0, totalFolders: 0, totalTags: 0 },
      });
    }
  };

  const handleCreateUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError('');

    try {
      await usersApi.create({
        username: newUsername,
        email: newEmail,
        password: newPassword,
        role: newRole,
        isServiceAccount: newIsServiceAccount,
      });

      setNewUsername('');
      setNewEmail('');
      setNewPassword('');
      setNewRole('user');
      setNewIsServiceAccount(false);
      setShowCreateModal(false);
      loadUsers();
    } catch (err: any) {
      setCreateError(err.response?.data?.message || 'Failed to create user');
    }
  };

  const handleToggleActive = async (userId: string, currentlyActive: boolean) => {
    const originalUsers = [...users];
    setUsers((currentUsers) =>
      currentUsers.map((u) =>
        u.id === userId ? { ...u, isActive: !currentlyActive } : u
      )
    );

    try {
      await usersApi.update(userId, { isActive: !currentlyActive });
    } catch (error) {
      if (import.meta.env.DEV) console.error('Failed to toggle user status:', error);
      setUsers(originalUsers);
      showToast('Failed to update user status', 'error');
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetError('');

    if (!showResetModal) return;

    try {
      await usersApi.resetPassword(showResetModal, resetPassword);
      setResetPassword('');
      setShowResetModal(null);
      showToast('Password reset successfully', 'success');
    } catch (err: any) {
      setResetError(err.response?.data?.message || 'Failed to reset password');
    }
  };

  if (user?.role !== 'admin') {
    return (
      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
        You don't have permission to access this section.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* System Information */}
      {systemInfo && (
        <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center space-x-3 bg-gray-50 dark:bg-gray-700/50 rounded-t-lg">
            <Server className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">System Information</h3>
          </div>
          <div className="p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Version Info */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                <HardDrive className="w-4 h-4" />
                <span className="text-sm font-medium">Application</span>
              </div>
              <div className="ml-6 text-sm">
                <p className="text-gray-900 dark:text-white">Version: <span className="font-mono">{systemInfo.version}</span></p>
                <p className="text-gray-900 dark:text-white">Node.js: <span className="font-mono">{systemInfo.nodeVersion}</span></p>
                <p className="text-gray-900 dark:text-white">Uptime: <span className="font-mono">{systemInfo.uptime}</span></p>
              </div>
            </div>

            {/* Database Info */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                <Database className="w-4 h-4" />
                <span className="text-sm font-medium">Database</span>
              </div>
              <div className="ml-6 text-sm">
                <p className="text-gray-900 dark:text-white">
                  Status:{' '}
                  <span
                    className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${
                      systemInfo.database.status === 'connected'
                        ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                        : systemInfo.database.status === 'error'
                        ? 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400'
                        : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                    }`}
                  >
                    {systemInfo.database.status}
                  </span>
                </p>
                <p className="text-gray-900 dark:text-white">
                  Type: <span className="font-mono">{systemInfo.database.info}</span>
                </p>
              </div>
            </div>

            {/* Content Statistics */}
            <div className="space-y-2">
              <div className="flex items-center space-x-2 text-gray-600 dark:text-gray-400">
                <HardDrive className="w-4 h-4" />
                <span className="text-sm font-medium">Content</span>
              </div>
              <div className="ml-6 text-sm">
                <p className="text-gray-900 dark:text-white">Notes: <span className="font-mono">{systemInfo.statistics.totalNotes}</span></p>
                <p className="text-gray-900 dark:text-white">Folders: <span className="font-mono">{systemInfo.statistics.totalFolders}</span></p>
                <p className="text-gray-900 dark:text-white">Tags: <span className="font-mono">{systemInfo.statistics.totalTags}</span></p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User Management */}
      <div className="border border-gray-200 dark:border-gray-700 rounded-lg">
        <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700 flex items-center justify-between bg-gray-50 dark:bg-gray-700/50 rounded-t-lg">
          <div className="flex items-center space-x-3">
            <Users className="w-5 h-5 text-gray-600 dark:text-gray-400" />
            <h3 className="font-semibold text-gray-900 dark:text-white">User Management</h3>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center space-x-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-md hover:bg-blue-700"
          >
            <UserPlus className="w-4 h-4" />
            <span>Create User</span>
          </button>
        </div>

        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {isLoading ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">Loading users...</div>
          ) : users.length === 0 ? (
            <div className="px-4 py-8 text-center text-gray-500 dark:text-gray-400">No users found</div>
          ) : (
            users.map((u) => (
              <div key={u.id} className="px-4 py-3 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50">
                <div className="flex-1">
                  <div className="flex items-center space-x-3">
                    <h4 className="font-medium text-gray-900 dark:text-white">{u.username}</h4>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        u.role === 'admin'
                          ? 'bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400'
                          : 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300'
                      }`}
                    >
                      {u.role}
                    </span>
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${
                        u.isActive
                          ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                          : 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                      }`}
                    >
                      {u.isActive ? 'Active' : 'Inactive'}
                    </span>
                    {u.isServiceAccount && (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                        <Bot className="w-3 h-3" />
                        Service Account
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">{u.email}</p>
                  <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                    Created: {new Date(u.createdAt).toLocaleDateString()}
                  </p>
                </div>

                <div className="flex items-center space-x-2">
                  <button
                    onClick={() => setShowResetModal(u.id)}
                    className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-md"
                    title="Reset Password"
                  >
                    <Key className="w-4 h-4" />
                  </button>

                  <button
                    onClick={() => handleToggleActive(u.id, u.isActive)}
                    className={`p-2 rounded-md ${
                      u.isActive
                        ? 'text-gray-600 dark:text-gray-400 hover:text-orange-600 hover:bg-orange-50 dark:hover:bg-orange-900/20'
                        : 'text-gray-600 dark:text-gray-400 hover:text-green-600 hover:bg-green-50 dark:hover:bg-green-900/20'
                    }`}
                    title={u.isActive ? 'Deactivate' : 'Activate'}
                  >
                    {u.isActive ? <UserX className="w-4 h-4" /> : <UserCheck className="w-4 h-4" />}
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Create User Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Create New User</h3>

            {createError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-400">
                {createError}
              </div>
            )}

            <form onSubmit={handleCreateUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Username</label>
                <input
                  type="text"
                  required
                  value={newUsername}
                  onChange={(e) => setNewUsername(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Email</label>
                <input
                  type="email"
                  required
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  Temporary Password
                </label>
                <input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  User will be required to change this on first login
                </p>
              </div>

              <div>
                <label htmlFor="new-user-role" className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">Role</label>
                <select
                  id="new-user-role"
                  name="new-user-role"
                  value={newRole}
                  onChange={(e) => setNewRole(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              <div>
                <label className="flex items-center space-x-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={newIsServiceAccount}
                    onChange={(e) => setNewIsServiceAccount(e.target.checked)}
                    className="rounded border-gray-300 dark:border-gray-600 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm font-medium text-gray-700 dark:text-gray-200">Service Account</span>
                </label>
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400 ml-6">
                  Service accounts are for automated agents. This cannot be changed after creation.
                </p>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Create User
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setCreateError('');
                    setNewIsServiceAccount(false);
                  }}
                  className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Reset Password Modal */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">Reset User Password</h3>

            {resetError && (
              <div className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md text-sm text-red-800 dark:text-red-400">
                {resetError}
              </div>
            )}

            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                  New Temporary Password
                </label>
                <input
                  type="password"
                  required
                  value={resetPassword}
                  onChange={(e) => setResetPassword(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Min 8 chars, 1 uppercase, 1 number"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  User will be required to change this on next login
                </p>
              </div>

              <div className="flex space-x-3 mt-6">
                <button
                  type="submit"
                  className="flex-1 py-2 px-4 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                >
                  Reset Password
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(null);
                    setResetError('');
                    setResetPassword('');
                  }}
                  className="flex-1 py-2 px-4 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

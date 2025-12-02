import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { profileApi } from '../lib/api';
import { User, Mail, Lock, Loader2, Check, Camera, Trash2 } from 'lucide-react';
import { useConfirm } from './ConfirmDialog';

export function ProfileSettings() {
  const { user, refreshAuth } = useAuth();
  const confirm = useConfirm();
  const [isEditingEmail, setIsEditingEmail] = useState(false);
  const [email, setEmail] = useState(user?.email || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [isUploadingAvatar, setIsUploadingAvatar] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load avatar on mount
  useEffect(() => {
    if (user?.userId) {
      // Add timestamp to bust cache when avatar changes
      // Use relative URL so it goes through nginx proxy in production
      setAvatarUrl(`/api/profile/avatar/${user.userId}?t=${Date.now()}`);
    }
  }, [user?.userId]);

  const handleEmailSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    setError('');
    setSuccess('');

    try {
      // TODO: Implement email change endpoint
      // For now, just show a message that this feature is coming
      setError('Email change feature coming soon');
      setIsEditingEmail(false);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to update email');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];
    if (!allowedTypes.includes(file.type)) {
      setError('Invalid file type. Allowed: JPEG, PNG, GIF, WebP');
      return;
    }

    // Validate file size (5MB)
    if (file.size > 5 * 1024 * 1024) {
      setError('File too large. Maximum size is 5MB');
      return;
    }

    setIsUploadingAvatar(true);
    setError('');
    setSuccess('');

    try {
      await profileApi.uploadAvatar(file);
      // Update avatar URL with cache buster
      setAvatarUrl(`/api/profile/avatar/${user!.userId}?t=${Date.now()}`);
      setSuccess('Avatar updated successfully');
      // Refresh user data to update avatarUrl in context
      await refreshAuth();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to upload avatar');
    } finally {
      setIsUploadingAvatar(false);
      // Reset file input
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleAvatarDelete = async () => {
    const confirmed = await confirm({
      title: 'Delete Avatar',
      message: 'Are you sure you want to delete your avatar?',
      confirmText: 'Delete',
      variant: 'danger',
    });
    if (!confirmed) return;

    setIsUploadingAvatar(true);
    setError('');
    setSuccess('');

    try {
      await profileApi.deleteAvatar();
      setAvatarUrl(null);
      setSuccess('Avatar deleted successfully');
      // Refresh user data
      await refreshAuth();
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to delete avatar');
    } finally {
      setIsUploadingAvatar(false);
    }
  };

  const handleAvatarError = () => {
    // Avatar not found, clear URL to show default
    setAvatarUrl(null);
  };

  if (!user) {
    return (
      <div className="py-12 text-center text-gray-500 dark:text-gray-400">
        <p>Please log in to view your profile.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif,image/webp"
        onChange={handleAvatarChange}
        className="hidden"
      />

      {/* Profile Header */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center space-x-4">
          {/* Avatar with upload/delete controls */}
          <div className="relative group">
            <div className="w-20 h-20 rounded-full overflow-hidden bg-blue-100 dark:bg-blue-900 flex items-center justify-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={user.username}
                  className="w-full h-full object-cover"
                  onError={handleAvatarError}
                />
              ) : (
                <User className="w-10 h-10 text-blue-600 dark:text-blue-400" />
              )}
            </div>

            {/* Upload overlay */}
            <button
              onClick={handleAvatarClick}
              disabled={isUploadingAvatar}
              className="absolute inset-0 w-20 h-20 rounded-full bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center cursor-pointer disabled:cursor-not-allowed"
              title="Change avatar"
            >
              {isUploadingAvatar ? (
                <Loader2 className="w-6 h-6 text-white animate-spin" />
              ) : (
                <Camera className="w-6 h-6 text-white" />
              )}
            </button>

            {/* Delete button (only show if avatar exists) */}
            {avatarUrl && !isUploadingAvatar && (
              <button
                onClick={handleAvatarDelete}
                className="absolute -bottom-1 -right-1 w-7 h-7 rounded-full bg-red-500 hover:bg-red-600 text-white flex items-center justify-center shadow-md transition-colors"
                title="Delete avatar"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>

          <div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">{user.username}</h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {user.role === 'admin' ? 'Administrator' : 'User'}
            </p>
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Click avatar to upload (JPEG, PNG, GIF, WebP - max 5MB)
            </p>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 rounded-md text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      {success && (
        <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 rounded-md text-sm text-green-800 dark:text-green-200">
          {success}
        </div>
      )}

      {/* Email Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Mail className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Email Address</h3>
        </div>

        {isEditingEmail ? (
          <form onSubmit={handleEmailSave} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
                New Email Address
              </label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 dark:bg-gray-700 dark:text-white"
                placeholder="your@email.com"
              />
              <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                You'll need to verify your new email address.
              </p>
            </div>

            <div className="flex space-x-3">
              <button
                type="button"
                onClick={() => {
                  setIsEditingEmail(false);
                  setEmail(user.email);
                  setError('');
                }}
                className="px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-200 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSaving || email === user.email}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center space-x-2"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>Saving...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Save</span>
                  </>
                )}
              </button>
            </div>
          </form>
        ) : (
          <div className="flex items-center justify-between">
            <div>
              <p className="text-gray-900 dark:text-white">{user.email}</p>
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Your email is used for account recovery and notifications.
              </p>
            </div>
            <button
              onClick={() => setIsEditingEmail(true)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              Change
            </button>
          </div>
        )}
      </div>

      {/* Password Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center space-x-3 mb-4">
          <Lock className="w-5 h-5 text-gray-600 dark:text-gray-400" />
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Password</h3>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-gray-900 dark:text-white">••••••••••••</p>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Last changed: Unknown
            </p>
          </div>
          <Link
            to="/change-password"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            Change Password
          </Link>
        </div>
      </div>

      {/* Account Info */}
      <div className="bg-gray-50 dark:bg-gray-900/50 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
        <h4 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-3">Account Information</h4>
        <dl className="space-y-2 text-sm">
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">Username</dt>
            <dd className="text-gray-900 dark:text-white font-medium">{user.username}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">Role</dt>
            <dd className="text-gray-900 dark:text-white font-medium capitalize">{user.role}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-gray-500 dark:text-gray-400">User ID</dt>
            <dd className="text-gray-900 dark:text-white font-mono text-xs">{user.userId}</dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

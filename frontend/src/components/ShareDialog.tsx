import { useState, useEffect, useRef, useCallback, useId } from 'react';
import { X, Share2, Trash2 } from 'lucide-react';
import { sharesApi } from '../lib/api';
import { useToast } from './Toast';
import type { NoteShare, SharedContact } from '../lib/api';

interface ShareDialogProps {
  isOpen: boolean;
  onClose: () => void;
  noteId: string;
  noteTitle: string;
}

export function ShareDialog({ isOpen, onClose, noteId, noteTitle }: ShareDialogProps) {
  const { showToast } = useToast();
  const [shares, setShares] = useState<NoteShare[]>([]);
  const [usernameOrEmail, setUsernameOrEmail] = useState('');
  const [permission, setPermission] = useState<'VIEW' | 'EDIT'>('VIEW');
  const [isLoading, setIsLoading] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Autocomplete state
  const [contacts, setContacts] = useState<SharedContact[]>([]);
  const [showDropdown, setShowDropdown] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>(undefined);
  const blurTimeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  // Unique IDs for ARIA
  const titleId = useId();
  const listboxId = useId();
  const errorId = useId();

  // Reset state when dialog opens, load data
  useEffect(() => {
    if (isOpen && noteId) {
      setUsernameOrEmail('');
      setError(null);
      setSuccessMessage(null);
      setShowDropdown(false);
      setActiveIndex(-1);
      setPermission('VIEW');
      loadShares();
      fetchContacts('');
    }
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
    };
  }, [isOpen, noteId]);

  // Escape key to close dialog (when dropdown is closed)
  useEffect(() => {
    if (!isOpen) return;
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showDropdown) {
          setShowDropdown(false);
        } else {
          onClose();
        }
      }
    };
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, showDropdown, onClose]);

  // Focus trap inside modal dialog
  useEffect(() => {
    if (!isOpen || !dialogRef.current) return;
    const dialog = dialogRef.current;

    const handleTab = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const focusable = dialog.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      );
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleTab);
    return () => document.removeEventListener('keydown', handleTab);
  }, [isOpen, shares]);

  // Clamp activeIndex when filteredContacts changes
  const sharedUserIds = new Set(shares.map((s) => s.sharedWith.id));
  const filteredContacts = contacts.filter((c) => !sharedUserIds.has(c.id));

  useEffect(() => {
    setActiveIndex((prev) =>
      prev >= filteredContacts.length ? filteredContacts.length - 1 : prev
    );
  }, [filteredContacts.length]);

  const loadShares = async () => {
    setIsLoading(true);
    try {
      const response = await sharesApi.listShares(noteId);
      setShares(response.data.shares);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to load shares:', err);
      showToast('Failed to load sharing information', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const fetchContacts = useCallback(async (query: string) => {
    try {
      const response = await sharesApi.getSharedContacts(query || undefined, 8);
      setContacts(response.data.contacts);
    } catch (err) {
      if (import.meta.env.DEV) console.error('Failed to fetch contacts:', err);
    }
  }, []);

  const handleInputChange = (value: string) => {
    setUsernameOrEmail(value);
    setActiveIndex(-1);
    setError(null);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchContacts(value);
    }, 200);

    setShowDropdown(true);
  };

  const handleSelectContact = (contact: SharedContact) => {
    setUsernameOrEmail(contact.username);
    setShowDropdown(false);
    setActiveIndex(-1);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (!showDropdown || filteredContacts.length === 0) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex((prev) => (prev < filteredContacts.length - 1 ? prev + 1 : 0));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex((prev) => (prev > 0 ? prev - 1 : filteredContacts.length - 1));
    } else if (e.key === 'Enter' && activeIndex >= 0 && activeIndex < filteredContacts.length) {
      e.preventDefault();
      handleSelectContact(filteredContacts[activeIndex]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setShowDropdown(false);
    }
  };

  // Scroll active dropdown item into view
  useEffect(() => {
    if (activeIndex >= 0 && dropdownRef.current) {
      const activeEl = dropdownRef.current.querySelector(`[data-index="${activeIndex}"]`);
      activeEl?.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!usernameOrEmail.trim()) return;

    setIsSharing(true);
    setError(null);
    setSuccessMessage(null);
    setShowDropdown(false);

    try {
      await sharesApi.shareNote(noteId, { usernameOrEmail: usernameOrEmail.trim(), permission });
      setSuccessMessage(`Shared with ${usernameOrEmail.trim()}`);
      setTimeout(() => setSuccessMessage(null), 3000);
      setUsernameOrEmail('');
      await loadShares();
      // Refresh contacts so the new user appears next time
      fetchContacts('');
    } catch (err: any) {
      const msg = err.response?.data?.message || 'Failed to share note';
      setError(msg);
    } finally {
      setIsSharing(false);
    }
  };

  const handleUpdatePermission = async (shareId: string, newPermission: 'VIEW' | 'EDIT') => {
    const originalShares = [...shares];
    setShares(shares.map(s => s.id === shareId ? { ...s, permission: newPermission } : s));
    try {
      await sharesApi.updatePermission(noteId, shareId, newPermission);
    } catch (err) {
      setShares(originalShares);
      showToast('Failed to update permission', 'error');
      if (import.meta.env.DEV) console.error('Failed to update permission:', err);
    }
  };

  const handleRemoveShare = async (shareId: string) => {
    const originalShares = [...shares];
    setShares(shares.filter(s => s.id !== shareId));
    try {
      await sharesApi.removeShare(noteId, shareId);
    } catch (err) {
      setShares(originalShares);
      showToast('Failed to remove access', 'error');
      if (import.meta.env.DEV) console.error('Failed to remove share:', err);
    }
  };

  if (!isOpen) return null;

  // Using mousedown instead of click prevents issues with text selection.
  // When user drags to select text and mouseup lands on backdrop, click fires
  // but mousedown only fires if the click started on the backdrop.
  const handleBackdropMouseDown = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  };

  const dropdownOpen = showDropdown && filteredContacts.length > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm"
      onMouseDown={handleBackdropMouseDown}
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center space-x-2">
            <Share2 className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            <h3 id={titleId} className="text-lg font-semibold text-gray-900 dark:text-white">Share Note</h3>
          </div>
          <button
            onClick={onClose}
            aria-label="Close dialog"
            className="p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Note title */}
        <div className="px-4 py-2 bg-gray-50 dark:bg-gray-900/50 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-600 dark:text-gray-400 truncate">
            {noteTitle}
          </p>
        </div>

        {/* Share form */}
        <form onSubmit={handleShare} className="p-4 space-y-3">
          <div className="flex space-x-2">
            <div className="relative flex-1">
              <input
                ref={inputRef}
                type="text"
                role="combobox"
                aria-expanded={dropdownOpen}
                aria-haspopup="listbox"
                aria-autocomplete="list"
                aria-controls={dropdownOpen ? listboxId : undefined}
                aria-activedescendant={activeIndex >= 0 && filteredContacts[activeIndex] ? `contact-${filteredContacts[activeIndex].id}` : undefined}
                aria-label="Username or email to share with"
                aria-describedby={error ? errorId : undefined}
                aria-invalid={!!error}
                value={usernameOrEmail}
                onChange={(e) => handleInputChange(e.target.value)}
                onFocus={() => {
                  if (blurTimeoutRef.current) clearTimeout(blurTimeoutRef.current);
                  setShowDropdown(true);
                }}
                onBlur={() => {
                  blurTimeoutRef.current = setTimeout(() => setShowDropdown(false), 150);
                }}
                onKeyDown={handleKeyDown}
                placeholder="Username or email"
                className="w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                autoComplete="off"
              />
              {/* Autocomplete dropdown */}
              {dropdownOpen && (
                <div
                  ref={dropdownRef}
                  id={listboxId}
                  role="listbox"
                  aria-label="Recent contacts"
                  className="absolute z-10 w-full mt-1 bg-white dark:bg-gray-700 border border-gray-200 dark:border-gray-600 rounded-md shadow-lg max-h-48 overflow-y-auto overscroll-contain"
                >
                  <div className="px-3 py-1.5 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide" role="presentation">
                    Recent contacts
                  </div>
                  {filteredContacts.map((contact, index) => (
                    <button
                      key={contact.id}
                      id={`contact-${contact.id}`}
                      data-index={index}
                      type="button"
                      role="option"
                      aria-selected={index === activeIndex}
                      onMouseDown={(e) => {
                        e.preventDefault(); // Prevent input blur
                        handleSelectContact(contact);
                      }}
                      className={`w-full px-3 py-2 flex items-center space-x-2 text-left hover:bg-gray-100 dark:hover:bg-gray-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-500 ${
                        index === activeIndex ? 'bg-gray-100 dark:bg-gray-600' : ''
                      }`}
                    >
                      <div className="w-7 h-7 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                        <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                          {contact.username.charAt(0).toUpperCase()}
                        </span>
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                          {contact.username}
                        </p>
                        <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                          {contact.email || contact.username}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as 'VIEW' | 'EDIT')}
              aria-label="Permission level"
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="VIEW">View</option>
              <option value="EDIT">Edit</option>
            </select>
            <button
              type="submit"
              disabled={isSharing || !usernameOrEmail.trim()}
              aria-busy={isSharing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2"
            >
              {isSharing ? 'Sharing...' : 'Share'}
            </button>
          </div>
          {error && (
            <p id={errorId} role="alert" className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          {/* Live region for success announcements */}
          <div aria-live="polite" className="sr-only">{successMessage}</div>
        </form>

        {/* Shares list */}
        <div className="px-4 pb-4">
          <h4 className="text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wide mb-2">
            People with access
          </h4>
          {isLoading ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Loading...</p>
          ) : shares.length === 0 ? (
            <p className="text-sm text-gray-500 dark:text-gray-400 py-2">Not shared with anyone yet</p>
          ) : (
            <div className="space-y-2 max-h-48 overflow-y-auto overscroll-contain">
              {shares.map((share) => (
                <div
                  key={share.id}
                  className="flex items-center justify-between py-2 px-2 rounded hover:bg-gray-50 dark:hover:bg-gray-700/50"
                >
                  <div className="flex items-center space-x-2 min-w-0">
                    <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center flex-shrink-0">
                      <span className="text-xs font-medium text-blue-700 dark:text-blue-300">
                        {share.sharedWith.username.charAt(0).toUpperCase()}
                      </span>
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {share.sharedWith.username}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                        {share.sharedWith.email || share.sharedWith.username}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center space-x-2 flex-shrink-0">
                    <select
                      value={share.permission}
                      onChange={(e) => handleUpdatePermission(share.id, e.target.value as 'VIEW' | 'EDIT')}
                      aria-label={`Permission for ${share.sharedWith.username}`}
                      className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 dark:bg-gray-700 dark:text-white rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <option value="VIEW">View</option>
                      <option value="EDIT">Edit</option>
                    </select>
                    <button
                      onClick={() => handleRemoveShare(share.id)}
                      aria-label={`Remove access for ${share.sharedWith.username}`}
                      title={`Remove access for ${share.sharedWith.username}`}
                      className="p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

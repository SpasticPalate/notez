import { useState, useEffect } from 'react';
import { foldersApi } from '../lib/api';
import { ChevronLeft, ChevronRight, Folder, FolderPlus } from 'lucide-react';

interface FolderData {
  id: string;
  name: string;
  noteCount: number;
  createdAt: string;
  updatedAt: string;
}

interface FolderSidebarProps {
  selectedFolderId: string | null;
  onSelectFolder: (folderId: string | null) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export function FolderSidebar({
  selectedFolderId,
  onSelectFolder,
  collapsed,
  onToggleCollapse,
}: FolderSidebarProps) {
  const [folders, setFolders] = useState<FolderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');

  useEffect(() => {
    loadFolders();
  }, []);

  const loadFolders = async () => {
    try {
      const response = await foldersApi.list();
      setFolders(response.data.folders);
    } catch (error) {
      console.error('Failed to load folders:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;

    try {
      await foldersApi.create({ name: newFolderName.trim() });
      setNewFolderName('');
      setShowNewFolderInput(false);
      loadFolders();
    } catch (error: any) {
      alert(error.response?.data?.message || 'Failed to create folder');
    }
  };

  if (collapsed) {
    return (
      <div className="w-12 bg-white border-r border-gray-200 flex flex-col items-center py-4">
        <button
          onClick={onToggleCollapse}
          className="p-2 hover:bg-gray-100 rounded-md"
          title="Expand sidebar"
        >
          <ChevronRight className="w-5 h-5 text-gray-600" />
        </button>
      </div>
    );
  }

  return (
    <div className="w-64 bg-white border-r border-gray-200 flex flex-col">
      {/* Sidebar Header */}
      <div className="p-4 border-b border-gray-200 flex items-center justify-between">
        <h2 className="font-semibold text-gray-900">Folders</h2>
        <div className="flex items-center space-x-1">
          <button
            onClick={() => setShowNewFolderInput(true)}
            className="p-1.5 hover:bg-gray-100 rounded-md"
            title="New folder"
          >
            <FolderPlus className="w-4 h-4 text-gray-600" />
          </button>
          <button
            onClick={onToggleCollapse}
            className="p-1.5 hover:bg-gray-100 rounded-md"
            title="Collapse sidebar"
          >
            <ChevronLeft className="w-4 h-4 text-gray-600" />
          </button>
        </div>
      </div>

      {/* New Folder Input */}
      {showNewFolderInput && (
        <div className="p-2 border-b border-gray-200">
          <form onSubmit={handleCreateFolder} className="flex space-x-1">
            <input
              type="text"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              placeholder="Folder name"
              className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-blue-500"
              autoFocus
            />
            <button
              type="submit"
              className="px-2 py-1 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Add
            </button>
            <button
              type="button"
              onClick={() => {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }}
              className="px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* Folder List */}
      <div className="flex-1 overflow-y-auto">
        {/* All Notes */}
        <button
          onClick={() => onSelectFolder(null)}
          className={`w-full px-4 py-2.5 flex items-center space-x-3 hover:bg-gray-50 ${
            selectedFolderId === null ? 'bg-blue-50 border-l-4 border-blue-600' : ''
          }`}
        >
          <Folder className="w-5 h-5 text-gray-400" />
          <span className="text-sm font-medium text-gray-700">All Notes</span>
        </button>

        {/* Folder Items */}
        {isLoading ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">Loading...</div>
        ) : folders.length === 0 ? (
          <div className="px-4 py-8 text-center text-sm text-gray-500">
            No folders yet. Create one to get started!
          </div>
        ) : (
          folders.map((folder) => (
            <button
              key={folder.id}
              onClick={() => onSelectFolder(folder.id)}
              className={`w-full px-4 py-2.5 flex items-center justify-between hover:bg-gray-50 ${
                selectedFolderId === folder.id ? 'bg-blue-50 border-l-4 border-blue-600' : ''
              }`}
            >
              <div className="flex items-center space-x-3">
                <Folder className="w-5 h-5 text-gray-400" />
                <span className="text-sm font-medium text-gray-700">{folder.name}</span>
              </div>
              <span className="text-xs text-gray-500">{folder.noteCount}</span>
            </button>
          ))
        )}
      </div>
    </div>
  );
}

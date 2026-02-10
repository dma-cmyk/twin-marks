import React, { useEffect, useState } from 'react';
import { getSubTree, checkLink, getBookmark, removeBookmark, updateBookmark, moveBookmark } from '../utils/bookmarkService';
import type { BookmarkNode } from '../utils/bookmarkService';
import { Folder, FileText, ArrowLeft, CheckCircle2, XCircle, Loader2, Trash2, Edit2, Copy, CheckSquare, Square } from 'lucide-react';

interface BookmarkListProps {
  folderId: string;
  customBookmarks?: BookmarkNode[] | null; // For search results
  onNavigate: (id: string) => void;
  onSelectUrl: (url: string) => void;
  className?: string;
  title?: string;
}

type LinkStatus = 'idle' | 'loading' | 'ok' | 'error';

export const BookmarkList: React.FC<BookmarkListProps> = ({ folderId, customBookmarks, onNavigate, onSelectUrl, className, title }) => {
  const [bookmarks, setBookmarks] = useState<BookmarkNode[]>([]);
  const [currentFolder, setCurrentFolder] = useState<BookmarkNode | null>(null);
  const [linkStatuses, setLinkStatuses] = useState<Record<string, LinkStatus>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editUrl, setEditUrl] = useState('');
  const [copiedLinkFeedbackId, setCopiedLinkFeedbackId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    // If customBookmarks is provided (e.g. search results), use it and skip fetching
    if (customBookmarks) {
        setBookmarks(customBookmarks);
        setCurrentFolder(null); // No specific folder context
        setSelectedIds(new Set()); // Reset selection on new search
        return;
    }

    const handleRefresh = () => loadBookmarks();
    if (typeof chrome !== 'undefined' && chrome.bookmarks) {
        chrome.bookmarks.onCreated.addListener(handleRefresh);
        chrome.bookmarks.onRemoved.addListener(handleRefresh);
        chrome.bookmarks.onChanged.addListener(handleRefresh);
        chrome.bookmarks.onMoved.addListener(handleRefresh);
    }
    return () => {
        if (typeof chrome !== 'undefined' && chrome.bookmarks) {
            chrome.bookmarks.onCreated.removeListener(handleRefresh);
            chrome.bookmarks.onRemoved.removeListener(handleRefresh);
            chrome.bookmarks.onChanged.removeListener(handleRefresh);
            chrome.bookmarks.onMoved.removeListener(handleRefresh);
        }
    }
  }, [folderId, customBookmarks]); 

  useEffect(() => {
    if (!customBookmarks) {
        loadBookmarks();
        setSelectedIds(new Set()); // Reset selection on folder change
    }
  }, [folderId, customBookmarks]);

  const loadBookmarks = async () => {
    const nodes = await getSubTree(folderId);
    setBookmarks(nodes);
    
    if (folderId !== '0') {
         const folderNode = await getBookmark(folderId);
         setCurrentFolder(folderNode);
    } else {
        setCurrentFolder(null);
    }
  };

  const handleCheckLinks = async () => {
    const newStatuses = { ...linkStatuses };
    
    // Only check selected if any, otherwise all
    const targets = selectedIds.size > 0 
        ? bookmarks.filter(b => selectedIds.has(b.id)) 
        : bookmarks;

    targets.forEach(b => {
      if (b.url) newStatuses[b.id] = 'loading';
    });
    setLinkStatuses(newStatuses);

    await Promise.all(targets.map(async (b) => {
      if (b.url) {
        const result = await checkLink(b.url);
        setLinkStatuses(prev => ({
            ...prev,
            [b.id]: result.ok ? 'ok' : 'error'
        }));
      }
    }));
  };

  const handleDelete = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this?')) {
        await removeBookmark(id);
    }
  };

  const handleBulkDelete = async () => {
      if (selectedIds.size === 0) return;
      if (confirm(`Are you sure you want to delete ${selectedIds.size} items?`)) {
          // Process in sequence or parallel? Parallel is fine.
          await Promise.all(Array.from(selectedIds).map(id => removeBookmark(id)));
          setSelectedIds(new Set());
      }
  };

  const startEdit = (e: React.MouseEvent, node: BookmarkNode) => {
      e.stopPropagation();
      setEditingId(node.id);
      setEditTitle(node.title);
      setEditUrl(node.url || '');
  };

  const saveEdit = async (e: React.FormEvent) => {
      e.preventDefault();
      if (editingId) {
          await updateBookmark(editingId, { title: editTitle, url: editUrl || undefined });
          setEditingId(null);
      }
  };

  const handleDragStart = (e: React.DragEvent, node: BookmarkNode) => {
      // If dragging a selected item, we could support multi-drag later.
      // For now, simple single item drag.
      e.dataTransfer.setData('application/json', JSON.stringify({ id: node.id, parentId: node.parentId }));
      e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetParentId: string) => {
      e.preventDefault();
      if (customBookmarks) return;

      const data = e.dataTransfer.getData('application/json');
      if (data) {
          const { id, parentId: sourceParentId } = JSON.parse(data);
          if (id && sourceParentId !== targetParentId) {
              await moveBookmark(id, { parentId: targetParentId });
          }
      }
  };

  const handleDropOnFolder = async (e: React.DragEvent, folderId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const data = e.dataTransfer.getData('application/json');
    if (data) {
        const { id } = JSON.parse(data);
        if (id && id !== folderId) {
            await moveBookmark(id, { parentId: folderId });
        }
    }
  };

  const handleCopyLink = async (e: React.MouseEvent, url: string, id: string) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(url);
      setCopiedLinkFeedbackId(id);
      setTimeout(() => setCopiedLinkFeedbackId(null), 1500); 
    } catch (err) {
      console.error('Failed to copy text: ', err);
    }
  };

  const toggleSelection = (e: React.MouseEvent, id: string) => {
      e.stopPropagation();
      const newSet = new Set(selectedIds);
      if (newSet.has(id)) {
          newSet.delete(id);
      } else {
          newSet.add(id);
      }
      setSelectedIds(newSet);
  };

  const toggleSelectAll = () => {
      if (selectedIds.size === bookmarks.length && bookmarks.length > 0) {
          setSelectedIds(new Set());
      } else {
          setSelectedIds(new Set(bookmarks.map(b => b.id)));
      }
  };

  return (
    <div 
        className={`flex flex-col bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-xl ${className}`}
        onDragOver={handleDragOver}
        onDrop={(e) => handleDrop(e, folderId)}
    >
      {/* List Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-slate-900 border-b border-slate-800/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="flex items-center gap-3 overflow-hidden">
             {/* Select All Checkbox */}
             <button 
                onClick={toggleSelectAll}
                className="text-slate-500 hover:text-blue-400 transition-colors"
                title="Select All"
             >
                 {bookmarks.length > 0 && selectedIds.size === bookmarks.length ? (
                     <CheckSquare size={18} className="text-blue-500" />
                 ) : (
                     <Square size={18} />
                 )}
             </button>

            {!customBookmarks && folderId !== '0' && currentFolder && currentFolder.parentId && ( 
                 <button 
                 onClick={() => onNavigate(currentFolder.parentId!)}
                 className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-400 transition-all duration-200"
                 title="Go Up"
               >
                 <ArrowLeft size={18} />
               </button>
            )}
            {customBookmarks && (
                 <button 
                 onClick={() => onNavigate('ROOT_OR_PREV')} 
                 className="p-1.5 hover:bg-slate-800 rounded-lg text-slate-400 hover:text-blue-400 transition-all duration-200"
                 title="Back to Folders"
               >
                 <ArrowLeft size={18} />
               </button>
            )}

          <div className="flex flex-col min-w-0">
             <span className="font-bold text-sm truncate text-slate-200 tracking-wide">
                {selectedIds.size > 0 ? `${selectedIds.size} Selected` : (title || currentFolder?.title || (customBookmarks ? 'Search Results' : 'Root'))}
             </span>
             {currentFolder && !customBookmarks && selectedIds.size === 0 && (
                 <span className="text-[10px] text-slate-500 font-mono truncate">/{currentFolder.title}</span>
             )}
             {customBookmarks && selectedIds.size === 0 && (
                 <span className="text-[10px] text-slate-500 font-mono truncate">{bookmarks.length} hits</span>
             )}
          </div>
        </div>
        
        <div className="flex items-center gap-2">
            {selectedIds.size > 0 && (
                <button 
                    onClick={handleBulkDelete}
                    className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-rose-500/10 text-rose-400 rounded-full hover:bg-rose-600 hover:text-white transition-all duration-300 border border-rose-500/20 hover:border-rose-500 shadow-sm"
                >
                    <Trash2 size={12} />
                    <span>Delete</span>
                </button>
            )}

            <button 
                onClick={handleCheckLinks}
                className="flex items-center gap-1.5 text-[11px] font-medium px-3 py-1.5 bg-slate-800 text-slate-300 rounded-full hover:bg-blue-600 hover:text-white transition-all duration-300 border border-slate-700 hover:border-blue-500 shadow-sm"
            >
                <CheckCircle2 size={12} />
                <span>Scan</span>
            </button>
        </div>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1 bg-slate-900/50">
        {bookmarks.length === 0 && (
            <div className="flex flex-col items-center justify-center h-40 text-slate-600 space-y-2">
                <Folder size={32} className="opacity-20" />
                <span className="text-xs font-medium">
                    {customBookmarks ? 'No results found' : 'Empty Folder'}
                </span>
            </div>
        )}
        
        {bookmarks.map((node) => (
            editingId === node.id ? (
                <form key={node.id} onSubmit={saveEdit} className="p-3 bg-slate-800 rounded-lg border border-blue-500/50 shadow-lg animate-in fade-in zoom-in-95 duration-200">
                   {/* Edit Form Content - same as before */}
                    <div className="space-y-2">
                        <input 
                            className="w-full p-2 text-sm bg-slate-950 text-slate-200 rounded-md border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none transition-all"
                            value={editTitle} 
                            onChange={e => setEditTitle(e.target.value)} 
                            placeholder="Title"
                            autoFocus
                        />
                        {node.url && (
                            <input 
                                className="w-full p-2 text-xs bg-slate-950 text-slate-400 rounded-md border border-slate-700 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 outline-none font-mono"
                                value={editUrl} 
                                onChange={e => setEditUrl(e.target.value)} 
                                placeholder="https://..."
                            />
                        )}
                    </div>
                    <div className="flex justify-end gap-2 mt-3">
                        <button type="button" onClick={() => setEditingId(null)} className="px-3 py-1 text-xs font-medium text-slate-400 hover:text-slate-200 transition-colors">Cancel</button>
                        <button type="submit" className="px-3 py-1 text-xs font-bold bg-blue-600 text-white rounded-md hover:bg-blue-500 shadow-lg shadow-blue-900/20 transition-all">Save</button>
                    </div>
                </form>
            ) : (
          <div 
            key={node.id}
            draggable
            onDragStart={(e) => handleDragStart(e, node)}
            onDragOver={handleDragOver}
            onDrop={(e) => !node.url ? handleDropOnFolder(e, node.id) : undefined}
            className={`group relative flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all duration-200 border ${selectedIds.has(node.id) ? 'bg-blue-900/20 border-blue-500/30' : 'hover:bg-slate-800 border-transparent hover:border-slate-700'}`}
            onClick={() => {
              // Click now toggles selection if ctrl/cmd is pressed? 
              // Or standard behavior: Click = Navigate/Select. 
              // User asked for "Checkboxes". So click on body can still be Navigate/SelectUrl.
              // Click on checkbox = Toggle Selection.
              if (node.url) {
                onSelectUrl(node.url);
              } else {
                onNavigate(node.id);
              }
            }}
          >
            {/* Checkbox - Leftmost */}
            <div 
                onClick={(e) => toggleSelection(e, node.id)}
                className={`p-1 rounded hover:bg-slate-700/50 cursor-pointer ${selectedIds.has(node.id) ? 'text-blue-500' : 'text-slate-600 hover:text-slate-400'}`}
            >
                {selectedIds.has(node.id) ? <CheckSquare size={16} /> : <Square size={16} />}
            </div>

            {/* Icon */}
            <div className={`p-2 rounded-lg ${!node.url ? 'bg-amber-500/10 text-amber-500' : 'bg-slate-700/30 text-slate-400 group-hover:text-blue-400 group-hover:bg-blue-500/10'} transition-colors duration-300`}>
                {!node.url ? <Folder size={18} fill="currentColor" fillOpacity={0.2} /> : <FileText size={18} />}
            </div>
            
            {/* Text */}
            <div className="flex-1 min-w-0 flex flex-col justify-center">
                <div className={`text-sm font-medium truncate ${!node.url ? 'text-amber-100/90' : 'text-slate-300 group-hover:text-blue-200'} transition-colors`}>
                    {node.title}
                    {/* Link count for folders */}
                    {!node.url && node.children && (
                        <span className="ml-2 text-xs font-mono text-slate-500 group-hover:text-slate-400">
                            ({node.children.filter(child => child.url).length} links)
                        </span>
                    )}
                </div>
                {node.url && (
                    <div className="text-[10px] truncate text-slate-500 group-hover:text-slate-400 font-mono opacity-80">
                        {node.url.replace(/^https?:\/\/(www\.)?/, '')}
                    </div>
                )}
            </div>
            
            {/* Status & Actions */}
            <div className="flex items-center gap-2">
                {node.url && (
                    <div className="w-5 flex justify-center">
                        {linkStatuses[node.id] === 'loading' && <Loader2 size={14} className="animate-spin text-blue-500" />}
                        {linkStatuses[node.id] === 'ok' && <CheckCircle2 size={14} className="text-emerald-500 drop-shadow-[0_0_3px_rgba(16,185,129,0.5)]" />}
                        {linkStatuses[node.id] === 'error' && <XCircle size={14} className="text-rose-500 drop-shadow-[0_0_3px_rgba(244,63,94,0.5)]" />}
                    </div>
                )}

                {/* Hover Actions */}
                <div className="flex items-center opacity-0 group-hover:opacity-100 transition-opacity duration-200 bg-slate-800/80 rounded-lg p-0.5 border border-slate-700/50 backdrop-blur-sm absolute right-2 shadow-lg">
                    {node.url && (
                        <button 
                            onClick={(e) => handleCopyLink(e, node.url!, node.id)} 
                            className="relative p-1.5 text-slate-400 hover:text-cyan-400 hover:bg-slate-700 rounded-md transition-colors"
                            title="Copy Link"
                        >
                            <Copy size={14} />
                            {copiedLinkFeedbackId === node.id && (
                                <span className="absolute -top-6 left-1/2 -translate-x-1/2 bg-blue-500 text-white text-xs px-2 py-0.5 rounded-full whitespace-nowrap animate-in fade-in-50">Copied!</span>
                            )}
                        </button>
                    )}
                    <button 
                        onClick={(e) => startEdit(e, node)} 
                        className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-slate-700 rounded-md transition-colors"
                        title="Edit"
                    >
                        <Edit2 size={14} />
                    </button>
                    <button 
                        onClick={(e) => handleDelete(e, node.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-slate-700 rounded-md transition-colors"
                        title="Delete"
                    >
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>
          </div>
            )
        ))}
      </div>
    </div>
  );
};

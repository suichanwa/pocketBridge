import React, { useState, useEffect, useRef, useMemo } from 'react';
import type { FileItem } from '../../shared/types.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { Badge } from '@/components/ui/badge.js';
import {
  Folder,
  File,
  FileCode,
  Image,
  Package,
  Archive,
  ArrowUp,
  Download,
  Trash2,
  Upload,
  RotateCw,
  Search,
  X,
  HardDrive,
  FolderOpen,
  Check,
} from 'lucide-react';

interface FileManagerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FileManager: React.FC<FileManagerProps> = ({ isOpen, onClose }) => {
  const [currentPath, setCurrentPath] = useState<string>('');
  const [parentPath, setParentPath] = useState<string | null>(null);
  const [items, setItems] = useState<FileItem[]>([]);
  const [quickShortcuts, setQuickShortcuts] = useState<{ name: string; path: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const fetchDirectory = async (targetPath?: string) => {
    setLoading(true);
    setError(null);
    try {
      const url = targetPath
        ? `/api/files?path=${encodeURIComponent(targetPath)}`
        : '/api/files';
      const res = await fetch(url);
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to list directory');
      }
      const data = await res.json();
      setCurrentPath(data.currentPath);
      setParentPath(data.parentPath);
      setItems(data.items || []);
      setQuickShortcuts(data.quickShortcuts || []);
    } catch (err: any) {
      setError(err?.message || 'Error reading files');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      fetchDirectory(currentPath || undefined);
    }
  }, [isOpen]);

  const handleDownload = (filePath: string) => {
    const downloadUrl = `/api/files/download?path=${encodeURIComponent(filePath)}`;
    const a = document.createElement('a');
    a.href = downloadUrl;
    a.download = filePath.split('/').pop() || 'download';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleUploadFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setError(null);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const uploadUrl = `/api/files/upload?path=${encodeURIComponent(currentPath)}`;
      const res = await fetch(uploadUrl, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Upload failed');
      }

      setUploadSuccess(true);
      setTimeout(() => setUploadSuccess(false), 2000);
      await fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err?.message || 'Failed to upload file');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleDelete = async (filePath: string) => {
    const filename = filePath.split('/').pop();
    if (!window.confirm(`Delete ${filename}?`)) return;

    try {
      const res = await fetch(`/api/files?path=${encodeURIComponent(filePath)}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || 'Failed to delete');
      }
      await fetchDirectory(currentPath);
    } catch (err: any) {
      setError(err?.message || 'Delete failed');
    }
  };

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return items;
    const q = searchQuery.toLowerCase();
    return items.filter((item) => item.name.toLowerCase().includes(q));
  }, [items, searchQuery]);

  const formatSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getFileIcon = (item: FileItem) => {
    if (item.isDirectory) return <Folder className="w-4 h-4 text-sky-400 shrink-0" />;
    const ext = item.extension;
    if (ext === 'apk') return <Package className="w-4 h-4 text-emerald-400 shrink-0" />;
    if (['zip', 'tar', 'gz', 'bz2', 'xz', 'dmg'].includes(ext || ''))
      return <Archive className="w-4 h-4 text-amber-400 shrink-0" />;
    if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg'].includes(ext || ''))
      return <Image className="w-4 h-4 text-indigo-400 shrink-0" />;
    if (['ts', 'tsx', 'js', 'jsx', 'json', 'py', 'sh', 'rs', 'go', 'html', 'css'].includes(ext || ''))
      return <FileCode className="w-4 h-4 text-primary shrink-0" />;
    return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        className="fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
      />

      {/* Slide-over Drawer / Modal */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full sm:w-[460px] md:w-[520px] flex flex-col bg-card/95 backdrop-blur-md border-l border-border/80 text-foreground shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm tracking-tight">Files & APKs</span>
          </div>

          <div className="flex items-center gap-1">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleUploadFile}
              className="hidden"
            />
            <Button
              variant="outline"
              size="icon"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="h-7 w-7 border-border/70 hover:bg-primary/10 hover:text-primary text-foreground"
              title="Upload file from phone to Mac"
            >
              {uploadSuccess ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Upload className="w-3.5 h-3.5" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchDirectory(currentPath)}
              disabled={loading}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Refresh directory"
            >
              <RotateCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Close file manager"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Shortcuts Bar */}
        <div className="flex items-center gap-1.5 px-3 py-2 border-b border-border/40 overflow-x-auto no-scrollbar">
          {quickShortcuts.map((s) => (
            <button
              key={s.path}
              onClick={() => fetchDirectory(s.path)}
              className={`px-2 py-1 rounded-md text-[11px] font-medium border shrink-0 transition-colors ${
                currentPath === s.path
                  ? 'border-primary/50 bg-primary/10 text-primary'
                  : 'border-border/50 bg-secondary/30 text-muted-foreground hover:text-foreground hover:bg-secondary/60'
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>

        {/* Path Breadcrumb & Parent Nav */}
        <div className="flex items-center gap-2 px-3 py-2 bg-secondary/20 border-b border-border/40 text-xs">
          {parentPath ? (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => fetchDirectory(parentPath)}
              className="h-6 w-6 text-muted-foreground hover:text-foreground shrink-0"
              title="Go up to parent directory"
            >
              <ArrowUp className="w-3.5 h-3.5" />
            </Button>
          ) : (
            <FolderOpen className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-mono text-[11px] text-muted-foreground truncate" title={currentPath}>
            {currentPath.replace(/^\/Users\/suiseika/, '~') || '/'}
          </span>
        </div>

        {/* Search Filter */}
        <div className="p-2 border-b border-border/40">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder="Search files..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-2 text-xs bg-secondary/30 border-border/60 font-mono"
            />
          </div>
        </div>

        {/* Error Notification */}
        {error && (
          <div className="px-3 py-2 text-xs text-destructive bg-destructive/10 border-b border-destructive/20">
            {error}
          </div>
        )}

        {/* File & Folder List */}
        <ScrollArea className="flex-1 px-2 py-1">
          {filteredItems.length === 0 ? (
            <div className="py-12 text-center text-xs text-muted-foreground">
              {loading ? 'Reading files...' : 'Folder is empty.'}
            </div>
          ) : (
            <div className="space-y-1">
              {filteredItems.map((item) => (
                <div
                  key={item.path}
                  onClick={() => {
                    if (item.isDirectory) {
                      fetchDirectory(item.path);
                    } else {
                      handleDownload(item.path);
                    }
                  }}
                  className="group flex items-center justify-between p-2 rounded-lg cursor-pointer hover:bg-secondary/40 transition-colors border border-transparent hover:border-border/40"
                >
                  <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
                    {getFileIcon(item)}
                    <span className="text-xs truncate font-medium text-foreground">
                      {item.name}
                    </span>
                    {item.extension === 'apk' && (
                      <Badge variant="outline" className="text-[9px] py-0 px-1 h-3.5 border-emerald-500/40 text-emerald-400">
                        APK
                      </Badge>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[10px] text-muted-foreground font-mono">
                      {item.isDirectory ? 'dir' : formatSize(item.size)}
                    </span>

                    <div className="flex items-center gap-0.5">
                      {!item.isDirectory && (
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleDownload(item.path);
                          }}
                          className="h-6 w-6 text-muted-foreground hover:text-primary hover:bg-primary/10"
                          title="Download file to phone"
                        >
                          <Download className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDelete(item.path);
                        }}
                        className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground transition-opacity"
                        title="Delete file"
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
};

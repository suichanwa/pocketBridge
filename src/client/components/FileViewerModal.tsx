import React, { useState, useEffect, useMemo, useRef } from 'react';
import type { FileItem, FileTextPreview } from '../../shared/types.js';
import { fetchWithRetry } from '@/lib/fetchWithRetry.js';
import { Button } from '@/components/ui/button.js';
import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import { MarkdownView } from './MarkdownView.js';
import {
  X,
  Download,
  Copy,
  Check,
  ExternalLink,
  Music,
  Film,
  Image as ImageIcon,
  FileCode,
  FileText,
  Package,
  Archive,
  File,
  RotateCw,
  ZoomIn,
  ZoomOut,
  WrapText,
  AlertCircle,
  Play,
  Volume2,
} from 'lucide-react';

interface FileViewerModalProps {
  file: FileItem | null;
  onClose: () => void;
  onDownload: (filePath: string) => void;
}

export type FileCategory =
  | 'audio'
  | 'video'
  | 'image'
  | 'text'
  | 'pdf'
  | 'apk'
  | 'archive'
  | 'binary';

export function getFileCategory(name: string, extension?: string): FileCategory {
  const ext = (extension || '').toLowerCase();
  const lowerName = name.toLowerCase();

  if (['mp3', 'wav', 'ogg', 'oga', 'm4a', 'aac', 'flac', 'opus', 'aiff', 'aif'].includes(ext)) {
    return 'audio';
  }
  if (['mp4', 'webm', 'mov', 'm4v', 'mkv', 'ogv', 'avi'].includes(ext)) {
    return 'video';
  }
  if (['png', 'jpg', 'jpeg', 'webp', 'gif', 'svg', 'ico', 'bmp', 'avif', 'tiff', 'tif'].includes(ext)) {
    return 'image';
  }
  if (ext === 'pdf') {
    return 'pdf';
  }
  if (ext === 'apk') {
    return 'apk';
  }
  if (['zip', 'tar', 'gz', 'bz2', 'xz', 'dmg', '7z', 'rar', 'iso'].includes(ext)) {
    return 'archive';
  }

  const textExtensions = [
    'txt', 'log', 'md', 'markdown', 'json', 'ts', 'tsx', 'js', 'jsx', 'mjs', 'cjs',
    'py', 'sh', 'bash', 'zsh', 'html', 'htm', 'css', 'scss', 'sass', 'less',
    'yaml', 'yml', 'toml', 'env', 'sql', 'xml', 'graphql', 'ini', 'conf',
    'plist', 'lock', 'gitignore', 'gitattributes', 'dockerfile', 'rs', 'go',
    'c', 'cpp', 'h', 'hpp', 'cs', 'java', 'kt', 'swift', 'rb', 'php'
  ];
  if (textExtensions.includes(ext)) {
    return 'text';
  }

  const knownTextFiles = new Set([
    '.gitignore', '.env', '.env.example', '.env.local', 'makefile', 'dockerfile',
    'license', 'readme', 'procfile', '.tunnel-url', '.node-version', '.npmrc',
    '.prettierrc', '.eslintrc'
  ]);
  if (knownTextFiles.has(lowerName)) {
    return 'text';
  }

  return 'binary';
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

export const FileViewerModal: React.FC<FileViewerModalProps> = ({
  file,
  onClose,
  onDownload,
}) => {
  const [textPreview, setTextPreview] = useState<FileTextPreview | null>(null);
  const [loadingText, setLoadingText] = useState(false);
  const [textError, setTextError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [markdownMode, setMarkdownMode] = useState<'rendered' | 'source'>('rendered');
  const [lineWrap, setLineWrap] = useState(true);
  const [zoomOriginal, setZoomOriginal] = useState(false);
  const [imageDimensions, setImageDimensions] = useState<{ width: number; height: number } | null>(null);
  const [mediaError, setMediaError] = useState<string | null>(null);

  const category = useMemo(() => {
    if (!file) return 'binary';
    return getFileCategory(file.name, file.extension);
  }, [file]);

  const rawUrl = useMemo(() => {
    if (!file) return '';
    return `/api/files/raw?path=${encodeURIComponent(file.path)}`;
  }, [file]);

  useEffect(() => {
    if (!file) {
      setTextPreview(null);
      setTextError(null);
      setImageDimensions(null);
      setMediaError(null);
      return;
    }

    setCopied(false);
    setImageDimensions(null);
    setMediaError(null);

    if (category === 'text') {
      setLoadingText(true);
      setTextError(null);
      fetchWithRetry(`/api/files/text?path=${encodeURIComponent(file.path)}`, {
        retries: 2,
        retryDelay: 300,
      })
        .then((res) => {
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          return res.json();
        })
        .then((data: FileTextPreview) => {
          setTextPreview(data);
        })
        .catch((err) => {
          setTextError(err?.message || 'Failed to load file contents');
        })
        .finally(() => {
          setLoadingText(false);
        });
    } else {
      setTextPreview(null);
    }
  }, [file, category]);

  if (!file) return null;

  const handleCopy = async () => {
    try {
      if (category === 'text' && textPreview && !textPreview.isBinary) {
        await navigator.clipboard.writeText(textPreview.content);
      } else {
        await navigator.clipboard.writeText(file.path);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback if clipboard API is restricted
      const textarea = document.createElement('textarea');
      textarea.value = (category === 'text' && textPreview?.content) || file.path;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const getHeaderIcon = () => {
    switch (category) {
      case 'audio':
        return <Music className="w-4 h-4 text-violet-400 shrink-0" />;
      case 'video':
        return <Film className="w-4 h-4 text-rose-400 shrink-0" />;
      case 'image':
        return <ImageIcon className="w-4 h-4 text-indigo-400 shrink-0" />;
      case 'text':
        return <FileCode className="w-4 h-4 text-sky-400 shrink-0" />;
      case 'pdf':
        return <FileText className="w-4 h-4 text-amber-400 shrink-0" />;
      case 'apk':
        return <Package className="w-4 h-4 text-emerald-400 shrink-0" />;
      case 'archive':
        return <Archive className="w-4 h-4 text-amber-400 shrink-0" />;
      default:
        return <File className="w-4 h-4 text-muted-foreground shrink-0" />;
    }
  };

  const isMarkdown = file.extension === 'md' || file.extension === 'markdown';

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-2 sm:p-4 bg-background/80 backdrop-blur-sm animate-in fade-in duration-150">
      {/* Modal Dialog Card */}
      <div className="relative w-full max-w-4xl max-h-[92vh] flex flex-col bg-card border border-border/80 rounded-xl shadow-2xl overflow-hidden text-foreground">
        {/* Header Bar */}
        <div className="flex items-center justify-between px-3 sm:px-4 py-2.5 border-b border-border/60 bg-secondary/30 shrink-0">
          <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
            {getHeaderIcon()}
            <span className="font-semibold text-xs sm:text-sm truncate" title={file.name}>
              {file.name}
            </span>
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-muted-foreground shrink-0 font-mono">
              {formatBytes(file.size)}
            </Badge>
            {file.extension && (
              <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4 uppercase shrink-0 font-mono hidden xs:inline-flex">
                {file.extension}
              </Badge>
            )}
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-1 shrink-0">
            {category === 'text' && isMarkdown && (
              <div className="flex items-center rounded-md border border-border/60 p-0.5 mr-1 bg-background/50">
                <button
                  type="button"
                  onClick={() => setMarkdownMode('rendered')}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    markdownMode === 'rendered'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Preview
                </button>
                <button
                  type="button"
                  onClick={() => setMarkdownMode('source')}
                  className={`px-2 py-0.5 text-[10px] font-medium rounded transition-colors ${
                    markdownMode === 'source'
                      ? 'bg-primary text-primary-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Raw
                </button>
              </div>
            )}

            {category === 'text' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setLineWrap(!lineWrap)}
                className={`h-7 w-7 ${lineWrap ? 'text-primary' : 'text-muted-foreground'} hover:text-foreground`}
                title={lineWrap ? 'Disable wrap' : 'Enable wrap'}
              >
                <WrapText className="w-3.5 h-3.5" />
              </Button>
            )}

            {category === 'image' && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setZoomOriginal(!zoomOriginal)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title={zoomOriginal ? 'Fit to screen' : 'View full size'}
              >
                {zoomOriginal ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
              </Button>
            )}

            <Button
              variant="ghost"
              size="icon"
              onClick={handleCopy}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title={category === 'text' ? 'Copy content' : 'Copy file path'}
            >
              {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            </Button>

            <a
              href={rawUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:text-foreground hover:bg-accent/50 transition-colors"
              title="Open raw file in new tab"
            >
              <ExternalLink className="w-3.5 h-3.5" />
            </a>

            <Button
              variant="outline"
              size="icon"
              onClick={() => onDownload(file.path)}
              className="h-7 w-7 border-border/70 text-foreground hover:text-primary hover:bg-primary/10"
              title="Download file"
            >
              <Download className="w-3.5 h-3.5" />
            </Button>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground ml-1"
              title="Close preview"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Content Viewer Body */}
        <div className="flex-1 min-h-[220px] max-h-[calc(92vh-50px)] overflow-hidden flex flex-col bg-background/50">
          {/* IMAGE PREVIEW */}
          {category === 'image' && (
            <div className="flex-1 flex flex-col items-center justify-center p-3 overflow-auto bg-black/40">
              <div
                className={`relative flex items-center justify-center ${
                  zoomOriginal ? 'max-w-none' : 'max-h-[72vh] max-w-full'
                }`}
              >
                <img
                  src={rawUrl}
                  alt={file.name}
                  onLoad={(e) => {
                    const img = e.currentTarget;
                    setImageDimensions({ width: img.naturalWidth, height: img.naturalHeight });
                  }}
                  onError={() => setMediaError('Could not load image')}
                  className={`rounded-lg border border-border/40 shadow-lg object-contain transition-all duration-150 ${
                    zoomOriginal ? 'max-h-none max-w-none' : 'max-h-[72vh] max-w-full'
                  }`}
                  style={{
                    backgroundImage:
                      'linear-gradient(45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(-45deg, rgba(255,255,255,0.05) 25%, transparent 25%), linear-gradient(45deg, transparent 75%, rgba(255,255,255,0.05) 75%), linear-gradient(-45deg, transparent 75%, rgba(255,255,255,0.05) 75%)',
                    backgroundSize: '16px 16px',
                    backgroundPosition: '0 0, 0 8px, 8px -8px, -8px 0px',
                  }}
                />
              </div>

              {imageDimensions && (
                <div className="mt-2 text-[11px] text-muted-foreground font-mono">
                  {imageDimensions.width} x {imageDimensions.height} px
                </div>
              )}

              {mediaError && (
                <div className="flex items-center gap-1.5 text-xs text-destructive mt-3">
                  <AlertCircle className="w-4 h-4" />
                  <span>{mediaError}</span>
                </div>
              )}
            </div>
          )}

          {/* VIDEO PREVIEW */}
          {category === 'video' && (
            <div className="flex-1 flex flex-col items-center justify-center p-3 sm:p-5 bg-black/70 overflow-auto">
              <div className="w-full max-w-3xl flex flex-col items-center">
                <video
                  controls
                  playsInline
                  preload="metadata"
                  src={rawUrl}
                  onError={() =>
                    setMediaError(
                      'Browser cannot decode this video codec. Use Download to view locally.'
                    )
                  }
                  className="w-full max-h-[68vh] rounded-lg bg-black border border-border/40 shadow-xl"
                />

                {mediaError && (
                  <div className="flex items-center gap-2 text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 p-2.5 rounded-lg mt-3 w-full">
                    <AlertCircle className="w-4 h-4 shrink-0" />
                    <span className="flex-1">{mediaError}</span>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => onDownload(file.path)}
                      className="h-7 text-xs border-amber-500/40"
                    >
                      Download File
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* AUDIO PREVIEW */}
          {category === 'audio' && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 bg-gradient-to-b from-secondary/10 to-secondary/30">
              <div className="w-full max-w-md p-6 rounded-2xl bg-card border border-border/80 shadow-xl flex flex-col items-center text-center">
                <div className="w-20 h-20 rounded-full bg-violet-500/15 border border-violet-500/30 flex items-center justify-center mb-4 text-violet-400">
                  <Volume2 className="w-10 h-10 animate-pulse" />
                </div>

                <h3 className="font-semibold text-sm sm:text-base text-foreground mb-1 truncate max-w-full">
                  {file.name}
                </h3>
                <p className="text-xs text-muted-foreground font-mono mb-5">
                  {formatBytes(file.size)} | {file.extension?.toUpperCase() || 'AUDIO'}
                </p>

                <audio
                  controls
                  preload="metadata"
                  src={rawUrl}
                  onError={() =>
                    setMediaError('Audio format could not be played directly in browser.')
                  }
                  className="w-full h-11 mb-2"
                />

                {mediaError && (
                  <div className="text-xs text-amber-400 mt-2 flex items-center gap-1.5">
                    <AlertCircle className="w-3.5 h-3.5" />
                    <span>{mediaError}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TEXT & CODE PREVIEW */}
          {category === 'text' && (
            <div className="flex-1 flex flex-col min-h-0">
              {loadingText && (
                <div className="flex-1 flex items-center justify-center text-xs text-muted-foreground gap-2 p-8">
                  <RotateCw className="w-4 h-4 animate-spin text-primary" />
                  <span>Loading file contents...</span>
                </div>
              )}

              {textError && (
                <div className="p-4 m-4 rounded-lg bg-destructive/10 border border-destructive/30 text-destructive text-xs flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{textError}</span>
                </div>
              )}

              {textPreview && !loadingText && (
                <>
                  {textPreview.truncated && (
                    <div className="px-3 py-1 bg-amber-500/10 border-b border-amber-500/20 text-[11px] text-amber-400 flex items-center justify-between shrink-0">
                      <span>Large file: showing first 512 KB of {formatBytes(textPreview.size)}.</span>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onDownload(file.path)}
                        className="h-5 text-[10px] px-2 text-amber-400 hover:text-amber-300 hover:bg-amber-500/20"
                      >
                        Download Full File
                      </Button>
                    </div>
                  )}

                  <ScrollArea className="flex-1 min-h-0">
                    {isMarkdown && markdownMode === 'rendered' ? (
                      <div className="p-4 sm:p-6 prose prose-invert max-w-none text-foreground text-xs sm:text-sm">
                        <MarkdownView content={textPreview.content} />
                      </div>
                    ) : (
                      <div className="p-2 sm:p-3 font-mono text-[11px] sm:text-xs">
                        <table className="w-full border-collapse">
                          <tbody>
                            {textPreview.content.split('\n').map((line, idx) => (
                              <tr key={idx} className="hover:bg-secondary/30 transition-colors">
                                <td className="py-0.5 pr-3 pl-1 text-right select-none text-muted-foreground/60 w-10 text-[10px] font-mono align-top">
                                  {idx + 1}
                                </td>
                                <td
                                  className={`py-0.5 pl-2 text-foreground/90 align-top ${
                                    lineWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre overflow-x-auto'
                                  }`}
                                >
                                  {line || ' '}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </ScrollArea>
                </>
              )}
            </div>
          )}

          {/* PDF PREVIEW */}
          {category === 'pdf' && (
            <div className="flex-1 flex flex-col min-h-0 p-2 sm:p-3">
              <iframe
                src={rawUrl}
                title={file.name}
                className="w-full flex-1 min-h-[60vh] rounded-lg border border-border/50 bg-white"
              />
            </div>
          )}

          {/* APK, ARCHIVES & BINARIES */}
          {(category === 'apk' || category === 'archive' || category === 'binary') && (
            <div className="flex-1 flex flex-col items-center justify-center p-6 text-center">
              <div className="w-full max-w-md p-6 rounded-2xl bg-card border border-border/80 shadow-xl flex flex-col items-center">
                <div
                  className={`w-20 h-20 rounded-2xl flex items-center justify-center mb-4 ${
                    category === 'apk'
                      ? 'bg-emerald-500/15 border border-emerald-500/30 text-emerald-400'
                      : category === 'archive'
                      ? 'bg-amber-500/15 border border-amber-500/30 text-amber-400'
                      : 'bg-secondary/50 border border-border/60 text-muted-foreground'
                  }`}
                >
                  {category === 'apk' ? (
                    <Package className="w-10 h-10" />
                  ) : category === 'archive' ? (
                    <Archive className="w-10 h-10" />
                  ) : (
                    <File className="w-10 h-10" />
                  )}
                </div>

                <h3 className="font-semibold text-base sm:text-lg text-foreground mb-1 truncate max-w-full">
                  {file.name}
                </h3>
                <div className="flex items-center gap-1.5 mb-4">
                  <Badge
                    variant="outline"
                    className={`text-[10px] font-mono ${
                      category === 'apk'
                        ? 'border-emerald-500/40 text-emerald-400'
                        : category === 'archive'
                        ? 'border-amber-500/40 text-amber-400'
                        : ''
                    }`}
                  >
                    {category === 'apk' ? 'Android APK' : category === 'archive' ? 'Archive' : 'Binary File'}
                  </Badge>
                  <span className="text-xs text-muted-foreground font-mono">
                    {formatBytes(file.size)}
                  </span>
                </div>

                <p className="text-xs text-muted-foreground mb-6 max-w-xs leading-relaxed">
                  {category === 'apk'
                    ? 'Android package ready for installation. Tap below to download directly to your mobile device.'
                    : category === 'archive'
                    ? 'Compressed archive package. Tap below to download to your device.'
                    : 'Binary format cannot be rendered in browser preview. Tap below to download.'}
                </p>

                <Button
                  onClick={() => onDownload(file.path)}
                  className={`w-full sm:w-auto px-6 py-2 h-10 font-semibold gap-2 ${
                    category === 'apk'
                      ? 'bg-emerald-600 hover:bg-emerald-500 text-white'
                      : 'bg-primary text-primary-foreground hover:bg-primary/90'
                  }`}
                >
                  <Download className="w-4 h-4" />
                  {category === 'apk' ? 'Download APK to Phone' : 'Download to Device'}
                </Button>
              </div>
            </div>
          )}
        </div>

        {/* Footer Info Bar */}
        <div className="px-3 sm:px-4 py-2 border-t border-border/50 bg-secondary/20 flex items-center justify-between text-[11px] text-muted-foreground font-mono shrink-0">
          <span className="truncate max-w-[70%]" title={file.path}>
            {file.path.replace(/^\/Users\/suiseika/, '~')}
          </span>
          <span>{new Date(file.mtime).toLocaleDateString()}</span>
        </div>
      </div>
    </div>
  );
};

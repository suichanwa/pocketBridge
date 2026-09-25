import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { Camera, Maximize2, Minimize2, RefreshCw, Image as ImageIcon, Download, Trash2, Minus } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';

interface ScreenViewerProps {
  latestUrl: string | null;
  onTakeScreenshot: () => void;
  isLoading?: boolean;
  onHide?: () => void;
  onToggleMaximize?: () => void;
  isMaximized?: boolean;
}

export const ScreenViewer: React.FC<ScreenViewerProps> = ({
  latestUrl,
  onTakeScreenshot,
  isLoading,
  onHide,
  onToggleMaximize,
  isMaximized,
}) => {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [history, setHistory] = useState<Array<{ filename: string; url: string }>>([]);
  const [selectedUrl, setSelectedUrl] = useState<string | null>(latestUrl);

  useEffect(() => {
    if (latestUrl) {
      setSelectedUrl(latestUrl);
    }
  }, [latestUrl]);

  const fetchCaptures = async () => {
    try {
      const res = await fetch('/api/captures');
      const data = await res.json();
      if (data.captures) {
        setHistory(data.captures);
      }
    } catch {
      // Ignored
    }
  };

  useEffect(() => {
    fetchCaptures();
  }, [latestUrl]);

  const activeImage = selectedUrl || latestUrl;

  const getActiveFilename = () => {
    if (!activeImage) return null;
    const match = activeImage.match(/\/captures\/([^?#]+)/);
    return match ? match[1] : null;
  };

  const activeFilename = getActiveFilename();

  const handleDelete = async (filename: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    try {
      await fetch(`/api/captures/${encodeURIComponent(filename)}`, { method: 'DELETE' });
      const nextHistory = history.filter((h) => h.filename !== filename);
      setHistory(nextHistory);
      if (selectedUrl && selectedUrl.includes(filename)) {
        setSelectedUrl(nextHistory.length > 0 ? nextHistory[0].url : null);
      }
      if (nextHistory.length === 0) {
        setIsFullscreen(false);
      }
    } catch {
      // Ignored
    }
  };

  return (
    <div className="flex flex-col h-full space-y-3">
      <Card className="flex flex-col flex-1 border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
        <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-border/40">
          <div className="flex items-center gap-2">
            <Camera className="w-4 h-4 text-sky-400" />
            <CardTitle className="text-sm font-semibold">Live Mac Screen</CardTitle>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              variant="outline"
              size="icon"
              onClick={onTakeScreenshot}
              disabled={isLoading}
              className="h-7 w-7 border-border/70 text-muted-foreground hover:text-foreground"
              title="Capture Mac Screen Now"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
            {activeImage && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setIsFullscreen(true)}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Full View"
              >
                <Maximize2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {activeFilename && (
              <Button
                variant="ghost"
                size="icon"
                onClick={() => handleDelete(activeFilename)}
                className="h-7 w-7 text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                title="Delete Image"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            )}
            {onToggleMaximize && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onToggleMaximize}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title={isMaximized ? "Restore panel size" : "Maximize panel"}
              >
                {isMaximized ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </Button>
            )}
            {onHide && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onHide}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Hide panel"
              >
                <Minus className="w-3.5 h-3.5" />
              </Button>
            )}
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-3 flex flex-col justify-center items-center bg-black/40 min-h-[200px]">
          {activeImage ? (
            <div
              className="relative w-full h-full flex items-center justify-center cursor-pointer group"
              onClick={() => setIsFullscreen(true)}
            >
              <img
                src={activeImage}
                alt="Mac Desktop Screenshot"
                className="max-h-[60vh] max-w-full rounded-lg border border-border/40 object-contain shadow-2xl transition-transform duration-200 group-hover:scale-[1.01]"
              />
              <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity rounded-lg flex items-center justify-center gap-2 pointer-events-none">
                <span className="text-xs bg-black/70 text-white px-2.5 py-1 rounded-md flex items-center gap-1">
                  <Maximize2 className="w-3 h-3" />
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-secondary/60 flex items-center justify-center mb-3 text-muted-foreground/60">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-foreground">No screenshot captured yet</p>
              <Button
                variant="default"
                size="icon"
                onClick={onTakeScreenshot}
                disabled={isLoading}
                className="mt-4 h-8 w-8"
                title="Take First Screenshot"
              >
                <Camera className="w-4 h-4" />
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History thumbnails if multiple screenshots exist */}
      {history.length > 0 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          {history.slice(0, 10).map((item) => (
            <div key={item.filename} className="relative group shrink-0">
              <button
                type="button"
                onClick={() => setSelectedUrl(item.url)}
                className={`relative h-12 w-20 rounded-md overflow-hidden border transition-all block ${
                  selectedUrl === item.url
                    ? 'border-primary ring-1 ring-primary'
                    : 'border-border/60 opacity-60 group-hover:opacity-100'
                }`}
              >
                <img
                  src={item.url}
                  alt={item.filename}
                  className="h-full w-full object-cover"
                />
              </button>
              <button
                type="button"
                onClick={(e) => handleDelete(item.filename, e)}
                className="absolute top-0.5 right-0.5 h-4 w-4 rounded-full bg-destructive/90 text-destructive-foreground opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center hover:bg-destructive shadow"
                title="Delete photo"
              >
                <Trash2 className="w-2.5 h-2.5" />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Fullscreen Dialog */}
      <Dialog open={isFullscreen} onOpenChange={setIsFullscreen}>
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/95 border-border/40 flex flex-col items-center justify-center">
          {activeImage && (
            <div className="relative flex flex-col items-center max-w-full max-h-[90vh]">
              <img
                src={activeImage}
                alt="Full Mac Screenshot"
                className="max-h-[85vh] max-w-full rounded-md object-contain"
              />
              <div className="mt-2 flex items-center gap-2">
                <a
                  href={activeImage}
                  download="mac-screenshot.png"
                  target="_blank"
                  rel="noreferrer"
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground bg-secondary/80 flex items-center justify-center"
                  title="Download Full Resolution"
                >
                  <Download className="w-4 h-4" />
                </a>
                {activeFilename && (
                  <button
                    type="button"
                    onClick={() => handleDelete(activeFilename)}
                    className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 flex items-center justify-center"
                    title="Delete Image"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

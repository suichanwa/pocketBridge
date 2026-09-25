import React, { useState, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { Camera, Maximize2, RefreshCw, Image as ImageIcon, Download } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';

interface ScreenViewerProps {
  latestUrl: string | null;
  onTakeScreenshot: () => void;
  isLoading?: boolean;
}

export const ScreenViewer: React.FC<ScreenViewerProps> = ({
  latestUrl,
  onTakeScreenshot,
  isLoading,
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
          </div>
        </CardHeader>

        <CardContent className="flex-1 p-3 flex flex-col justify-center items-center bg-black/40 min-h-[220px]">
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
                  <Maximize2 className="w-3 h-3" /> Tap to zoom
                </span>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-6 text-muted-foreground">
              <div className="w-12 h-12 rounded-2xl bg-secondary/60 flex items-center justify-center mb-3 text-muted-foreground/60">
                <ImageIcon className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-foreground">No screenshot captured yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-[240px]">
                Tap &ldquo;Capture Now&rdquo; or ask the agent in chat to show your screen.
              </p>
              <Button
                variant="default"
                size="sm"
                onClick={onTakeScreenshot}
                disabled={isLoading}
                className="mt-4 gap-1.5 h-8 text-xs"
              >
                <Camera className="w-3.5 h-3.5" />
                <span>Take First Screenshot</span>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>

      {/* History thumbnails if multiple screenshots exist */}
      {history.length > 1 && (
        <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider pl-1 shrink-0">
            Recent:
          </span>
          {history.slice(0, 8).map((item) => (
            <button
              key={item.filename}
              onClick={() => setSelectedUrl(item.url)}
              className={`relative h-12 w-20 rounded-md overflow-hidden shrink-0 border transition-all ${
                selectedUrl === item.url
                  ? 'border-primary ring-1 ring-primary'
                  : 'border-border/60 opacity-60 hover:opacity-100'
              }`}
            >
              <img
                src={item.url}
                alt={item.filename}
                className="h-full w-full object-cover"
              />
            </button>
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
              <div className="mt-2 flex items-center gap-3">
                <a
                  href={activeImage}
                  download="mac-screenshot.png"
                  target="_blank"
                  rel="noreferrer"
                  className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1.5 bg-secondary/80 px-3 py-1 rounded-md"
                >
                  <Download className="w-3.5 h-3.5" /> Download Full Res
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

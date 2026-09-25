import React, { useState, useRef, useEffect } from 'react';
import { useAgentSocket } from '@/hooks/useAgentSocket.js';
import { Header } from '@/components/Header.js';
import { ChatFeed } from '@/components/ChatFeed.js';
import { ScreenViewer } from '@/components/ScreenViewer.js';
import { TerminalLog } from '@/components/TerminalLog.js';
import { SettingsModal } from '@/components/SettingsModal.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.js';
import {
  MessageSquare,
  Camera,
  Terminal,
  ShieldAlert,
  GripVertical,
  GripHorizontal,
  Maximize2,
  Minimize2,
  Minus,
} from 'lucide-react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';

export function App() {
  const {
    isConnected,
    messages,
    terminalLogs,
    status,
    latestScreenshot,
    isAuthenticated,
    authError,
    sendMessage,
    clearChat,
    sendQuickAction,
    saveSettings,
    verifyPin,
  } = useAgentSocket();

  const [activeTab, setActiveTab] = useState<'chat' | 'screen' | 'terminal'>('chat');
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [pinInput, setPinInput] = useState('');
  const [isCapturing, setIsCapturing] = useState(false);

  // Panel Visibility (persisted)
  const [panels, setPanels] = useState<{ chat: boolean; screen: boolean; terminal: boolean }>(() => {
    try {
      const saved = localStorage.getItem('pocketbridge_panels');
      if (saved) return JSON.parse(saved);
    } catch {}
    return { chat: true, screen: true, terminal: true };
  });

  // Panel Width/Height splits (persisted)
  const [splitPercent, setSplitPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pocketbridge_split_h');
      if (saved) return Number(saved);
    } catch {}
    return 52;
  });

  const [verticalSplitPercent, setVerticalSplitPercent] = useState<number>(() => {
    try {
      const saved = localStorage.getItem('pocketbridge_split_v');
      if (saved) return Number(saved);
    } catch {}
    return 50;
  });

  const [maximizedPanel, setMaximizedPanel] = useState<'chat' | 'screen' | 'terminal' | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const containerRef = useRef<HTMLDivElement>(null);
  const sideColRef = useRef<HTMLDivElement>(null);
  const isDraggingH = useRef(false);
  const isDraggingV = useRef(false);
  const splitHRef = useRef(splitPercent);
  const splitVRef = useRef(verticalSplitPercent);

  useEffect(() => {
    splitHRef.current = splitPercent;
  }, [splitPercent]);

  useEffect(() => {
    splitVRef.current = verticalSplitPercent;
  }, [verticalSplitPercent]);

  // Sync panels to localStorage
  useEffect(() => {
    localStorage.setItem('pocketbridge_panels', JSON.stringify(panels));
  }, [panels]);

  const togglePanel = (panel: 'chat' | 'screen' | 'terminal') => {
    setPanels((prev) => ({ ...prev, [panel]: !prev[panel] }));
    if (maximizedPanel === panel) {
      setMaximizedPanel(null);
    }
  };

  const toggleMaximize = (panel: 'chat' | 'screen' | 'terminal') => {
    setMaximizedPanel((prev) => (prev === panel ? null : panel));
  };

  const handleTakeScreenshot = async () => {
    setIsCapturing(true);
    sendQuickAction('screenshot');
    setTimeout(() => setIsCapturing(false), 2000);
  };

  const handlePinSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (pinInput.trim()) {
      verifyPin(pinInput.trim());
    }
  };

  // Horizontal splitter dragging with RAF throttling
  const startDraggingH = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingH.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    let rafId: number | null = null;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingH.current || !containerRef.current) return;
      const clientX = 'touches' in moveEvent ? moveEvent.touches[0].clientX : moveEvent.clientX;

      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const newPercent = Math.min(80, Math.max(20, ((clientX - rect.left) / rect.width) * 100));
        setSplitPercent(newPercent);
      });
    };

    const onUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      isDraggingH.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('pocketbridge_split_h', splitHRef.current.toString());
      } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  // Vertical splitter dragging with RAF throttling
  const startDraggingV = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDraggingV.current = true;
    setIsDragging(true);
    document.body.style.cursor = 'row-resize';
    document.body.style.userSelect = 'none';

    let rafId: number | null = null;

    const onMove = (moveEvent: MouseEvent | TouchEvent) => {
      if (!isDraggingV.current || !sideColRef.current) return;
      const clientY = 'touches' in moveEvent ? moveEvent.touches[0].clientY : moveEvent.clientY;

      if (rafId !== null) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(() => {
        if (!sideColRef.current) return;
        const rect = sideColRef.current.getBoundingClientRect();
        const newPercent = Math.min(80, Math.max(20, ((clientY - rect.top) / rect.height) * 100));
        setVerticalSplitPercent(newPercent);
      });
    };

    const onUp = () => {
      if (rafId !== null) cancelAnimationFrame(rafId);
      isDraggingV.current = false;
      setIsDragging(false);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
      try {
        localStorage.setItem('pocketbridge_split_v', splitVRef.current.toString());
      } catch {}
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      window.removeEventListener('touchmove', onMove);
      window.removeEventListener('touchend', onUp);
    };

    window.addEventListener('mousemove', onMove, { passive: true });
    window.addEventListener('mouseup', onUp);
    window.addEventListener('touchmove', onMove, { passive: true });
    window.addEventListener('touchend', onUp);
  };

  // PIN Authentication Gate
  if (!isAuthenticated && status?.pinRequired) {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen bg-background text-foreground p-4">
        <div className="w-full max-w-sm p-6 rounded-2xl border border-border/80 bg-card/80 backdrop-blur-md shadow-xl text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-500 flex items-center justify-center mx-auto">
            <ShieldAlert className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-bold">PIN Protected</h2>
            <p className="text-xs text-muted-foreground mt-1">
              Enter the access PIN to connect to your Mac bridge.
            </p>
          </div>
          <form onSubmit={handlePinSubmit} className="space-y-3">
            <Input
              type="password"
              placeholder="Enter PIN..."
              value={pinInput}
              onChange={(e) => setPinInput(e.target.value)}
              className="text-center font-mono tracking-widest text-lg h-11"
              autoFocus
            />
            {authError && <p className="text-xs text-destructive">{authError}</p>}
            <Button type="submit" className="w-full h-10">
              Unlock PocketBridge
            </Button>
          </form>
        </div>
      </div>
    );
  }

  const isChatVisible = maximizedPanel ? maximizedPanel === 'chat' : panels.chat;
  const isScreenVisible = maximizedPanel ? maximizedPanel === 'screen' : panels.screen;
  const isTerminalVisible = maximizedPanel ? maximizedPanel === 'terminal' : panels.terminal;
  const isSideVisible = isScreenVisible || isTerminalVisible;
  const hasBothColumns = isChatVisible && isSideVisible;
  const noPanelsVisible = !isChatVisible && !isScreenVisible && !isTerminalVisible;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Top Header */}
      <Header
        status={status}
        isConnected={isConnected}
        onOpenSettings={() => setSettingsOpen(true)}
        onClearChat={clearChat}
        panels={panels}
        onTogglePanel={togglePanel}
      />

      {/* Mobile Layout (< 1024px) */}
      <div className="lg:hidden flex flex-col flex-1 overflow-hidden">
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as any)}
          className="flex flex-col flex-1 overflow-hidden"
        >
          <div className="px-3 pt-2 pb-1 border-b border-border/40 bg-background/50">
            <TabsList className="grid grid-cols-3 w-full h-9">
              <TabsTrigger value="chat" className="text-xs gap-1.5">
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Chat</span>
              </TabsTrigger>
              <TabsTrigger value="screen" className="text-xs gap-1.5 relative">
                <Camera className="w-3.5 h-3.5" />
                <span>Screen</span>
                {latestScreenshot && (
                  <span className="w-1.5 h-1.5 rounded-full bg-primary absolute top-1.5 right-2" />
                )}
              </TabsTrigger>
              <TabsTrigger value="terminal" className="text-xs gap-1.5">
                <Terminal className="w-3.5 h-3.5" />
                <span>Terminal</span>
                {terminalLogs.length > 0 && (
                  <span className="text-[10px] px-1 py-0.5 rounded-full bg-secondary text-muted-foreground ml-1">
                    {terminalLogs.length}
                  </span>
                )}
              </TabsTrigger>
            </TabsList>
          </div>

          <TabsContent value="chat" className="flex-1 overflow-hidden m-0 data-[state=active]:flex data-[state=active]:flex-col">
            <ChatFeed
              messages={messages}
              onSendMessage={sendMessage}
              onClearChat={clearChat}
              disabled={!isConnected}
            />
          </TabsContent>

          <TabsContent value="screen" className="flex-1 overflow-hidden m-0 p-3 data-[state=active]:flex data-[state=active]:flex-col">
            <ScreenViewer
              latestUrl={latestScreenshot}
              onTakeScreenshot={handleTakeScreenshot}
              isLoading={isCapturing}
            />
          </TabsContent>

          <TabsContent value="terminal" className="flex-1 overflow-hidden m-0 p-3 data-[state=active]:flex data-[state=active]:flex-col">
            <TerminalLog logs={terminalLogs} />
          </TabsContent>
        </Tabs>
      </div>

      {/* Desktop / Resizable & Hideable Layout (>= 1024px) */}
      <div
        ref={containerRef}
        className="hidden lg:flex flex-1 overflow-hidden max-w-[1920px] mx-auto w-full p-3 sm:p-4 gap-0 relative"
      >
        {/* All panels hidden fallback */}
        {noPanelsVisible && (
          <div className="flex-1 flex flex-col items-center justify-center text-muted-foreground gap-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => togglePanel('chat')}
                className="h-10 w-10 border-border/70 text-primary"
                title="Restore Chat"
              >
                <MessageSquare className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => togglePanel('screen')}
                className="h-10 w-10 border-border/70 text-sky-400"
                title="Restore Screen"
              >
                <Camera className="w-5 h-5" />
              </Button>
              <Button
                variant="outline"
                size="icon"
                onClick={() => togglePanel('terminal')}
                className="h-10 w-10 border-border/70 text-emerald-400"
                title="Restore Terminal"
              >
                <Terminal className="w-5 h-5" />
              </Button>
            </div>
          </div>
        )}

        {/* Fullscreen overlay during dragging to prevent event dropping */}
        {isDragging && (
          <div
            className="fixed inset-0 z-50 pointer-events-auto select-none"
            style={{ cursor: isDraggingH.current ? 'col-resize' : 'row-resize' }}
          />
        )}

        {/* Left Column: Chat Conversation */}
        {isChatVisible && (
          <div
            style={{ width: hasBothColumns ? `${splitPercent}%` : '100%' }}
            className={`flex flex-col h-full rounded-xl border border-border/80 bg-card/40 overflow-hidden shadow-sm ${
              isDragging ? 'pointer-events-none select-none' : 'backdrop-blur-sm'
            }`}
          >
            {/* Chat Panel Header */}
            <div className="flex items-center justify-between py-1.5 px-3 border-b border-border/40 bg-card/60">
              <div className="flex items-center gap-2">
                <MessageSquare className="w-3.5 h-3.5 text-primary" />
                <span className="text-xs font-semibold">Chat</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => toggleMaximize('chat')}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title={maximizedPanel === 'chat' ? 'Restore size' : 'Maximize panel'}
                >
                  {maximizedPanel === 'chat' ? <Minimize2 className="w-3 h-3" /> : <Maximize2 className="w-3 h-3" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => togglePanel('chat')}
                  className="h-6 w-6 text-muted-foreground hover:text-foreground"
                  title="Hide panel"
                >
                  <Minus className="w-3 h-3" />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-hidden">
              <ChatFeed
                messages={messages}
                onSendMessage={sendMessage}
                onClearChat={clearChat}
                disabled={!isConnected}
              />
            </div>
          </div>
        )}

        {/* Horizontal Resizer Divider between Chat & Side Column */}
        {hasBothColumns && (
          <div
            onMouseDown={startDraggingH}
            onTouchStart={startDraggingH}
            className={`w-3 hover:w-3 z-10 cursor-col-resize flex items-center justify-center group select-none shrink-0 ${
              isDragging ? 'cursor-col-resize' : ''
            }`}
            title="Drag to resize columns"
          >
            <div
              className={`w-1 h-12 rounded-full transition-colors flex items-center justify-center ${
                isDragging ? 'bg-primary' : 'bg-border/60 group-hover:bg-primary'
              }`}
            >
              <GripVertical className="w-2.5 h-2.5 text-muted-foreground group-hover:text-primary-foreground opacity-0 group-hover:opacity-100" />
            </div>
          </div>
        )}

        {/* Right Column: Split Screen Viewer & Terminal */}
        {isSideVisible && (
          <div
            ref={sideColRef}
            style={{ width: hasBothColumns ? `${100 - splitPercent}%` : '100%' }}
            className={`flex flex-col h-full overflow-hidden gap-0 ${
              isDragging ? 'pointer-events-none select-none' : ''
            }`}
          >
            {/* Top Half: Screen Viewer */}
            {isScreenVisible && (
              <div
                style={{
                  height: isScreenVisible && isTerminalVisible ? `${verticalSplitPercent}%` : '100%',
                }}
                className="overflow-hidden min-h-[160px] pb-1 flex flex-col"
              >
                <ScreenViewer
                  latestUrl={latestScreenshot}
                  onTakeScreenshot={handleTakeScreenshot}
                  isLoading={isCapturing}
                  onHide={() => togglePanel('screen')}
                  onToggleMaximize={() => toggleMaximize('screen')}
                  isMaximized={maximizedPanel === 'screen'}
                />
              </div>
            )}

            {/* Vertical Resizer Divider between Screen & Terminal */}
            {isScreenVisible && isTerminalVisible && (
              <div
                onMouseDown={startDraggingV}
                onTouchStart={startDraggingV}
                className={`h-3 hover:h-3 z-10 cursor-row-resize flex items-center justify-center group select-none shrink-0 ${
                  isDragging ? 'cursor-row-resize' : ''
                }`}
                title="Drag to resize panels"
              >
                <div
                  className={`h-1 w-12 rounded-full transition-colors flex items-center justify-center ${
                    isDragging ? 'bg-primary' : 'bg-border/60 group-hover:bg-primary'
                  }`}
                >
                  <GripHorizontal className="w-2.5 h-2.5 text-muted-foreground group-hover:text-primary-foreground opacity-0 group-hover:opacity-100" />
                </div>
              </div>
            )}

            {/* Bottom Half: Terminal Output */}
            {isTerminalVisible && (
              <div
                style={{
                  height: isScreenVisible && isTerminalVisible ? `${100 - verticalSplitPercent}%` : '100%',
                }}
                className="overflow-hidden min-h-[140px] pt-1 flex flex-col"
              >
                <TerminalLog
                  logs={terminalLogs}
                  onHide={() => togglePanel('terminal')}
                  onToggleMaximize={() => toggleMaximize('terminal')}
                  isMaximized={maximizedPanel === 'terminal'}
                />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Settings Modal */}
      <SettingsModal
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
        status={status}
        onSaveSettings={saveSettings}
      />
    </div>
  );
}

export default App;

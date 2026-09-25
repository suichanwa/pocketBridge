import React, { useState } from 'react';
import { useAgentSocket } from '@/hooks/useAgentSocket.js';
import { Header } from '@/components/Header.js';
import { ChatFeed } from '@/components/ChatFeed.js';
import { ScreenViewer } from '@/components/ScreenViewer.js';
import { TerminalLog } from '@/components/TerminalLog.js';
import { SettingsModal } from '@/components/SettingsModal.js';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs.js';
import { MessageSquare, Camera, Terminal, ShieldAlert } from 'lucide-react';
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

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-background text-foreground">
      {/* Top Header */}
      <Header
        status={status}
        isConnected={isConnected}
        onOpenSettings={() => setSettingsOpen(true)}
        onClearChat={clearChat}
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

      {/* Desktop / 16:10 Laptop / 2K 27" Layout (>= 1024px) */}
      <div className="hidden lg:grid grid-cols-12 flex-1 overflow-hidden max-w-[1920px] mx-auto w-full p-3 sm:p-4 gap-4">
        {/* Left Column: Chat Conversation */}
        <div className="col-span-6 xl:col-span-7 flex flex-col h-full rounded-xl border border-border/80 bg-card/40 backdrop-blur-sm overflow-hidden shadow-sm">
          <ChatFeed
            messages={messages}
            onSendMessage={sendMessage}
            onClearChat={clearChat}
            disabled={!isConnected}
          />
        </div>

        {/* Right Column: Split Screen Viewer & Terminal */}
        <div className="col-span-6 xl:col-span-5 flex flex-col h-full space-y-4 overflow-hidden">
          {/* Top Half: Screen Viewer */}
          <div className="flex-1 min-h-[300px] overflow-hidden">
            <ScreenViewer
              latestUrl={latestScreenshot}
              onTakeScreenshot={handleTakeScreenshot}
              isLoading={isCapturing}
            />
          </div>

          {/* Bottom Half: Terminal Output */}
          <div className="flex-1 min-h-[260px] overflow-hidden">
            <TerminalLog logs={terminalLogs} />
          </div>
        </div>
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

import React from 'react';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Laptop,
  Battery,
  BatteryCharging,
  Settings,
  Wifi,
  WifiOff,
  Cpu,
  Trash2,
  MessageSquare,
  Camera,
  Terminal,
  PanelLeft,
} from 'lucide-react';
import type { SystemStatus } from '../../shared/types.js';

interface HeaderProps {
  status: SystemStatus | null;
  isConnected: boolean;
  onOpenSettings: () => void;
  onClearChat?: () => void;
  onToggleSidebar?: () => void;
  isSidebarOpen?: boolean;
  panels?: {
    chat: boolean;
    screen: boolean;
    terminal: boolean;
  };
  onTogglePanel?: (panel: 'chat' | 'screen' | 'terminal') => void;
}

export const Header: React.FC<HeaderProps> = ({
  status,
  isConnected,
  onOpenSettings,
  onClearChat,
  onToggleSidebar,
  isSidebarOpen,
  panels,
  onTogglePanel,
}) => {
  return (
    <header className="sticky top-0 z-30 w-full border-b border-border/80 bg-background/90 backdrop-blur-md px-3 sm:px-6 py-2.5 sm:py-3">
      <div className="flex items-center justify-between gap-2 max-w-[1920px] mx-auto">
        {/* Brand & Connection State */}
        <div className="flex items-center gap-2 sm:gap-2.5">
          {onToggleSidebar && (
            <Button
              variant="outline"
              size="icon"
              onClick={onToggleSidebar}
              className={`h-8 w-8 border-border/70 hover:bg-secondary/60 text-muted-foreground ${
                isSidebarOpen ? 'text-primary border-primary/40 bg-primary/10' : ''
              }`}
              title="Toggle Conversations Sidebar"
            >
              <PanelLeft className="w-4 h-4" />
            </Button>
          )}
          <div className="relative flex items-center justify-center w-8 h-8 rounded-lg bg-primary/10 border border-primary/20 text-primary">
            <Laptop className="w-4 h-4" />
            <span
              className={`absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full border-2 border-background ${
                isConnected ? 'bg-emerald-500 animate-pulse' : 'bg-red-500'
              }`}
            />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-bold text-sm sm:text-base tracking-tight">PocketBridge</span>
              <Badge variant="outline" className="hidden xs:inline-flex text-[10px] py-0 px-1.5 h-4 text-muted-foreground border-border/60">
                macOS
              </Badge>
            </div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              {isConnected ? (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  <Wifi className="w-3 h-3" />
                  <span className="truncate max-w-[130px] sm:max-w-[200px]">
                    {status?.bonjourHost || 'Connected'}
                  </span>
                </span>
              ) : (
                <span className="flex items-center gap-1 text-rose-400 font-medium">
                  <WifiOff className="w-3 h-3" /> Reconnecting...
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Live System Stats */}
        <div className="flex items-center gap-1.5 sm:gap-3">
          {status?.battery && (
            <div className="hidden sm:flex items-center gap-1.5 bg-secondary/50 border border-border/50 rounded-lg px-2.5 py-1 text-xs text-muted-foreground">
              {status.battery.isCharging ? (
                <BatteryCharging className="w-3.5 h-3.5 text-emerald-400" />
              ) : (
                <Battery className="w-3.5 h-3.5 text-muted-foreground" />
              )}
              <span className="font-medium text-foreground">{status.battery.percent}%</span>
            </div>
          )}

          {status?.memory && (
            <div className="hidden md:flex items-center gap-1.5 bg-secondary/50 border border-border/50 rounded-lg px-2.5 py-1 text-xs text-muted-foreground">
              <Cpu className="w-3.5 h-3.5 text-primary" />
              <span>RAM: <strong className="text-foreground">{status.memory.usedPercent}%</strong></span>
            </div>
          )}

          {/* Panel Visibility Toggles (Desktop/Wide) */}
          {panels && onTogglePanel && (
            <div className="hidden lg:flex items-center gap-1 bg-secondary/40 border border-border/50 rounded-lg p-0.5">
              <Button
                variant={panels.chat ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onTogglePanel('chat')}
                className={`h-7 w-7 ${panels.chat ? 'text-primary' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                title="Toggle Chat Panel"
              >
                <MessageSquare className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={panels.screen ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onTogglePanel('screen')}
                className={`h-7 w-7 ${panels.screen ? 'text-sky-400' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                title="Toggle Screen Panel"
              >
                <Camera className="w-3.5 h-3.5" />
              </Button>
              <Button
                variant={panels.terminal ? "secondary" : "ghost"}
                size="icon"
                onClick={() => onTogglePanel('terminal')}
                className={`h-7 w-7 ${panels.terminal ? 'text-emerald-400' : 'text-muted-foreground/50 hover:text-muted-foreground'}`}
                title="Toggle Terminal Panel"
              >
                <Terminal className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          {/* Clear Chat Icon */}
          {onClearChat && (
            <Button
              variant="outline"
              size="icon"
              onClick={onClearChat}
              className="h-8 w-8 sm:h-9 sm:w-9 border-border/70 hover:bg-destructive/10 hover:text-destructive hover:border-destructive/40 text-muted-foreground"
              title="Clear Chat (/clear)"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}

          {/* Settings Trigger */}
          <Button
            variant="outline"
            size="icon"
            onClick={onOpenSettings}
            className="h-8 w-8 sm:h-9 sm:w-9 border-border/70 hover:bg-secondary/60 relative"
            title="Settings & API Keys"
          >
            <Settings className="w-4 h-4 text-muted-foreground" />
            {!status?.hasGeminiKey && (
              <span className="absolute -top-1 -right-1 w-2.5 h-2.5 bg-amber-500 rounded-full border-2 border-background" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
};

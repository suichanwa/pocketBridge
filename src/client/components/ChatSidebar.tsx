import React, { useState, useMemo } from 'react';
import type { ChatSessionMeta } from '../../shared/types.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Badge } from '@/components/ui/badge.js';
import { ScrollArea } from '@/components/ui/scroll-area.js';
import {
  Plus,
  Trash2,
  MessageSquare,
  Sparkles,
  Search,
  PanelLeftClose,
  RotateCw,
  FolderOpen,
  ArrowRight,
  Clock,
} from 'lucide-react';

interface ChatSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  sessions: ChatSessionMeta[];
  agySessions: ChatSessionMeta[];
  activeSessionId: string | null;
  onSwitchSession: (sessionId: string) => void;
  onNewSession: () => void;
  onDeleteSession: (sessionId: string) => void;
  onResumeAgySession: (conversationId: string) => void;
  onRefreshSessions?: () => void;
}

export const ChatSidebar: React.FC<ChatSidebarProps> = ({
  isOpen,
  onClose,
  sessions,
  agySessions,
  activeSessionId,
  onSwitchSession,
  onNewSession,
  onDeleteSession,
  onResumeAgySession,
  onRefreshSessions,
}) => {
  const [activeTab, setActiveTab] = useState<'saved' | 'gemini'>('saved');
  const [searchQuery, setSearchQuery] = useState('');

  const filteredSavedSessions = useMemo(() => {
    if (!searchQuery.trim()) return sessions;
    const q = searchQuery.toLowerCase();
    return sessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.preview && s.preview.toLowerCase().includes(q))
    );
  }, [sessions, searchQuery]);

  const filteredAgySessions = useMemo(() => {
    if (!searchQuery.trim()) return agySessions;
    const q = searchQuery.toLowerCase();
    return agySessions.filter(
      (s) =>
        s.title.toLowerCase().includes(q) ||
        (s.preview && s.preview.toLowerCase().includes(q)) ||
        s.id.toLowerCase().includes(q)
    );
  }, [agySessions, searchQuery]);

  const formatDate = (timestamp: number) => {
    if (!timestamp) return '';
    const date = new Date(timestamp);
    const now = new Date();
    const diffHours = (now.getTime() - date.getTime()) / (1000 * 60 * 60);

    if (diffHours < 24 && date.getDate() === now.getDate()) {
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }
    return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Mobile Backdrop */}
      <div
        onClick={onClose}
        className="lg:hidden fixed inset-0 z-40 bg-background/80 backdrop-blur-sm"
      />

      {/* Sidebar Container */}
      <aside className="fixed lg:static inset-y-0 left-0 z-50 w-72 sm:w-80 flex flex-col bg-card/95 backdrop-blur-md border-r border-border/80 text-foreground transition-all duration-200 shadow-xl lg:shadow-none shrink-0">
        {/* Sidebar Header */}
        <div className="flex items-center justify-between px-3 py-3 border-b border-border/60">
          <div className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm tracking-tight">Conversations</span>
          </div>
          <div className="flex items-center gap-1">
            {onRefreshSessions && (
              <Button
                variant="ghost"
                size="icon"
                onClick={onRefreshSessions}
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                title="Refresh conversation list"
              >
                <RotateCw className="w-3.5 h-3.5" />
              </Button>
            )}
            <Button
              variant="outline"
              size="icon"
              onClick={onNewSession}
              className="h-7 w-7 border-border/70 hover:bg-primary/10 hover:text-primary hover:border-primary/40 text-foreground"
              title="Start new conversation"
            >
              <Plus className="w-4 h-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              className="h-7 w-7 text-muted-foreground hover:text-foreground"
              title="Close conversations sidebar"
            >
              <PanelLeftClose className="w-4 h-4" />
            </Button>
          </div>
        </div>

        {/* Tab Selection */}
        <div className="p-2 border-b border-border/40">
          <div className="grid grid-cols-2 p-0.5 rounded-lg bg-secondary/50 border border-border/50 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab('saved')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                activeTab === 'saved'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Saved ({sessions.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab('gemini')}
              className={`flex items-center justify-center gap-1.5 py-1.5 rounded-md transition-colors ${
                activeTab === 'gemini'
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-primary" />
              <span>Resume ({agySessions.length})</span>
            </button>
          </div>
        </div>

        {/* Search Input */}
        <div className="px-2 pt-2 pb-1">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
            <Input
              type="text"
              placeholder={activeTab === 'saved' ? 'Search saved chats...' : 'Search local transcripts...'}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-2 text-xs bg-secondary/30 border-border/60"
            />
          </div>
        </div>

        {/* List Content */}
        <ScrollArea className="flex-1 px-2 py-1">
          {activeTab === 'saved' ? (
            <div className="space-y-1">
              {filteredSavedSessions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No saved conversations found.
                </div>
              ) : (
                filteredSavedSessions.map((session) => {
                  const isActive = activeSessionId === session.id;
                  return (
                    <div
                      key={session.id}
                      onClick={() => onSwitchSession(session.id)}
                      className={`group relative flex flex-col p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isActive
                          ? 'bg-primary/10 border-primary/40 text-foreground'
                          : 'border-transparent hover:bg-secondary/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="font-medium text-xs truncate max-w-[190px]">
                          {session.title || 'Untitled Conversation'}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeleteSession(session.id);
                          }}
                          className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive text-muted-foreground shrink-0 transition-opacity"
                          title="Delete conversation"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {session.preview && (
                        <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 pr-4">
                          {session.preview}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/80">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDate(session.updatedAt)}
                        </span>
                        <span>{session.messageCount} msgs</span>
                        {session.isExternalAgy && (
                          <Badge
                            variant="outline"
                            className="text-[9px] py-0 px-1 h-3.5 border-primary/30 text-primary"
                          >
                            AGY
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          ) : (
            <div className="space-y-1">
              <div className="px-1 py-1 text-[11px] text-muted-foreground">
                Local Gemini CLI transcripts from Mac brain
              </div>
              {filteredAgySessions.length === 0 ? (
                <div className="py-8 text-center text-xs text-muted-foreground">
                  No local Gemini CLI sessions found.
                </div>
              ) : (
                filteredAgySessions.map((agy) => {
                  const isCurrent =
                    activeSessionId === `agy-${agy.id}` || activeSessionId === agy.id;
                  return (
                    <div
                      key={agy.id}
                      onClick={() => onResumeAgySession(agy.id)}
                      className={`group relative flex flex-col p-2.5 rounded-lg cursor-pointer transition-all border ${
                        isCurrent
                          ? 'bg-primary/10 border-primary/40 text-foreground'
                          : 'border-transparent hover:bg-secondary/40 text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-1.5">
                        <div className="font-medium text-xs truncate max-w-[190px]">
                          {agy.title}
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            onResumeAgySession(agy.id);
                          }}
                          className="h-6 w-6 hover:bg-primary/10 hover:text-primary text-muted-foreground shrink-0"
                          title="Resume local conversation"
                        >
                          <ArrowRight className="w-3.5 h-3.5" />
                        </Button>
                      </div>

                      {agy.preview && (
                        <div className="text-[11px] text-muted-foreground line-clamp-1 mt-0.5 pr-2">
                          {agy.preview}
                        </div>
                      )}

                      <div className="flex items-center gap-2 mt-1.5 text-[10px] text-muted-foreground/80">
                        <span className="flex items-center gap-0.5">
                          <Clock className="w-2.5 h-2.5" />
                          {formatDate(agy.updatedAt)}
                        </span>
                        <Badge
                          variant="outline"
                          className="text-[9px] py-0 px-1 h-3.5 border-border/60 text-muted-foreground"
                        >
                          {agy.id.slice(0, 8)}
                        </Badge>
                        <span className="text-[10px] text-primary flex items-center gap-0.5 ml-auto">
                          <FolderOpen className="w-2.5 h-2.5" />
                          Resume
                        </span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}
        </ScrollArea>
      </aside>
    </>
  );
};

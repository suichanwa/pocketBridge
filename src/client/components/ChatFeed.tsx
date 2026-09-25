import React, { useState, useRef, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Badge } from '@/components/ui/badge.js';
import {
  Send,
  Bot,
  User,
  Camera,
  Terminal,
  Search,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Sparkles,
  Loader2,
} from 'lucide-react';
import { QuickActions } from './QuickActions.js';
import { MarkdownView } from './MarkdownView.js';
import type { ChatMessage, ToolCallRecord } from '../../shared/types.js';

interface ChatFeedProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onQuickAction: (action: 'screenshot' | 'git_status' | 'system_info') => void;
  onViewImage?: (url: string) => void;
  disabled?: boolean;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  onSendMessage,
  onQuickAction,
  onViewImage,
  disabled,
}) => {
  const [inputText, setInputText] = useState('');
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim() || disabled) return;
    onSendMessage(inputText.trim());
    setInputText('');
  };

  const toggleTool = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'take_screenshot':
        return <Camera className="w-3.5 h-3.5 text-sky-400" />;
      case 'execute_command':
        return <Terminal className="w-3.5 h-3.5 text-emerald-400" />;
      case 'search_web':
        return <Search className="w-3.5 h-3.5 text-amber-400" />;
      case 'send_telegram_message':
        return <MessageSquare className="w-3.5 h-3.5 text-violet-400" />;
      default:
        return <Sparkles className="w-3.5 h-3.5 text-primary" />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-background overflow-hidden relative">
      {/* Scrollable message thread */}
      <div className="flex-1 overflow-y-auto p-3 sm:p-4 space-y-4">
        {messages.map((msg) => {
          const isUser = msg.role === 'user';
          return (
            <div
              key={msg.id}
              className={`flex gap-2 sm:gap-3 max-w-[92%] sm:max-w-[80%] ${
                isUser ? 'ml-auto flex-row-reverse' : 'mr-auto'
              }`}
            >
              {/* Avatar */}
              <div
                className={`w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center shrink-0 text-xs ${
                  isUser
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary border border-border/80 text-foreground'
                }`}
              >
                {isUser ? <User className="w-4 h-4" /> : <Bot className="w-4 h-4" />}
              </div>

              {/* Message Bubble */}
              <div className="flex flex-col space-y-2 overflow-hidden">
                <div
                  className={`rounded-2xl px-3.5 py-2.5 text-sm shadow-sm leading-relaxed ${
                    isUser
                      ? 'bg-primary text-primary-foreground rounded-tr-sm'
                      : 'bg-card border border-border/70 text-card-foreground rounded-tl-sm'
                  }`}
                >
                  {/* Status / Thinking indicator */}
                  {msg.status === 'thinking' && !msg.content && (
                    <div className="flex items-center gap-2 text-muted-foreground text-xs py-0.5">
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                      <span>Thinking & selecting tools...</span>
                    </div>
                  )}

                  {/* Message text with rich markdown formatting */}
                  {msg.content && (
                    <div className="text-[13px] sm:text-sm">
                      <MarkdownView content={msg.content} />
                    </div>
                  )}

                  {/* Inline Tool Execution Cards */}
                  {msg.toolCalls && msg.toolCalls.length > 0 && (
                    <div className="mt-2.5 space-y-1.5 pt-2 border-t border-border/40">
                      {msg.toolCalls.map((tool) => {
                        const isExpanded = expandedTools[tool.id];
                        return (
                          <div
                            key={tool.id}
                            className="rounded-lg border border-border/50 bg-black/40 text-xs overflow-hidden"
                          >
                            <button
                              type="button"
                              onClick={() => toggleTool(tool.id)}
                              className="w-full flex items-center justify-between p-2 hover:bg-secondary/40 transition-colors text-left"
                            >
                              <div className="flex items-center gap-1.5 truncate">
                                {getToolIcon(tool.name)}
                                <span className="font-mono font-medium truncate">
                                  {tool.name}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 shrink-0">
                                {tool.status === 'running' && (
                                  <Badge variant="warning" className="text-[9px] py-0 px-1">
                                    RUNNING
                                  </Badge>
                                )}
                                {tool.status === 'success' && (
                                  <Badge variant="success" className="text-[9px] py-0 px-1">
                                    DONE
                                  </Badge>
                                )}
                                {tool.status === 'failed' && (
                                  <Badge variant="destructive" className="text-[9px] py-0 px-1">
                                    FAILED
                                  </Badge>
                                )}
                                {isExpanded ? (
                                  <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                                ) : (
                                  <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                                )}
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="p-2 border-t border-border/30 bg-black/60 font-mono text-[11px] space-y-1">
                                <div>
                                  <span className="text-muted-foreground">Args: </span>
                                  <pre className="text-sky-300 whitespace-pre-wrap break-all">
                                    {JSON.stringify(tool.args, null, 2)}
                                  </pre>
                                </div>
                                {tool.result && (
                                  <div className="pt-1 border-t border-border/20">
                                    <span className="text-muted-foreground">Result: </span>
                                    <pre className="text-emerald-300 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                                      {JSON.stringify(tool.result, null, 2)}
                                    </pre>
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Inline Screenshot Preview if attached */}
                  {msg.screenshotUrl && (
                    <div className="mt-2.5 rounded-lg overflow-hidden border border-border/60 bg-black/60 relative group">
                      <img
                        src={msg.screenshotUrl}
                        alt="Captured Screen"
                        className="w-full max-h-48 sm:max-h-60 object-contain cursor-pointer"
                        onClick={() => onViewImage?.(msg.screenshotUrl!)}
                      />
                      <button
                        onClick={() => onViewImage?.(msg.screenshotUrl!)}
                        className="absolute bottom-2 right-2 bg-black/75 hover:bg-black text-white text-[11px] px-2 py-1 rounded flex items-center gap-1 opacity-90 transition-opacity"
                      >
                        <Maximize2 className="w-3 h-3" /> View Full
                      </button>
                    </div>
                  )}
                </div>

                {/* Timestamp */}
                <span
                  className={`text-[10px] text-muted-foreground px-1 ${
                    isUser ? 'text-right' : 'text-left'
                  }`}
                >
                  {new Date(msg.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
          );
        })}
        <div ref={messagesEndRef} />
      </div>

      {/* Bottom Input Area */}
      <div className="border-t border-border/80 bg-background/95 backdrop-blur-md p-2.5 sm:p-4 space-y-2">
        <QuickActions onAction={onQuickAction} disabled={disabled} />

        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Tell your Mac what to do... (or /screenshot, /git)"
            disabled={disabled}
            className="flex-1 bg-secondary/50 border-border/60 rounded-xl px-3.5 py-2 h-10 text-sm focus-visible:ring-1 focus-visible:ring-primary"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!inputText.trim() || disabled}
            className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
};

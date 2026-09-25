import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Badge } from '@/components/ui/badge.js';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import {
  Send,
  Bot,
  User,
  Camera,
  Monitor,
  Terminal,
  Search,
  MessageSquare,
  ChevronDown,
  ChevronRight,
  Maximize2,
  Sparkles,
  Loader2,
  Video,
  GitBranch,
  Cpu,
  Download,
  X,
  Trash2,
  MousePointer,
  Type,
  Keyboard,
  Command,
  ExternalLink,
  Move,
  Mic,
  MicOff,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { MarkdownView } from './MarkdownView.js';
import type { ChatMessage, ToolCallRecord } from '../../shared/types.js';

interface CommandOption {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const AVAILABLE_COMMANDS: CommandOption[] = [
  {
    name: '/agy ',
    description: 'Run task via Antigravity (Gemini 3.8 Flash High, --dangerously-skip-permissions)',
    icon: Sparkles,
  },
  {
    name: '/screenshot',
    description: 'Capture live Mac desktop screen & windows',
    icon: Camera,
  },
  {
    name: '/camera',
    description: 'Snap photo from Mac FaceTime HD webcam',
    icon: Video,
  },
  {
    name: '/open ',
    description: 'Open any Mac application (e.g. /open Safari, /open Notes)',
    icon: ExternalLink,
  },
  {
    name: '/click ',
    description: 'Click coordinates on Mac screen (e.g. /click 500 400)',
    icon: MousePointer,
  },
  {
    name: '/type ',
    description: 'Type text into currently focused Mac window or input',
    icon: Type,
  },
  {
    name: '/key ',
    description: 'Press a key (e.g. /key enter, /key space, /key esc)',
    icon: Keyboard,
  },
  {
    name: '/hotkey ',
    description: 'Run shortcut (e.g. /hotkey cmd+space, /hotkey cmd+c)',
    icon: Command,
  },
  {
    name: '/clear',
    description: 'Clear chat messages and history',
    icon: Trash2,
  },
  {
    name: '/git status',
    description: 'Check git repository status',
    icon: GitBranch,
  },
  {
    name: '/system',
    description: 'Show Mac battery, RAM & system telemetry',
    icon: Cpu,
  },
  {
    name: '/tg ',
    description: 'Send Telegram message (e.g. /tg me Hello, /tg @user Hi)',
    icon: Send,
  },
  {
    name: '/tgvoice ',
    description: 'Send Telegram circular voice note (e.g. /tgvoice me Audio note)',
    icon: Mic,
  },
  {
    name: '/say ',
    description: 'Speak text out loud on Mac speakers (e.g. /say Hello)',
    icon: Volume2,
  },
  {
    name: '/sh ',
    description: 'Run arbitrary terminal command (e.g. /sh ls -la)',
    icon: Terminal,
  },
];

interface ChatFeedProps {
  messages: ChatMessage[];
  onSendMessage: (text: string) => void;
  onClearChat?: () => void;
  disabled?: boolean;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  onSendMessage,
  onClearChat,
  disabled,
}) => {
  const [inputText, setInputText] = useState('');
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0);
  const [showCommands, setShowCommands] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const commandItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Autocomplete filtering
  const matchingCommands = inputText.startsWith('/')
    ? AVAILABLE_COMMANDS.filter((cmd) =>
        cmd.name.toLowerCase().startsWith(inputText.toLowerCase().trim())
      )
    : [];

  useEffect(() => {
    if (inputText.startsWith('/') && matchingCommands.length > 0) {
      setShowCommands(true);
      setSelectedCmdIndex(0);
    } else {
      setShowCommands(false);
    }
  }, [inputText, matchingCommands.length]);

  // Auto-scroll the dropdown list to follow keyboard/hover selection
  useEffect(() => {
    if (showCommands && commandItemRefs.current[selectedCmdIndex]) {
      commandItemRefs.current[selectedCmdIndex]?.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth',
      });
    }
  }, [selectedCmdIndex, showCommands]);

  const handleSelectCommand = (cmdName: string) => {
    if (cmdName.trim() === '/clear') {
      onClearChat?.();
      onSendMessage('/clear');
      setInputText('');
      setShowCommands(false);
      return;
    }
    setInputText(cmdName);
    setShowCommands(false);
    inputRef.current?.focus();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (showCommands && matchingCommands.length > 0) {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedCmdIndex((prev) => (prev + 1) % matchingCommands.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedCmdIndex((prev) => (prev - 1 + matchingCommands.length) % matchingCommands.length);
      } else if (e.key === 'Tab' || (e.key === 'Enter' && !inputText.includes(' '))) {
        e.preventDefault();
        handleSelectCommand(matchingCommands[selectedCmdIndex].name);
      } else if (e.key === 'Escape') {
        setShowCommands(false);
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if (!text || disabled) return;
    const lower = text.toLowerCase();
    if (
      lower === '/clear' ||
      lower === 'clear' ||
      lower === '/cls' ||
      lower === '/clean' ||
      lower === '/reset' ||
      lower.startsWith('/clear ')
    ) {
      onClearChat?.();
      onSendMessage('/clear');
      setInputText('');
      setShowCommands(false);
      return;
    }
    onSendMessage(text);
    setInputText('');
    setShowCommands(false);
  };

  const toggleTool = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const toggleListening = () => {
    if (isListening) {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      setIsListening(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      alert('Speech recognition is not supported in this browser. Please use iOS Safari, Chrome, or Edge.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognitionRef.current = recognition;
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      recognition.onstart = () => {
        setIsListening(true);
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript;
        }
        if (transcript) {
          setInputText(transcript);
        }
      };

      recognition.onerror = (event: any) => {
        console.warn('Speech recognition error:', event.error);
        setIsListening(false);
      };

      recognition.onend = () => {
        setIsListening(false);
      };

      recognition.start();
    } catch (err) {
      console.error('Failed to initiate speech recognition:', err);
      setIsListening(false);
    }
  };

  const handleToggleSpeak = (msgId: string, text: string) => {
    if (typeof window === 'undefined' || !window.speechSynthesis) return;

    if (speakingMsgId === msgId) {
      window.speechSynthesis.cancel();
      setSpeakingMsgId(null);
      return;
    }

    window.speechSynthesis.cancel();

    // Clean up markdown / code blocks / urls before speaking
    const clean = text
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .replace(/https?:\/\/\S+/g, '')
      .replace(/[#*_~>]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setSpeakingMsgId(null);
    utterance.onerror = () => setSpeakingMsgId(null);

    setSpeakingMsgId(msgId);
    window.speechSynthesis.speak(utterance);
  };

  const getToolIcon = (name: string) => {
    switch (name) {
      case 'take_screenshot':
        return <Camera className="w-3.5 h-3.5 text-sky-400" />;
      case 'take_camera_photo':
        return <Video className="w-3.5 h-3.5 text-violet-400" />;
      case 'speak_aloud':
        return <Volume2 className="w-3.5 h-3.5 text-pink-400" />;
      case 'mouse_click':
        return <MousePointer className="w-3.5 h-3.5 text-rose-400" />;
      case 'mouse_move':
      case 'mouse_drag':
        return <Move className="w-3.5 h-3.5 text-cyan-400" />;
      case 'type_text':
        return <Type className="w-3.5 h-3.5 text-indigo-400" />;
      case 'press_key':
        return <Keyboard className="w-3.5 h-3.5 text-orange-400" />;
      case 'hotkey':
        return <Command className="w-3.5 h-3.5 text-yellow-400" />;
      case 'open_app':
        return <ExternalLink className="w-3.5 h-3.5 text-blue-400" />;
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
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full min-h-[280px] text-center p-6 text-muted-foreground select-none">
            <div className="w-12 h-12 rounded-2xl bg-secondary/80 border border-border/60 flex items-center justify-center mb-3 text-muted-foreground shadow-inner">
              <Sparkles className="w-5 h-5 text-primary" />
            </div>
            <p className="text-sm font-semibold text-foreground">PocketBridge Ready</p>
            <p className="text-xs text-muted-foreground mt-1.5 max-w-xs leading-relaxed">
              Chat history is clear. Send a prompt to your Mac or type{' '}
              <button
                type="button"
                onClick={() => {
                  setInputText('/');
                  setShowCommands(true);
                  inputRef.current?.focus();
                }}
                className="inline-flex items-center px-1.5 py-0.5 rounded bg-secondary font-mono text-[11px] text-foreground hover:bg-secondary/80 border border-border/50 transition-colors"
              >
                /
              </button>{' '}
              to explore commands.
            </p>
          </div>
        ) : (
          messages.map((msg) => {
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
                      <span>Thinking & executing...</span>
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

                  {/* Inline Screenshot/Camera Previews if attached */}
                  {(() => {
                    const media =
                      msg.mediaUrls && msg.mediaUrls.length > 0
                        ? msg.mediaUrls
                        : msg.screenshotUrl
                        ? [msg.screenshotUrl]
                        : [];

                    if (media.length === 0) return null;

                    return (
                      <div
                        className={`mt-2.5 grid gap-2 ${
                          media.length > 1 ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'
                        }`}
                      >
                        {media.map((url, idx) => (
                          <div
                            key={`${url}-${idx}`}
                            className="rounded-lg overflow-hidden border border-border/60 bg-black/60 relative group"
                          >
                            <img
                              src={url}
                              alt={`Captured Media ${idx + 1}`}
                              className="w-full max-h-52 sm:max-h-64 object-contain cursor-pointer transition-transform hover:scale-[1.01]"
                              onClick={() => setPreviewImageUrl(url)}
                            />
                            <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-sm text-[10px] text-white/90 px-2 py-0.5 rounded-full border border-white/10 font-medium flex items-center gap-1.5">
                              {url.includes('camera') ? (
                                <>
                                  <Camera className="w-3 h-3 text-sky-400" />
                                  <span>Webcam Photo</span>
                                </>
                              ) : (
                                <>
                                  <Monitor className="w-3 h-3 text-sky-400" />
                                  <span>Screen Capture</span>
                                </>
                              )}
                            </div>
                            <button
                              type="button"
                              onClick={() => setPreviewImageUrl(url)}
                              title="View Full"
                              className="absolute bottom-2 right-2 bg-black/80 hover:bg-black text-white h-7 w-7 rounded-md flex items-center justify-center shadow-md border border-white/10 transition-colors"
                            >
                              <Maximize2 className="w-3.5 h-3.5 text-sky-400" />
                            </button>
                          </div>
                        ))}
                      </div>
                    );
                  })()}
                </div>

                {/* Timestamp & Listen */}
                <div
                  className={`flex items-center gap-2 px-1 ${
                    isUser ? 'justify-end' : 'justify-between'
                  }`}
                >
                  <span className="text-[10px] text-muted-foreground">
                    {new Date(msg.timestamp).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </span>

                  {!isUser && msg.content && (
                    <button
                      type="button"
                      onClick={() => handleToggleSpeak(msg.id, msg.content)}
                      title={speakingMsgId === msg.id ? 'Stop listening' : 'Read aloud'}
                      className={`h-6 w-6 rounded-full flex items-center justify-center transition-colors ${
                        speakingMsgId === msg.id
                          ? 'bg-primary text-primary-foreground animate-pulse shadow-sm'
                          : 'text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                      }`}
                    >
                      {speakingMsgId === msg.id ? (
                        <VolumeX className="w-3.5 h-3.5" />
                      ) : (
                        <Volume2 className="w-3.5 h-3.5" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        }))}
        <div ref={messagesEndRef} />
      </div>

      {/* Autocomplete Menu (Popup attached above input when typing '/') */}
      {showCommands && matchingCommands.length > 0 && (
        <div className="absolute bottom-[65px] left-3 right-3 sm:left-4 sm:right-4 z-40 bg-card/95 backdrop-blur-md border border-border/80 rounded-xl shadow-2xl p-1.5 space-y-1 max-h-64 overflow-y-auto animate-in fade-in slide-in-from-bottom-2 duration-150">
          <div className="px-2 py-1 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Available Commands
          </div>
          {matchingCommands.map((cmd, idx) => {
            const Icon = cmd.icon;
            const isSelected = idx === selectedCmdIndex;
            return (
              <button
                key={cmd.name}
                ref={(el) => {
                  commandItemRefs.current[idx] = el;
                }}
                type="button"
                onClick={() => handleSelectCommand(cmd.name)}
                onMouseEnter={() => setSelectedCmdIndex(idx)}
                className={`w-full flex items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-colors ${
                  isSelected
                    ? 'bg-primary text-primary-foreground'
                    : 'text-foreground hover:bg-secondary/60'
                }`}
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className={`w-6 h-6 rounded-md flex items-center justify-center ${
                      isSelected ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-secondary text-primary'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <span className="font-mono font-semibold">{cmd.name}</span>
                    <span className={`block text-[11px] truncate ${isSelected ? 'text-primary-foreground/80' : 'text-muted-foreground'}`}>
                      {cmd.description}
                    </span>
                  </div>
                </div>
                <span className={`text-[10px] font-mono px-1.5 py-0.5 rounded ${isSelected ? 'bg-primary-foreground/20' : 'bg-secondary text-muted-foreground'}`}>
                  Tab
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Bottom Input Area */}
      <div className="border-t border-border/80 bg-background/95 backdrop-blur-md p-2.5 sm:p-4">
        <form onSubmit={handleSubmit} className="flex items-center gap-2">
          <Input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={isListening ? 'Listening to voice...' : "Type a message or '/' for commands..."}
            disabled={disabled}
            className={`flex-1 bg-secondary/50 border-border/60 rounded-xl px-3.5 py-2 h-10 text-sm focus-visible:ring-1 focus-visible:ring-primary font-normal ${
              isListening ? 'ring-2 ring-rose-500 bg-rose-500/10 placeholder:text-rose-400' : ''
            }`}
          />
          {onClearChat && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={onClearChat}
              disabled={disabled}
              title="Clear Chat (/clear)"
              className="h-10 w-10 shrink-0 rounded-xl bg-secondary/70 hover:bg-destructive/15 hover:text-destructive hover:border-destructive/40 text-muted-foreground border-border/60 transition-colors"
            >
              <Trash2 className="w-4 h-4" />
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={toggleListening}
            disabled={disabled}
            title={isListening ? 'Stop listening' : 'Voice Input'}
            className={`h-10 w-10 shrink-0 rounded-xl transition-all ${
              isListening
                ? 'bg-rose-500 hover:bg-rose-600 text-white animate-pulse ring-2 ring-rose-400/50 shadow-md border-transparent'
                : 'bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border-border/60'
            }`}
          >
            {isListening ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
          </Button>
          <Button
            type="submit"
            size="icon"
            disabled={!inputText.trim() || disabled}
            title="Send"
            className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>

      {/* Full-Screen Image Modal */}
      <Dialog
        open={Boolean(previewImageUrl)}
        onOpenChange={(open) => !open && setPreviewImageUrl(null)}
      >
        <DialogContent className="max-w-[95vw] max-h-[95vh] p-2 bg-black/95 border-border/50 flex flex-col items-center justify-center">
          {previewImageUrl && (
            <div className="relative flex flex-col items-center max-w-full max-h-[90vh]">
              <img
                src={previewImageUrl}
                alt="Full View"
                className="max-h-[85vh] max-w-full rounded-md object-contain"
              />
              <div className="mt-2.5 flex items-center gap-3">
                <a
                  href={previewImageUrl}
                  download="pocketbridge-capture.png"
                  target="_blank"
                  rel="noreferrer"
                  title="Download Image"
                  className="text-muted-foreground hover:text-foreground flex items-center justify-center bg-secondary/80 hover:bg-secondary h-8 w-8 rounded-lg border border-border/40 transition-colors"
                >
                  <Download className="w-4 h-4 text-sky-400" />
                </a>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

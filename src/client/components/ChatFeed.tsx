import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Badge } from '@/components/ui/badge.js';
import { Dialog, DialogContent } from '@/components/ui/dialog.js';
import {
  Send,
  Bot,
  User,
  Brain,
  Activity,
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
  RotateCw,
  Zap,
  ImagePlus,
  ShieldAlert,
  Lock,
  Copy,
  Check,
} from 'lucide-react';
import { MarkdownView } from './MarkdownView.js';
import { fetchWithRetry } from '@/lib/fetchWithRetry.js';
import type { ChatMessage, ToolCallRecord, SystemStatus } from '../../shared/types.js';

interface CommandOption {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

const AVAILABLE_COMMANDS: CommandOption[] = [
  {
    name: '/caveman',
    description: 'Toggle Caveman Ultra mode to cut token usage (terse, zero fluff, highest token savings)',
    icon: Zap,
  },
  {
    name: '/model',
    description: 'Inspect or switch active AI model (/model pro, /model flash, /model <name>)',
    icon: Brain,
  },
  {
    name: '/usage',
    description: 'View session usage metrics, AI engine status, and Mac system utilization',
    icon: Activity,
  },
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
  status?: SystemStatus | null;
  onSendMessage: (text: string, images?: string[]) => void;
  onClearChat?: () => void;
  disabled?: boolean;
}

export const ChatFeed: React.FC<ChatFeedProps> = ({
  messages,
  status,
  onSendMessage,
  onClearChat,
  disabled,
}) => {
  const [inputText, setInputText] = useState('');
  const [selectedImage, setSelectedImage] = useState<{ file: File; previewUrl: string } | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [expandedTools, setExpandedTools] = useState<Record<string, boolean>>({});
  const [previewImageUrl, setPreviewImageUrl] = useState<string | null>(null);
  const [selectedCmdIndex, setSelectedCmdIndex] = useState(0);
  const [showCommands, setShowCommands] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [micError, setMicError] = useState<string | null>(null);
  const [secureModalOpen, setSecureModalOpen] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [speakingMsgId, setSpeakingMsgId] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const recognitionRef = useRef<any>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const baseInputRef = useRef<string>('');
  const commandItemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const PAGE_SIZE = 30;
  const [visibleCount, setVisibleCount] = useState<number>(PAGE_SIZE);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const isNearBottomRef = useRef(true);
  const prevFirstMsgIdRef = useRef<string | null>(null);
  const prevLenRef = useRef<number>(messages.length);

  const totalCount = messages.length;
  const hasMore = totalCount > visibleCount;
  const visibleMessages = hasMore ? messages.slice(-visibleCount) : messages;

  const currentFirstMsgId = messages[0]?.id || null;

  // When conversation session changes or chat is cleared, reset window to PAGE_SIZE
  useEffect(() => {
    if (currentFirstMsgId !== prevFirstMsgIdRef.current) {
      prevFirstMsgIdRef.current = currentFirstMsgId;
      setVisibleCount(PAGE_SIZE);
      isNearBottomRef.current = true;
      requestAnimationFrame(() => {
        if (scrollContainerRef.current) {
          const el = scrollContainerRef.current;
          if (el.scrollHeight > el.clientHeight) {
            el.scrollTop = el.scrollHeight;
          }
        }
      });
    }
  }, [currentFirstMsgId]);

  useEffect(() => {
    return () => {
      if (selectedImage) {
        URL.revokeObjectURL(selectedImage.previewUrl);
      }
    };
  }, [selectedImage]);

  const loadMoreMessages = () => {
    const container = scrollContainerRef.current;
    if (!container || !hasMore || isLoadingMoreRef.current) return;

    isLoadingMoreRef.current = true;
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    setVisibleCount((prev) => Math.min(totalCount, prev + PAGE_SIZE));

    // Restore scroll position after older messages are prepended to DOM
    requestAnimationFrame(() => {
      if (scrollContainerRef.current) {
        const newScrollHeight = scrollContainerRef.current.scrollHeight;
        const heightDiff = newScrollHeight - prevScrollHeight;
        scrollContainerRef.current.scrollTop = prevScrollTop + heightDiff;
      }
      setTimeout(() => {
        isLoadingMoreRef.current = false;
      }, 50);
    });
  };

  const handleScroll = () => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    isNearBottomRef.current = distanceToBottom < 80;

    // Upward infinite scroll trigger when reaching within 60px of top (only if container has scroll overflow)
    if (
      container.scrollTop < 60 &&
      hasMore &&
      !isLoadingMoreRef.current &&
      container.scrollHeight > container.clientHeight + 100
    ) {
      loadMoreMessages();
    }
  };

  const scrollToBottom = (behavior: ScrollBehavior = 'smooth') => {
    const el = scrollContainerRef.current;
    if (!el) return;
    if (el.scrollHeight > el.clientHeight) {
      el.scrollTo({
        top: el.scrollHeight,
        behavior,
      });
    }
  };

  const lastMessage = messages[messages.length - 1];
  const lastMessageContent = lastMessage?.content;
  const lastMessageToolCount = lastMessage?.toolCalls?.length || 0;
  const lastMessageStatus = lastMessage?.status;

  useEffect(() => {
    // Only auto-scroll to bottom if new messages were appended and user was near bottom
    if (messages.length > prevLenRef.current) {
      if (isNearBottomRef.current) {
        scrollToBottom('smooth');
      }
    }
    prevLenRef.current = messages.length;
  }, [messages.length]);

  useEffect(() => {
    // Keep feed scrolled to bottom while assistant is streaming response or tools
    if (isNearBottomRef.current && lastMessageStatus === 'thinking') {
      const el = scrollContainerRef.current;
      if (el && el.scrollHeight > el.clientHeight) {
        el.scrollTop = el.scrollHeight;
      }
    }
  }, [lastMessageContent, lastMessageToolCount, lastMessageStatus]);

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
    if (cmdName.trim() === '/usage') {
      onSendMessage('/usage');
      setInputText('');
      setShowCommands(false);
      return;
    }
    if (cmdName.trim() === '/caveman') {
      onSendMessage('/caveman');
      setInputText('');
      setShowCommands(false);
      return;
    }
    setInputText(cmdName.endsWith(' ') ? cmdName : `${cmdName} `);
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

  const handleImageSelected = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file (PNG, JPG, WebP, etc.)');
      return;
    }
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
    }
    const previewUrl = URL.createObjectURL(file);
    setSelectedImage({ file, previewUrl });
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClearSelectedImage = () => {
    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
      setSelectedImage(null);
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handlePaste = (e: React.ClipboardEvent) => {
    const items = e.clipboardData?.items;
    if (!items) return;
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        const file = items[i].getAsFile();
        if (file) {
          e.preventDefault();
          if (selectedImage) {
            URL.revokeObjectURL(selectedImage.previewUrl);
          }
          const previewUrl = URL.createObjectURL(file);
          setSelectedImage({ file, previewUrl });
          break;
        }
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputText.trim();
    if ((!text && !selectedImage) || disabled || isUploading) return;

    const lower = text.toLowerCase();
    if (
      !selectedImage &&
      (lower === '/clear' ||
        lower === 'clear' ||
        lower === '/cls' ||
        lower === '/clean' ||
        lower === '/reset' ||
        lower.startsWith('/clear '))
    ) {
      onClearChat?.();
      onSendMessage('/clear');
      setInputText('');
      setShowCommands(false);
      return;
    }

    let uploadedImageUrl: string | undefined;

    if (selectedImage) {
      setIsUploading(true);
      try {
        const formData = new FormData();
        formData.append('file', selectedImage.file);
        const res = await fetchWithRetry('/api/chat/upload', {
          method: 'POST',
          body: formData,
          retries: 3,
          retryDelay: 400,
        });
        if (!res.ok) {
          throw new Error(`Upload failed with status ${res.status}`);
        }
        const data = await res.json();
        if (data.url) {
          uploadedImageUrl = data.url;
        } else {
          throw new Error(data.error || 'Server did not return image URL');
        }
      } catch (err: any) {
        console.error('Failed to upload image:', err);
        alert(`Failed to upload photo: ${err?.message || 'Network error'}`);
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    if (selectedImage) {
      URL.revokeObjectURL(selectedImage.previewUrl);
      setSelectedImage(null);
    }

    const messageText = text || (uploadedImageUrl ? 'Attached photo' : '');
    onSendMessage(messageText, uploadedImageUrl ? [uploadedImageUrl] : undefined);
    setInputText('');
    setShowCommands(false);
  };

  const toggleTool = (toolId: string) => {
    setExpandedTools((prev) => ({ ...prev, [toolId]: !prev[toolId] }));
  };

  const startAudioRecordingFallback = async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setMicError('Audio recording is not supported in this browser.');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunksRef.current = [];

      let mimeType = 'audio/webm';
      if (typeof MediaRecorder !== 'undefined') {
        if (MediaRecorder.isTypeSupported('audio/webm;codecs=opus')) {
          mimeType = 'audio/webm;codecs=opus';
        } else if (MediaRecorder.isTypeSupported('audio/mp4')) {
          mimeType = 'audio/mp4';
        } else if (MediaRecorder.isTypeSupported('audio/ogg')) {
          mimeType = 'audio/ogg';
        }
      }

      const recorder = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current = recorder;
      baseInputRef.current = inputText;

      recorder.ondataavailable = (event) => {
        if (event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        setIsListening(false);
        stream.getTracks().forEach((track) => track.stop());

        const audioBlob = new Blob(audioChunksRef.current, { type: mimeType });
        if (audioBlob.size < 500) return;

        setIsTranscribing(true);
        try {
          const reader = new FileReader();
          reader.readAsDataURL(audioBlob);
          reader.onloadend = async () => {
            try {
              const base64Audio = reader.result as string;
              const res = await fetchWithRetry('/api/transcribe', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ audio: base64Audio, mimeType }),
                retries: 2,
                retryDelay: 500,
              });
              const data = await res.json();
              if (data.success && data.text) {
                const base = baseInputRef.current.trim();
                setInputText(base ? `${base} ${data.text.trim()}` : data.text.trim());
              } else if (data.error) {
                setMicError(`Transcription error: ${data.error}`);
              }
            } catch (err: any) {
              console.error('Audio transcription request failed:', err);
              setMicError('Failed to transcribe audio.');
            } finally {
              setIsTranscribing(false);
            }
          };
        } catch (err: any) {
          console.error('Error reading recorded audio:', err);
          setIsTranscribing(false);
        }
      };

      recorder.start(250);
      setIsListening(true);
      setMicError(null);
    } catch (err: any) {
      console.error('Failed to get microphone stream:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setMicError('Microphone permission denied. Allow mic access in browser settings.');
      } else {
        setMicError(`Microphone error: ${err.message || 'Could not access mic'}`);
      }
      setIsListening(false);
    }
  };

  const toggleListening = async () => {
    // 1. If currently listening/recording, stop it
    if (isListening) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
        try {
          mediaRecorderRef.current.stop();
        } catch {}
      }
      setIsListening(false);
      return;
    }

    setMicError(null);

    // 2. Check Secure Context:
    // If accessing over plain HTTP on LAN or Tailscale from phone,
    // modern browsers forbid microphone access unless on localhost or HTTPS.
    const isSecure =
      typeof window !== 'undefined' &&
      (window.isSecureContext ||
        window.location.hostname === 'localhost' ||
        window.location.hostname === '127.0.0.1');

    if (!isSecure) {
      setSecureModalOpen(true);
      return;
    }

    // 3. Try Web Speech API (streaming client recognition for Chrome/Safari/Edge)
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (SpeechRecognition) {
      try {
        const recognition = new SpeechRecognition();
        recognitionRef.current = recognition;
        recognition.continuous = true;
        recognition.interimResults = true;
        recognition.lang = navigator.language || 'en-US';

        baseInputRef.current = inputText;

        recognition.onstart = () => {
          setIsListening(true);
          setMicError(null);
        };

        recognition.onresult = (event: any) => {
          let currentTranscript = '';
          for (let i = 0; i < event.results.length; i++) {
            currentTranscript += event.results[i][0].transcript;
          }
          const base = baseInputRef.current.trim();
          if (currentTranscript.trim()) {
            setInputText(base ? `${base} ${currentTranscript.trim()}` : currentTranscript.trim());
          }
        };

        recognition.onerror = (event: any) => {
          console.warn('Speech recognition error:', event.error);
          if (event.error === 'not-allowed') {
            setMicError('Microphone permission denied. Allow mic access in browser settings.');
            setIsListening(false);
          } else if (event.error === 'network') {
            console.log('Speech recognition network error, falling back to MediaRecorder');
            setIsListening(false);
            startAudioRecordingFallback();
          } else if (event.error === 'no-speech') {
            // Quiet pause, keep going
          } else {
            setIsListening(false);
          }
        };

        recognition.onend = () => {
          setIsListening(false);
        };

        recognition.start();
        return;
      } catch (err) {
        console.warn('SpeechRecognition failed to start, falling back to MediaRecorder:', err);
      }
    }

    // 4. Fallback to MediaRecorder + Gemini server transcription (Firefox, WebView, etc.)
    await startAudioRecordingFallback();
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
      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overscroll-y-contain p-3 sm:p-4 pb-6 space-y-4"
      >
        {/* Load older messages trigger indicator */}
        {hasMore && (
          <div className="flex items-center justify-center py-1">
            <Button
              variant="outline"
              size="icon"
              onClick={loadMoreMessages}
              className="h-7 w-7 rounded-full border-border/70 hover:bg-secondary text-muted-foreground hover:text-foreground shadow-sm"
              title={`Load older messages (${totalCount - visibleCount} remaining)`}
            >
              <RotateCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        {visibleMessages.length === 0 ? (
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
          visibleMessages.map((msg) => {
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
                              onLoad={() => {
                                if (isNearBottomRef.current) {
                                  scrollToBottom('smooth');
                                }
                              }}
                            />
                            <div className="absolute top-2 left-2 bg-black/75 backdrop-blur-sm text-[10px] text-white/90 px-2 py-0.5 rounded-full border border-white/10 font-medium flex items-center gap-1.5">
                              {url.includes('camera') ? (
                                <>
                                  <Camera className="w-3 h-3 text-sky-400" />
                                  <span>Webcam Photo</span>
                                </>
                              ) : url.includes('upload') ? (
                                <>
                                  <ImagePlus className="w-3 h-3 text-emerald-400" />
                                  <span>Attached Photo</span>
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
        {/* Selected image preview */}
        {selectedImage && (
          <div className="mb-2 flex items-center justify-between bg-secondary/60 border border-border/70 rounded-xl p-1.5 pr-2.5 max-w-sm animate-in fade-in slide-in-from-bottom-1 duration-150">
            <div className="flex items-center gap-2 overflow-hidden">
              <div className="relative w-11 h-11 shrink-0 rounded-lg overflow-hidden border border-border/60 bg-black/40">
                <img
                  src={selectedImage.previewUrl}
                  alt="Preview"
                  className="w-full h-full object-cover"
                />
                {isUploading && (
                  <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                  </div>
                )}
              </div>
              <div className="flex flex-col min-w-0 pr-1">
                <span className="text-xs font-mono truncate text-foreground font-medium">
                  {selectedImage.file.name}
                </span>
                <span className="text-[10px] text-muted-foreground">
                  {(selectedImage.file.size / 1024).toFixed(0)} KB
                </span>
              </div>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              onClick={handleClearSelectedImage}
              disabled={isUploading}
              title="Remove photo"
              className="h-7 w-7 rounded-lg text-muted-foreground hover:text-destructive hover:bg-destructive/10 shrink-0"
            >
              <X className="w-3.5 h-3.5" />
            </Button>
          </div>
        )}

        <form onSubmit={handleSubmit} className="flex items-center gap-1.5 sm:gap-2">
          {/* Photo attachment button on the left side of the input bar */}
          <Button
            type="button"
            variant="outline"
            size="icon"
            onClick={() => fileInputRef.current?.click()}
            disabled={disabled || isUploading}
            title="Attach photo"
            className="h-10 w-10 shrink-0 rounded-xl bg-secondary/70 hover:bg-secondary text-muted-foreground hover:text-foreground border-border/60 transition-colors"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin text-primary" />
            ) : (
              <ImagePlus className="w-4 h-4" />
            )}
          </Button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleImageSelected}
          />

          <Input
            ref={inputRef}
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={
              isListening
                ? 'Listening to voice...'
                : selectedImage
                ? 'Ask a question or caption for this photo...'
                : "Type a message or '/' for commands..."
            }
            disabled={disabled || isUploading}
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
              disabled={disabled || isUploading}
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
            disabled={disabled || isUploading}
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
            disabled={(!inputText.trim() && !selectedImage) || disabled || isUploading}
            title="Send"
            className="h-10 w-10 shrink-0 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 shadow-sm"
          >
            {isUploading ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Send className="w-4 h-4" />
            )}
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

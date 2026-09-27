import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  TerminalLog,
  SystemStatus,
  ClientMessage,
  ServerMessage,
  ConfigSettings,
  ChatSessionMeta,
} from '../../shared/types.js';

export function useAgentSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [sessions, setSessions] = useState<ChatSessionMeta[]>([]);
  const [agySessions, setAgySessions] = useState<ChatSessionMeta[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const pingIntervalRef = useRef<any>(null);
  const pongTimeoutRef = useRef<any>(null);
  const hiddenTimeRef = useRef<number>(0);
  const reconnectAttemptsRef = useRef<number>(0);
  const savedPinRef = useRef<string>(localStorage.getItem('pb_pin') || '');

  const cleanupSocket = useCallback(() => {
    if (socketRef.current) {
      try {
        socketRef.current.onopen = null;
        socketRef.current.onmessage = null;
        socketRef.current.onerror = null;
        socketRef.current.onclose = null;
        socketRef.current.close();
      } catch {}
      socketRef.current = null;
    }
    clearTimeout(pongTimeoutRef.current);
    clearInterval(pingIntervalRef.current);
  }, []);

  const sendPing = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      try {
        socketRef.current.send(JSON.stringify({ type: 'ping' } as ClientMessage));
        clearTimeout(pongTimeoutRef.current);
        pongTimeoutRef.current = setTimeout(() => {
          console.warn('Heartbeat timeout; closing dead socket and reconnecting...');
          cleanupSocket();
          setIsConnected(false);
          connect(true);
        }, 8000);
      } catch {
        cleanupSocket();
        setIsConnected(false);
        connect(true);
      }
    }
  }, [cleanupSocket]);

  const connect = useCallback((forceFresh: boolean = false) => {
    clearTimeout(reconnectTimeoutRef.current);

    if (!forceFresh && socketRef.current && (socketRef.current.readyState === WebSocket.CONNECTING || socketRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    if (forceFresh) {
      cleanupSocket();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttemptsRef.current = 0;
      if (savedPinRef.current) {
        ws.send(JSON.stringify({ type: 'verify_pin', pin: savedPinRef.current } as ClientMessage));
      }

      // Start periodic 15-second heartbeat
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = setInterval(sendPing, 15000);
    };

    ws.onmessage = (event) => {
      clearTimeout(pongTimeoutRef.current);

      try {
        const msg: ServerMessage = JSON.parse(event.data);
        if (msg.type === 'pong') {
          return;
        }

        switch (msg.type) {
          case 'init_state':
            setMessages(msg.messages);
            setTerminalLogs(msg.terminalLogs);
            setStatus(msg.status);
            if (msg.sessions) setSessions(msg.sessions);
            if (msg.agySessions) setAgySessions(msg.agySessions);
            if (msg.activeSessionId) setActiveSessionId(msg.activeSessionId);
            if (msg.status.pinRequired && !savedPinRef.current) {
              setIsAuthenticated(false);
            }
            // Check if there's any screenshot in recent messages
            const lastShot = [...msg.messages].reverse().find((m) => m.screenshotUrl);
            if (lastShot?.screenshotUrl) {
              setLatestScreenshot(lastShot.screenshotUrl);
            }
            break;

          case 'sessions_list':
            setSessions(msg.sessions);
            setAgySessions(msg.agySessions);
            setActiveSessionId(msg.activeSessionId);
            break;

          case 'session_loaded':
            setMessages(msg.session.messages);
            setTerminalLogs(msg.session.terminalLogs || []);
            setActiveSessionId(msg.session.id);
            if (msg.sessions) setSessions(msg.sessions);
            if (msg.agySessions) setAgySessions(msg.agySessions);
            const shotInLoaded = [...msg.session.messages].reverse().find((m) => m.screenshotUrl);
            if (shotInLoaded?.screenshotUrl) {
              setLatestScreenshot(shotInLoaded.screenshotUrl);
            }
            break;

          case 'chat_message':
            setMessages((prev) => [...prev, msg.message]);
            if (msg.message.screenshotUrl) {
              setLatestScreenshot(msg.message.screenshotUrl);
            }
            break;

          case 'chat_update':
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === msg.messageId) {
                  const updated = { ...m, ...msg.partial };
                  if (m.status === 'thinking' && (updated.status === 'done' || updated.status === 'error')) {
                    if (
                      typeof window !== 'undefined' &&
                      'Notification' in window &&
                      Notification.permission === 'granted' &&
                      (!document.hasFocus() || document.hidden)
                    ) {
                      try {
                        const clean = (updated.content || '').replace(/[#*`_]/g, '').trim();
                        const snippet = clean.length > 100 ? `${clean.slice(0, 100)}...` : clean;
                        new Notification(
                          updated.status === 'done' ? 'PocketBridge Task Completed' : 'PocketBridge Task Failed',
                          {
                            body: snippet || 'Background task finished.',
                            icon: '/vite.svg',
                          }
                        );
                        if ('vibrate' in navigator) {
                          navigator.vibrate([100, 50, 100]);
                        }
                      } catch (err) {
                        console.error('Notification error:', err);
                      }
                    }
                  }
                  return updated;
                }
                return m;
              })
            );
            if (msg.partial.screenshotUrl) {
              setLatestScreenshot(msg.partial.screenshotUrl);
            }
            break;

          case 'chat_cleared':
            setMessages([]);
            break;

          case 'terminal_log':
            setTerminalLogs((prev) => [...prev, msg.log]);
            break;

          case 'terminal_log_update':
            setTerminalLogs((prev) =>
              prev.map((l) => {
                if (l.id === msg.logId) {
                  return {
                    ...l,
                    output: l.output + msg.chunk,
                    exitCode: msg.exitCode !== undefined ? msg.exitCode : l.exitCode,
                    status: msg.status || l.status,
                  };
                }
                return l;
              })
            );
            break;

          case 'system_status':
            setStatus(msg.status);
            break;

          case 'screenshot_ready':
            setLatestScreenshot(msg.url);
            break;

          case 'auth_result':
            setIsAuthenticated(msg.success);
            setAuthError(msg.success ? null : msg.message || 'Authentication failed');
            break;

          case 'error':
            console.error('Server error received:', msg.message);
            break;
        }
      } catch (err) {
        console.error('Failed to parse WebSocket message:', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      cleanupSocket();

      // Exponential backoff reconnect: 1s, 1.5s, 2.25s, max 5s
      const delay = Math.min(1000 * Math.pow(1.5, reconnectAttemptsRef.current), 5000);
      reconnectAttemptsRef.current += 1;
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => connect(false), delay);
    };

    ws.onerror = (err) => {
      console.warn('WebSocket connection error:', err);
      try {
        ws.close();
      } catch {}
    };
  }, [cleanupSocket, sendPing]);

  useEffect(() => {
    connect();

    // Reconnect immediately when mobile browser comes back to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenTimeRef.current = Date.now();
      } else if (document.visibilityState === 'visible') {
        const elapsed = hiddenTimeRef.current > 0 ? Date.now() - hiddenTimeRef.current : 0;
        hiddenTimeRef.current = 0;

        if (elapsed > 2000) {
          // Tab was backgrounded for more than 2 seconds.
          // Mobile OS / Tailscale tunnel likely disconnected. Force clean reconnect.
          cleanupSocket();
          setIsConnected(false);
          // Wait 250ms for mobile OS network / VPN handshake to complete
          clearTimeout(reconnectTimeoutRef.current);
          reconnectTimeoutRef.current = setTimeout(() => {
            connect(true);
          }, 250);
        } else {
          // Test socket liveness immediately
          if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
            sendPing();
          } else {
            connect(true);
          }
        }
      }
    };

    const handleOnline = () => {
      reconnectAttemptsRef.current = 0;
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(() => {
        connect(true);
      }, 200);
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);
    window.addEventListener('pageshow', handleVisibilityChange);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      window.removeEventListener('pageshow', handleVisibilityChange);
      window.removeEventListener('online', handleOnline);
      clearTimeout(reconnectTimeoutRef.current);
      cleanupSocket();
    };
  }, [connect, cleanupSocket, sendPing]);

  const clearChat = useCallback(() => {
    setMessages([]);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'chat_clear',
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const sendMessage = useCallback((text: string, images?: string[]) => {
    const trimmed = text.trim();
    const lower = trimmed.toLowerCase();
    if (
      !images?.length &&
      (lower === '/clear' ||
        lower === 'clear' ||
        lower === '/cls' ||
        lower === '/clean' ||
        lower === '/reset' ||
        lower.startsWith('/clear '))
    ) {
      clearChat();
      return;
    }

    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'chat_send',
          text,
          images: images && images.length > 0 ? images : undefined,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, [clearChat]);

  const sendQuickAction = useCallback((action: 'screenshot' | 'camera' | 'git_status' | 'system_info' | 'kill_apps') => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'run_quick_action',
          action,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const saveSettings = useCallback((settings: ConfigSettings) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'save_settings',
          settings,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const verifyPin = useCallback((pin: string) => {
    savedPinRef.current = pin;
    localStorage.setItem('pb_pin', pin);
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'verify_pin',
          pin,
        } as ClientMessage)
      );
    }
  }, []);

  const refreshSessions = useCallback(() => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'get_sessions',
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const switchSession = useCallback((sessionId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'switch_session',
          sessionId,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const createNewSession = useCallback((title?: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'new_session',
          title,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const deleteSession = useCallback((sessionId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'delete_session',
          sessionId,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  const resumeAgySession = useCallback((conversationId: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'resume_agy_session',
          conversationId,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

  return {
    isConnected,
    messages,
    terminalLogs,
    status,
    latestScreenshot,
    isAuthenticated,
    authError,
    sessions,
    agySessions,
    activeSessionId,
    sendMessage,
    clearChat,
    sendQuickAction,
    saveSettings,
    verifyPin,
    refreshSessions,
    switchSession,
    createNewSession,
    deleteSession,
    resumeAgySession,
  };
}

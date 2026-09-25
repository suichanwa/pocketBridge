import { useState, useEffect, useRef, useCallback } from 'react';
import type {
  ChatMessage,
  TerminalLog,
  SystemStatus,
  ClientMessage,
  ServerMessage,
  ConfigSettings,
} from '../../shared/types.js';

export function useAgentSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [terminalLogs, setTerminalLogs] = useState<TerminalLog[]>([]);
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [latestScreenshot, setLatestScreenshot] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);

  const socketRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<any>(null);
  const savedPinRef = useRef<string>(localStorage.getItem('pb_pin') || '');

  const connect = useCallback(() => {
    if (socketRef.current && (socketRef.current.readyState === WebSocket.CONNECTING || socketRef.current.readyState === WebSocket.OPEN)) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const host = window.location.host;
    const wsUrl = `${protocol}//${host}/ws`;

    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      setIsConnected(true);
      if (savedPinRef.current) {
        ws.send(JSON.stringify({ type: 'verify_pin', pin: savedPinRef.current } as ClientMessage));
      }
    };

    ws.onmessage = (event) => {
      try {
        const msg: ServerMessage = JSON.parse(event.data);

        switch (msg.type) {
          case 'init_state':
            setMessages(msg.messages);
            setTerminalLogs(msg.terminalLogs);
            setStatus(msg.status);
            if (msg.status.pinRequired && !savedPinRef.current) {
              setIsAuthenticated(false);
            }
            // Check if there's any screenshot in recent messages
            const lastShot = [...msg.messages].reverse().find((m) => m.screenshotUrl);
            if (lastShot?.screenshotUrl) {
              setLatestScreenshot(lastShot.screenshotUrl);
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
              prev.map((m) => (m.id === msg.messageId ? { ...m, ...msg.partial } : m))
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
      socketRef.current = null;
      // Auto-reconnect after 2 seconds
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = setTimeout(connect, 2000);
    };

    ws.onerror = (err) => {
      console.error('WebSocket connection error:', err);
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();

    // Reconnect immediately when mobile browser comes back to foreground
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        connect();
      }
    };

    window.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleVisibilityChange);

    return () => {
      window.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleVisibilityChange);
      clearTimeout(reconnectTimeoutRef.current);
      if (socketRef.current) {
        socketRef.current.close();
      }
    };
  }, [connect]);

  const sendMessage = useCallback((text: string) => {
    if (socketRef.current && socketRef.current.readyState === WebSocket.OPEN) {
      socketRef.current.send(
        JSON.stringify({
          type: 'chat_send',
          text,
          pin: savedPinRef.current,
        } as ClientMessage)
      );
    }
  }, []);

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

  return {
    isConnected,
    messages,
    terminalLogs,
    status,
    latestScreenshot,
    isAuthenticated,
    authError,
    sendMessage,
    sendQuickAction,
    saveSettings,
    verifyPin,
  };
}

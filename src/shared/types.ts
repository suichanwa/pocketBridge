export interface ToolCallRecord {
  id: string;
  name: string;
  args: Record<string, any>;
  result?: any;
  status: 'pending' | 'running' | 'success' | 'failed';
  error?: string;
  startedAt?: number;
  completedAt?: number;
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  status?: 'thinking' | 'streaming' | 'done' | 'error';
  toolCalls?: ToolCallRecord[];
  screenshotUrl?: string;
}

export interface TerminalLog {
  id: string;
  command: string;
  output: string;
  exitCode?: number | null;
  timestamp: number;
  status: 'running' | 'completed' | 'failed';
}

export interface SystemStatus {
  hostname: string;
  localIp: string;
  bonjourHost: string;
  port: number;
  uptime: number;
  platform: string;
  cpuModel: string;
  memory: {
    totalGb: string;
    freeGb: string;
    usedPercent: number;
  };
  battery?: {
    percent: number;
    isCharging: boolean;
  };
  hasGeminiKey: boolean;
  hasTelegramConfig: boolean;
  pinRequired: boolean;
}

export interface ConfigSettings {
  geminiApiKey?: string;
  accessPin?: string;
  telegramApiId?: string;
  telegramApiHash?: string;
}

export type ClientMessage =
  | { type: 'chat_send'; text: string; pin?: string }
  | { type: 'run_quick_action'; action: 'screenshot' | 'camera' | 'git_status' | 'system_info' | 'kill_apps'; pin?: string }
  | { type: 'save_settings'; settings: ConfigSettings; pin?: string }
  | { type: 'verify_pin'; pin: string }
  | { type: 'get_status' };

export type ServerMessage =
  | { type: 'init_state'; messages: ChatMessage[]; terminalLogs: TerminalLog[]; status: SystemStatus }
  | { type: 'chat_message'; message: ChatMessage }
  | { type: 'chat_update'; messageId: string; partial: Partial<ChatMessage> }
  | { type: 'terminal_log'; log: TerminalLog }
  | { type: 'terminal_log_update'; logId: string; chunk: string; exitCode?: number; status?: 'completed' | 'failed' }
  | { type: 'system_status'; status: SystemStatus }
  | { type: 'auth_result'; success: boolean; message?: string }
  | { type: 'screenshot_ready'; url: string; timestamp: number }
  | { type: 'error'; message: string };

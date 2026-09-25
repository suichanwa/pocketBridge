import React, { useRef, useEffect } from 'react';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card.js';
import { Button } from '@/components/ui/button.js';
import { Badge } from '@/components/ui/badge.js';
import { Terminal, Copy, Check, Trash2, ArrowDown } from 'lucide-react';
import type { TerminalLog as TerminalLogType } from '../../shared/types.js';

interface TerminalLogProps {
  logs: TerminalLogType[];
  onClear?: () => void;
}

export const TerminalLog: React.FC<TerminalLogProps> = ({ logs, onClear }) => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [copiedId, setCopiedId] = React.useState<string | null>(null);

  // Auto-scroll on new log chunk
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs]);

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  return (
    <Card className="flex flex-col h-full border-border/60 bg-card/60 backdrop-blur-sm overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b border-border/40">
        <div className="flex items-center gap-2">
          <Terminal className="w-4 h-4 text-emerald-400" />
          <CardTitle className="text-sm font-semibold">Terminal & Test Output</CardTitle>
          {logs.length > 0 && (
            <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4">
              {logs.length}
            </Badge>
          )}
        </div>
        {logs.length > 0 && onClear && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onClear}
            className="h-7 w-7 text-muted-foreground hover:text-foreground"
            title="Clear logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </Button>
        )}
      </CardHeader>

      <CardContent
        ref={scrollRef}
        className="flex-1 p-3 font-mono text-xs overflow-y-auto space-y-3 bg-[#0d0d11] min-h-[220px]"
      >
        {logs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center text-muted-foreground p-6">
            <Terminal className="w-8 h-8 mb-2 opacity-30 text-emerald-400" />
            <p className="text-xs">No active terminal commands</p>
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              Commands executed by the agent or test runs will stream here live.
            </p>
          </div>
        ) : (
          logs.map((log) => (
            <div
              key={log.id}
              className="rounded-lg border border-border/40 bg-black/50 p-2.5 space-y-1.5 overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between gap-2 text-[11px] text-muted-foreground border-b border-border/30 pb-1.5">
                <span className="text-emerald-400 font-semibold truncate flex items-center gap-1.5">
                  <span className="text-muted-foreground">$</span> {log.command}
                </span>
                <div className="flex items-center gap-1.5 shrink-0">
                  {log.status === 'running' && (
                    <Badge variant="warning" className="text-[9px] py-0 px-1">
                      RUNNING...
                    </Badge>
                  )}
                  {log.status === 'completed' && (
                    <Badge variant="success" className="text-[9px] py-0 px-1">
                      EXIT 0
                    </Badge>
                  )}
                  {log.status === 'failed' && (
                    <Badge variant="destructive" className="text-[9px] py-0 px-1">
                      EXIT {log.exitCode ?? 1}
                    </Badge>
                  )}
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => copyToClipboard(log.output, log.id)}
                    className="h-5 w-5 text-muted-foreground hover:text-foreground"
                    title="Copy output"
                  >
                    {copiedId === log.id ? (
                      <Check className="w-3 h-3 text-emerald-400" />
                    ) : (
                      <Copy className="w-3 h-3" />
                    )}
                  </Button>
                </div>
              </div>

              {/* Output Content */}
              <pre className="text-[11px] text-foreground/90 whitespace-pre-wrap break-all max-h-[300px] overflow-y-auto leading-relaxed scrollbar-thin">
                {log.output || <span className="text-muted-foreground/60 italic">(waiting for output...)</span>}
              </pre>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  );
};

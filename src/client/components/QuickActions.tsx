import React from 'react';
import { Button } from '@/components/ui/button.js';
import { Camera, GitBranch, Cpu, RefreshCw } from 'lucide-react';

interface QuickActionsProps {
  onAction: (action: 'screenshot' | 'git_status' | 'system_info') => void;
  disabled?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({ onAction, disabled }) => {
  return (
    <div className="flex items-center gap-1.5 overflow-x-auto py-1 scrollbar-none no-scrollbar">
      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => onAction('screenshot')}
        className="h-7 text-xs px-2.5 rounded-full shrink-0 border border-border/40 hover:border-primary/50 gap-1.5 bg-secondary/60 hover:bg-secondary"
      >
        <Camera className="w-3.5 h-3.5 text-sky-400" />
        <span>Snap Screen</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => onAction('git_status')}
        className="h-7 text-xs px-2.5 rounded-full shrink-0 border border-border/40 hover:border-primary/50 gap-1.5 bg-secondary/60 hover:bg-secondary"
      >
        <GitBranch className="w-3.5 h-3.5 text-emerald-400" />
        <span>Git Status</span>
      </Button>

      <Button
        variant="secondary"
        size="sm"
        disabled={disabled}
        onClick={() => onAction('system_info')}
        className="h-7 text-xs px-2.5 rounded-full shrink-0 border border-border/40 hover:border-primary/50 gap-1.5 bg-secondary/60 hover:bg-secondary"
      >
        <Cpu className="w-3.5 h-3.5 text-amber-400" />
        <span>System Info</span>
      </Button>
    </div>
  );
};

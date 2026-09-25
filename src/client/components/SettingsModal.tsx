import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog.js';
import { Button } from '@/components/ui/button.js';
import { Input } from '@/components/ui/input.js';
import { Badge } from '@/components/ui/badge.js';
import { Key, Lock, Send, Check, ExternalLink, Copy, Sparkles } from 'lucide-react';
import type { SystemStatus, ConfigSettings } from '../../shared/types.js';

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  status: SystemStatus | null;
  onSaveSettings: (settings: ConfigSettings) => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  open,
  onOpenChange,
  status,
  onSaveSettings,
}) => {
  const [geminiKey, setGeminiKey] = useState('');
  const [modelTier, setModelTier] = useState<'flash' | 'pro'>(status?.modelTier || 'pro');
  const [accessPin, setAccessPin] = useState(localStorage.getItem('pb_pin') || '');
  const [tgId, setTgId] = useState('');
  const [tgHash, setTgHash] = useState('');
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [isSaved, setIsSaved] = useState(false);

  useEffect(() => {
    if (open) {
      setIsSaved(false);
      if (status?.modelTier) {
        setModelTier(status.modelTier);
      }
    }
  }, [open, status?.modelTier]);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessPin) {
      localStorage.setItem('pb_pin', accessPin);
    } else {
      localStorage.removeItem('pb_pin');
    }

    onSaveSettings({
      geminiApiKey: geminiKey || undefined,
      modelTier,
      accessPin: accessPin || undefined,
      telegramApiId: tgId || undefined,
      telegramApiHash: tgHash || undefined,
    });

    setIsSaved(true);
    setTimeout(() => {
      onOpenChange(false);
    }, 1000);
  };

  const copyConnectionUrl = () => {
    const url = `http://${status?.localIp || 'localhost'}:${status?.port || 3000}`;
    navigator.clipboard.writeText(url);
    setCopiedUrl(true);
    setTimeout(() => setCopiedUrl(false), 2000);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto bg-card border-border/80">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base sm:text-lg">
            <span>PocketBridge Settings</span>
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Configure your AI brain, network access, and Telegram integration.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-4 py-2">
          {/* Mobile Connection Info Banner */}
          <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-primary">📱 Phone Access URL</span>
              <button
                type="button"
                onClick={copyConnectionUrl}
                className="text-[11px] flex items-center gap-1 text-primary hover:underline"
              >
                {copiedUrl ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                {copiedUrl ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="font-mono text-xs text-foreground bg-background/80 rounded-md p-2 border border-border/50 break-all select-all">
              http://{status?.localIp || '192.168.1.8'}:{status?.port || 3000}
            </div>
            <p className="text-[11px] text-muted-foreground">
              Or use <code className="text-sky-400">http://{status?.bonjourHost || 'mac.local'}:{status?.port || 3000}</code> on your phone&apos;s Safari/Chrome.
            </p>
          </div>

          {/* Gemini API Key */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Key className="w-3.5 h-3.5 text-primary" />
                Gemini API Key
              </label>
              <a
                href="https://aistudio.google.com/"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-primary flex items-center gap-0.5 hover:underline"
              >
                Get Free Key <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <Input
              type="password"
              placeholder={status?.hasGeminiKey ? '•••••••••••••••• (configured)' : 'AIzaSy...'}
              value={geminiKey}
              onChange={(e) => setGeminiKey(e.target.value)}
              className="h-9 text-xs font-mono bg-secondary/50 border-border/70"
            />
            <p className="text-[11px] text-muted-foreground">
              Powers autonomous tool calling, code debugging, and web search synthesis.
            </p>
          </div>

          {/* AI Model Tier Selector */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold flex items-center justify-between text-foreground">
              <span className="flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-primary" />
                AI Model Tier
              </span>
              <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-normal">
                {modelTier === 'pro' ? 'Gemini 3.8 Flash High (AGY)' : 'Gemini Flash'}
              </Badge>
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setModelTier('pro')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  modelTier === 'pro'
                    ? 'border-violet-500 bg-violet-500/10 text-foreground ring-1 ring-violet-500'
                    : 'border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/60'
                }`}
              >
                <span className="font-semibold block text-violet-400">🧠 Pro (Default)</span>
                <span className="text-[10px] text-muted-foreground block mt-0.5 leading-snug">
                  Gemini 3.8 Flash High via Antigravity (--dangerously-skip-permissions)
                </span>
              </button>

              <button
                type="button"
                onClick={() => setModelTier('flash')}
                className={`p-2.5 rounded-xl border text-left text-xs transition-all ${
                  modelTier === 'flash'
                    ? 'border-primary bg-primary/10 text-foreground ring-1 ring-primary'
                    : 'border-border/60 bg-secondary/40 text-muted-foreground hover:bg-secondary/60'
                }`}
              >
                <span className="font-semibold block text-primary">⚡ Flash</span>
                <span className="text-[10px] text-muted-foreground block mt-0.5 leading-snug">
                  Lightweight Gemini Flash for basic Mac control
                </span>
              </button>
            </div>
          </div>

          {/* Access PIN */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Local Access PIN (Optional)
            </label>
            <Input
              type="text"
              placeholder="e.g. 1234 (leave blank for open Wi-Fi)"
              value={accessPin}
              onChange={(e) => setAccessPin(e.target.value)}
              className="h-9 text-xs font-mono bg-secondary/50 border-border/70"
            />
            <p className="text-[11px] text-muted-foreground">
              Protects against other devices on the same Wi-Fi sending commands.
            </p>
          </div>

          {/* Telegram Credentials (Optional) */}
          <div className="space-y-2 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold flex items-center gap-1.5 text-foreground">
                <Send className="w-3.5 h-3.5 text-violet-400" />
                Telegram Messaging (Optional)
              </label>
              <a
                href="https://my.telegram.org"
                target="_blank"
                rel="noreferrer"
                className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
              >
                my.telegram.org <ExternalLink className="w-2.5 h-2.5" />
              </a>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Input
                type="text"
                placeholder="API ID"
                value={tgId}
                onChange={(e) => setTgId(e.target.value)}
                className="h-8 text-xs font-mono bg-secondary/50 border-border/70"
              />
              <Input
                type="password"
                placeholder="API Hash"
                value={tgHash}
                onChange={(e) => setTgHash(e.target.value)}
                className="h-8 text-xs font-mono bg-secondary/50 border-border/70"
              />
            </div>
          </div>

          <DialogFooter className="pt-2">
            <Button
              type="submit"
              disabled={isSaved}
              className="w-full h-9 text-xs font-medium gap-1.5 bg-primary text-primary-foreground hover:bg-primary/90"
            >
              {isSaved ? <Check className="w-4 h-4 text-emerald-400" /> : null}
              {isSaved ? 'Settings Saved!' : 'Save & Apply'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};

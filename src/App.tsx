import React, { useState, useEffect } from 'react';
import { EngineConfig } from '@/engine/types';
import { NavHeader } from '@/ui/NavHeader';
import { TypingArena } from '@/ui/TypingArena';
import { PerfOverlay } from '@/perf/PerfOverlay';
import { scheduler } from '@/scheduler';

export const App: React.FC = () => {
  const [config, setConfig] = useState<EngineConfig>({
    mode: 'time',
    duration: 30,
    wordCount: 25,
    punctuation: false,
    numbers: false,
  });

  useEffect(() => {
    scheduler.start();
    return () => {
      scheduler.stop();
    };
  }, []);

  return (
    <div className="min-h-screen w-full bg-canvas text-ink flex flex-col justify-between px-6 py-4 md:px-12 md:py-6 selection:bg-primary selection:text-on-primary transition-colors duration-300">
      {/* Sleek Minimalist Navigation Header */}
      <NavHeader config={config} onConfigChange={setConfig} />

      {/* Main Focus: Pure Typing Arena */}
      <main className="flex-1 flex flex-col items-center justify-center py-8">
        <TypingArena config={config} onConfigChange={setConfig} />
      </main>

      {/* Minimalist Subdued Keyboard Shortcut Hints Footer */}
      <footer className="w-full max-w-4xl mx-auto flex items-center justify-between text-[11px] font-mono text-text-dim pt-4 border-t border-hairline/40 select-none">
        <div className="flex items-center gap-4">
          <span><kbd className="px-1 py-0.5 rounded bg-surface border border-hairline text-text-muted">tab</kbd> restart</span>
          <span><kbd className="px-1 py-0.5 rounded bg-surface border border-hairline text-text-muted">ctrl</kbd> + <kbd className="px-1 py-0.5 rounded bg-surface border border-hairline text-text-muted">shift</kbd> + <kbd className="px-1 py-0.5 rounded bg-surface border border-hairline text-text-muted">p</kbd> perf</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            60fps engine
          </span>
          <span>•</span>
          <span>local-first</span>
        </div>
      </footer>

      {/* Dev Perf Overlay (Hidden until Ctrl+Shift+P) */}
      <PerfOverlay />
    </div>
  );
};

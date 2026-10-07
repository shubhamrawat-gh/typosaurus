import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TypingEngine } from '@/engine';
import { EngineConfig, EngineMetrics } from '@/engine/types';
import { TextRenderer } from '@/render/text-renderer';
import { perfCollector } from '@/perf/collector';

interface TypingArenaProps {
  config: EngineConfig;
  onConfigChange?: (config: EngineConfig) => void;
}

export const TypingArena: React.FC<TypingArenaProps> = ({ config }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engineRef = useRef<TypingEngine | null>(null);
  const rendererRef = useRef<TextRenderer | null>(null);

  // Low-frequency UI state (only updated on start/pause/finish/timer tick at ~4Hz)
  const [isFocused, setIsFocused] = useState<boolean>(true);
  const [capsLock, setCapsLock] = useState<boolean>(false);
  const [isFinished, setIsFinished] = useState<boolean>(false);
  const [finalMetrics, setFinalMetrics] = useState<EngineMetrics | null>(null);

  // Live HUD metrics refs to write directly to DOM text nodes (~4Hz)
  const timerNodeRef = useRef<HTMLSpanElement>(null);
  const liveWpmNodeRef = useRef<HTMLSpanElement>(null);
  const liveAccNodeRef = useRef<HTMLSpanElement>(null);

  // Initialize or reconfigure engine
  const initEngine = useCallback(() => {
    if (rendererRef.current) {
      rendererRef.current.destroy();
      rendererRef.current = null;
    }
    if (engineRef.current) {
      engineRef.current.destroy();
      engineRef.current = null;
    }

    const engine = new TypingEngine(config);
    engineRef.current = engine;

    if (containerRef.current) {
      const renderer = new TextRenderer(containerRef.current);
      renderer.mountWords(engine.getState().words);
      rendererRef.current = renderer;
    }

    setIsFinished(false);
    setFinalMetrics(null);

    // Initial HUD labels
    if (timerNodeRef.current) {
      timerNodeRef.current.textContent =
        config.mode === 'time' ? `${config.duration ?? 30}s` : `${config.wordCount ?? 25}w`;
    }
    if (liveWpmNodeRef.current) liveWpmNodeRef.current.textContent = '0';
    if (liveAccNodeRef.current) liveAccNodeRef.current.textContent = '100%';

    // Finish listener
    engine.onFinish((_, metrics) => {
      setIsFinished(true);
      setFinalMetrics(metrics);
    });

    // Low-frequency HUD timer loop (~4Hz)
    let lastHudUpdate = 0;
    engine.subscribe((state, metrics) => {
      // Direct DOM update on renderer hot path
      if (rendererRef.current) {
        rendererRef.current.update(state);
      }

      const now = performance.now();
      if (now - lastHudUpdate > 250 || state.status === 'finished') {
        lastHudUpdate = now;

        if (timerNodeRef.current) {
          if (config.mode === 'time' && state.startTime !== null) {
            const elapsed = Math.floor((now - state.startTime) / 1000);
            const remaining = Math.max(0, (config.duration ?? 30) - elapsed);
            timerNodeRef.current.textContent = `${remaining}s`;
          } else if (config.mode === 'words') {
            const remaining = Math.max(0, (config.wordCount ?? 25) - state.currentWordIndex);
            timerNodeRef.current.textContent = `${remaining}w`;
          }
        }

        if (liveWpmNodeRef.current && state.status === 'running') {
          liveWpmNodeRef.current.textContent = `${metrics.wpm}`;
        }

        if (liveAccNodeRef.current && state.status === 'running') {
          liveAccNodeRef.current.textContent = `${metrics.accuracy}%`;
        }
      }
    });

    // Focus input
    inputRef.current?.focus();
  }, [config]);

  useEffect(() => {
    initEngine();

    return () => {
      engineRef.current?.destroy();
      rendererRef.current?.destroy();
    };
  }, [initEngine]);

  // Handle global keyboard inputs (Tab restart, input routing)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Tab then Enter or simple Tab to restart
      if (e.key === 'Tab') {
        e.preventDefault();
        initEngine();
        return;
      }

      // Check CapsLock state
      if (typeof e.getModifierState === 'function') {
        setCapsLock(e.getModifierState('CapsLock'));
      }

      // Route to engine if not an interactive UI element
      const target = e.target as HTMLElement;
      if (target.tagName !== 'INPUT' && target.tagName !== 'SELECT' && target.tagName !== 'TEXTAREA') {
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [initEngine]);

  // Hot path input handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Record input latency telemetry
    perfCollector.recordInputEvent();

    if (engineRef.current) {
      const handled = engineRef.current.handleKeyDown(e.nativeEvent);
      if (handled) {
        e.preventDefault();
      }
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto flex flex-col items-center justify-center relative select-none">
      {/* Hidden Textarea for focused native input */}
      <textarea
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
          engineRef.current?.resume();
        }}
        onBlur={() => {
          setIsFocused(false);
          engineRef.current?.pause();
        }}
        className="opacity-0 absolute -top-96 left-0 w-0 h-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={0}
      />

      {/* Live Minimal HUD Bar */}
      <div className="w-full flex items-center justify-between font-mono text-sm mb-6 text-text-muted transition-opacity duration-300">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-text-dim text-xs uppercase tracking-wider">Timer</span>
            <span ref={timerNodeRef} className="text-primary font-bold text-base">
              {config.mode === 'time' ? `${config.duration ?? 30}s` : `${config.wordCount ?? 25}w`}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-dim text-xs uppercase tracking-wider">Live WPM</span>
            <span ref={liveWpmNodeRef} className="text-ink font-semibold">
              0
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-text-dim text-xs uppercase tracking-wider">Acc</span>
            <span ref={liveAccNodeRef} className="text-ink font-semibold">
              100%
            </span>
          </div>
        </div>

        {/* Caps Lock notification */}
        {capsLock && (
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-error-bg text-error text-xs border border-error/30 animate-pulse">
            <span className="inline-block w-1.5 h-1.5 rounded-full bg-error" />
            CAPS LOCK
          </div>
        )}
      </div>

      {/* Main Text Container */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`w-full relative py-6 px-4 cursor-text transition-all duration-300 ${
          !isFocused ? 'blur-[1.5px] opacity-40' : 'opacity-100'
        }`}
      >
        <div ref={containerRef} className="w-full" />

        {/* Unfocused Click-to-Resume Banner */}
        {!isFocused && !isFinished && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="px-4 py-2 rounded-full bg-surface/90 border border-hairline shadow-lg backdrop-blur text-xs font-mono text-text-muted">
              Click or press any key to focus
            </div>
          </div>
        )}
      </div>

      {/* Restart & Quick Command Hint */}
      <div className="mt-8 flex items-center gap-4 text-xs font-mono text-text-dim">
        <button
          onClick={initEngine}
          className="flex items-center gap-1.5 hover:text-ink transition-colors px-3 py-1.5 rounded hover:bg-surface border border-transparent hover:border-hairline"
          title="Restart Test (Tab)"
        >
          <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
          Restart <kbd className="text-[10px] bg-surface-soft px-1 rounded border border-hairline">tab</kbd>
        </button>
      </div>

      {/* Clean Post-Test Results Overlay */}
      {isFinished && finalMetrics && (
        <div className="fixed inset-0 bg-canvas/80 backdrop-blur-md z-40 flex items-center justify-center p-6 animate-fade-in">
          <div className="w-full max-w-lg bg-surface border border-hairline-strong rounded-2xl p-8 shadow-2xl relative">
            <div className="text-center mb-8">
              <span className="text-xs uppercase font-mono tracking-widest text-text-muted">
                Test Complete
              </span>
              <div className="flex items-baseline justify-center gap-2 mt-2">
                <span className="text-6xl font-bold font-mono tracking-tighter text-primary">
                  {finalMetrics.wpm}
                </span>
                <span className="text-xl font-mono text-text-muted">WPM</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-4 border-y border-hairline py-6 mb-8 text-center font-mono">
              <div>
                <span className="text-xs text-text-dim block mb-1">ACCURACY</span>
                <span className="text-2xl font-bold text-ink">{finalMetrics.accuracy}%</span>
              </div>
              <div>
                <span className="text-xs text-text-dim block mb-1">RAW WPM</span>
                <span className="text-2xl font-bold text-ink">{finalMetrics.rawWpm}</span>
              </div>
              <div>
                <span className="text-xs text-text-dim block mb-1">CONSISTENCY</span>
                <span className="text-2xl font-bold text-ink">{finalMetrics.consistency}%</span>
              </div>
            </div>

            <div className="flex items-center justify-center gap-4">
              <button
                onClick={initEngine}
                autoFocus
                className="w-full py-3 px-6 rounded-full bg-primary hover:bg-primary-hover text-on-primary font-display font-semibold text-sm transition-transform active:scale-[0.98] shadow-lg flex items-center justify-center gap-2"
              >
                Next Test
                <kbd className="text-[10px] font-mono bg-on-primary/10 px-1.5 py-0.5 rounded">Enter</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

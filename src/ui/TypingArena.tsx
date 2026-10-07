import React, { useEffect, useRef, useState, useCallback } from 'react';
import { TypingEngine } from '@/engine';
import { EngineConfig, EngineMetrics, EngineState } from '@/engine/types';
import { TextRenderer } from '@/render/text-renderer';
import { scheduler } from '@/scheduler';

interface TypingArenaProps {
  config: EngineConfig;
  onNextTest: () => void;
}

export const TypingArena: React.FC<TypingArenaProps> = ({ config, onNextTest }) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const engineRef = useRef<TypingEngine | null>(null);
  const rendererRef = useRef<TextRenderer | null>(null);
  const hudUnsubRef = useRef<(() => void) | null>(null);

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
    hudUnsubRef.current?.();
    hudUnsubRef.current = null;
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
        config.mode === 'time' ? `${config.duration ?? 30}s` : config.mode === 'words' ? `${config.wordCount ?? 25}w` : config.mode === 'code' ? `${engine.getState().words.length} lines` : '∞';
    }
    if (liveWpmNodeRef.current) liveWpmNodeRef.current.textContent = '0';
    if (liveAccNodeRef.current) liveAccNodeRef.current.textContent = '100%';

    // Finish listener
    engine.onFinish((_, metrics) => {
      setIsFinished(true);
      setFinalMetrics(metrics);
    });

    // Keep the HUD moving while no keys are pressed. DOM writes stay at ~4Hz.
    let lastHudUpdate = 0;
    const updateHud = (state: EngineState, metrics: EngineMetrics, now: number) => {
      if (now - lastHudUpdate < 250 && state.status !== 'finished') return;
      lastHudUpdate = now;

      if (timerNodeRef.current) {
        if (config.mode === 'time' && state.startTime !== null) {
          const elapsed = Math.floor(((state.endTime ?? now) - state.startTime) / 1000);
          timerNodeRef.current.textContent = `${Math.max(0, (config.duration ?? 30) - elapsed)}s`;
        } else if (config.mode === 'words') {
          timerNodeRef.current.textContent = `${Math.max(0, (config.wordCount ?? 25) - state.currentWordIndex)}w`;
        } else if (config.mode === 'code') {
          timerNodeRef.current.textContent = `${Math.max(0, state.words.length - state.currentWordIndex)} lines`;
        }
      }

      if (liveWpmNodeRef.current && state.status === 'running') liveWpmNodeRef.current.textContent = `${metrics.wpm}`;
      if (liveAccNodeRef.current && state.status === 'running') liveAccNodeRef.current.textContent = `${metrics.accuracy}%`;
    };

    engine.subscribe((state, metrics) => {
      rendererRef.current?.update(state);
      updateHud(state, metrics, performance.now());
    });
    hudUnsubRef.current = scheduler.subscribe('arena-hud', (_, now) => {
      const state = engine.getState();
      if (state.status === 'running') updateHud(state, engine.getMetrics(), now);
    }, 8);

    // Focus input
    inputRef.current?.focus();
  }, [config]);

  useEffect(() => {
    initEngine();

    return () => {
      hudUnsubRef.current?.();
      engineRef.current?.destroy();
      rendererRef.current?.destroy();
    };
  }, [initEngine]);

  // Handle the next-test shortcut and input routing.
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      // Tab loads the next test while typing or viewing results.
      const target = e.target instanceof HTMLElement ? e.target : null;
      if (e.key === 'Tab' && !e.shiftKey && (target === inputRef.current || target?.closest('.results-card'))) {
        e.preventDefault();
        onNextTest();
        return;
      }

      // Check CapsLock state
      if (typeof e.getModifierState === 'function') {
        setCapsLock(e.getModifierState('CapsLock'));
      }

      // Route to engine if not an interactive UI element
      if (target && !['INPUT', 'SELECT', 'TEXTAREA', 'BUTTON'].includes(target.tagName) && !target.closest('[role="dialog"]')) {
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [onNextTest]);

  // Hot path input handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (engineRef.current) {
      const handled = engineRef.current.handleKeyDown(e.nativeEvent);
      if (handled) {
        e.preventDefault();
      }
    }
  };

  return (
    <section className={`typing-station ${config.mode === 'code' ? 'is-code-mode' : ''}`} aria-label="Typing test">
      {/* Hidden Textarea for focused native input */}
      <textarea
        ref={inputRef}
        onKeyDown={handleKeyDown}
        onFocus={() => {
          setIsFocused(true);
        }}
        onBlur={() => {
          setIsFocused(false);
        }}
        className="opacity-0 absolute -top-96 left-0 w-0 h-0 pointer-events-none"
        aria-hidden="true"
        tabIndex={0}
      />

      {/* Live Minimal HUD Bar */}
      <div className="metrics-row">
        <div className="metrics-group">
          <div className="metric metric-primary">
            <span className="metric-label">{config.mode === 'time' ? 'Time left' : config.mode === 'words' ? 'Words left' : config.mode === 'code' ? 'Lines left' : 'Session'}</span>
            <span ref={timerNodeRef} className="metric-value">
              {config.mode === 'time' ? `${config.duration ?? 30}s` : config.mode === 'words' ? `${config.wordCount ?? 25}w` : config.mode === 'code' ? 'Code' : '∞'}
            </span>
          </div>
          <div className="metric">
            <span className="metric-label">Speed</span>
            <span className="metric-number"><span ref={liveWpmNodeRef} className="metric-value">
              0
            </span><span className="metric-unit">wpm</span></span>
          </div>
          <div className="metric">
            <span className="metric-label">Accuracy</span>
            <span ref={liveAccNodeRef} className="metric-value">
              100%
            </span>
          </div>
        </div>

        {/* Caps Lock notification */}
        {capsLock && (
          <div className="caps-warning">
            Caps lock is on
          </div>
        )}
      </div>

      {/* Main Text Container */}
      <div
        onClick={() => inputRef.current?.focus()}
        className={`text-surface ${!isFocused ? 'is-unfocused' : ''}`}
      >
        <div ref={containerRef} className="w-full" />

        {/* Unfocused Click-to-Resume Banner */}
        {!isFocused && !isFinished && (
          <div className="absolute inset-0 flex items-center justify-center z-20 pointer-events-none">
            <div className="focus-prompt">
              Click or press any key to focus
            </div>
          </div>
        )}
      </div>

      {/* Restart & Quick Command Hint */}
      <div className="station-bottom">
        {config.mode === 'code' && <span className="practice-hint"><kbd>enter</kbd> next line</span>}
        <div className="station-actions">
          <button
            onClick={initEngine}
            className="restart-button"
            title="Restart current test"
          >
            <svg className="restart-icon" fill="none" viewBox="0 0 24 24" stroke="currentColor" aria-hidden="true">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            Restart
          </button>
          <button onClick={onNextTest} className="restart-button" title="Next test (Tab)">Next test <kbd>tab</kbd></button>
        </div>
      </div>

      {/* Clean Post-Test Results Overlay */}
      {isFinished && finalMetrics && (
        <div className="results-backdrop">
          <div className="results-card" role="dialog" aria-modal="true" aria-labelledby="results-title">
            <div className="text-center mb-8">
              <img
                src={`${import.meta.env.BASE_URL}logo.png`}
                alt="Typosaurus mascot"
                className="results-logo"
              />
              <span id="results-title" className="results-eyebrow">
                Test Complete
              </span>
              <div className="flex items-baseline justify-center gap-2 mt-2">
                <span className="results-wpm">
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
                onClick={onNextTest}
                autoFocus
                className="next-test-button"
              >
                Next Test
                <kbd className="text-[10px] font-mono bg-on-primary/10 px-1.5 py-0.5 rounded">tab</kbd>
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

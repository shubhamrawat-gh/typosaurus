import React, { useEffect, useState } from 'react';
import { perfCollector, PerfMetrics } from './collector';

export const PerfOverlay: React.FC = () => {
  const [visible, setVisible] = useState<boolean>(false);
  const [metrics, setMetrics] = useState<PerfMetrics>(perfCollector.getMetrics());

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Toggle with Ctrl+Shift+P
      if (e.ctrlKey && e.shiftKey && (e.key === 'P' || e.key === 'p')) {
        e.preventDefault();
        setVisible((prev) => !prev);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    if (!visible) return;

    // Refresh overlay UI at ~4Hz (250ms) to ensure zero impact on frame rendering
    const interval = setInterval(() => {
      setMetrics(perfCollector.getMetrics());
    }, 250);

    return () => clearInterval(interval);
  }, [visible]);

  if (!visible) return null;

  const qualityNames: Record<number, string> = {
    1: '1 (Minimal)',
    2: '2 (Medium)',
    3: '3 (High)',
    4: '4 (Blazing)',
  };

  const getStatusColor = (ms: number) => {
    if (ms <= 12) return 'text-primary';
    if (ms <= 16.7) return 'text-accent-orange';
    return 'text-error';
  };

  return (
    <aside
      aria-label="Performance Metrics Overlay"
      className="fixed top-4 right-4 z-50 bg-surface/95 backdrop-blur-md border border-hairline-strong shadow-2xl rounded-lg p-3 w-64 font-mono text-xs text-ink pointer-events-auto select-none"
    >
      <div className="flex items-center justify-between border-b border-hairline pb-2 mb-2">
        <span className="font-semibold text-primary flex items-center gap-1.5">
          <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse" />
          PERF MONITOR
        </span>
        <button
          onClick={() => setVisible(false)}
          className="text-text-muted hover:text-ink text-sm px-1 leading-none rounded hover:bg-surface-soft transition-colors"
          title="Close overlay (Ctrl+Shift+P)"
        >
          ✕
        </button>
      </div>

      <div className="space-y-1.5">
        <div className="flex justify-between items-center">
          <span className="text-text-muted">Framerate</span>
          <span className="font-bold text-sm text-primary">{metrics.fps} FPS</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Frame Time (p50)</span>
          <span className={getStatusColor(metrics.p50)}>{metrics.p50} ms</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Frame Time (p95)</span>
          <span className={getStatusColor(metrics.p95)}>{metrics.p95} ms</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Frame Time (p99)</span>
          <span className={getStatusColor(metrics.p99)}>{metrics.p99} ms</span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Input Latency</span>
          <span className="text-primary font-medium">
            {metrics.inputLatencyMs > 0 ? `${metrics.inputLatencyMs} ms` : '< 1 ms'}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Long Tasks (&gt;50ms)</span>
          <span className={metrics.longTasks > 0 ? 'text-error font-bold' : 'text-primary'}>
            {metrics.longTasks}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Quality Tier</span>
          <span className="text-accent-purple font-medium">
            {qualityNames[metrics.qualityLevel]}
          </span>
        </div>

        <div className="flex justify-between items-center">
          <span className="text-text-muted">Active Particles</span>
          <span className="text-text-muted">{metrics.particleCount}</span>
        </div>

        {metrics.heapUsedMb !== null && (
          <div className="flex justify-between items-center">
            <span className="text-text-muted">JS Heap</span>
            <span className="text-text-muted">{metrics.heapUsedMb} MB</span>
          </div>
        )}
      </div>

      <div className="mt-2.5 pt-2 border-t border-hairline text-[10px] text-text-dim flex justify-between">
        <span>Toggle: Ctrl+Shift+P</span>
        <span>rAF Loops: {metrics.subscriberCount}</span>
      </div>
    </aside>
  );
};

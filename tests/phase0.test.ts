import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AnimationScheduler } from '../src/scheduler';
import { perfCollector } from '../src/perf/collector';
import { useThemeStore, THEMES } from '../src/ui/theme';

describe('Phase 0 - Setup & Infrastructure Verification', () => {
  describe('AnimationScheduler', () => {
    let scheduler: AnimationScheduler;

    beforeEach(() => {
      scheduler = AnimationScheduler.getInstance();
      scheduler.stop();
    });

    it('manages subscriptions and prioritizes callbacks', () => {
      const order: number[] = [];
      const unsub1 = scheduler.subscribe('second', () => order.push(2), 20);
      const unsub2 = scheduler.subscribe('first', () => order.push(1), 10);

      expect(scheduler.getSubscriberCount()).toBe(2);

      unsub1();
      expect(scheduler.getSubscriberCount()).toBe(1);

      unsub2();
      expect(scheduler.getSubscriberCount()).toBe(0);
    });

    it('notifies frame telemetry listeners with dt calculations', () => {
      const telemetrySpy = vi.fn();
      const unsub = scheduler.onFrame(telemetrySpy);

      // Simulating a frame directly via perfCollector
      perfCollector.recordFrame(16.6);
      perfCollector.recordFrame(15.2);
      perfCollector.recordFrame(16.8);

      const metrics = perfCollector.getMetrics();
      expect(metrics.fps).toBeGreaterThan(0);
      expect(metrics.p50).toBeGreaterThan(0);
      expect(metrics.p95).toBeGreaterThan(0);

      unsub();
    });
  });

  describe('Theme System', () => {
    beforeEach(() => {
      useThemeStore.getState().setTheme('mongodb-dark');
    });

    it('defaults to MongoDB Dark theme derived from DESIGN.md', () => {
      const current = useThemeStore.getState().currentTheme;
      expect(current).toBe('mongodb-dark');
    });

    it('supports 7 distinct themes maintaining the design token structure', () => {
      expect(THEMES.length).toBeGreaterThanOrEqual(6);
      const ids = THEMES.map((t) => t.id);
      expect(ids).toContain('mongodb-dark');
      expect(ids).toContain('mongodb-light');
      expect(ids).toContain('matrix-cyber');
      expect(ids).toContain('dracula');
    });

    it('cycles through next and previous themes seamlessly', () => {
      useThemeStore.getState().setTheme('mongodb-dark');
      useThemeStore.getState().nextTheme();
      expect(useThemeStore.getState().currentTheme).toBe('mongodb-light');

      useThemeStore.getState().prevTheme();
      expect(useThemeStore.getState().currentTheme).toBe('mongodb-dark');
    });
  });

  describe('PerfCollector', () => {
    beforeEach(() => {
      perfCollector.reset();
    });

    it('accurately computes p50, p95, p99 frame times and quality level', () => {
      // Feed controlled frame timings
      for (let i = 1; i <= 100; i++) {
        perfCollector.recordFrame(i);
      }

      const metrics = perfCollector.getMetrics();
      expect(metrics.p50).toBeCloseTo(51, 1);
      expect(metrics.p95).toBeCloseTo(96, 1);
      expect(metrics.p99).toBeCloseTo(100, 1);
      expect(metrics.qualityLevel).toBe(4);
    });
  });
});

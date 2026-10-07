/**
 * Performance metrics collector
 * Tracks rolling frame times (p50, p95, p99), FPS, long tasks, and input-to-paint latency.
 */

import { scheduler } from '@/scheduler';

export type QualityLevel = 1 | 2 | 3 | 4; // 1: Minimal, 2: Medium, 3: High, 4: Blazing

export interface PerfMetrics {
  fps: number;
  p50: number;
  p95: number;
  p99: number;
  longTasks: number;
  inputLatencyMs: number;
  particleCount: number;
  qualityLevel: QualityLevel;
  heapUsedMb: number | null;
  subscriberCount: number;
}

class PerfCollector {
  private static instance: PerfCollector | null = null;
  private frameTimes: number[] = [];
  private readonly maxFrames = 120; // ~2 seconds of history at 60fps
  private longTaskCount: number = 0;
  private lastInputTimestamp: number | null = null;
  private lastInputLatency: number = 0;
  private currentParticleCount: number = 0;
  private qualityLevel: QualityLevel = 4; // Defaults to Blazing
  private observer: PerformanceObserver | null = null;

  private constructor() {
    this.initLongTaskObserver();
    this.subscribeToScheduler();
  }

  public static getInstance(): PerfCollector {
    if (!PerfCollector.instance) {
      PerfCollector.instance = new PerfCollector();
    }
    return PerfCollector.instance;
  }

  private initLongTaskObserver(): void {
    if (typeof window !== 'undefined' && 'PerformanceObserver' in window) {
      try {
        this.observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (entry.entryType === 'longtask') {
              this.longTaskCount++;
            }
          }
        });
        this.observer.observe({ entryTypes: ['longtask'] });
      } catch {
        // LongTask API not supported in all browsers / tests
      }
    }
  }

  private subscribeToScheduler(): void {
    scheduler.onFrame((frameTimeMs) => {
      this.recordFrame(frameTimeMs);

      // If we had a keydown waiting for paint
      if (this.lastInputTimestamp !== null) {
        this.lastInputLatency = performance.now() - this.lastInputTimestamp;
        this.lastInputTimestamp = null;
      }
    });
  }

  public reset(): void {
    this.frameTimes = [];
    this.longTaskCount = 0;
    this.lastInputTimestamp = null;
    this.lastInputLatency = 0;
    this.currentParticleCount = 0;
    this.qualityLevel = 4;
  }

  public recordInputEvent(): void {
    this.lastInputTimestamp = performance.now();
  }

  public recordFrame(frameTimeMs: number): void {
    if (this.frameTimes.length >= this.maxFrames) {
      this.frameTimes.shift();
    }
    this.frameTimes.push(frameTimeMs);
  }

  public setParticleCount(count: number): void {
    this.currentParticleCount = count;
  }

  public setQualityLevel(level: QualityLevel): void {
    this.qualityLevel = level;
  }

  public getMetrics(): PerfMetrics {
    if (this.frameTimes.length === 0) {
      return {
        fps: 60,
        p50: 16.6,
        p95: 16.6,
        p99: 16.6,
        longTasks: this.longTaskCount,
        inputLatencyMs: this.lastInputLatency,
        particleCount: this.currentParticleCount,
        qualityLevel: this.qualityLevel,
        heapUsedMb: this.getHeapMemoryMb(),
        subscriberCount: scheduler.getSubscriberCount(),
      };
    }

    const sorted = [...this.frameTimes].sort((a, b) => a - b);
    const count = sorted.length;
    const p50 = sorted[Math.floor(count * 0.5)] || 0;
    const p95 = sorted[Math.floor(count * 0.95)] || 0;
    const p99 = sorted[Math.floor(count * 0.99)] || 0;

    const avgMs = sorted.reduce((sum, val) => sum + val, 0) / count;
    const fps = avgMs > 0 ? Math.round(1000 / avgMs) : 60;

    return {
      fps,
      p50: parseFloat(p50.toFixed(2)),
      p95: parseFloat(p95.toFixed(2)),
      p99: parseFloat(p99.toFixed(2)),
      longTasks: this.longTaskCount,
      inputLatencyMs: parseFloat(this.lastInputLatency.toFixed(2)),
      particleCount: this.currentParticleCount,
      qualityLevel: this.qualityLevel,
      heapUsedMb: this.getHeapMemoryMb(),
      subscriberCount: scheduler.getSubscriberCount(),
    };
  }

  private getHeapMemoryMb(): number | null {
    if (typeof window !== 'undefined' && 'performance' in window) {
      const perfAny = performance as unknown as { memory?: { usedJSHeapSize: number } };
      if (perfAny.memory && typeof perfAny.memory.usedJSHeapSize === 'number') {
        return parseFloat((perfAny.memory.usedJSHeapSize / (1024 * 1024)).toFixed(1));
      }
    }
    return null;
  }

  public destroy(): void {
    if (this.observer) {
      this.observer.disconnect();
      this.observer = null;
    }
  }
}

export const perfCollector = PerfCollector.getInstance();

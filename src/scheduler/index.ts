/**
 * Shared requestAnimationFrame Animation Scheduler
 * Drives caret, ghost, particles, flow meter, line scroll, and live-WPM.
 * Time-based (dt in seconds, clamped), frame-rate independent (60/120/144Hz).
 */

export type FrameCallback = (dt: number, time: number) => void;

interface Subscription {
  id: string;
  callback: FrameCallback;
  priority: number; // Lower numbers run first
}

export class AnimationScheduler {
  private static instance: AnimationScheduler | null = null;
  private subscriptions: Subscription[] = [];
  private isRunning: boolean = false;
  private rafId: number | null = null;
  private lastTime: number = 0;
  private maxDt: number = 0.1; // 100ms max clamp to avoid spring explosion on tab switch

  // Performance telemetry listeners
  private perfListeners: Array<(frameTimeMs: number, dtSeconds: number) => void> = [];

  private constructor() {}

  public static getInstance(): AnimationScheduler {
    if (!AnimationScheduler.instance) {
      AnimationScheduler.instance = new AnimationScheduler();
    }
    return AnimationScheduler.instance;
  }

  /**
   * Subscribe a frame update callback to the unified rAF loop.
   */
  public subscribe(id: string, callback: FrameCallback, priority: number = 10): () => void {
    const existingIndex = this.subscriptions.findIndex((s) => s.id === id);
    if (existingIndex !== -1) {
      this.subscriptions[existingIndex] = { id, callback, priority };
    } else {
      this.subscriptions.push({ id, callback, priority });
      this.subscriptions.sort((a, b) => a.priority - b.priority);
    }

    if (!this.isRunning && this.subscriptions.length > 0) {
      this.start();
    }

    return () => this.unsubscribe(id);
  }

  /**
   * Unsubscribe a callback.
   */
  public unsubscribe(id: string): void {
    this.subscriptions = this.subscriptions.filter((s) => s.id !== id);
    if (this.subscriptions.length === 0) {
      this.stop();
    }
  }

  /**
   * Register a telemetry callback for frame time metrics (used by perf overlay & quality governor).
   */
  public onFrame(listener: (frameTimeMs: number, dtSeconds: number) => void): () => void {
    this.perfListeners.push(listener);
    return () => {
      this.perfListeners = this.perfListeners.filter((l) => l !== listener);
    };
  }

  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;
    this.lastTime = typeof performance !== 'undefined' ? performance.now() : Date.now();
    this.loop = this.loop.bind(this);
    if (typeof requestAnimationFrame !== 'undefined') {
      this.rafId = requestAnimationFrame(this.loop);
    }
  }

  public stop(): void {
    if (!this.isRunning) return;
    this.isRunning = false;
    if (this.rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  private loop(currentTime: number): void {
    if (!this.isRunning) return;

    const rawDeltaMs = currentTime - this.lastTime;
    this.lastTime = currentTime;

    // Convert to seconds and clamp
    const rawDt = rawDeltaMs / 1000;
    const clampedDt = Math.min(rawDt, this.maxDt);

    // Notify telemetry listeners with real duration
    for (let i = 0; i < this.perfListeners.length; i++) {
      this.perfListeners[i](rawDeltaMs, clampedDt);
    }

    // Execute animation subscriptions in sorted priority order
    for (let i = 0; i < this.subscriptions.length; i++) {
      this.subscriptions[i].callback(clampedDt, currentTime);
    }

    this.rafId = requestAnimationFrame(this.loop);
  }

  public getSubscriberCount(): number {
    return this.subscriptions.length;
  }
}

export const scheduler = AnimationScheduler.getInstance();

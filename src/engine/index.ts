import { EngineState, EngineConfig, EngineMetrics, KeystrokeRecord } from './types';
import { engineReducer, createInitialState } from './reducer';
import { calculateMetrics } from './metrics';
import { scheduler } from '@/scheduler';

export type StateListener = (state: EngineState, metrics: EngineMetrics) => void;
export type FinishListener = (state: EngineState, metrics: EngineMetrics, telemetry: KeystrokeRecord[]) => void;

export class TypingEngine {
  private state: EngineState;
  private stateListeners: Set<StateListener> = new Set();
  private finishListeners: Set<FinishListener> = new Set();
  private perSecondRawWpm: number[] = [];
  private lastSecondRecorded: number = 0;
  private telemetry: KeystrokeRecord[] = [];
  private schedulerUnsub: (() => void) | null = null;

  // Pre-allocated typed arrays for zero-allocation telemetry recording
  private times: Float64Array = new Float64Array(1024);
  private keys: Uint16Array = new Uint16Array(1024);
  private flags: Uint8Array = new Uint8Array(1024);
  private recordCount: number = 0;

  constructor(config: EngineConfig) {
    this.state = createInitialState(config);
    this.attachScheduler();
  }

  public getState(): EngineState {
    return this.state;
  }

  public getMetrics(): EngineMetrics {
    return calculateMetrics(this.state, this.perSecondRawWpm);
  }

  public getTelemetry(): KeystrokeRecord[] {
    return this.telemetry;
  }

  public subscribe(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.state, this.getMetrics());
    return () => this.stateListeners.delete(listener);
  }

  public onFinish(listener: FinishListener): () => void {
    this.finishListeners.add(listener);
    return () => this.finishListeners.delete(listener);
  }

  public reset(config?: Partial<EngineConfig>): void {
    this.state = engineReducer(this.state, { type: 'RESET', config });
    this.perSecondRawWpm = [];
    this.lastSecondRecorded = 0;
    this.telemetry = [];
    this.recordCount = 0;
    this.notify();
  }

  public pause(): void {
    if (this.state.status === 'running') {
      this.state = engineReducer(this.state, { type: 'PAUSE' });
      this.notify();
    }
  }

  public resume(): void {
    if (this.state.status === 'paused') {
      this.state = engineReducer(this.state, { type: 'RESUME' });
      this.notify();
    }
  }

  public finish(): void {
    if (this.state.status !== 'finished') {
      const now = performance.now();
      this.state = engineReducer(this.state, { type: 'FINISH', timestamp: now });
      const metrics = this.getMetrics();
      this.notify();
      for (const listener of this.finishListeners) {
        listener(this.state, metrics, this.telemetry);
      }
    }
  }

  /**
   * Hot path keystroke processor: handles keydown synchronously (<1ms budget)
   */
  public handleKeyDown(e: KeyboardEvent): boolean {
    const { key, code, ctrlKey, altKey, metaKey } = e;

    // Ignore standalone modifiers, shortcuts, tab, or escape
    if (
      key === 'Shift' ||
      key === 'Control' ||
      key === 'Alt' ||
      key === 'Meta' ||
      key === 'CapsLock' ||
      key === 'Tab' ||
      key === 'Escape' ||
      altKey ||
      metaKey
    ) {
      return false;
    }

    // Ignore browser shortcuts such as Ctrl+R.
    if (ctrlKey && key !== 'Backspace' && key !== 'a' && key !== 'v') {
      return false;
    }

    const timestamp = e.timeStamp > 0 ? e.timeStamp : performance.now();
    const prevWordIdx = this.state.currentWordIndex;
    const prevCharIdx = this.state.currentCharIndex;
    const prevStatus = this.state.status;

    // Dispatch to reducer
    const newState = engineReducer(this.state, {
      type: 'KEY_DOWN',
      key,
      code,
      ctrlKey,
      timestamp,
    });

    if (newState === this.state) {
      return false;
    }

    this.state = newState;

    // Record telemetry
    if (this.state.status === 'running' || prevStatus === 'running' || prevStatus === 'idle') {
      const targetWord = this.state.words[prevWordIdx] || '';
      const expected = prevCharIdx < targetWord.length ? targetWord[prevCharIdx] : ' ';
      const status =
        this.state.charStatuses[prevWordIdx]?.[prevCharIdx] ||
        (key === ' ' ? 'correct' : 'incorrect');

      this.recordKeystroke(timestamp, key, code, expected, status);
    }

    // Check if finished via word count
    if (this.state.status === 'finished') {
      const metrics = this.getMetrics();
      this.notify();
      for (const listener of this.finishListeners) {
        listener(this.state, metrics, this.telemetry);
      }
      return true;
    }

    this.notify();
    return true;
  }

  private recordKeystroke(
    timestamp: number,
    key: string,
    code: string,
    expected: string,
    status: KeystrokeRecord['status']
  ): void {
    // Grow buffers if needed
    if (this.recordCount >= this.times.length) {
      const newCapacity = this.times.length * 2;
      const newTimes = new Float64Array(newCapacity);
      const newKeys = new Uint16Array(newCapacity);
      const newFlags = new Uint8Array(newCapacity);
      newTimes.set(this.times);
      newKeys.set(this.keys);
      newFlags.set(this.flags);
      this.times = newTimes;
      this.keys = newKeys;
      this.flags = newFlags;
    }

    const relativeTime =
      this.state.startTime !== null ? timestamp - this.state.startTime : 0;
    this.times[this.recordCount] = relativeTime;
    this.keys[this.recordCount] = key.charCodeAt(0) || 0;
    this.flags[this.recordCount] = status === 'correct' ? 1 : 0;
    this.recordCount++;

    this.telemetry.push({
      timestamp: relativeTime,
      key,
      code,
      expected,
      status,
    });
  }

  private attachScheduler(): void {
    this.schedulerUnsub = scheduler.subscribe(
      'engine-timer',
      () => {
        if (this.state.status !== 'running' || this.state.startTime === null) {
          return;
        }

        const now = performance.now();
        const elapsedSeconds = (now - this.state.startTime) / 1000;

        // In Time Mode: terminate when duration is reached
        if (this.state.config.mode === 'time') {
          const duration = this.state.config.duration ?? 30;
          if (elapsedSeconds >= duration) {
            this.finish();
            return;
          }
        }

        // Track per-second raw WPM for consistency calculation
        const currentSecond = Math.floor(elapsedSeconds);
        if (currentSecond > this.lastSecondRecorded) {
          this.lastSecondRecorded = currentSecond;
          const currentMetrics = this.getMetrics();
          this.perSecondRawWpm.push(currentMetrics.rawWpm);
        }
      },
      1 // Highest priority
    );
  }

  private notify(): void {
    const metrics = this.getMetrics();
    for (const listener of this.stateListeners) {
      listener(this.state, metrics);
    }
  }

  public destroy(): void {
    if (this.schedulerUnsub) {
      this.schedulerUnsub();
      this.schedulerUnsub = null;
    }
    this.stateListeners.clear();
    this.finishListeners.clear();
  }
}

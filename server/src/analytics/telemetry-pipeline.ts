import { EventEmitter } from 'node:events';

export interface KeystrokeTelemetryEvent {
  userId: string;
  testId: string;
  timestamp: number;
  key: string;
  code: string;
  status: 'correct' | 'incorrect' | 'extra';
  dwellTime?: number;
}

export interface PipelineStats {
  totalIngested: number;
  totalFlushed: number;
  droppedEvents: number;
  currentBufferCount: number;
  bufferCapacity: number;
  eventsPerSecond: number;
}

/**
 * High-performance circular ring buffer.
 * Power-of-2 capacity enables bitwise index masking for zero-allocation O(1) writes.
 */
export class RingBuffer<T> {
  private buffer: Array<T | undefined>;
  private capacity: number;
  private mask: number;
  private head: number = 0; // write index
  private tail: number = 0; // read index
  private count: number = 0;

  constructor(capacityPowerOfTwo: number = 65536) {
    this.capacity = capacityPowerOfTwo;
    this.mask = capacityPowerOfTwo - 1;
    this.buffer = new Array<T | undefined>(capacityPowerOfTwo);
  }

  public push(item: T): boolean {
    if (this.count >= this.capacity) {
      return false; // Buffer overflow (backpressure)
    }

    this.buffer[this.head & this.mask] = item;
    this.head++;
    this.count++;
    return true;
  }

  public drain(maxCount: number = 1000): T[] {
    const drainCount = Math.min(this.count, maxCount);
    if (drainCount === 0) return [];

    const result: T[] = new Array(drainCount);
    for (let i = 0; i < drainCount; i++) {
      result[i] = this.buffer[this.tail & this.mask]!;
      this.buffer[this.tail & this.mask] = undefined; // release reference
      this.tail++;
    }

    this.count -= drainCount;
    return result;
  }

  public size(): number {
    return this.count;
  }

  public getCapacity(): number {
    return this.capacity;
  }
}

export class TelemetryPipeline extends EventEmitter {
  private ring: RingBuffer<KeystrokeTelemetryEvent>;
  private flushIntervalMs: number;
  private flushTimer: NodeJS.Timeout | null = null;
  private totalIngested: number = 0;
  private totalFlushed: number = 0;
  private droppedEvents: number = 0;
  private lastRateCheckTime: number = Date.now();
  private lastIngestedSnapshot: number = 0;
  private currentEps: number = 0;

  constructor(capacity: number = 65536, flushIntervalMs: number = 500) {
    super();
    this.ring = new RingBuffer<KeystrokeTelemetryEvent>(capacity);
    this.flushIntervalMs = flushIntervalMs;
    this.startFlusher();
  }

  public ingest(event: KeystrokeTelemetryEvent): boolean {
    const success = this.ring.push(event);
    if (success) {
      this.totalIngested++;
    } else {
      this.droppedEvents++;
    }
    return success;
  }

  public ingestBatch(events: KeystrokeTelemetryEvent[]): { ingested: number; dropped: number } {
    let ingested = 0;
    let dropped = 0;
    for (let i = 0; i < events.length; i++) {
      if (this.ring.push(events[i])) {
        ingested++;
        this.totalIngested++;
      } else {
        dropped++;
        this.droppedEvents++;
      }
    }
    return { ingested, dropped };
  }

  private startFlusher(): void {
    if (this.flushTimer) return;
    this.flushTimer = setInterval(() => {
      this.flush();
    }, this.flushIntervalMs);
  }

  public flush(): void {
    const batch = this.ring.drain(5000);
    if (batch.length > 0) {
      this.totalFlushed += batch.length;
      this.emit('batch_flushed', batch);
    }

    // Update throughput telemetry every second
    const now = Date.now();
    const elapsed = (now - this.lastRateCheckTime) / 1000;
    if (elapsed >= 1.0) {
      const deltaIngested = this.totalIngested - this.lastIngestedSnapshot;
      this.currentEps = Math.round(deltaIngested / elapsed);
      this.lastRateCheckTime = now;
      this.lastIngestedSnapshot = this.totalIngested;
    }
  }

  public getStats(): PipelineStats {
    return {
      totalIngested: this.totalIngested,
      totalFlushed: this.totalFlushed,
      droppedEvents: this.droppedEvents,
      currentBufferCount: this.ring.size(),
      bufferCapacity: this.ring.getCapacity(),
      eventsPerSecond: this.currentEps,
    };
  }

  public stop(): void {
    if (this.flushTimer) {
      clearInterval(this.flushTimer);
      this.flushTimer = null;
    }
  }
}

export const telemetryPipeline = new TelemetryPipeline();
